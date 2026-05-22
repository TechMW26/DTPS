import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import dbConnect from '@/lib/db/connect';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import ServicePlan, { ClientPurchase } from '@/lib/db/models/ServicePlan';
import { addDays, format, differenceInDays, startOfDay, parseISO } from 'date-fns';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// Helper function to calculate allowed freeze days based on plan duration in months (fallback)
function calculateAllowedFreezeDaysFallback(durationDays: number): number {
  // Calculate months (approximately 30 days per month)
  const months = Math.ceil(durationDays / 30);
  // Each month allows 10 days of freeze (fallback if not set in service plan)
  return months * 10;
}

// Helper function to get freeze days from purchase/service plan
// Checks: 1. ClientPurchase.selectedTier.freezeDays
//         2. UnifiedPayment → ServicePlan.pricingTiers (matching durationDays)
//         3. Falls back to calculated value
async function getFreezeDaysFromPurchase(purchaseId: string | null, durationDays: number): Promise<number> {
  if (!purchaseId) {
    return calculateAllowedFreezeDaysFallback(durationDays);
  }

  try {
    // First, try ClientPurchase model
    const clientPurchase: any = await ClientPurchase.findById(purchaseId).lean();
    if (clientPurchase?.selectedTier?.freezeDays && clientPurchase.selectedTier.freezeDays > 0) {
      return clientPurchase.selectedTier.freezeDays;
    }

    // Second, try UnifiedPayment model and fetch from ServicePlan
    const unifiedPayment: any = await UnifiedPayment.findById(purchaseId)
      .populate('servicePlan')
      .lean();

    if (unifiedPayment?.servicePlan) {
      const servicePlan = unifiedPayment.servicePlan;
      // Find the matching pricing tier based on duration
      const matchingTier = servicePlan.pricingTiers?.find(
        (tier: any) => tier.durationDays === (unifiedPayment.durationDays || durationDays) && tier.isActive
      );

      if (matchingTier?.freezeDays && matchingTier.freezeDays > 0) {
        return matchingTier.freezeDays;
      }
    }

    // Third, if UnifiedPayment has servicePlan reference, try direct ServicePlan lookup
    if (!unifiedPayment && clientPurchase?.servicePlan) {
      const servicePlan: any = await ServicePlan.findById(clientPurchase.servicePlan).lean();
      if (servicePlan?.pricingTiers) {
        const matchingTier = servicePlan.pricingTiers.find(
          (tier: any) => tier.durationDays === durationDays && tier.isActive
        );
        if (matchingTier?.freezeDays && matchingTier.freezeDays > 0) {
          return matchingTier.freezeDays;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching purchase for freeze days:', error);
  }

  // Fallback to calculated value if not found in any source
  return calculateAllowedFreezeDaysFallback(durationDays);
}

// Helper function to get aggregated freeze info from all plans linked to the same purchase
async function getSharedFreezeInfo(purchaseId: string | null, currentPlanId: string): Promise<{
  totalFreezeCount: number;
  allFreezedDays: any[];
  linkedPlanIds: string[];
  totalDurationDays: number;
}> {
  if (!purchaseId) {
    return { totalFreezeCount: 0, allFreezedDays: [], linkedPlanIds: [], totalDurationDays: 0 };
  }

  // Find all meal plans linked to the same purchase
  const linkedPlans: any[] = await ClientMealPlan.find({ purchaseId }).lean();

  let totalFreezeCount = 0;
  let allFreezedDays: any[] = [];
  let totalDurationDays = 0;
  const linkedPlanIds: string[] = [];

  for (const plan of linkedPlans) {
    linkedPlanIds.push(plan._id.toString());
    totalFreezeCount += plan.totalFreezeCount || 0;

    // Add all freezed days with plan info including reason and frozenBy
    const planFreezedDays = (plan.freezedDays || []).map((fd: any) => ({
      ...fd,
      reason: fd.reason || null,
      frozenBy: fd.frozenBy || null,
      planId: plan._id.toString(),
      planName: plan.name
    }));
    allFreezedDays = allFreezedDays.concat(planFreezedDays);

    // Calculate total duration across all linked plans
    const startDate = new Date(plan.startDate);
    const endDate = new Date(plan.endDate);
    totalDurationDays += differenceInDays(endDate, startDate) + 1;
  }

  return { totalFreezeCount, allFreezedDays, linkedPlanIds, totalDurationDays };
}

type PurchaseDateRecord = {
  _id: string;
  paymentLink?: string | null;
  expectedEndDate?: Date | null;
  endDate?: Date | null;
  updatedAt?: Date;
  createdAt?: Date;
};

async function resolveLinkedPurchaseTargets(purchaseId: string | null): Promise<{
  unifiedTargets: PurchaseDateRecord[];
  legacyTargets: PurchaseDateRecord[];
}> {
  if (!purchaseId) {
    return { unifiedTargets: [], legacyTargets: [] };
  }

  const selectFields = '_id paymentLink expectedEndDate endDate updatedAt createdAt';
  const unifiedTargetsMap = new Map<string, PurchaseDateRecord>();
  const legacyTargetsMap = new Map<string, PurchaseDateRecord>();

  const registerTarget = (map: Map<string, PurchaseDateRecord>, record: any) => {
    if (!record?._id) return;
    map.set(String(record._id), record as PurchaseDateRecord);
  };

  const [primaryUnifiedPurchase, primaryLegacyPurchase] = await Promise.all([
    UnifiedPayment.findById(purchaseId).select(selectFields).lean(),
    ClientPurchase.findById(purchaseId).select(selectFields).lean()
  ]);

  registerTarget(unifiedTargetsMap, primaryUnifiedPurchase);
  registerTarget(legacyTargetsMap, primaryLegacyPurchase);

  let relatedPaymentLinkId =
    primaryUnifiedPurchase?.paymentLink?.toString?.() ||
    primaryLegacyPurchase?.paymentLink?.toString?.() ||
    null;

  if (relatedPaymentLinkId) {
    const [linkedUnifiedTargets, linkedLegacyTargets] = await Promise.all([
      UnifiedPayment.find({ paymentLink: relatedPaymentLinkId }).select(selectFields).lean(),
      ClientPurchase.find({ paymentLink: relatedPaymentLinkId }).select(selectFields).lean()
    ]);

    linkedUnifiedTargets.forEach((record: any) => registerTarget(unifiedTargetsMap, record));
    linkedLegacyTargets.forEach((record: any) => registerTarget(legacyTargetsMap, record));
  }

  if (unifiedTargetsMap.size === 0 && legacyTargetsMap.size === 0) {
    const [fallbackUnifiedTargets, fallbackLegacyTargets] = await Promise.all([
      UnifiedPayment.find({ paymentLink: purchaseId }).select(selectFields).lean(),
      ClientPurchase.find({ paymentLink: purchaseId }).select(selectFields).lean()
    ]);

    fallbackUnifiedTargets.forEach((record: any) => registerTarget(unifiedTargetsMap, record));
    fallbackLegacyTargets.forEach((record: any) => registerTarget(legacyTargetsMap, record));
  }

  return {
    unifiedTargets: Array.from(unifiedTargetsMap.values()),
    legacyTargets: Array.from(legacyTargetsMap.values())
  };
}

async function resolveLatestLinkedMealPlanEndDate(purchaseId: string | null, fallbackDate: Date): Promise<Date> {
  if (!purchaseId) {
    return fallbackDate;
  }

  const linkedPlans = await ClientMealPlan.find({ purchaseId }).select('endDate updatedAt createdAt').lean();
  let latestEndDate = fallbackDate;

  for (const plan of linkedPlans) {
    const planEndDate = plan?.endDate ? new Date(plan.endDate) : null;
    if (!planEndDate || Number.isNaN(planEndDate.getTime())) continue;

    if (planEndDate.getTime() > latestEndDate.getTime()) {
      latestEndDate = planEndDate;
    }
  }

  return latestEndDate;
}

function resolvePurchaseExpectedEndBaseline(records: PurchaseDateRecord[], fallbackDate: Date): Date {
  if (records.length === 0) {
    return fallbackDate;
  }

  const sortedByFreshness = [...records].sort((a, b) => {
    const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return bTime - aTime;
  });

  for (const record of sortedByFreshness) {
    if (record?.expectedEndDate) return new Date(record.expectedEndDate);
  }

  for (const record of sortedByFreshness) {
    if (record?.endDate) return new Date(record.endDate);
  }

  return fallbackDate;
}

// GET - Get freeze information for a meal plan
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const { id } = await params;

    const mealPlan: any = await ClientMealPlan.findById(id).lean();

    if (!mealPlan) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 });
    }

    // Keep duration tied to original plan length (freeze days must not increase duration)
    const startDate = new Date(mealPlan.startDate);
    const endDate = new Date(mealPlan.endDate);
    const durationDays = mealPlan.duration || (differenceInDays(endDate, startDate) + 1);

    // Check if this plan is linked to a purchase (for shared freeze tracking)
    const purchaseId = mealPlan.purchaseId?.toString() || null;
    let totalFreezeCount = mealPlan.totalFreezeCount || 0;
    let freezedDays = mealPlan.freezedDays || [];

    // Get allowed freeze days from the purchase/service plan (database value)
    let allowedFreezeDays = await getFreezeDaysFromPurchase(purchaseId, durationDays);
    let isSharedFreeze = false;
    let linkedPlanCount = 0;

    if (purchaseId) {
      // Get aggregated freeze info from all plans linked to the same purchase
      const sharedInfo = await getSharedFreezeInfo(purchaseId, id);

      if (sharedInfo.linkedPlanIds.length > 1) {
        // Multiple plans share the same purchase - use aggregated data
        isSharedFreeze = true;
        linkedPlanCount = sharedInfo.linkedPlanIds.length;
        totalFreezeCount = sharedInfo.totalFreezeCount;
        freezedDays = sharedInfo.allFreezedDays;
        // For shared plans, still use the freeze days from purchase (not recalculated)
        // The allowedFreezeDays is already fetched from purchase above
      }
    }

    // Calculate remaining freeze days
    const remainingFreezeDays = Math.max(0, allowedFreezeDays - totalFreezeCount);

    return NextResponse.json({
      success: true,
      data: {
        planId: mealPlan._id,
        planName: mealPlan.name,
        startDate: mealPlan.startDate,
        endDate: mealPlan.endDate,
        durationDays,
        allowedFreezeDays,
        totalFreezeCount,
        remainingFreezeDays,
        freezedDays: freezedDays.map((fd: any) => ({
          date: fd.date,
          addedDate: fd.addedDate || null,
          reason: fd.reason || null,
          frozenBy: fd.frozenBy || null,
          createdAt: fd.createdAt,
          planId: fd.planId || null,
          planName: fd.planName || null
        })),
        canFreeze: remainingFreezeDays > 0,
        // Shared freeze tracking info
        isSharedFreeze,
        linkedPlanCount,
        purchaseId
      }
    });
  } catch (error) {
    console.error('Error getting freeze info:', error);
    return NextResponse.json({ error: 'Failed to get freeze information' }, { status: 500 });
  }
}

// POST - Freeze selected dates
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const { id } = await params;
    const body = await request.json();
    const { freezeDates, reason } = body; // Array of date strings in YYYY-MM-DD format + optional reason

    if (!freezeDates || !Array.isArray(freezeDates) || freezeDates.length === 0) {
      return NextResponse.json({ error: 'freezeDates array is required' }, { status: 400 });
    }

    // Get the user name for frozenBy field
    const frozenBy = session.user.name || session.user.email || 'Unknown';

    // Fetch the meal plan
    const mealPlan = await withCache(
      `client-meal-plans:id:freeze:${JSON.stringify(id)}`,
      async () => await ClientMealPlan.findById(id),
      { ttl: 120000, tags: ['client_meal_plans'] }
    );

    if (!mealPlan) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 });
    }

    // Calculate plan duration
    const startDate = startOfDay(new Date(mealPlan.startDate));
    const endDate = startOfDay(new Date(mealPlan.endDate));
    const durationDays = differenceInDays(endDate, startDate) + 1;

    // Check for shared freeze tracking
    const purchaseId = mealPlan.purchaseId?.toString() || null;
    let currentFreezeCount = mealPlan.totalFreezeCount || 0;

    // Get allowed freeze days from the purchase/service plan (database value)
    let allowedFreezeDays = await getFreezeDaysFromPurchase(purchaseId, durationDays);
    let existingFreezeSet = new Set(
      (mealPlan.freezedDays || []).map((fd: any) => format(new Date(fd.date), 'yyyy-MM-dd'))
    );

    if (purchaseId) {
      // Get aggregated freeze info from all plans linked to the same purchase
      const sharedInfo = await getSharedFreezeInfo(purchaseId, id);

      if (sharedInfo.linkedPlanIds.length > 1) {
        // Use aggregated freeze count from all linked plans
        currentFreezeCount = sharedInfo.totalFreezeCount;
        // For shared plans, still use the freeze days from purchase (not recalculated)
        // Build set of all frozen dates across all linked plans
        existingFreezeSet = new Set(
          sharedInfo.allFreezedDays.map((fd: any) => format(new Date(fd.date), 'yyyy-MM-dd'))
        );
      }
    }

    const existingFreezedDays = mealPlan.freezedDays || [];

    // Validate freeze dates
    const today = startOfDay(new Date());
    const validFreezeDates: Date[] = [];

    for (const dateStr of freezeDates) {
      const freezeDate = startOfDay(parseISO(dateStr));
      const formattedDate = format(freezeDate, 'yyyy-MM-dd');

      // Check if date is already frozen (across all linked plans if shared)
      if (existingFreezeSet.has(formattedDate)) {
        continue; // Skip already frozen dates
      }

      // Check if date is within plan range
      if (freezeDate < startDate || freezeDate > endDate) {
        return NextResponse.json({
          error: `Date ${formattedDate} is outside the plan range (${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')})`
        }, { status: 400 });
      }

      // Check if date is not in the past
      if (freezeDate < today) {
        return NextResponse.json({
          error: `Cannot freeze past date: ${formattedDate}`
        }, { status: 400 });
      }

      validFreezeDates.push(freezeDate);
    }

    if (validFreezeDates.length === 0) {
      return NextResponse.json({
        error: 'No valid dates to freeze. All dates may already be frozen.'
      }, { status: 400 });
    }

    // Check if we have enough remaining freeze days (considering shared tracking)
    const newTotalFreezeCount = currentFreezeCount + validFreezeDates.length;
    if (newTotalFreezeCount > allowedFreezeDays) {
      return NextResponse.json({
        error: `Cannot freeze ${validFreezeDates.length} days. Only ${allowedFreezeDays - currentFreezeCount} days remaining${purchaseId ? ' (shared across all plan phases)' : ''}.`,
        allowedFreezeDays,
        currentFreezeCount,
        requestedDays: validFreezeDates.length
      }, { status: 400 });
    }

    // Get meals array
    const meals = mealPlan.meals || [];
    const originalPhaseDuration = mealPlan.duration;

    // Sort freeze dates
    validFreezeDates.sort((a, b) => a.getTime() - b.getTime());

    // Find meals on freeze dates to COPY (not move)
    const mealsToCopy: any[] = [];

    for (const meal of meals) {
      const mealDate = startOfDay(new Date(meal.date));
      const mealDateStr = format(mealDate, 'yyyy-MM-dd');

      // Check if this meal's date is in the freeze dates
      const isFreezeDate = validFreezeDates.some(
        fd => format(fd, 'yyyy-MM-dd') === mealDateStr
      );

      if (isFreezeDate) {
        mealsToCopy.push({ ...meal }); // Create a copy
      }
    }

    // Find the last meal date in the existing meals array (to add after it)
    let lastMealDate = endDate;
    if (meals.length > 0) {
      const sortedMeals = [...meals].sort((a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const lastMealDateStr = sortedMeals[0].date;
      if (lastMealDateStr) {
        const parsedLastDate = startOfDay(new Date(lastMealDateStr));
        if (parsedLastDate > lastMealDate) {
          lastMealDate = parsedLastDate;
        }
      }
    }

    // Calculate new dates for the copied meals (after the LAST meal date, not endDate)
    const addedMealDates: string[] = [];
    const newMeals: any[] = [];

    for (let i = 0; i < mealsToCopy.length; i++) {
      const mealToCopy = mealsToCopy[i];
      const newDate = addDays(lastMealDate, i + 1);
      const dayNumber = differenceInDays(newDate, startDate);
      const newDateStr = format(newDate, 'yyyy-MM-dd');
      const newDateOfMonth = newDate.getDate();
      const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const newDayName = fullDayNames[newDate.getDay()];

      // Get original frozen day info for recovery label
      const originalDate = validFreezeDates[i] || validFreezeDates[0];
      const originalDateObj = new Date(originalDate);
      const originalDayOfMonth = originalDateObj.getDate();
      const originalDayName = fullDayNames[originalDateObj.getDay()];

      // Find the original day number from the original meal
      const originalMealIndex = meals.findIndex((m: any) => {
        if (!m?.date) return false;
        return format(startOfDay(new Date(m.date)), 'yyyy-MM-dd') === format(originalDate, 'yyyy-MM-dd');
      });
      const originalDayNum = originalMealIndex >= 0 ? originalMealIndex + 1 : i + 1;
      const originalFreezeDateLabel = `${originalDayOfMonth} - Day ${originalDayNum} - ${originalDayName}`;

      newMeals.push({
        ...mealToCopy,
        id: `day-${dayNumber}`,
        day: `${newDateOfMonth} - Day ${dayNumber + 1} - ${newDayName}`,
        date: newDateStr,
        isFreezeRecovery: true, // Mark as freeze recovery day
        originalFreezeDate: format(originalDate, 'yyyy-MM-dd'),
        originalFreezeDateLabel: originalFreezeDateLabel // e.g. "16 - Day 5 - Tuesday"
      });

      addedMealDates.push(newDateStr);
    }

    // Mark original frozen days with isFrozen: true
    const frozenDateStrings = validFreezeDates.map(d => format(d, 'yyyy-MM-dd'));
    const mealsWithFrozenMarked = meals.map((meal: any) => {
      const mealDateStr = meal?.date ? format(startOfDay(new Date(meal.date)), 'yyyy-MM-dd') : null;
      if (mealDateStr && frozenDateStrings.includes(mealDateStr)) {
        return { ...meal, isFrozen: true };
      }
      return meal;
    });

    // Combine existing meals (with frozen marked) with new copied meals
    const updatedMeals = [...mealsWithFrozenMarked, ...newMeals];

    // Sort meals by date
    updatedMeals.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });

    // Create new freeze day entries with added date info, reason, and frozenBy
    const newFreezeDays = validFreezeDates.map((date, index) => ({
      date: date,
      addedDate: addedMealDates[index] || null,
      reason: reason || null, // Optional reason for freezing
      frozenBy: frozenBy, // Who froze this date
      createdAt: new Date()
    }));

    // Calculate new end date by extending it by the number of frozen days
    const newEndDate = addDays(endDate, validFreezeDates.length);

    // Update the meal plan - extend endDate by frozen days count
    mealPlan.freezedDays = [...existingFreezedDays, ...newFreezeDays];
    // Update only THIS plan's freeze count (not the shared total)
    const thisPlanNewFreezeCount = (mealPlan.totalFreezeCount || 0) + validFreezeDates.length;
    mealPlan.totalFreezeCount = thisPlanNewFreezeCount;
    mealPlan.meals = updatedMeals;
    mealPlan.endDate = newEndDate; // Extend end date by frozen days
    mealPlan.duration = originalPhaseDuration; // Keep assigned phase duration immutable

    await mealPlan.save();

    // Also update UnifiedPayment end date and expected end date to keep in sync
    await UnifiedPayment.updateOne(
      { mealPlan: mealPlan._id },
      { $set: { endDate: newEndDate } }
    );

    // If this plan is linked to a purchase, extend linked purchase expected/end dates too
    if (purchaseId) {
      const linkedPurchaseTargets = await resolveLinkedPurchaseTargets(purchaseId);

      const purchaseRecords = [
        ...linkedPurchaseTargets.unifiedTargets,
        ...linkedPurchaseTargets.legacyTargets
      ];
      const newExpectedEndDate = await resolveLatestLinkedMealPlanEndDate(purchaseId, newEndDate);
      const purchaseUpdate = {
        $set: {
          expectedEndDate: newExpectedEndDate,
          endDate: newExpectedEndDate
        }
      };

      const unifiedTargetIds = linkedPurchaseTargets.unifiedTargets.map((record) => String(record._id));
      const legacyTargetIds = linkedPurchaseTargets.legacyTargets.map((record) => String(record._id));
      const updateOps: Promise<any>[] = [];

      if (unifiedTargetIds.length > 0) {
        updateOps.push(UnifiedPayment.updateMany({ _id: { $in: unifiedTargetIds } }, purchaseUpdate));
      }
      if (legacyTargetIds.length > 0) {
        updateOps.push(ClientPurchase.updateMany({ _id: { $in: legacyTargetIds } }, purchaseUpdate));
      }
      if (updateOps.length > 0) {
        await Promise.all(updateOps);
      }

      clearCacheByTag('client_purchases');
      clearCacheByTag('client_meal_plans');
    }

    // Calculate the new shared freeze count for the response
    const newSharedTotalFreezeCount = purchaseId
      ? (await getSharedFreezeInfo(purchaseId, id)).totalFreezeCount
      : thisPlanNewFreezeCount;

    return NextResponse.json({
      success: true,
      message: `Successfully froze ${validFreezeDates.length} days. Meals copied to new days. End date extended to ${format(newEndDate, 'yyyy-MM-dd')}.`,
      data: {
        planId: mealPlan._id,
        originalEndDate: format(endDate, 'yyyy-MM-dd'),
        newEndDate: format(newEndDate, 'yyyy-MM-dd'),
        totalFreezeCount: newSharedTotalFreezeCount, // Shared count if applicable
        thisPlanFreezeCount: thisPlanNewFreezeCount, // This plan's count only
        allowedFreezeDays,
        remainingFreezeDays: allowedFreezeDays - newSharedTotalFreezeCount,
        frozenDates: validFreezeDates.map(d => format(d, 'yyyy-MM-dd')),
        addedMealDates: addedMealDates,
        copiedMeals: mealsToCopy.length,
        isSharedFreeze: !!purchaseId
      }
    });

  } catch (error) {
    console.error('Error freezing dates:', error);
    return NextResponse.json({ error: 'Failed to freeze dates' }, { status: 500 });
  }
}

// DELETE - Unfreeze selected dates (revert to original state)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const { id } = await params;
    const body = await request.json();
    const { unfreezeDates } = body; // Array of date strings in YYYY-MM-DD format to unfreeze

    if (!unfreezeDates || !Array.isArray(unfreezeDates) || unfreezeDates.length === 0) {
      return NextResponse.json({ error: 'unfreezeDates array is required' }, { status: 400 });
    }

    // Fetch the meal plan
    const mealPlan = await withCache(
      `client-meal-plans:id:freeze:${JSON.stringify(id)}`,
      async () => await ClientMealPlan.findById(id),
      { ttl: 120000, tags: ['client_meal_plans'] }
    );

    if (!mealPlan) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 });
    }

    const meals = mealPlan.meals || [];
    const originalPhaseDuration = mealPlan.duration;
    const freezedDays = mealPlan.freezedDays || [];
    const currentFreezeCount = mealPlan.totalFreezeCount || 0;

    // Convert unfreeze dates to Set for quick lookup
    const unfreezeDateSet = new Set(unfreezeDates.map((d: string) => format(parseISO(d), 'yyyy-MM-dd')));

    // Find which frozen dates to remove
    const datesToUnfreeze: string[] = [];
    const addedDatesToRemove: string[] = [];

    for (const freezeDay of freezedDays) {
      const freezeDateStr = format(new Date(freezeDay.date), 'yyyy-MM-dd');
      if (unfreezeDateSet.has(freezeDateStr)) {
        datesToUnfreeze.push(freezeDateStr);
        if (freezeDay.addedDate) {
          addedDatesToRemove.push(format(new Date(freezeDay.addedDate), 'yyyy-MM-dd'));
        }
      }
    }

    if (datesToUnfreeze.length === 0) {
      return NextResponse.json({
        error: 'No matching frozen dates found to unfreeze'
      }, { status: 400 });
    }

    // Remove isFrozen flag from originally frozen days
    const updatedMeals = meals
      .filter((meal: any) => {
        const mealDateStr = meal?.date ? format(startOfDay(new Date(meal.date)), 'yyyy-MM-dd') : '';
        // Remove the freeze recovery meals that were added
        if (addedDatesToRemove.includes(mealDateStr)) {
          return false;
        }
        return true;
      })
      .map((meal: any) => {
        const mealDateStr = meal?.date ? format(startOfDay(new Date(meal.date)), 'yyyy-MM-dd') : '';
        // Remove isFrozen flag from unfrozen dates
        if (datesToUnfreeze.includes(mealDateStr) && meal.isFrozen) {
          const { isFrozen, ...mealWithoutFrozen } = meal;
          return mealWithoutFrozen;
        }
        return meal;
      });

    // Sort meals by date
    updatedMeals.sort((a: any, b: any) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });

    // Remove unfrozen dates from freezedDays array
    const updatedFreezedDays = freezedDays.filter((fd: any) => {
      const freezeDateStr = format(new Date(fd.date), 'yyyy-MM-dd');
      return !unfreezeDateSet.has(freezeDateStr);
    });

    const startDate = startOfDay(new Date(mealPlan.startDate));
    const currentEndDate = startOfDay(new Date(mealPlan.endDate));
    const lastUpdatedMeal = updatedMeals[updatedMeals.length - 1];
    const newEndDate = lastUpdatedMeal?.date
      ? startOfDay(parseISO(lastUpdatedMeal.date))
      : addDays(startDate, (originalPhaseDuration || 0) - 1);

    // NOTE: totalFreezeCount does NOT change on unfreeze
    // The freeze days are still "used" even after unfreezing
    // This means remaining freeze days won't increase when you unfreeze
    // Only the freezedDays array is updated to remove the unfrozen dates

    // Update the meal plan - keep totalFreezeCount unchanged
    mealPlan.meals = updatedMeals;
    mealPlan.freezedDays = updatedFreezedDays;
    // mealPlan.totalFreezeCount stays the same - freeze days are still "used"
    mealPlan.endDate = newEndDate;
    mealPlan.duration = originalPhaseDuration; // Keep assigned phase duration immutable

    await mealPlan.save();

    // Also update UnifiedPayment end date to keep in sync
    await UnifiedPayment.updateOne(
      { mealPlan: mealPlan._id },
      { $set: { endDate: newEndDate } }
    );

    // If linked to a purchase, keep linked expected/end dates aligned without decrementing
    const purchaseId = mealPlan.purchaseId?.toString() || null;
    if (purchaseId) {
      const linkedPurchaseTargets = await resolveLinkedPurchaseTargets(purchaseId);

      const purchaseRecords = [
        ...linkedPurchaseTargets.unifiedTargets,
        ...linkedPurchaseTargets.legacyTargets
      ];
      const newExpectedEndDate = await resolveLatestLinkedMealPlanEndDate(purchaseId, newEndDate);
      const purchaseUpdate = {
        $set: {
          expectedEndDate: newExpectedEndDate,
          endDate: newExpectedEndDate
        }
      };

      const unifiedTargetIds = linkedPurchaseTargets.unifiedTargets.map((record) => String(record._id));
      const legacyTargetIds = linkedPurchaseTargets.legacyTargets.map((record) => String(record._id));
      const updateOps: Promise<any>[] = [];

      if (unifiedTargetIds.length > 0) {
        updateOps.push(UnifiedPayment.updateMany({ _id: { $in: unifiedTargetIds } }, purchaseUpdate));
      }
      if (legacyTargetIds.length > 0) {
        updateOps.push(ClientPurchase.updateMany({ _id: { $in: legacyTargetIds } }, purchaseUpdate));
      }
      if (updateOps.length > 0) {
        await Promise.all(updateOps);
      }

      clearCacheByTag('client_purchases');
      clearCacheByTag('client_meal_plans');
    }

    // Recalculate allowed freeze days based on original duration
    const allowedFreezeDays = calculateAllowedFreezeDaysFallback(mealPlan.duration || differenceInDays(newEndDate, startDate) + 1);

    return NextResponse.json({
      success: true,
      message: `Successfully unfroze ${datesToUnfreeze.length} days. End date remains ${format(newEndDate, 'yyyy-MM-dd')} to preserve freeze-adjusted duration.`,
      data: {
        planId: mealPlan._id,
        previousEndDate: format(currentEndDate, 'yyyy-MM-dd'),
        newEndDate: format(newEndDate, 'yyyy-MM-dd'),
        totalFreezeCount: currentFreezeCount, // Unchanged - freeze days still "used"
        allowedFreezeDays,
        remainingFreezeDays: allowedFreezeDays - currentFreezeCount, // Remains same
        unfrozenDates: datesToUnfreeze,
        removedMealDates: addedDatesToRemove
      }
    });

  } catch (error) {
    console.error('Error unfreezing dates:', error);
    return NextResponse.json({ error: 'Failed to unfreeze dates' }, { status: 500 });
  }
}
