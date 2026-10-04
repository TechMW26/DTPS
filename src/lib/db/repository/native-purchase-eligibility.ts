import type {Firestore,DocumentData} from 'firebase-admin/firestore';
import {Filter} from 'firebase-admin/firestore';
import {nativeDates} from './native-plan-editor';
import {nativeFinanceActor,nativeFinanceClient} from './native-finance-access';
import {nativeHabitDay} from './native-habits';
import {NativeCheckoutError} from './native-checkout';
import {canonicalizePurchaseRecords} from '@/lib/payments/canonicalize-purchases';
import {resolveEntitlementEndDateCoveringRemainingDays} from '@/lib/payments/entitlement-dates';
import {computeClientStatusFromDocs} from '@/lib/status/computeClientStatus';
function toPositiveDurationDays(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
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
      const diff =
        Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) +
        1;
      return Math.max(0, diff);
    }
  }

  return 0;
}

function toValidDate(value: unknown): Date | null {
  if (!value) return null;

  const parsed = new Date(value as any);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getEffectiveDurationDays(purchase: any): number {
  if (typeof purchase?.__effectiveDurationDays === "number") {
    return purchase.__effectiveDurationDays;
  }

  const sourceDurationDays = getDurationDaysFromSource(purchase);
  if (sourceDurationDays > 0) {
    return sourceDurationDays;
  }

  // Fallback for records where duration metadata is missing but day counters exist.
  const inferredDaysUsed = Math.max(0, Number(purchase?.daysUsed || 0));
  const inferredRemainingDays = Math.max(
    0,
    Number(purchase?.remainingDays || 0),
  );
  return Math.max(0, inferredDaysUsed + inferredRemainingDays);
}

function getEffectiveDaysUsed(purchase: any): number {
  if (typeof purchase?.__effectiveDaysUsed === "number") {
    return purchase.__effectiveDaysUsed;
  }
  return Math.max(0, Number(purchase?.daysUsed || 0));
}

function getEffectiveRemainingDays(purchase: any): number {
  if (typeof purchase?.__effectiveRemainingDays === "number") {
    return purchase.__effectiveRemainingDays;
  }
  return Math.max(
    0,
    getEffectiveDurationDays(purchase) - getEffectiveDaysUsed(purchase),
  );
}


export async function nativePurchaseEligibility(db:Firestore,actorId:string,clientId:string,requestedDays:number,effectiveCreateMealPlans:boolean){
 if(!Number.isSafeInteger(requestedDays)||requestedDays<0)throw new NativeCheckoutError('Invalid requested days',400);
 const actor=await nativeFinanceActor(db,actorId),client=await nativeFinanceClient(db,actor,clientId);
 const accessContext={requestedBy:{userId:actor.id,role:actor.role},permissions:{roleBasedCreateMealPlans:['admin','dietitian'].includes(actor.role),effectiveCreateMealPlans,effectiveReason:null}};
 const [payments,plans]=await Promise.all([
 db.collection('unifiedpayments').where('client','==',clientId).where(Filter.or(Filter.where('paymentStatus','==','paid'),Filter.where('status','in',['paid','completed','active']))).get(),
 db.collection('clientmealplans').where('clientId','==',clientId).where('status','in',['active','completed','paused']).select('purchaseId','duration','startDate','endDate','status','isDeleted').get()]);
 const allPaidPurchases=payments.docs.map(row=>({...nativeDates(row.data()),_id:row.id})),canonicalizedPurchases=canonicalizePurchaseRecords(allPaidPurchases),dedupedPaidPurchases=canonicalizedPurchases.purchases.sort((a:any,b:any)=>new Date(a.createdAt||0).getTime()-new Date(b.createdAt||0).getTime());
 const now=nativeHabitDay(null).start,linkedMealPlans=plans.docs.filter(row=>!row.get('isDeleted')&&row.get('purchaseId')).map(row=>nativeDates(row.data()));
 const updatedClientStatus=computeClientStatusFromDocs(allPaidPurchases,!!client.holdStatus?.isOnHold);
 const isPurchaseEligibleForPlanning=(purchase:any)=>getEffectiveRemainingDays(purchase)>0;
    const latestMealPlanEndDateByPurchase = new Map<string, Date>();
    for (const plan of linkedMealPlans) {
      const purchaseKey = String((plan as any).purchaseId);
      const planEndDate = toValidDate((plan as any).endDate);
      if (!purchaseKey || !planEndDate) {
        continue;
      }

      const existingEndDate = latestMealPlanEndDateByPurchase.get(purchaseKey);
      if (
        !existingEndDate ||
        planEndDate.getTime() > existingEndDate.getTime()
      ) {
        latestMealPlanEndDateByPurchase.set(purchaseKey, planEndDate);
      }
    }

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
        (usedDaysByPurchase.get(purchaseKey) || 0) + planDuration,
      );
      mealPlansByPurchase.set(
        purchaseKey,
        (mealPlansByPurchase.get(purchaseKey) || 0) + 1,
      );
    }

    const computedPaidPurchases = dedupedPaidPurchases.map((purchase: any) => {
      const purchaseId =
        purchase?._id?.toString?.() || String(purchase?._id || "");
      const durationDays = getEffectiveDurationDays(purchase);
      const linkedDaysUsed = usedDaysByPurchase.get(purchaseId);
      const linkedMealPlanCount = mealPlansByPurchase.get(purchaseId) || 0;
      const hasExplicitDuration = getDurationDaysFromSource(purchase) > 0;
      const storedDaysUsed = Math.max(0, Number(purchase?.daysUsed ?? (purchase?.remainingDays !== undefined ? durationDays - Number(purchase.remainingDays) : 0)));
      const storedRemainingDays = Math.max(0, Number(purchase?.remainingDays ?? (durationDays - storedDaysUsed)));

      // UnifiedPayment counters are the source of truth for UI/API responses.
      // Linked meal plans are only a fallback for legacy records that never had counters populated.
      const hasStoredCounters =
        purchase?.daysUsed !== undefined ||
        purchase?.remainingDays !== undefined;

      const countersExceedDuration =
        storedDaysUsed > durationDays ||
        storedDaysUsed + storedRemainingDays > durationDays;

      let effectiveDaysUsed = hasStoredCounters
        ? storedDaysUsed
        : typeof linkedDaysUsed === "number"
          ? linkedDaysUsed
          : storedDaysUsed;

      // If stored counters are inconsistent (e.g. 45 used for a 30-day plan),
      // prefer linked meal-plan usage when available and always cap by duration.
      if (hasStoredCounters && countersExceedDuration) {
        if (typeof linkedDaysUsed === "number") {
          effectiveDaysUsed = linkedDaysUsed;
        }
        effectiveDaysUsed = Math.min(
          durationDays,
          Math.max(0, effectiveDaysUsed),
        );
      }

      const isClearlyUnstartedFuturePurchase = Boolean(
        hasExplicitDuration &&
        linkedMealPlanCount === 0 &&
        purchase?.mealPlanCreated !== true &&
        purchase?.expectedStartDate &&
        new Date(purchase.expectedStartDate).getTime() > now.getTime(),
      );

      // Imported purchases occasionally carry the previous subscription's
      // counters. A future allocation with no linked plan is unequivocally
      // unstarted, so those stale counters must not appear as days used.
      if (isClearlyUnstartedFuturePurchase) {
        effectiveDaysUsed = 0;
      }

      // Do not auto-consume full duration just because a meal plan exists.
      // Multi-phase plans under a single purchase must continue to use real counters.

      // Future scheduled purchases should not consume allocation until they start.
      // Only normalize to zero when we do not have authoritative stored counters.
      if (
        typeof linkedDaysUsed !== "number" &&
        !hasStoredCounters &&
        purchase?.expectedStartDate &&
        new Date(purchase.expectedStartDate).getTime() > now.getTime()
      ) {
        effectiveDaysUsed = 0;
      }

      // Unstarted purchase should not be blocked by stale daysUsed.
      // Keep stored counters when they already exist; otherwise fall back to zero.
      if (
        typeof linkedDaysUsed !== "number" &&
        !hasStoredCounters &&
        purchase?.mealPlanCreated !== true
      ) {
        effectiveDaysUsed = 0;
      }

      // Keep stored counters by default, but normalize inconsistent values.
      const effectiveRemainingDays = isClearlyUnstartedFuturePurchase
        ? durationDays
        : hasStoredCounters && !countersExceedDuration
          ? storedRemainingDays
          : Math.max(0, durationDays - effectiveDaysUsed);

      const linkedMealPlanEndDate =
        latestMealPlanEndDateByPurchase.get(purchaseId) || null;
      const resolvedExpectedEndDate =
        resolveEntitlementEndDateCoveringRemainingDays({
          expectedStartDate: purchase?.expectedStartDate,
          expectedEndDate: purchase?.expectedEndDate,
          endDate: purchase?.endDate,
          durationLabel: purchase?.durationLabel,
          durationDays: purchase?.durationDays,
          linkedMealPlanEndDate,
          remainingDays: effectiveRemainingDays,
        });

      (purchase as any).__effectiveDurationDays = durationDays;
      (purchase as any).__effectiveDaysUsed = effectiveDaysUsed;
      (purchase as any).__effectiveRemainingDays = effectiveRemainingDays;
      (purchase as any).__resolvedExpectedEndDate = resolvedExpectedEndDate;

      return purchase;
    });

    const allActivePurchases = computedPaidPurchases.filter((purchase: any) =>
      isPurchaseEligibleForPlanning(purchase),
    );

    const isWithinExpectedWindow = (purchase: any): boolean => {
      if (!purchase?.expectedStartDate) return false;

      const start = new Date(purchase.expectedStartDate);
      const end = new Date(
        purchase.__resolvedExpectedEndDate ||
          purchase.expectedEndDate ||
          purchase.endDate ||
          purchase.expectedStartDate,
      );

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
        return false;

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
          return (
            new Date(a.expectedStartDate).getTime() -
            new Date(b.expectedStartDate).getTime()
          );
        }
        if (a.expectedStartDate && !b.expectedStartDate) return -1;
        if (!a.expectedStartDate && b.expectedStartDate) return 1;
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });

    let activePurchase: any =
      partiallyUsedPurchase ||
      (unstartedPurchases.length > 0 ? unstartedPurchases[0] : null);

    if (!activePurchase) {
      activePurchase =
        allActivePurchases.find((p: any) => getEffectiveRemainingDays(p) > 0) ||
        null;
    }

    const purchasesNeedingPlan = [
      ...(partiallyUsedPurchase ? [partiallyUsedPurchase] : []),
      ...unstartedPurchases.filter(
        (p: any) => p._id.toString() !== partiallyUsedPurchase?._id?.toString(),
      ),
    ];

    if (!activePurchase && allActivePurchases.length > 0) {
      activePurchase = allActivePurchases[0];
    }

    if (!activePurchase) {
      const hasPaidHistory = computedPaidPurchases.length > 0;
      const fallbackPurchase = hasPaidHistory
        ? computedPaidPurchases[computedPaidPurchases.length - 1]
        : null;

      const aggregatedTotalPurchasedDays = computedPaidPurchases.reduce(
        (sum: number, p: any) => sum + getEffectiveDurationDays(p),
        0,
      );
      const aggregatedTotalDaysUsed = computedPaidPurchases.reduce(
        (sum: number, p: any) => sum + getEffectiveDaysUsed(p),
        0,
      );
      const aggregatedRemainingDays = Math.max(
        0,
        aggregatedTotalPurchasedDays - aggregatedTotalDaysUsed,
      );

      // Allow multi-phase planning: if aggregated remaining days > 0, user can create a new meal plan
      const canCreate =
        aggregatedRemainingDays > 0 &&
        accessContext.permissions.effectiveCreateMealPlans;

      return ({
        success: true,
        hasPaidPlan: hasPaidHistory,
        canCreateMealPlan: canCreate && accessContext.permissions.effectiveCreateMealPlans,
        access: accessContext,
        clientStatus: updatedClientStatus,
        purchase: fallbackPurchase
          ? {
              _id: fallbackPurchase?._id,
              planName: fallbackPurchase?.planName,
              planCategory: fallbackPurchase?.planCategory,
              durationDays: getEffectiveDurationDays(fallbackPurchase),
              durationLabel: fallbackPurchase?.durationLabel,
              startDate: fallbackPurchase?.startDate,
              endDate: fallbackPurchase?.endDate,
              expectedStartDate: fallbackPurchase?.expectedStartDate || null,
              expectedEndDate:
                fallbackPurchase?.__resolvedExpectedEndDate ||
                fallbackPurchase?.expectedEndDate ||
                null,
              parentPurchaseId: fallbackPurchase?.parentPaymentId || null,
              mealPlanCreated: fallbackPurchase?.mealPlanCreated,
              daysUsed: getEffectiveDaysUsed(fallbackPurchase),
              baseAmount: fallbackPurchase?.baseAmount,
              discountPercent: fallbackPurchase?.discountPercent,
              taxPercent: fallbackPurchase?.taxPercent,
              finalAmount: fallbackPurchase?.finalAmount,
            }
          : null,
        message: hasPaidHistory
          ? "Payment history found, but no remaining subscription days are available for creating a new meal plan."
          : "No active paid plan found. Client needs to purchase a plan first.",
        remainingDays: aggregatedRemainingDays,
        maxDays: aggregatedRemainingDays,
        totalDaysUsed: aggregatedTotalDaysUsed,
        totalPurchasedDays: aggregatedTotalPurchasedDays,
        allPurchases: [],
        diagnostics: {
          totalPaidPurchases: allPaidPurchases.length,
          dedupedPaidPurchases: dedupedPaidPurchases.length,
          duplicateEntriesDetected:
            canonicalizedPurchases.duplicateEntriesDetected,
        },
      });
    }

    const aggregatedTotalPurchasedDays = computedPaidPurchases.reduce(
      (sum: number, p: any) => sum + getEffectiveDurationDays(p),
      0,
    );
    const aggregatedTotalDaysUsed = computedPaidPurchases.reduce(
      (sum: number, p: any) => sum + getEffectiveDaysUsed(p),
      0,
    );
    const aggregatedRemainingDays = Math.max(
      0,
      aggregatedTotalPurchasedDays - aggregatedTotalDaysUsed,
    );

    const totalPurchasedDays = getEffectiveDurationDays(activePurchase);
    const totalDaysUsed = getEffectiveDaysUsed(activePurchase);
    const remainingDays = getEffectiveRemainingDays(activePurchase);

    const canCreate =
      remainingDays > 0 &&
      (requestedDays === 0 || requestedDays <= remainingDays);

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

    if (!canCreate || !accessContext.permissions.effectiveCreateMealPlans) {
    }

    return ({
      success: true,
      hasPaidPlan: true,
      canCreateMealPlan: canCreate && accessContext.permissions.effectiveCreateMealPlans,
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
        expectedEndDate:
          activePurchase?.__resolvedExpectedEndDate ||
          activePurchase?.expectedEndDate ||
          null,
        parentPurchaseId: activePurchase?.parentPaymentId || null,
        mealPlanCreated: activePurchase?.mealPlanCreated,
        daysUsed: totalDaysUsed,
        baseAmount: activePurchase?.baseAmount,
        discountPercent: activePurchase?.discountPercent,
        taxPercent: activePurchase?.taxPercent,
        finalAmount: activePurchase?.finalAmount,
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
        purchasesNeedingMealPlan: purchasesNeedingPlan.length,
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
        expectedEndDate:
          p.__resolvedExpectedEndDate || p.expectedEndDate || null,
        parentPurchaseId: p.parentPaymentId || null,
        createdAt: p.createdAt,
      })),
      diagnostics: {
        totalPaidPurchases: allPaidPurchases.length,
        dedupedPaidPurchases: dedupedPaidPurchases.length,
        duplicateEntriesDetected:
          canonicalizedPurchases.duplicateEntriesDetected,
      },
      message: canCreate
        ? `Client has ${remainingDays} days remaining (${totalDaysUsed}/${totalPurchasedDays} days used) in their ${activePurchase.planName} plan.${purchasesNeedingPlan.length > 1 ? ` (${purchasesNeedingPlan.length} purchases need meal plans)` : ""}`
        : remainingDays === 0
          ? `All ${totalPurchasedDays} days have been used. Client needs to purchase a new plan.`
          : `Requested ${requestedDays} days but only ${remainingDays} days remaining in plan.`,
    });

}
