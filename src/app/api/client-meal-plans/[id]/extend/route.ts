import {planNeedsDateCorrection} from '@/lib/meal-plan-date-validity';
import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getNativeDatabase } from '@/lib/db/firestore-native';
import { NativePlanEditor, nativePlanStaffAccess } from '@/lib/db/repository/native-plan-editor';
import { clearCacheByTag } from '@/lib/cache/memoryCache';
import { logHistoryServer } from '@/lib/server/history';
import { addDays, format } from 'date-fns';
import { recalculateAndPersistClientStatus } from '@/lib/status/computeClientStatus';

function toPositiveDurationDays(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        const match = normalized.match(/(\d+(?:\.\d+)?)/);
        if (!match) return 0;

        const numeric = parseFloat(match[1]);
        if (!Number.isFinite(numeric) || numeric <= 0) return 0;

        if (/year|yr/.test(normalized)) return Math.floor(numeric * 365);
        if (/month|mo/.test(normalized)) return Math.floor(numeric * 30);
        if (/week|wk/.test(normalized)) return Math.floor(numeric * 7);

        return Math.floor(numeric);
    }

    return 0;
}

function getRecordBaseDurationDays(record: any): number {
    const selectedTierDuration = toPositiveDurationDays(record?.selectedTier?.durationDays);
    if (selectedTierDuration > 0) return selectedTierDuration;

    const durationLabelDays = toPositiveDurationDays(record?.durationLabel);
    if (durationLabelDays > 0) return durationLabelDays;

    return toPositiveDurationDays(record?.durationDays);
}

function getRecordUsedExtendDays(record: any): number {
    const explicitUsed = toPositiveDurationDays(record?.extendedDaysUsed);
    if (explicitUsed > 0) {
        return explicitUsed;
    }

    const currentDuration = toPositiveDurationDays(record?.durationDays);
    const baseDuration = getRecordBaseDurationDays(record);

    if (currentDuration > 0 && baseDuration > 0 && currentDuration > baseDuration) {
        return currentDuration - baseDuration;
    }

    return 0;
}

function resolveBaselineExpectedEndDate(records: any[], fallbackDate?: Date | null): Date | null {
    if (records.length > 0) {
        const sortedByFreshness = [...records].sort((a: any, b: any) => {
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
    }

    return fallbackDate || null;
}

function shiftDateValue(value: any, deltaDays: number): Date | null {
    if (!value || deltaDays === 0) return value ? new Date(value) : null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return addDays(date, deltaDays);
}

function sortPhasesForCascade(a: any, b: any): number {
    const aPhase = typeof a?.phaseNumber === 'number' ? a.phaseNumber : Number.MAX_SAFE_INTEGER;
    const bPhase = typeof b?.phaseNumber === 'number' ? b.phaseNumber : Number.MAX_SAFE_INTEGER;
    if (aPhase !== bPhase) return aPhase - bPhase;

    const aStart = new Date(a?.startDate || 0).getTime();
    const bStart = new Date(b?.startDate || 0).getTime();
    if (aStart !== bStart) return aStart - bStart;

    const aCreated = new Date(a?.createdAt || 0).getTime();
    const bCreated = new Date(b?.createdAt || 0).getTime();
    return aCreated - bCreated;
}

async function cascadeShiftLinkedPhases(
    editor: NativePlanEditor,
    clientId: string,
    purchaseId: string | null,
    anchorPlanId: string,
    deltaDays: number
): Promise<Array<{collection:string;id:string;patch:Record<string,any>}>> {
    if (!purchaseId || deltaDays === 0) return [];

    const linkedPlans=await editor.query('clientmealplans',[['purchaseId','==',purchaseId],['clientId','==',clientId]]);
    const mutations:Array<{collection:string;id:string;patch:Record<string,any>}>=[];
    if (linkedPlans.length <= 1) return mutations;

    const orderedPlans = linkedPlans.filter(plan=>!plan.isDeleted).sort(sortPhasesForCascade);
    const anchorIndex = orderedPlans.findIndex((plan) => String(plan._id) === String(anchorPlanId));
    if (anchorIndex < 0 || anchorIndex >= orderedPlans.length - 1) return mutations;

    for (let i = anchorIndex + 1; i < orderedPlans.length; i += 1) {
        const plan = await editor.hydrate(orderedPlans[i]);

        const shiftedStartDate = shiftDateValue(plan.startDate, deltaDays);
        const shiftedEndDate = shiftDateValue(plan.endDate, deltaDays);
        if (shiftedStartDate) plan.startDate = shiftedStartDate;
        if (shiftedEndDate) plan.endDate = shiftedEndDate;

        if (Array.isArray(plan.meals)) {
            plan.meals = plan.meals.map((meal: any) => {
                if (!meal?.date) return meal;
                const shiftedMealDate = shiftDateValue(meal.date, deltaDays);
                if (!shiftedMealDate) return meal;
                return {
                    ...meal,
                    date: shiftedMealDate
                };
            });
        }

        if (Array.isArray(plan.freezedDays)) {
            plan.freezedDays = plan.freezedDays.map((fd: any) => ({
                ...fd,
                date: shiftDateValue(fd?.date, deltaDays) || fd?.date,
                addedDate: fd?.addedDate ? (shiftDateValue(fd.addedDate, deltaDays) || fd.addedDate) : fd?.addedDate
            }));
        }

        mutations.push({collection:'clientmealplans',id:plan._id,patch:{startDate:plan.startDate,endDate:plan.endDate,...(plan.meals?{meals:plan.meals}:{}),...(plan.freezedDays?{freezedDays:plan.freezedDays}:{})}});
    }
    return mutations;
}

async function resolveLinkedPurchaseTargets(editor:NativePlanEditor, clientId:string, purchaseId: string | null): Promise<{
    unifiedTargets: any[];
    legacyTargets: any[];
    relatedPaymentLinkId: string | null;
}> {
    if (!purchaseId) {
        return {
            unifiedTargets: [],
            legacyTargets: [],
            relatedPaymentLinkId: null
        };
    }

    const unifiedTargetsMap = new Map<string, any>();
    const legacyTargetsMap = new Map<string, any>();

    const registerTarget = (map: Map<string, any>, record: any) => {
        if (!record?._id) return;
        if (String(record.client || record.clientId || '') !== clientId) throw new Error('Linked purchase ownership mismatch');
        map.set(String(record._id), record);
    };

    const [primaryUnifiedPurchase, primaryLegacyPurchase] = await Promise.all([
        editor.document('unifiedpayments',purchaseId),
        editor.document('clientpurchases',purchaseId)
    ]);

    registerTarget(unifiedTargetsMap, primaryUnifiedPurchase);
    registerTarget(legacyTargetsMap, primaryLegacyPurchase);

    let relatedPaymentLinkId =
        primaryUnifiedPurchase?.paymentLink?.toString?.() ||
        primaryLegacyPurchase?.paymentLink?.toString?.() ||
        null;

    if (relatedPaymentLinkId) {
        const [linkedUnifiedTargets, linkedLegacyTargets] = await Promise.all([
            editor.query('unifiedpayments',[['paymentLink','==',relatedPaymentLinkId]]),
            editor.query('clientpurchases',[['paymentLink','==',relatedPaymentLinkId]])
        ]);

        linkedUnifiedTargets.forEach((record: any) => registerTarget(unifiedTargetsMap, record));
        linkedLegacyTargets.forEach((record: any) => registerTarget(legacyTargetsMap, record));
    }

    // Backward compatibility: in older data, mealPlan.purchaseId may contain a paymentLink id.
    if (unifiedTargetsMap.size === 0 && legacyTargetsMap.size === 0) {
        const [fallbackUnifiedTargets, fallbackLegacyTargets] = await Promise.all([
            editor.query('unifiedpayments',[['paymentLink','==',purchaseId]]),
            editor.query('clientpurchases',[['paymentLink','==',purchaseId]])
        ]);

        fallbackUnifiedTargets.forEach((record: any) => registerTarget(unifiedTargetsMap, record));
        fallbackLegacyTargets.forEach((record: any) => registerTarget(legacyTargetsMap, record));

        if (!relatedPaymentLinkId && (fallbackUnifiedTargets.length > 0 || fallbackLegacyTargets.length > 0)) {
            relatedPaymentLinkId = purchaseId;
        }
    }

    return {
        unifiedTargets: Array.from(unifiedTargetsMap.values()),
        legacyTargets: Array.from(legacyTargetsMap.values()),
        relatedPaymentLinkId
    };
}

// Helper function to get extend days from purchase/service plan
// Checks: 1. ClientPurchase.selectedTier.extendDays
//         2. UnifiedPayment → ServicePlan.pricingTiers (matching durationDays)
//         3. Falls back to 0 (no extension allowed)
async function getExtendDaysFromPurchase(editor:NativePlanEditor, clientId:string, purchaseId: string | null, durationDays: number): Promise<number> {
    if (!purchaseId) {
        return 0;
    }

    try {
        // First, try ClientPurchase model
        const clientPurchase: any = await editor.document('clientpurchases',purchaseId);
        if(clientPurchase && String(clientPurchase.client || clientPurchase.clientId || '')!==clientId)throw new Error('Linked purchase ownership mismatch');
        if (clientPurchase?.selectedTier?.extendDays && clientPurchase.selectedTier.extendDays > 0) {
            return clientPurchase.selectedTier.extendDays;
        }

        // Second, try UnifiedPayment model and fetch from ServicePlan
        const unifiedPayment: any = await editor.document('unifiedpayments',purchaseId);

        if(unifiedPayment && String(unifiedPayment.client || '')!==clientId)throw new Error('Linked purchase ownership mismatch');
        if (unifiedPayment?.servicePlan) {
            const servicePlan = await editor.document('serviceplans',String(unifiedPayment.servicePlan));
            // Find the matching pricing tier based on duration
            const matchingTier = servicePlan?.pricingTiers?.find(
                (tier: any) => tier.durationDays === (unifiedPayment.durationDays || durationDays) && tier.isActive
            );

            if (matchingTier?.extendDays && matchingTier.extendDays > 0) {
                return matchingTier.extendDays;
            }
        }

        // Third, if UnifiedPayment has servicePlan reference, try direct ServicePlan lookup
        if (!unifiedPayment && clientPurchase?.servicePlan) {
            const servicePlan: any = await editor.document('serviceplans',String(clientPurchase.servicePlan));
            if (servicePlan?.pricingTiers) {
                const matchingTier = servicePlan.pricingTiers.find(
                    (tier: any) => tier.durationDays === durationDays && tier.isActive
                );
                if (matchingTier?.extendDays && matchingTier.extendDays > 0) {
                    return matchingTier.extendDays;
                }
            }
        }
    } catch (error) {
        console.error('Error fetching purchase for extend days:', error);
    }

    return 0;
}

// POST - Extend the linked purchase allocation and expected end date.
// This also extends the current phase timeline and shifts later linked phases.
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return nativeResponseJson(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const editor=new NativePlanEditor(getNativeDatabase());

        const { id } = await context.params;
        const body = await request.json();
        const { extendDays } = body;

        if (!Number.isSafeInteger(extendDays) || extendDays <= 0) {
            return nativeResponseJson(
                { success: false, error: 'Please specify valid number of days to extend' },
                { status: 400 }
            );
        }

        // Fetch the meal plan
        const mealPlan: any = await editor.plan(id);
        if (!mealPlan) {
            return nativeResponseJson(
                { success: false, error: 'Meal plan not found' },
                { status: 404 }
            );
        }

        // Only allow extending active plans
        if (mealPlan.status !== 'active') {
            return nativeResponseJson(
                { success: false, error: 'Can only extend active meal plans' },
                { status: 400 }
            );
        }

        if(!await nativePlanStaffAccess(editor,mealPlan,session.user)) return nativeResponseJson({success:false,error:'Forbidden'},{status:403});
    if(planNeedsDateCorrection(mealPlan))return nativeResponseJson({error:'An administrator must confirm missing plan dates first',code:'PLAN_DATES_NEED_CORRECTION'},{status:409});

        // Calculate duration days from meal plan
        const durationDays = mealPlan.durationDays ||
            Math.ceil((new Date(mealPlan.endDate).getTime() - new Date(mealPlan.startDate).getTime()) / (1000 * 60 * 60 * 24));

        // Get max extend days from purchase
        const purchaseId = mealPlan.purchaseId?.toString() || null;
        const maxExtendDays = await getExtendDaysFromPurchase(editor,String(mealPlan.clientId),purchaseId, durationDays);

        if (maxExtendDays <= 0) {
            return nativeResponseJson(
                { success: false, error: 'Extension feature is not available for this plan' },
                { status: 400 }
            );
        }

        // Track how many days have already been extended.
        // Priority: purchase-level tracked extension usage, with fallback to older extended-plan history.
        let alreadyExtended = 0;
        const linkedPurchaseTargets = await resolveLinkedPurchaseTargets(editor,String(mealPlan.clientId),purchaseId);
        if (purchaseId) {
            const allLinkedPlans = await editor.query('clientmealplans',[['purchaseId','==',purchaseId],['clientId','==',mealPlan.clientId],['isExtendedPlan','==',true]]);
            const legacyExtendedPlanUsed = allLinkedPlans.reduce((total: number, plan: any) => {
                return total + (plan.durationDays || 0);
            }, 0);

            const purchaseRecords = [
                ...linkedPurchaseTargets.unifiedTargets,
                ...linkedPurchaseTargets.legacyTargets
            ];
            const purchaseTrackedUsed = purchaseRecords.reduce((maxUsed: number, record: any) => {
                return Math.max(maxUsed, getRecordUsedExtendDays(record));
            }, 0);

            alreadyExtended = Math.max(legacyExtendedPlanUsed, purchaseTrackedUsed);
        }

        const remainingExtendDays = Math.max(0, maxExtendDays - alreadyExtended);

        if (remainingExtendDays <= 0) {
            return nativeResponseJson(
                { success: false, error: 'No extend days remaining in this plan' },
                { status: 400 }
            );
        }

        // Check if requested days exceed remaining
        if (extendDays > remainingExtendDays) {
            return nativeResponseJson(
                {
                    success: false,
                    error: `Cannot extend by ${extendDays} days. Only ${remainingExtendDays} extend days remaining.`
                },
                { status: 400 }
            );
        }

        // Extend current phase timeline and shift later linked phases by the same delta.
        const previousMealPlanEndDate = new Date(mealPlan.endDate);
        const currentMealPlanDuration = toPositiveDurationDays(mealPlan.duration) ||
            Math.max(1, Math.ceil((new Date(mealPlan.endDate).getTime() - new Date(mealPlan.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);

        const newMealPlanEndDate = addDays(previousMealPlanEndDate, extendDays);
        const mutations=await cascadeShiftLinkedPhases(editor,String(mealPlan.clientId),purchaseId,String(mealPlan._id),extendDays);
        mutations.push({collection:'clientmealplans',id:String(mealPlan._id),patch:{endDate:newMealPlanEndDate}});


        // ====== Update linked purchase allocation + expected end date (legacy and unified safe) ======
        let previousExpectedEndDate: Date | null = null;
        let newExpectedEndDate: Date | null = null;
        if (purchaseId) {
            const purchaseRecords = [
                ...linkedPurchaseTargets.unifiedTargets,
                ...linkedPurchaseTargets.legacyTargets
            ];

            previousExpectedEndDate = resolveBaselineExpectedEndDate(
                purchaseRecords,
                mealPlan?.endDate ? new Date(mealPlan.endDate) : null
            );

            if (!previousExpectedEndDate && mealPlan?.endDate) {
                previousExpectedEndDate = new Date(mealPlan.endDate);
            }

            // Calculate new values ONCE from the primary purchase record (unstarted or first one)
            const primaryRecord = purchaseRecords.length > 0 ? purchaseRecords[0] : null;

            if (!primaryRecord) {
                return nativeResponseJson(
                    { success: false, error: 'Linked purchase not found for this meal plan' },
                    { status: 404 }
                );
            }

            const currentDurationDays = primaryRecord?.durationDays || 0;
            const currentExtendedDays = primaryRecord?.extendedDaysUsed || 0;
            const currentRemainingDays = primaryRecord?.remainingDays || 0;

            // Build the update object with calculated values (single calculation, applied to all)
            const purchaseUpdate: any = {
                $set: {
                    durationDays: currentDurationDays + extendDays,
                    extendedDaysUsed: currentExtendedDays + extendDays,
                    remainingDays: currentRemainingDays + extendDays
                }
            };

            if (previousExpectedEndDate) {
                newExpectedEndDate = addDays(previousExpectedEndDate, extendDays);
                // Keep both expectedEndDate and endDate in sync when extending
                purchaseUpdate.$set.expectedEndDate = newExpectedEndDate;
                purchaseUpdate.$set.endDate = newExpectedEndDate;
            }

            for(const record of linkedPurchaseTargets.unifiedTargets) mutations.push({collection:'unifiedpayments',id:String(record._id),patch:purchaseUpdate.$set});
            for(const record of linkedPurchaseTargets.legacyTargets) mutations.push({collection:'clientpurchases',id:String(record._id),patch:purchaseUpdate.$set});
        }
        if(!await editor.commit(mutations))return nativeResponseJson({success:false,error:'The plan or purchase changed. Refresh and try again.'},{status:409});

        // Clear caches
        clearCacheByTag('client_meal_plans');
        clearCacheByTag('client_purchases');
        clearCacheByTag(`client:${mealPlan.clientId}`);

        // Extending the Expected End Date may flip the client between ACTIVE/INACTIVE —
        // recompute from the single source of truth.
        if (newExpectedEndDate && mealPlan.clientId) {
            try {
                await recalculateAndPersistClientStatus(String(mealPlan.clientId), {
                    trigger: 'meal_plan_extended',
                    changedBy: session.user.id,
                    relatedEvent: `mealPlan:${id}`,
                });
            } catch (statusError) {
                console.error('Error recalculating client status after meal plan extend:', statusError);
            }
        }

        // Log history
        await logHistoryServer({
            userId: mealPlan.clientId.toString(),
            action: 'update',
            category: 'diet',
            description: `Extended purchase expected end date for meal plan "${mealPlan.name}" by ${extendDays} days`,
            performedById: session.user.id,
            metadata: {
                mealPlanId: id,
                extendDays,
                previousExpectedEndDate: previousExpectedEndDate ? format(previousExpectedEndDate, 'yyyy-MM-dd') : null,
                newExpectedEndDate: newExpectedEndDate ? format(newExpectedEndDate, 'yyyy-MM-dd') : null,
                mealPlanEndDate: format(previousMealPlanEndDate, 'yyyy-MM-dd'),
                newMealPlanEndDate: format(newMealPlanEndDate, 'yyyy-MM-dd'),
                mealPlanDuration: currentMealPlanDuration,
                remainingExtendDays: remainingExtendDays - extendDays
            }
        });


        return nativeResponseJson({
            success: true,
            message: newExpectedEndDate
                ? `Extended plan by ${extendDays} days. New expected end: ${format(newExpectedEndDate, 'MMM d, yyyy')}`
                : `Extended plan allocation by ${extendDays} days.`,
            plan: {
                _id: mealPlan._id,
                name: mealPlan.name,
                startDate: mealPlan.startDate,
                endDate: newMealPlanEndDate,
                duration: currentMealPlanDuration,
                status: mealPlan.status
            },
            extendInfo: {
                maxExtendDays,
                usedExtendDays: alreadyExtended + extendDays,
                remainingExtendDays: remainingExtendDays - extendDays,
                previousExpectedEndDate,
                newExpectedEndDate,
                mealPlanEndDate: newMealPlanEndDate,
                mealPlanDuration: currentMealPlanDuration
            }
        });
    } catch (error: any) {
        console.error('Error extending meal plan:', error);
        console.error('Error details:', error?.message, error?.errors);
        return nativeResponseJson(
            {
                success: false,
                error: error?.message || 'Failed to extend meal plan',
                details: error?.errors ? Object.keys(error.errors).map(k => `${k}: ${error.errors[k].message}`).join(', ') : undefined
            },
            { status: 500 }
        );
    }
}

// GET - Get extend info for a meal plan
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return nativeResponseJson(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const editor=new NativePlanEditor(getNativeDatabase());

        const { id } = await context.params;

        // Fetch the meal plan
        const mealPlan: any = await editor.plan(id);
        if (!mealPlan) {
            return nativeResponseJson(
                { success: false, error: 'Meal plan not found' },
                { status: 404 }
            );
        }

        if(!await nativePlanStaffAccess(editor,mealPlan,session.user)) return nativeResponseJson({success:false,error:'Forbidden'},{status:403});
    if(planNeedsDateCorrection(mealPlan))return nativeResponseJson({error:'An administrator must confirm missing plan dates first',code:'PLAN_DATES_NEED_CORRECTION'},{status:409});

        // Calculate duration days from meal plan
        const durationDays = mealPlan.durationDays ||
            Math.ceil((new Date(mealPlan.endDate).getTime() - new Date(mealPlan.startDate).getTime()) / (1000 * 60 * 60 * 24));

        // Get max extend days from purchase
        const purchaseId = mealPlan.purchaseId?.toString() || null;
        const maxExtendDays = await getExtendDaysFromPurchase(editor,String(mealPlan.clientId),purchaseId, durationDays);

        // Calculate used extend days using purchase-level tracked usage,
        // with fallback to older extended-plan history.
        let usedExtendDays = 0;
        const linkedPurchaseTargets = await resolveLinkedPurchaseTargets(editor,String(mealPlan.clientId),purchaseId);
        if (purchaseId) {
            const extendedPlans = await editor.query('clientmealplans',[['purchaseId','==',purchaseId],['clientId','==',mealPlan.clientId],['isExtendedPlan','==',true]]);
            const legacyExtendedPlanUsed = extendedPlans.reduce((total: number, plan: any) => {
                return total + (plan.durationDays || 0);
            }, 0);

            const purchaseRecords = [
                ...linkedPurchaseTargets.unifiedTargets,
                ...linkedPurchaseTargets.legacyTargets
            ];

            const purchaseTrackedUsed = purchaseRecords.reduce((maxUsed: number, record: any) => {
                return Math.max(maxUsed, getRecordUsedExtendDays(record));
            }, 0);

            usedExtendDays = Math.max(legacyExtendedPlanUsed, purchaseTrackedUsed);
        }

        const remainingExtendDays = Math.max(0, maxExtendDays - usedExtendDays);

        // Get plan name if available
        const servicePlanName =
            linkedPurchaseTargets.legacyTargets.find((record: any) => record?.planName)?.planName ||
            linkedPurchaseTargets.unifiedTargets.find((record: any) => record?.planName)?.planName ||
            '';

        const purchaseRecords = [
            ...linkedPurchaseTargets.unifiedTargets,
            ...linkedPurchaseTargets.legacyTargets
        ];
        const currentExpectedEndDate = resolveBaselineExpectedEndDate(
            purchaseRecords,
            mealPlan?.endDate ? new Date(mealPlan.endDate) : null
        );

        return nativeResponseJson({
            success: true,
            canExtend: remainingExtendDays > 0 && mealPlan.status === 'active',
            maxExtendDays,
            usedExtendDays,
            remainingExtendDays,
            currentEndDate: currentExpectedEndDate || mealPlan.endDate,
            currentExpectedEndDate,
            currentMealPlanEndDate: mealPlan.endDate,
            planStatus: mealPlan.status,
            servicePlanName,
            // Additional info for UI
            isExtendedPlan: mealPlan.isExtendedPlan || false,
            willCreateNewPlan: false
        });
    } catch (error) {
        console.error('Error getting extend info:', error);
        return nativeResponseJson(
            { success: false, error: 'Failed to get extend info' },
            { status: 500 }
        );
    }
}
