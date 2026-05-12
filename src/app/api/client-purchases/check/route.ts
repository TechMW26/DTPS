import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import dbConnect from '@/lib/db/connect';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import PaymentLink from '@/lib/db/models/PaymentLink';
import User from '@/lib/db/models/User';
import MealPlan from '@/lib/db/models/MealPlan';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import Razorpay from 'razorpay';
import { computeClientStatus } from '@/lib/status/computeClientStatus';
import { checkPermission } from '@/lib/permissions/check';
import { PermissionKey } from '@/lib/db/models/Permission';
import { UserRole } from '@/types';

// Initialize Razorpay for syncing payment status
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })
  : null;

const durationEligibilityQuery = {
  $or: [
    { durationDays: { $exists: true, $gt: 0 } },
    { duration: { $exists: true, $nin: [null, ''] } },
    { durationLabel: { $exists: true, $nin: [null, ''] } }
  ]
};

function toPositiveDurationDays(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    const match = normalized.match(/(\d+(?:\.\d+)?)/);
    if (!match) {
      return 0;
    }

    const numeric = parseFloat(match[1]);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 0;
    }

    if (/year|yr/.test(normalized)) {
      return Math.floor(numeric * 365);
    }

    if (/month|mo/.test(normalized)) {
      return Math.floor(numeric * 30);
    }

    if (/week|wk/.test(normalized)) {
      return Math.floor(numeric * 7);
    }

    return Math.floor(numeric);
  }

  return 0;
}

function getDurationDaysFromSource(source: any): number {
  return (
    toPositiveDurationDays(source?.durationDays) ||
    toPositiveDurationDays(source?.durationLabel) ||
    toPositiveDurationDays(source?.duration)
  );
}

function getMealPlanDurationDays(plan: any): number {
  const explicitDuration = toPositiveDurationDays(plan?.duration);
  if (explicitDuration > 0) {
    return explicitDuration;
  }

  if (plan?.startDate && plan?.endDate) {
    const start = new Date(plan.startDate);
    const end = new Date(plan.endDate);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return Math.max(0, diff);
    }
  }

  return 0;
}

function getEffectiveDurationDays(purchase: any): number {
  if (typeof purchase?.__effectiveDurationDays === 'number') {
    return purchase.__effectiveDurationDays;
  }

  const sourceDurationDays = getDurationDaysFromSource(purchase);
  if (sourceDurationDays > 0) {
    return sourceDurationDays;
  }

  // Fallback for records where duration metadata is missing but day counters exist.
  const inferredDaysUsed = Math.max(0, Number(purchase?.daysUsed || 0));
  const inferredRemainingDays = Math.max(0, Number(purchase?.remainingDays || 0));
  return Math.max(0, inferredDaysUsed + inferredRemainingDays);
}

function getEffectiveDaysUsed(purchase: any): number {
  if (typeof purchase?.__effectiveDaysUsed === 'number') {
    return purchase.__effectiveDaysUsed;
  }
  return Math.max(0, Number(purchase?.daysUsed || 0));
}

function getEffectiveRemainingDays(purchase: any): number {
  if (typeof purchase?.__effectiveRemainingDays === 'number') {
    return purchase.__effectiveRemainingDays;
  }
  return Math.max(0, getEffectiveDurationDays(purchase) - getEffectiveDaysUsed(purchase));
}

function hasPaymentProof(paymentLink: any): boolean {
  return Boolean(
    paymentLink?.paidAt ||
    (typeof paymentLink?.razorpayPaymentId === 'string' && paymentLink.razorpayPaymentId.trim()) ||
    (typeof paymentLink?.transactionId === 'string' && paymentLink.transactionId.trim())
  );
}

// Helper function to update client status based on payments + plans
async function updateClientStatusBasedOnMealPlan(clientId: string): Promise<string> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check for any successful payment (UnifiedPayment uses 'client' field, not 'clientId')
    const hasSuccessfulPayment = await UnifiedPayment.exists({
      client: clientId,
      $or: [
        { status: { $in: ['paid', 'completed', 'active'] } },
        { paymentStatus: 'paid' }
      ]
    });

    // Check both MealPlan and ClientMealPlan for active plans
    // A plan is valid if status is 'active' AND endDate is in the future (regardless of startDate)
    const activeMealPlan = await MealPlan.findOne({
      client: clientId,
      status: 'active',
      endDate: { $gte: today }
    });

    const activeClientMealPlan = !activeMealPlan ? await ClientMealPlan.findOne({
      clientId,
      status: 'active',
      endDate: { $gte: today }
    }) : null;

    const currentActivePlan = activeMealPlan || activeClientMealPlan;

    const newStatus = computeClientStatus({
      hasSuccessfulPayment: !!hasSuccessfulPayment,
      activePlan: currentActivePlan ? {
        startDate: currentActivePlan.startDate,
        endDate: currentActivePlan.endDate,
        status: currentActivePlan.status
      } : null
    });

    const client = await User.findById(clientId).select('clientStatus');
    if (client && client.clientStatus !== newStatus) {
      await User.findByIdAndUpdate(clientId, { clientStatus: newStatus });
    }

    return newStatus;
  } catch (error) {
    console.error('Error updating client status:', error);
    return 'lead';
  }
}

// Helper function to create/update UnifiedPayment record from PaymentLink
async function createUnifiedPaymentFromLink(paymentLink: any): Promise<string | null> {
  try {
    const durationDays = getDurationDaysFromSource(paymentLink);
    const startDate = paymentLink.paidAt || new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);

    const unifiedPayment = await UnifiedPayment.syncRazorpayPayment(
      { paymentLink: paymentLink._id },
      {
        client: paymentLink.client,
        dietitian: paymentLink.dietitian,
        servicePlan: paymentLink.servicePlanId,
        paymentLink: paymentLink._id,
        paymentType: 'service_plan',
        planName: paymentLink.planName || 'Service Plan',
        planCategory: paymentLink.planCategory || 'general-wellness',
        durationDays,
        durationLabel: paymentLink.duration || paymentLink.durationLabel || `${durationDays} Days`,
        baseAmount: paymentLink.amount,
        discountPercent: paymentLink.discount || 0,
        taxPercent: paymentLink.tax || 0,
        finalAmount: paymentLink.finalAmount,
        currency: paymentLink.currency || 'INR',
        status: 'paid',
        paymentStatus: 'paid',
        paymentMethod: paymentLink.paymentMethod || 'razorpay',
        razorpayPaymentLinkId: paymentLink.razorpayPaymentLinkId,
        razorpayPaymentId: paymentLink.razorpayPaymentId,
        transactionId: paymentLink.razorpayPaymentId || paymentLink.razorpayPaymentLinkId,
        payerEmail: paymentLink.payerEmail,
        payerPhone: paymentLink.payerPhone,
        purchaseDate: startDate,
        startDate,
        endDate,
        paidAt: paymentLink.paidAt,
        mealPlanCreated: false,
        daysUsed: 0
      }
    );

    return unifiedPayment._id.toString();
  } catch (error) {
    console.error('Error creating UnifiedPayment record:', error);
    return null;
  }
}

// Helper function to sync a single payment link with Razorpay
async function syncPaymentLinkWithRazorpay(paymentLink: any): Promise<boolean> {
  if (paymentLink.status === 'paid') return true;

  if (hasPaymentProof(paymentLink)) {
    paymentLink.status = 'paid';
    if (!paymentLink.paidAt) {
      paymentLink.paidAt = new Date();
    }

    await paymentLink.save();
    await createUnifiedPaymentFromLink(paymentLink);
    return true;
  }

  if (!razorpay || !paymentLink.razorpayPaymentLinkId) return false;

  try {
    const razorpayLink: any = await razorpay.paymentLink.fetch(paymentLink.razorpayPaymentLinkId);

    if (razorpayLink.status === 'paid') {
      paymentLink.status = 'paid';
      paymentLink.paidAt = razorpayLink.paid_at
        ? new Date(razorpayLink.paid_at * 1000)
        : new Date();

      if (razorpayLink.payments?.length > 0) {
        const latestPayment = razorpayLink.payments[razorpayLink.payments.length - 1];
        paymentLink.razorpayPaymentId = latestPayment.payment_id;
      }

      await paymentLink.save();
      await createUnifiedPaymentFromLink(paymentLink);

      return true;
    }
  } catch (error) {
    console.error(`Error syncing payment link ${paymentLink._id}:`, error);
  }
  return false;
}

function isPurchaseEligibleForPlanning(purchase: any): boolean {
  const remainingDays = getEffectiveRemainingDays(purchase);

  // A purchase is eligible if it has remaining days, regardless of expected dates
  // Expected dates are for planning convenience, not eligibility.
  return remainingDays > 0;
}

// GET - Check if client has active paid plan and can create meal plan
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const requestedDays = parseInt(searchParams.get('requestedDays') || '0');
    const forceSync = searchParams.get('forceSync') === 'true';

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    const roleBasedCanCreateMealPlans =
      session.user.role === UserRole.DIETITIAN ||
      session.user.role === UserRole.ADMIN;
    const effectiveCreateMealPlanPermission = await checkPermission(
      session.user.id,
      session.user.role as UserRole,
      PermissionKey.CREATE_MEAL_PLANS
    );
    const accessContext = {
      requestedBy: {
        userId: session.user.id,
        role: session.user.role,
      },
      permissions: {
        roleBasedCreateMealPlans: roleBasedCanCreateMealPlans,
        effectiveCreateMealPlans: effectiveCreateMealPlanPermission.hasPermission,
        effectiveReason: effectiveCreateMealPlanPermission.reason || null,
      },
    };

    // First, heal any links that clearly contain paid-proof metadata.
    const linksWithPaymentProof = await PaymentLink.find({
      client: clientId,
      status: { $ne: 'paid' },
      servicePlanId: { $exists: true, $ne: null },
      ...durationEligibilityQuery,
      $or: [
        { paidAt: { $exists: true, $ne: null } },
        { razorpayPaymentId: { $exists: true, $nin: [null, ''] } },
        { transactionId: { $exists: true, $nin: [null, ''] } }
      ]
    }).sort({ updatedAt: -1 }).limit(20);

    for (const link of linksWithPaymentProof) {
      if (link.status !== 'paid') {
        link.status = 'paid';
        if (!link.paidAt) {
          link.paidAt = new Date();
        }
        await link.save();
      }
      await createUnifiedPaymentFromLink(link);
    }

    // Sync payment links if needed
    if (forceSync) {
      const allPaymentLinks = await PaymentLink.find({
        client: clientId,
        servicePlanId: { $exists: true, $ne: null },
        ...durationEligibilityQuery
      }).sort({ createdAt: -1 }).limit(10);

      for (const paymentLink of allPaymentLinks) {
        if (paymentLink.status !== 'paid') {
          await syncPaymentLinkWithRazorpay(paymentLink);
        }
      }
    } else {
      const pendingPaymentLinks = await PaymentLink.find({
        client: clientId,
        status: { $in: ['pending', 'created', 'expired'] },
        servicePlanId: { $exists: true, $ne: null },
        ...durationEligibilityQuery
      }).sort({ createdAt: -1 }).limit(5);

      for (const pendingLink of pendingPaymentLinks) {
        await syncPaymentLinkWithRazorpay(pendingLink);
      }
    }

    // Find ALL paid purchases for this client, then compute active eligibility in-memory
    const allPaidPurchases = await UnifiedPayment.find({
      client: clientId,
      $or: [
        { paymentStatus: 'paid' },
        { status: { $in: ['paid', 'completed', 'active'] } }
      ]
    })
      .populate('servicePlan', 'name category')
      .sort({ createdAt: 1 });

    // De-duplicate by strongest available payment identity to avoid duplicate-entry edge cases.
    const dedupedByIdentity = new Map<string, any>();
    for (const purchase of allPaidPurchases) {
      const identityKey = String(
        purchase.paymentLink ||
        purchase.razorpayPaymentId ||
        purchase.transactionId ||
        purchase._id
      );

      const existing = dedupedByIdentity.get(identityKey);
      if (!existing) {
        dedupedByIdentity.set(identityKey, purchase);
        continue;
      }

      const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      const currentTime = new Date(purchase.updatedAt || purchase.createdAt || 0).getTime();
      if (currentTime > existingTime) {
        dedupedByIdentity.set(identityKey, purchase);
      }
    }

    const dedupedPaidPurchases = Array.from(dedupedByIdentity.values()).sort((a: any, b: any) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const linkedMealPlans = await ClientMealPlan.find({
      clientId,
      purchaseId: { $exists: true, $ne: null },
      status: { $in: ['active', 'completed', 'paused'] }
    }).select('purchaseId duration startDate endDate status');

    const usedDaysByPurchase = new Map<string, number>();
    const mealPlansByPurchase = new Map<string, number>();
    for (const plan of linkedMealPlans) {
      const purchaseKey = String((plan as any).purchaseId);
      const planDuration = getMealPlanDurationDays(plan);
      if (!purchaseKey || planDuration <= 0) {
        continue;
      }

      usedDaysByPurchase.set(
        purchaseKey,
        (usedDaysByPurchase.get(purchaseKey) || 0) + planDuration
      );
      mealPlansByPurchase.set(
        purchaseKey,
        (mealPlansByPurchase.get(purchaseKey) || 0) + 1
      );
    }

    const computedPaidPurchases = dedupedPaidPurchases.map((purchase: any) => {
      const purchaseId = purchase?._id?.toString?.() || String(purchase?._id || '');
      const durationDays = getEffectiveDurationDays(purchase);
      const linkedDaysUsed = usedDaysByPurchase.get(purchaseId);
      const linkedMealPlanCount = mealPlansByPurchase.get(purchaseId) || 0;
      const storedDaysUsed = Math.max(0, Number(purchase?.daysUsed || 0));
      const storedRemainingDays = Math.max(0, Number(purchase?.remainingDays || 0));

      // UnifiedPayment counters are the source of truth for UI/API responses.
      // Linked meal plans are only a fallback for legacy records that never had counters populated.
      const hasStoredCounters =
        purchase?.daysUsed !== undefined ||
        purchase?.remainingDays !== undefined;

      const countersExceedDuration =
        storedDaysUsed > durationDays ||
        (storedDaysUsed + storedRemainingDays) > durationDays;

      let effectiveDaysUsed = hasStoredCounters
        ? storedDaysUsed
        : (typeof linkedDaysUsed === 'number' ? linkedDaysUsed : storedDaysUsed);

      // If stored counters are inconsistent (e.g. 45 used for a 30-day plan),
      // prefer linked meal-plan usage when available and always cap by duration.
      if (hasStoredCounters && countersExceedDuration) {
        if (typeof linkedDaysUsed === 'number') {
          effectiveDaysUsed = linkedDaysUsed;
        }
        effectiveDaysUsed = Math.min(durationDays, Math.max(0, effectiveDaysUsed));
      }

      // Do not auto-consume full duration just because a meal plan exists.
      // Multi-phase plans under a single purchase must continue to use real counters.

      // Future scheduled purchases should not consume allocation until they start.
      // Only normalize to zero when we do not have authoritative stored counters.
      if (
        typeof linkedDaysUsed !== 'number' &&
        !hasStoredCounters &&
        purchase?.expectedStartDate &&
        new Date(purchase.expectedStartDate).getTime() > now.getTime()
      ) {
        effectiveDaysUsed = 0;
      }

      // Unstarted purchase should not be blocked by stale daysUsed.
      // Keep stored counters when they already exist; otherwise fall back to zero.
      if (
        typeof linkedDaysUsed !== 'number' &&
        !hasStoredCounters &&
        purchase?.mealPlanCreated !== true
      ) {
        effectiveDaysUsed = 0;
      }

      // Keep stored counters by default, but normalize inconsistent values.
      const effectiveRemainingDays = (hasStoredCounters && !countersExceedDuration)
        ? storedRemainingDays
        : Math.max(0, durationDays - effectiveDaysUsed);

      (purchase as any).__effectiveDurationDays = durationDays;
      (purchase as any).__effectiveDaysUsed = effectiveDaysUsed;
      (purchase as any).__effectiveRemainingDays = effectiveRemainingDays;

      return purchase;
    });

    const allActivePurchases = computedPaidPurchases.filter((purchase: any) =>
      isPurchaseEligibleForPlanning(purchase)
    );

    const isWithinExpectedWindow = (purchase: any): boolean => {
      if (!purchase?.expectedStartDate) return false;

      const start = new Date(purchase.expectedStartDate);
      const end = new Date(purchase.expectedEndDate || purchase.endDate || purchase.expectedStartDate);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

      return start.getTime() <= now.getTime() && now.getTime() <= end.getTime();
    };

    // Find partially used purchase and prioritize the most relevant current one.
    const partiallyUsedPurchases = allActivePurchases
      .filter((p: any) => {
        const usedDays = getEffectiveDaysUsed(p);
        const remaining = getEffectiveRemainingDays(p);
        return usedDays > 0 && remaining > 0;
      })
      .sort((a: any, b: any) => {
        const aInCurrentWindow = isWithinExpectedWindow(a) ? 1 : 0;
        const bInCurrentWindow = isWithinExpectedWindow(b) ? 1 : 0;
        if (aInCurrentWindow !== bInCurrentWindow) {
          return bInCurrentWindow - aInCurrentWindow;
        }

        const usedDiff = getEffectiveDaysUsed(b) - getEffectiveDaysUsed(a);
        if (usedDiff !== 0) {
          return usedDiff;
        }

        const aUpdatedAt = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bUpdatedAt = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bUpdatedAt - aUpdatedAt;
      });

    const partiallyUsedPurchase = partiallyUsedPurchases[0] || null;

    // Find unstarted purchases
    const unstartedPurchases = allActivePurchases
      .filter((p: any) => {
        const usedDays = getEffectiveDaysUsed(p);
        const remaining = getEffectiveRemainingDays(p);
        return usedDays === 0 && remaining > 0;
      })
      .sort((a: any, b: any) => {
        if (a.expectedStartDate && b.expectedStartDate) {
          return new Date(a.expectedStartDate).getTime() - new Date(b.expectedStartDate).getTime();
        }
        if (a.expectedStartDate && !b.expectedStartDate) return -1;
        if (!a.expectedStartDate && b.expectedStartDate) return 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    let activePurchase: any = partiallyUsedPurchase || (unstartedPurchases.length > 0 ? unstartedPurchases[0] : null);

    if (!activePurchase) {
      activePurchase = allActivePurchases.find((p: any) =>
        getEffectiveRemainingDays(p) > 0
      ) || null;
    }

    const purchasesNeedingPlan = [
      ...(partiallyUsedPurchase ? [partiallyUsedPurchase] : []),
      ...unstartedPurchases.filter((p: any) => p._id.toString() !== partiallyUsedPurchase?._id?.toString())
    ];

    if (!activePurchase && allActivePurchases.length > 0) {
      activePurchase = allActivePurchases[0];
    }

    // Check for paid payment links without UnifiedPayment
    if (!activePurchase) {
      const paidPaymentLink = await PaymentLink.findOne({
        client: clientId,
        status: 'paid',
        servicePlanId: { $exists: true, $ne: null },
        ...durationEligibilityQuery
      }).sort({ paidAt: -1 });

      if (paidPaymentLink) {
        await createUnifiedPaymentFromLink(paidPaymentLink);

        const existingPayment = await UnifiedPayment.findOne({
          paymentLink: paidPaymentLink._id
        }).populate('servicePlan', 'name category');

        if (existingPayment && isPurchaseEligibleForPlanning(existingPayment)) {
          activePurchase = existingPayment;
        }
      }
    }

    if (!activePurchase) {
      const updatedClientStatus = await updateClientStatusBasedOnMealPlan(clientId);
      const hasPaidHistory = computedPaidPurchases.length > 0;
      const fallbackPurchase = hasPaidHistory ? computedPaidPurchases[computedPaidPurchases.length - 1] : null;

      const aggregatedTotalPurchasedDays = computedPaidPurchases.reduce(
        (sum: number, p: any) => sum + getEffectiveDurationDays(p),
        0
      );
      const aggregatedTotalDaysUsed = computedPaidPurchases.reduce(
        (sum: number, p: any) => sum + getEffectiveDaysUsed(p),
        0
      );
      const aggregatedRemainingDays = Math.max(0, aggregatedTotalPurchasedDays - aggregatedTotalDaysUsed);

      // Allow multi-phase planning: if aggregated remaining days > 0, user can create a new meal plan
      const canCreate = aggregatedRemainingDays > 0 && accessContext.permissions.effectiveCreateMealPlans;

      console.info('[MEAL_PLAN_ELIGIBILITY_DEBUG]', {
        clientId,
        hasPaidPlan: hasPaidHistory,
        canCreateMealPlan: canCreate,
        role: session.user.role,
        aggregatedRemainingDays,
        accessContext,
      });

      return NextResponse.json({
        success: true,
        hasPaidPlan: hasPaidHistory,
        canCreateMealPlan: canCreate,
        access: accessContext,
        clientStatus: updatedClientStatus,
        purchase: fallbackPurchase ? {
          _id: fallbackPurchase?._id,
          planName: fallbackPurchase?.planName,
          planCategory: fallbackPurchase?.planCategory,
          durationDays: getEffectiveDurationDays(fallbackPurchase),
          durationLabel: fallbackPurchase?.durationLabel,
          startDate: fallbackPurchase?.startDate,
          endDate: fallbackPurchase?.endDate,
          expectedStartDate: fallbackPurchase?.expectedStartDate || null,
          expectedEndDate: fallbackPurchase?.expectedEndDate || null,
          parentPurchaseId: fallbackPurchase?.parentPaymentId || null,
          mealPlanCreated: fallbackPurchase?.mealPlanCreated,
          daysUsed: getEffectiveDaysUsed(fallbackPurchase),
          baseAmount: fallbackPurchase?.baseAmount,
          discountPercent: fallbackPurchase?.discountPercent,
          taxPercent: fallbackPurchase?.taxPercent,
          finalAmount: fallbackPurchase?.finalAmount
        } : null,
        message: hasPaidHistory
          ? 'Payment history found, but no remaining subscription days are available for creating a new meal plan.'
          : 'No active paid plan found. Client needs to purchase a plan first.',
        remainingDays: aggregatedRemainingDays,
        maxDays: aggregatedRemainingDays,
        totalDaysUsed: aggregatedTotalDaysUsed,
        totalPurchasedDays: aggregatedTotalPurchasedDays,
        allPurchases: [],
        diagnostics: {
          totalPaidPurchases: allPaidPurchases.length,
          dedupedPaidPurchases: dedupedPaidPurchases.length,
          duplicateEntriesDetected: Math.max(0, allPaidPurchases.length - dedupedPaidPurchases.length),
        }
      });
    }

    const aggregatedTotalPurchasedDays = computedPaidPurchases.reduce((sum: number, p: any) => sum + getEffectiveDurationDays(p), 0);
    const aggregatedTotalDaysUsed = computedPaidPurchases.reduce((sum: number, p: any) => sum + getEffectiveDaysUsed(p), 0);
    const aggregatedRemainingDays = Math.max(0, aggregatedTotalPurchasedDays - aggregatedTotalDaysUsed);

    const totalPurchasedDays = getEffectiveDurationDays(activePurchase);
    const totalDaysUsed = getEffectiveDaysUsed(activePurchase);
    const remainingDays = getEffectiveRemainingDays(activePurchase);

    const canCreate = remainingDays > 0 && (requestedDays === 0 || requestedDays <= remainingDays);

    const paymentDetails = {
      _id: activePurchase?._id,
      amount: activePurchase?.finalAmount,
      currency: activePurchase?.currency,
      status: activePurchase?.paymentStatus,
      paymentMethod: activePurchase?.paymentMethod,
      transactionId: activePurchase?.transactionId,
      paidAt: activePurchase?.paidAt ? new Date(activePurchase.paidAt) : null,
      mealPlanCreated: activePurchase?.mealPlanCreated || false,
      mealPlanId: activePurchase?.mealPlan || null,
    };

    const updatedClientStatus = await updateClientStatusBasedOnMealPlan(clientId);

    if (!canCreate || !accessContext.permissions.effectiveCreateMealPlans) {
      console.info('[MEAL_PLAN_ELIGIBILITY_DEBUG]', {
        clientId,
        hasPaidPlan: true,
        canCreateMealPlan: canCreate,
        role: session.user.role,
        activePurchaseId: activePurchase?._id?.toString?.() || null,
        activePurchaseStatus: activePurchase?.status || null,
        activePurchasePaymentStatus: activePurchase?.paymentStatus || null,
        remainingDays,
        requestedDays,
        accessContext,
      });
    }

    return NextResponse.json({
      success: true,
      hasPaidPlan: true,
      canCreateMealPlan: canCreate,
      access: accessContext,
      clientStatus: updatedClientStatus,
      purchase: {
        _id: activePurchase?._id,
        planName: activePurchase?.planName,
        planCategory: activePurchase?.planCategory,
        durationDays: getEffectiveDurationDays(activePurchase),
        durationLabel: activePurchase?.durationLabel,
        startDate: activePurchase?.startDate,
        endDate: activePurchase?.endDate,
        expectedStartDate: activePurchase?.expectedStartDate || null,
        expectedEndDate: activePurchase?.expectedEndDate || null,
        parentPurchaseId: activePurchase?.parentPaymentId || null,
        mealPlanCreated: activePurchase?.mealPlanCreated,
        daysUsed: totalDaysUsed,
        baseAmount: activePurchase?.baseAmount,
        discountPercent: activePurchase?.discountPercent,
        taxPercent: activePurchase?.taxPercent,
        finalAmount: activePurchase?.finalAmount
      },
      payment: paymentDetails,
      remainingDays,
      maxDays: remainingDays,
      totalDaysUsed,
      totalPurchasedDays,
      aggregated: {
        totalPurchases: computedPaidPurchases.length,
        totalPurchasedDays: aggregatedTotalPurchasedDays,
        totalDaysUsed: aggregatedTotalDaysUsed,
        totalRemainingDays: aggregatedRemainingDays,
        purchasesNeedingMealPlan: purchasesNeedingPlan.length
      },
      allPurchasesNeedingMealPlan: purchasesNeedingPlan.map((p: any) => ({
        _id: p._id,
        planName: p.planName,
        planCategory: p.planCategory,
        durationDays: getEffectiveDurationDays(p),
        durationLabel: p.durationLabel,
        daysUsed: getEffectiveDaysUsed(p),
        remainingDays: getEffectiveRemainingDays(p),
        mealPlanCreated: p.mealPlanCreated,
        startDate: p.startDate,
        endDate: p.endDate,
        expectedStartDate: p.expectedStartDate || null,
        expectedEndDate: p.expectedEndDate || null,
        parentPurchaseId: p.parentPaymentId || null,
        createdAt: p.createdAt
      })),
      diagnostics: {
        totalPaidPurchases: allPaidPurchases.length,
        dedupedPaidPurchases: dedupedPaidPurchases.length,
        duplicateEntriesDetected: Math.max(0, allPaidPurchases.length - dedupedPaidPurchases.length),
      },
      message: canCreate
        ? `Client has ${remainingDays} days remaining (${totalDaysUsed}/${totalPurchasedDays} days used) in their ${activePurchase.planName} plan.${purchasesNeedingPlan.length > 1 ? ` (${purchasesNeedingPlan.length} purchases need meal plans)` : ''}`
        : remainingDays === 0
          ? `All ${totalPurchasedDays} days have been used. Client needs to purchase a new plan.`
          : `Requested ${requestedDays} days but only ${remainingDays} days remaining in plan.`
    });
  } catch (error) {
    console.error('Error checking client paid plan:', error);
    return NextResponse.json({ error: 'Failed to check client paid plan' }, { status: 500 });
  }
}
