import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import dbConnect from '@/lib/db/connect';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import ServicePlan, { ClientPurchase } from '@/lib/db/models/ServicePlan';
import { clearCacheByTag } from '@/lib/api/utils';
import { logHistoryServer } from '@/lib/server/history';
import { addDays, format } from 'date-fns';

const PURCHASE_TRACKING_FIELDS = [
    '_id',
    'paymentLink',
    'planName',
    'durationDays',
    'durationLabel',
    'selectedTier',
    'extendedDaysUsed',
    'expectedEndDate',
    'endDate',
    'updatedAt',
    'createdAt'
].join(' ');

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

async function resolveLinkedPurchaseTargets(purchaseId: string | null): Promise<{
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
        map.set(String(record._id), record);
    };

    const [primaryUnifiedPurchase, primaryLegacyPurchase] = await Promise.all([
        UnifiedPayment.findById(purchaseId)
            .select(PURCHASE_TRACKING_FIELDS)
            .lean(),
        ClientPurchase.findById(purchaseId)
            .select(PURCHASE_TRACKING_FIELDS)
            .lean()
    ]);

    registerTarget(unifiedTargetsMap, primaryUnifiedPurchase);
    registerTarget(legacyTargetsMap, primaryLegacyPurchase);

    let relatedPaymentLinkId =
        primaryUnifiedPurchase?.paymentLink?.toString?.() ||
        primaryLegacyPurchase?.paymentLink?.toString?.() ||
        null;

    if (relatedPaymentLinkId) {
        const [linkedUnifiedTargets, linkedLegacyTargets] = await Promise.all([
            UnifiedPayment.find({ paymentLink: relatedPaymentLinkId })
                .select(PURCHASE_TRACKING_FIELDS)
                .lean(),
            ClientPurchase.find({ paymentLink: relatedPaymentLinkId })
                .select(PURCHASE_TRACKING_FIELDS)
                .lean()
        ]);

        linkedUnifiedTargets.forEach((record: any) => registerTarget(unifiedTargetsMap, record));
        linkedLegacyTargets.forEach((record: any) => registerTarget(legacyTargetsMap, record));
    }

    // Backward compatibility: in older data, mealPlan.purchaseId may contain a paymentLink id.
    if (unifiedTargetsMap.size === 0 && legacyTargetsMap.size === 0) {
        const [fallbackUnifiedTargets, fallbackLegacyTargets] = await Promise.all([
            UnifiedPayment.find({ paymentLink: purchaseId })
                .select(PURCHASE_TRACKING_FIELDS)
                .lean(),
            ClientPurchase.find({ paymentLink: purchaseId })
                .select(PURCHASE_TRACKING_FIELDS)
                .lean()
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
async function getExtendDaysFromPurchase(purchaseId: string | null, durationDays: number): Promise<number> {
    if (!purchaseId) {
        return 0;
    }

    try {
        // First, try ClientPurchase model
        const clientPurchase: any = await ClientPurchase.findById(purchaseId).lean();
        if (clientPurchase?.selectedTier?.extendDays && clientPurchase.selectedTier.extendDays > 0) {
            return clientPurchase.selectedTier.extendDays;
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

            if (matchingTier?.extendDays && matchingTier.extendDays > 0) {
                return matchingTier.extendDays;
            }
        }

        // Third, if UnifiedPayment has servicePlan reference, try direct ServicePlan lookup
        if (!unifiedPayment && clientPurchase?.servicePlan) {
            const servicePlan: any = await ServicePlan.findById(clientPurchase.servicePlan).lean();
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
// This does NOT modify the current meal plan end date.
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        await dbConnect();

        const { id } = await context.params;
        const body = await request.json();
        const { extendDays } = body;

        if (!extendDays || extendDays <= 0) {
            return NextResponse.json(
                { success: false, error: 'Please specify valid number of days to extend' },
                { status: 400 }
            );
        }

        // Fetch the meal plan
        const mealPlan: any = await ClientMealPlan.findById(id);
        if (!mealPlan) {
            return NextResponse.json(
                { success: false, error: 'Meal plan not found' },
                { status: 404 }
            );
        }

        // Only allow extending active plans
        if (mealPlan.status !== 'active') {
            return NextResponse.json(
                { success: false, error: 'Can only extend active meal plans' },
                { status: 400 }
            );
        }

        // Calculate duration days from meal plan
        const durationDays = mealPlan.durationDays ||
            Math.ceil((new Date(mealPlan.endDate).getTime() - new Date(mealPlan.startDate).getTime()) / (1000 * 60 * 60 * 24));

        // Get max extend days from purchase
        const purchaseId = mealPlan.purchaseId?.toString() || null;
        const maxExtendDays = await getExtendDaysFromPurchase(purchaseId, durationDays);

        if (maxExtendDays <= 0) {
            return NextResponse.json(
                { success: false, error: 'Extension feature is not available for this plan' },
                { status: 400 }
            );
        }

        // Track how many days have already been extended.
        // Priority: purchase-level tracked extension usage, with fallback to older extended-plan history.
        let alreadyExtended = 0;
        const linkedPurchaseTargets = await resolveLinkedPurchaseTargets(purchaseId);
        if (purchaseId) {
            const allLinkedPlans = await ClientMealPlan.find({
                purchaseId: purchaseId,
                isExtendedPlan: true
            }).lean();
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
            return NextResponse.json(
                { success: false, error: 'No extend days remaining in this plan' },
                { status: 400 }
            );
        }

        // Check if requested days exceed remaining
        if (extendDays > remainingExtendDays) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Cannot extend by ${extendDays} days. Only ${remainingExtendDays} extend days remaining.`
                },
                { status: 400 }
            );
        }

        // Keep the current meal plan timeline unchanged.
        // Extend should only update the linked purchase allocation/expected dates,
        // not the end date or duration of the meal plan where the action was triggered.
        const previousMealPlanEndDate = new Date(mealPlan.endDate);
        const currentMealPlanDuration = toPositiveDurationDays(mealPlan.duration) ||
            Math.max(1, Math.ceil((new Date(mealPlan.endDate).getTime() - new Date(mealPlan.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);

        console.log(`[EXTEND_DEBUG] Meal plan ${id}:`, {
            mealPlanEndDate: format(previousMealPlanEndDate, 'yyyy-MM-dd'),
            mealPlanDuration: currentMealPlanDuration,
            purchaseId: purchaseId,
            extendDays: extendDays
        });

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
                return NextResponse.json(
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
                purchaseUpdate.$set.expectedEndDate = newExpectedEndDate;
            }

            const unifiedTargetIds = linkedPurchaseTargets.unifiedTargets.map((record: any) => String(record._id));
            const legacyTargetIds = linkedPurchaseTargets.legacyTargets.map((record: any) => String(record._id));

            const updateOps: Promise<any>[] = [];
            if (unifiedTargetIds.length > 0) {
                updateOps.push(
                    UnifiedPayment.updateMany(
                        { _id: { $in: unifiedTargetIds } },
                        purchaseUpdate
                    )
                );
            }

            if (legacyTargetIds.length > 0) {
                updateOps.push(
                    ClientPurchase.updateMany(
                        { _id: { $in: legacyTargetIds } },
                        purchaseUpdate
                    )
                );
            }

            if (updateOps.length === 0) {
                return NextResponse.json(
                    { success: false, error: 'Linked purchase not found for this meal plan' },
                    { status: 404 }
                );
            }

            await Promise.all(updateOps);
        }

        // Clear caches
        clearCacheByTag('client_meal_plans');
        clearCacheByTag('client_purchases');
        clearCacheByTag(`client:${mealPlan.clientId}`);

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
                mealPlanDuration: currentMealPlanDuration,
                remainingExtendDays: remainingExtendDays - extendDays
            }
        });

        console.log(`[EXTEND_RESULT] Purchase ${purchaseId}:`, {
            previousExpectedEndDate: previousExpectedEndDate ? format(previousExpectedEndDate, 'yyyy-MM-dd') : null,
            newExpectedEndDate: newExpectedEndDate ? format(newExpectedEndDate, 'yyyy-MM-dd') : null,
            mealPlanEndDate: format(previousMealPlanEndDate, 'yyyy-MM-dd'),
            remainingExtendDaysLeft: remainingExtendDays - extendDays
        });

        return NextResponse.json({
            success: true,
            message: newExpectedEndDate
                ? `Extended plan by ${extendDays} days. New expected end: ${format(newExpectedEndDate, 'MMM d, yyyy')}`
                : `Extended plan allocation by ${extendDays} days.`,
            plan: {
                _id: mealPlan._id,
                name: mealPlan.name,
                startDate: mealPlan.startDate,
                endDate: previousMealPlanEndDate,
                duration: currentMealPlanDuration,
                status: mealPlan.status
            },
            extendInfo: {
                maxExtendDays,
                usedExtendDays: alreadyExtended + extendDays,
                remainingExtendDays: remainingExtendDays - extendDays,
                previousExpectedEndDate,
                newExpectedEndDate,
                mealPlanEndDate: previousMealPlanEndDate,
                mealPlanDuration: currentMealPlanDuration
            }
        });
    } catch (error: any) {
        console.error('Error extending meal plan:', error);
        console.error('Error details:', error?.message, error?.errors);
        return NextResponse.json(
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
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        await dbConnect();

        const { id } = await context.params;

        // Fetch the meal plan
        const mealPlan: any = await ClientMealPlan.findById(id);
        if (!mealPlan) {
            return NextResponse.json(
                { success: false, error: 'Meal plan not found' },
                { status: 404 }
            );
        }

        // Calculate duration days from meal plan
        const durationDays = mealPlan.durationDays ||
            Math.ceil((new Date(mealPlan.endDate).getTime() - new Date(mealPlan.startDate).getTime()) / (1000 * 60 * 60 * 24));

        // Get max extend days from purchase
        const purchaseId = mealPlan.purchaseId?.toString() || null;
        const maxExtendDays = await getExtendDaysFromPurchase(purchaseId, durationDays);

        // Calculate used extend days using purchase-level tracked usage,
        // with fallback to older extended-plan history.
        let usedExtendDays = 0;
        const linkedPurchaseTargets = await resolveLinkedPurchaseTargets(purchaseId);
        if (purchaseId) {
            const extendedPlans = await ClientMealPlan.find({
                purchaseId: purchaseId,
                isExtendedPlan: true
            }).lean();
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

        return NextResponse.json({
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
        return NextResponse.json(
            { success: false, error: 'Failed to get extend info' },
            { status: 500 }
        );
    }
}
