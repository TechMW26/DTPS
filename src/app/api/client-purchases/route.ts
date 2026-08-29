import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import dbConnect from "@/lib/db/connect";
import UnifiedPayment from "@/lib/db/models/UnifiedPayment";
import PaymentLink from "@/lib/db/models/PaymentLink";
import ClientMealPlan from "@/lib/db/models/ClientMealPlan";
import { withCache, clearCacheByTag } from "@/lib/api/utils";
import { recalculateAndPersistClientStatus } from "@/lib/status/computeClientStatus";
import { canonicalizePurchaseRecords } from "@/lib/payments/canonicalize-purchases";
import { resolveEntitlementEndDateCoveringRemainingDays } from "@/lib/payments/entitlement-dates";

const getPaidPurchaseQuery = () => ({
  $or: [
    { paymentStatus: "paid" },
    { status: { $in: ["paid", "completed", "active"] } },
  ],
});

const toPositiveDurationDays = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    const match = normalized.match(/(\d+(?:\.\d+)?)/);
    if (!match) {
      return 0;
    }

    const parsed = parseFloat(match[1]);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }

    if (/year|yr/.test(normalized)) {
      return Math.floor(parsed * 365);
    }

    if (/month|mo/.test(normalized)) {
      return Math.floor(parsed * 30);
    }

    if (/week|wk/.test(normalized)) {
      return Math.floor(parsed * 7);
    }

    return Math.floor(parsed);
  }

  return 0;
};

const getDurationDaysFromSource = (source: any): number => {
  return (
    toPositiveDurationDays(source?.durationDays) ||
    toPositiveDurationDays(source?.durationLabel) ||
    toPositiveDurationDays(source?.duration)
  );
};

const getEffectiveDurationDays = (purchase: any): number => {
  if (typeof purchase?.__effectiveDurationDays === "number") {
    return purchase.__effectiveDurationDays;
  }

  const sourceDurationDays = getDurationDaysFromSource(purchase);
  if (sourceDurationDays > 0) {
    return sourceDurationDays;
  }

  const inferredDaysUsed = Math.max(0, Number(purchase?.daysUsed || 0));
  const inferredRemainingDays = Math.max(
    0,
    Number(purchase?.remainingDays || 0),
  );
  return Math.max(0, inferredDaysUsed + inferredRemainingDays);
};

const getEffectiveDaysUsed = (purchase: any): number => {
  if (typeof purchase?.__effectiveDaysUsed === "number") {
    return purchase.__effectiveDaysUsed;
  }

  return Math.max(0, Number(purchase?.daysUsed || 0));
};

const getEffectiveRemainingDays = (purchase: any): number => {
  if (typeof purchase?.__effectiveRemainingDays === "number") {
    return purchase.__effectiveRemainingDays;
  }

  const durationDays = getEffectiveDurationDays(purchase);
  const storedDaysUsed = Math.max(0, Number(purchase?.daysUsed || 0));
  const storedRemainingDays = Math.max(0, Number(purchase?.remainingDays || 0));
  const hasStoredCounters =
    purchase?.daysUsed !== undefined || purchase?.remainingDays !== undefined;

  if (hasStoredCounters) {
    return storedRemainingDays;
  }

  return Math.max(0, durationDays - storedDaysUsed);
};

const shouldPreserveStoredCounters = (
  purchase: any,
  recalculatedDaysUsed: number,
): boolean => {
  const hasStoredCounters =
    purchase?.daysUsed !== undefined || purchase?.remainingDays !== undefined;

  if (!hasStoredCounters) {
    return false;
  }

  const storedDaysUsed = Math.max(0, Number(purchase?.daysUsed || 0));
  return storedDaysUsed > Math.max(0, Number(recalculatedDaysUsed || 0));
};

const getLinkedMealPlanDaysUsed = (mealPlans: any[]): number => {
  return mealPlans.reduce(
    (sum, plan) => sum + Math.max(0, Number(plan?.duration || 0)),
    0,
  );
};

const applyPurchaseCounters = ({
  purchase,
  mealPlans,
  preserveStoredCounters,
}: {
  purchase: any;
  mealPlans: any[];
  preserveStoredCounters: boolean;
}) => {
  const recalculatedDaysUsed = getLinkedMealPlanDaysUsed(mealPlans);
  const oldDaysUsed = Math.max(0, Number(purchase.daysUsed || 0));
  const oldRemainingDays = Math.max(0, Number(purchase.remainingDays || 0));
  const nextMealPlanCreated = mealPlans.length > 0;
  const durationDays = getEffectiveDurationDays(purchase);

  const finalDaysUsed = preserveStoredCounters
    ? oldDaysUsed
    : Math.min(durationDays, recalculatedDaysUsed);
  const finalRemainingDays = preserveStoredCounters
    ? oldRemainingDays
    : Math.max(0, durationDays - finalDaysUsed);

  return {
    recalculatedDaysUsed,
    oldDaysUsed,
    oldRemainingDays,
    nextMealPlanCreated,
    finalDaysUsed,
    finalRemainingDays,
  };
};

const getStartOfDayIST = (value: Date | string | number): Date => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const [year, month, day] = formatter.format(new Date(value)).split("-");
  return new Date(`${year}-${month}-${day}T00:00:00+05:30`);
};

const getCalendarDaysUntilEndIST = (
  endDateValue: Date | string,
  referenceDate: Date = new Date(),
): number => {
  const endDay = getStartOfDayIST(endDateValue);
  const currentDay = getStartOfDayIST(referenceDate);
  const diffMs = endDay.getTime() - currentDay.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
};

const toValidDate = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = new Date(value as any);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isPurchaseActiveForPlanning = (purchase: any, now: Date): boolean => {
  const remainingDays = getEffectiveRemainingDays(purchase);
  if (remainingDays <= 0) return false;

  // If expected end date is explicitly set, honor it for active-window checks.
  if (purchase.expectedEndDate) {
    const end = new Date(purchase.expectedEndDate);
    end.setHours(23, 59, 59, 999);
    return end >= now;
  }

  // If expected dates are not set yet, treat the paid purchase as active for planning
  // as long as allocation remains.
  return true;
};

// GET - Fetch client purchases (now from UnifiedPayment)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status");
    const activeOnly = searchParams.get("activeOnly") === "true";

    const query: any = getPaidPurchaseQuery();

    // Filter by client
    if (clientId) {
      query.client = clientId;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Backfill any missing UnifiedPayment records for paid payment links (client-specific)
    let backfilledCount = 0;
    if (clientId) {
      const paidLinks = await PaymentLink.find({
        client: clientId,
        status: "paid",
        $or: [
          { durationDays: { $exists: true, $gt: 0 } },
          { duration: { $exists: true, $nin: [null, ""] } },
          { durationLabel: { $exists: true, $nin: [null, ""] } },
        ],
      })
        .select(
          "_id client dietitian servicePlanId amount tax discount finalAmount currency planName planCategory duration durationDays paidAt paymentMethod transactionId payerEmail payerPhone razorpayPaymentLinkId razorpayPaymentId razorpayOrderId",
        )
        .sort({ paidAt: -1, createdAt: -1 });

      if (paidLinks.length > 0) {
        const linkIds = paidLinks.map((l: any) => l._id);
        const existing = await UnifiedPayment.find({
          client: clientId,
          paymentLink: { $in: linkIds },
        }).select("paymentLink");

        const existingLinkIds = new Set(
          existing.map((p: any) => String(p.paymentLink)),
        );

        for (const link of paidLinks) {
          if (existingLinkIds.has(String(link._id))) continue;

          const startDate = link.paidAt ? new Date(link.paidAt) : new Date();
          const endDate = new Date(startDate);
          const durationDays = getDurationDaysFromSource(link);
          endDate.setDate(endDate.getDate() + durationDays);

          try {
            await UnifiedPayment.syncRazorpayPayment(
              {
                paymentLink: link._id,
                paymentLinkId: link.razorpayPaymentLinkId || undefined,
                paymentId: link.razorpayPaymentId || undefined,
                orderId: link.razorpayOrderId || undefined,
                transactionId: link.transactionId || undefined,
                client: link.client,
              },
              {
                client: link.client,
                dietitian: link.dietitian,
                servicePlan: link.servicePlanId,
                paymentLink: link._id,
                paymentType: "service_plan",
                planName: link.planName || "Service Plan",
                planCategory: link.planCategory || "general-wellness",
                durationDays,
                durationLabel:
                  link.duration || link.durationLabel || `${durationDays} Days`,
                baseAmount: link.amount,
                discountPercent: link.discount || 0,
                taxPercent: link.tax || 0,
                finalAmount: link.finalAmount,
                currency: link.currency || "INR",
                status: "paid",
                paymentStatus: "paid",
                paymentMethod: link.paymentMethod || "razorpay",
                razorpayPaymentLinkId: link.razorpayPaymentLinkId,
                razorpayPaymentId: link.razorpayPaymentId,
                razorpayOrderId: link.razorpayOrderId,
                transactionId:
                  link.transactionId ||
                  link.razorpayPaymentId ||
                  link.razorpayPaymentLinkId,
                payerEmail: link.payerEmail,
                payerPhone: link.payerPhone,
                purchaseDate: startDate,
                startDate,
                endDate,
                expectedStartDate: startDate,
                expectedEndDate: endDate,
                paidAt: link.paidAt || startDate,
                mealPlanCreated: false,
                daysUsed: 0,
              },
            );
            backfilledCount += 1;
          } catch (syncErr) {
            console.error(
              "Failed to backfill UnifiedPayment for paid link:",
              link._id,
              syncErr,
            );
          }
        }

        // Ensure fresh reads when new purchases were backfilled during this request.
        if (backfilledCount > 0) {
          clearCacheByTag("client_purchases");
        }
      }
    }

    const fetchPurchases = async () =>
      await UnifiedPayment.find(query)
        .populate("client", "firstName lastName email phone")
        .populate("dietitian", "firstName lastName")
        .populate("servicePlan", "name category")
        .populate("paymentLink", "razorpayPaymentLinkId status paidAt")
        .sort({ purchaseDate: -1 });

    // Client-scoped views (dietitian/health-counselor client detail pages) require real-time freshness.
    const purchases = clientId
      ? await fetchPurchases()
      : await withCache(
          `client-purchases:${JSON.stringify(query)}`,
          fetchPurchases,
          { ttl: 120000, tags: ["client_purchases"] },
        );

    const purchaseIds = purchases
      .map((purchase: any) => purchase?._id?.toString?.())
      .filter((id: string | undefined): id is string => Boolean(id));

    const latestMealPlanEndDateByPurchase = new Map<string, Date>();
    if (purchaseIds.length > 0) {
      const linkedMealPlans = await ClientMealPlan.find({
        purchaseId: { $in: purchaseIds },
        status: { $in: ["active", "completed", "paused"] },
      }).select("purchaseId endDate");

      for (const plan of linkedMealPlans) {
        const purchaseKey = plan?.purchaseId ? String(plan.purchaseId) : "";
        const planEndDate = toValidDate((plan as any)?.endDate);
        if (!purchaseKey || !planEndDate) continue;

        const existing = latestMealPlanEndDateByPurchase.get(purchaseKey);
        if (!existing || planEndDate.getTime() > existing.getTime()) {
          latestMealPlanEndDateByPurchase.set(purchaseKey, planEndDate);
        }
      }
    }

    // Add remaining days to each purchase
    // remainingDays = durationDays - daysUsed (plan allocation remaining)
    // calendarDaysUntilEnd = days until endDate/expectedEndDate (for expiration tracking)
    const canonicalPurchases = clientId
      ? canonicalizePurchaseRecords(purchases).purchases
      : purchases;

    const purchasesWithInfo = canonicalPurchases.map((purchase) => {
      const purchaseObj = purchase.toObject();
      const now = new Date();
      const purchaseId = purchaseObj?._id?.toString?.() || "";

      const durationDays = getEffectiveDurationDays(purchaseObj);
      const daysUsed = getEffectiveDaysUsed(purchaseObj);
      const remainingDays = getEffectiveRemainingDays(purchaseObj);

      const linkedMealPlanEndDate =
        latestMealPlanEndDateByPurchase.get(purchaseId) || null;
      const resolvedExpectedEndDate =
        resolveEntitlementEndDateCoveringRemainingDays({
          expectedStartDate: purchaseObj.expectedStartDate,
          expectedEndDate: purchaseObj.expectedEndDate,
          endDate: purchaseObj.endDate,
          durationLabel: purchaseObj.durationLabel,
          linkedMealPlanEndDate,
          remainingDays,
        });

      // Calculate calendar days until end date (for expiration)
      const endDate = resolvedExpectedEndDate || purchaseObj.endDate;
      const calendarDaysUntilEnd = endDate
        ? getCalendarDaysUntilEndIST(endDate, now)
        : remainingDays;

      // A purchase is expired if endDate has passed OR all days are used
      const isExpired = calendarDaysUntilEnd === 0 || remainingDays === 0;

      return {
        ...purchaseObj,
        expectedEndDate:
          resolvedExpectedEndDate || purchaseObj.expectedEndDate || null,
        durationDays,
        daysUsed,
        remainingDays,
        calendarDaysUntilEnd, // Days until expectedEndDate/endDate
        isExpired,
      };
    });

    const now = new Date();
    const filteredPurchases = activeOnly
      ? purchasesWithInfo.filter((purchase: any) =>
          isPurchaseActiveForPlanning(purchase, now),
        )
      : purchasesWithInfo;

    const response = NextResponse.json({
      success: true,
      purchases: filteredPurchases,
      total: filteredPurchases.length,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Error fetching client purchases:", error);
    return NextResponse.json(
      { error: "Failed to fetch client purchases" },
      { status: 500 },
    );
  }
}

// POST - Create a client purchase (after payment is confirmed)
// Uses syncRazorpayPayment to UPDATE existing or CREATE new (NO DUPLICATES)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const body = await request.json();
    const {
      clientId,
      servicePlanId,
      paymentLinkId,
      pricingTierId,
      planName,
      planCategory,
      durationDays,
      durationLabel,
      baseAmount,
      discountPercent,
      taxPercent,
      finalAmount,
    } = body;

    // Validate required fields
    if (!clientId || !servicePlanId || !paymentLinkId || !durationDays) {
      return NextResponse.json(
        {
          error:
            "Client ID, service plan ID, payment link ID, and duration are required",
        },
        { status: 400 },
      );
    }

    // Auto-window from payment day: start tomorrow, end inclusive by duration.
    const paidAt = new Date();
    const purchaseStartDate = new Date(paidAt);
    purchaseStartDate.setHours(0, 0, 0, 0);
    purchaseStartDate.setDate(purchaseStartDate.getDate() + 1);

    const purchaseEndDate = new Date(purchaseStartDate);
    purchaseEndDate.setDate(purchaseEndDate.getDate() + durationDays - 1);

    // Use syncRazorpayPayment to UPDATE existing or CREATE new (NO DUPLICATES)
    const purchase = await UnifiedPayment.syncRazorpayPayment(
      { paymentLink: paymentLinkId },
      {
        client: clientId,
        dietitian: session.user.id,
        servicePlan: servicePlanId,
        paymentLink: paymentLinkId,
        paymentType: "service_plan",
        planName,
        planCategory,
        durationDays,
        durationLabel,
        baseAmount,
        discountPercent: Math.min(discountPercent || 0, 40), // Max 40%
        taxPercent: taxPercent || 0,
        finalAmount,
        currency: "INR",
        status: "paid",
        paymentStatus: "paid",
        purchaseDate: paidAt,
        startDate: purchaseStartDate,
        endDate: purchaseEndDate,
        expectedStartDate: purchaseStartDate,
        expectedEndDate: purchaseEndDate,
        paidAt,
        mealPlanCreated: false,
        daysUsed: 0,
      },
    );

    // A new paid purchase establishes/extends the subscription window — recompute status.
    try {
      await recalculateAndPersistClientStatus(clientId, {
        trigger: "purchase_created",
        changedBy: session.user.id,
        relatedEvent: `purchase:${purchase._id}`,
      });
    } catch (statusError) {
      console.error(
        "Error recalculating client status after purchase create:",
        statusError,
      );
    }

    return NextResponse.json({
      success: true,
      purchase,
      message: "Client purchase recorded successfully",
    });
  } catch (error) {
    console.error("Error creating client purchase:", error);
    return NextResponse.json(
      { error: "Failed to create client purchase" },
      { status: 500 },
    );
  }
}

// PUT - Update client purchase (e.g., mark meal plan created, add days used)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const body = await request.json();
    const {
      purchaseId,
      mealPlanId,
      mealPlanCreated,
      daysUsed,
      addDaysUsed,
      status,
      expectedStartDate,
      expectedEndDate,
      parentPurchaseId,
    } = body;

    if (!purchaseId) {
      return NextResponse.json(
        { error: "Purchase ID is required" },
        { status: 400 },
      );
    }

    // Get current purchase to check existing daysUsed
    const currentPurchase = await withCache(
      `client-purchases:${JSON.stringify(purchaseId)}`,
      async () => await UnifiedPayment.findById(purchaseId),
      { ttl: 120000, tags: ["client_purchases"] },
    );
    if (!currentPurchase) {
      return NextResponse.json(
        { error: "Purchase not found" },
        { status: 404 },
      );
    }

    // ======== EXPECTED END DATE VALIDATION ========
    // Only dietitian and admin can edit expected dates
    // Dietitian: edits allowed only up to one day before the current expected end date
    // Admin: edits allowed at any time
    if (expectedEndDate !== undefined || expectedStartDate !== undefined) {
      // Check if user is admin or dietitian
      const normalizedRole = (session.user.role || "").toLowerCase();
      const isAdmin = normalizedRole === "admin";
      const isDietitian =
        normalizedRole === "dietitian" || normalizedRole === "dietician";

      if (!isAdmin && !isDietitian) {
        return NextResponse.json(
          {
            error:
              "Only admins and dietitians are permitted to modify expected dates",
            code: "ROLE_UNAUTHORIZED",
          },
          { status: 403 },
        );
      }

      // Date validation logic differs by role
      if (expectedEndDate !== undefined && currentPurchase.expectedEndDate) {
        const existingEndDate = new Date(currentPurchase.expectedEndDate);
        existingEndDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Calculate one day before the expected end date
        const oneDayBeforeEnd = new Date(existingEndDate);
        oneDayBeforeEnd.setDate(oneDayBeforeEnd.getDate() - 1);

        if (isDietitian) {
          // Dietitian: cannot edit on or after the expected end date
          if (today >= existingEndDate) {
            return NextResponse.json(
              {
                error:
                  "Cannot modify expected end date: The expected end date has already passed or is today. Modifications are not allowed.",
                code: "DATE_EXPIRED",
              },
              { status: 400 },
            );
          }

          // Dietitian: cannot edit after one day before the expected end date
          if (today > oneDayBeforeEnd) {
            return NextResponse.json(
              {
                error:
                  "Cannot modify expected end date: Changes are only allowed up to one day before the current expected end date.",
                code: "DATE_TOO_CLOSE",
              },
              { status: 400 },
            );
          }
        }
      }
    }
    // ======== END EXPECTED END DATE VALIDATION ========

    const updateData: any = {};
    if (mealPlanId) updateData.mealPlan = mealPlanId;
    if (mealPlanCreated !== undefined)
      updateData.mealPlanCreated = mealPlanCreated;

    // Update expected dates
    if (expectedStartDate !== undefined) {
      updateData.expectedStartDate = expectedStartDate
        ? new Date(expectedStartDate)
        : null;
    }
    if (expectedEndDate !== undefined) {
      updateData.expectedEndDate = expectedEndDate
        ? new Date(expectedEndDate)
        : null;
    }

    // Update parent purchase reference (for multi-phase plans)
    if (parentPurchaseId !== undefined) {
      updateData.parentPaymentId = parentPurchaseId || null;
    }

    // If addDaysUsed is provided for a specific meal plan, recalculate from linked plans
    // to keep this operation idempotent (prevents double counting from repeated publish calls).
    if (addDaysUsed !== undefined && addDaysUsed > 0) {
      if (mealPlanId) {
        const { default: ClientMealPlan } =
          await import("@/lib/db/models/ClientMealPlan");
        const linkedMealPlans = await ClientMealPlan.find({
          purchaseId,
          status: { $in: ["active", "completed", "paused"] },
        }).select("duration endDate");

        const recalculatedDaysUsed = linkedMealPlans.reduce(
          (sum: number, plan: any) => {
            return sum + Math.max(0, Number(plan?.duration || 0));
          },
          0,
        );

        updateData.daysUsed = recalculatedDaysUsed;
        updateData.mealPlanCreated = linkedMealPlans.length > 0;

        const latestLinkedMealPlanEndDate = linkedMealPlans.reduce(
          (latest: Date | null, plan: any) => {
            const endDate = toValidDate(plan?.endDate);
            if (!endDate) return latest;
            return !latest || endDate.getTime() > latest.getTime()
              ? endDate
              : latest;
          },
          null,
        );
        const durationDays = Math.max(
          0,
          Number(
            currentPurchase.durationDays ||
              (currentPurchase.daysUsed || 0) +
                (currentPurchase.remainingDays || 0) ||
              0,
          ),
        );
        const remainingDays = Math.max(0, durationDays - recalculatedDaysUsed);
        const reconciledExpectedEndDate =
          resolveEntitlementEndDateCoveringRemainingDays({
            expectedStartDate: currentPurchase.expectedStartDate,
            expectedEndDate: currentPurchase.expectedEndDate,
            endDate: currentPurchase.endDate,
            durationLabel: currentPurchase.durationLabel,
            linkedMealPlanEndDate: latestLinkedMealPlanEndDate,
            remainingDays,
          });

        if (
          reconciledExpectedEndDate &&
          (!currentPurchase.expectedEndDate ||
            reconciledExpectedEndDate.getTime() >
              new Date(currentPurchase.expectedEndDate).getTime())
        ) {
          updateData.expectedEndDate = reconciledExpectedEndDate;
        }
      } else {
        updateData.daysUsed = (currentPurchase.daysUsed || 0) + addDaysUsed;
      }
    } else if (daysUsed !== undefined) {
      // Legacy: direct set (for backwards compatibility)
      updateData.daysUsed = daysUsed;
    }

    if (updateData.daysUsed !== undefined) {
      const durationDays = Math.max(
        0,
        Number(
          currentPurchase.durationDays ||
            (currentPurchase.daysUsed || 0) +
              (currentPurchase.remainingDays || 0) ||
            0,
        ),
      );
      const normalizedDaysUsed = Math.max(0, Number(updateData.daysUsed || 0));
      updateData.daysUsed = normalizedDaysUsed;
      updateData.remainingDays = Math.max(0, durationDays - normalizedDaysUsed);
    }

    if (status) updateData.status = status;

    const updatedPurchase = await UnifiedPayment.findByIdAndUpdate(
      purchaseId,
      updateData,
      { new: true },
    );

    if (!updatedPurchase) {
      return NextResponse.json(
        { error: "Purchase not found" },
        { status: 404 },
      );
    }

    // Clear cache to ensure real-time updates across all platforms
    clearCacheByTag("client_purchases");
    clearCacheByTag(`client-purchases:${JSON.stringify(purchaseId)}`);

    // If the subscription window or payment status changed, recompute client status
    // (single source of truth: Expected End Date + manual hold).
    if (
      expectedEndDate !== undefined ||
      updateData.expectedEndDate !== undefined ||
      expectedStartDate !== undefined ||
      status !== undefined
    ) {
      const purchaseClientId = updatedPurchase.client
        ? String(updatedPurchase.client)
        : null;
      if (purchaseClientId) {
        try {
          await recalculateAndPersistClientStatus(purchaseClientId, {
            trigger: "purchase_updated",
            changedBy: session.user.id,
            relatedEvent: `purchase:${purchaseId}`,
          });
        } catch (statusError) {
          console.error(
            "Error recalculating client status after purchase update:",
            statusError,
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      purchase: updatedPurchase,
      totalDaysUsed: updatedPurchase.daysUsed || 0,
      remainingDays: Math.max(
        0,
        (updatedPurchase.durationDays || 0) - (updatedPurchase.daysUsed || 0),
      ),
      message: "Purchase updated successfully",
    });
  } catch (error) {
    console.error("Error updating client purchase:", error);
    return NextResponse.json(
      { error: "Failed to update client purchase" },
      { status: 500 },
    );
  }
}

// PATCH - Recalculate daysUsed for a purchase based on actual meal plans
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const body = await request.json();
    const { purchaseId, clientId, action } = body;

    if (action !== "recalculate" && action !== "repair") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const shouldRepairCounters = action === "repair";

    // Import ClientMealPlan model
    const { default: ClientMealPlan } =
      await import("@/lib/db/models/ClientMealPlan");

    // If clientId is provided (no active purchase), recalculate all purchases for this client
    if (clientId && !purchaseId) {
      // Get all purchases for this client
      const allPurchases = await UnifiedPayment.find({
        client: clientId,
        $or: [
          { paymentStatus: "paid" },
          { status: { $in: ["paid", "completed", "active"] } },
        ],
      });

      // Fetch all meal plans for this client once, then group by purchaseId.
      // Each purchase is only fixed based on its own explicitly linked plans —
      // never a cross-purchase fallback.
      const allMealPlans = await ClientMealPlan.find({
        clientId: clientId,
        status: { $in: ["active", "completed"] },
      });

      const totalDaysUsed = getLinkedMealPlanDaysUsed(allMealPlans);

      // Manual "Fix Days" must reflect actual meal plans, even when stored counters exist.
      let updatedCount = 0;
      for (const purchase of allPurchases) {
        // Only count plans that explicitly belong to this purchase.
        const effectiveMealPlans = allMealPlans.filter(
          (plan) => plan.purchaseId?.toString() === purchase._id.toString(),
        );

        const counterState = applyPurchaseCounters({
          purchase,
          mealPlans: effectiveMealPlans,
          preserveStoredCounters: shouldRepairCounters
            ? false
            : shouldPreserveStoredCounters(
                purchase,
                getLinkedMealPlanDaysUsed(effectiveMealPlans),
              ),
        });

        if (
          counterState.oldDaysUsed !== counterState.finalDaysUsed ||
          counterState.oldRemainingDays !== counterState.finalRemainingDays ||
          Boolean(purchase.mealPlanCreated) !== counterState.nextMealPlanCreated
        ) {
          purchase.daysUsed = counterState.finalDaysUsed;
          purchase.remainingDays = counterState.finalRemainingDays;
          purchase.mealPlanCreated = counterState.nextMealPlanCreated;
          await purchase.save();
          updatedCount++;
        }
      }

      // Clear cache
      clearCacheByTag("client_purchases");

      return NextResponse.json({
        success: true,
        message: shouldRepairCounters
          ? `Purchase counters repaired from meal plans for ${updatedCount} purchase(s).`
          : `Days recalculated from actual meal plans for ${updatedCount} purchase(s).`,
        oldDaysUsed: 0,
        newDaysUsed: totalDaysUsed,
        mealPlansCount: allMealPlans.length,
        purchasesUpdated: updatedCount,
        remainingDays: allPurchases.reduce(
          (sum, p) => sum + Math.max(0, (p.durationDays || 0) - totalDaysUsed),
          0,
        ),
      });
    }

    if (!purchaseId) {
      return NextResponse.json(
        { error: "Purchase ID or Client ID is required" },
        { status: 400 },
      );
    }

    // Get the purchase
    const purchase = await UnifiedPayment.findById(purchaseId);
    if (!purchase) {
      return NextResponse.json(
        { error: "Purchase not found" },
        { status: 404 },
      );
    }

    // Only count meal plans explicitly linked to this purchase by purchaseId.
    // Do NOT fall back to all client plans — that would incorrectly count
    // days from previous purchases/phases and inflate the counter.
    const mealPlans = await ClientMealPlan.find({
      purchaseId: purchaseId,
      status: { $in: ["active", "completed"] },
    });

    const totalDaysUsed = getLinkedMealPlanDaysUsed(mealPlans);
    const counterState = applyPurchaseCounters({
      purchase,
      mealPlans,
      preserveStoredCounters: shouldRepairCounters
        ? false
        : shouldPreserveStoredCounters(purchase, totalDaysUsed),
    });

    if (
      counterState.oldDaysUsed !== counterState.finalDaysUsed ||
      counterState.oldRemainingDays !== counterState.finalRemainingDays ||
      Boolean(purchase.mealPlanCreated) !== counterState.nextMealPlanCreated
    ) {
      purchase.daysUsed = counterState.finalDaysUsed;
      purchase.remainingDays = counterState.finalRemainingDays;
      purchase.mealPlanCreated = counterState.nextMealPlanCreated;
      await purchase.save();
    }

    // Clear cache
    clearCacheByTag("client_purchases");

    return NextResponse.json({
      success: true,
      message: shouldRepairCounters
        ? `Purchase counters repaired: ${counterState.oldDaysUsed} → ${counterState.finalDaysUsed}`
        : counterState.finalDaysUsed === counterState.oldDaysUsed &&
            counterState.finalRemainingDays === counterState.oldRemainingDays
          ? `Days used preserved at ${counterState.oldDaysUsed}; stored purchase counters remain authoritative.`
          : `Days used recalculated: ${counterState.oldDaysUsed} → ${counterState.finalDaysUsed}`,
      oldDaysUsed: counterState.oldDaysUsed,
      newDaysUsed: counterState.finalDaysUsed,
      mealPlansCount: mealPlans.length,
      remainingDays: counterState.finalRemainingDays,
    });
  } catch (error) {
    console.error("Error recalculating days used:", error);
    return NextResponse.json(
      { error: "Failed to recalculate days used" },
      { status: 500 },
    );
  }
}
