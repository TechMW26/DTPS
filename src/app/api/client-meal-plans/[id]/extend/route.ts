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

        // Track how many days have already been extended (across all extended plans for this payment)
        // Count extension history from ALL plans linked to this payment
        let alreadyExtended = 0;
        if (purchaseId) {
            const allLinkedPlans = await ClientMealPlan.find({
                purchaseId: purchaseId,
                isExtendedPlan: true
            }).lean();
            alreadyExtended = allLinkedPlans.reduce((total: number, plan: any) => {
                return total + (plan.durationDays || 0);
            }, 0);
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

        // Keep meal plan end date unchanged as requested.
        const currentMealPlanEndDate = new Date(mealPlan.endDate);

        // ====== Update linked purchase allocation + expected end date (legacy and unified safe) ======
        let previousExpectedEndDate: Date | null = null;
        let newExpectedEndDate: Date | null = null;
        if (purchaseId) {
            const purchaseUpdate: any = {
                $inc: { durationDays: extendDays }
            };

            const selectPurchaseFields = '_id paymentLink expectedEndDate endDate updatedAt createdAt';

            const primaryUnifiedPurchase: any = await UnifiedPayment.findById(purchaseId)
                .select(selectPurchaseFields)
                .lean();

            const primaryLegacyPurchase: any = !primaryUnifiedPurchase
                ? await ClientPurchase.findById(purchaseId)
                    .select(selectPurchaseFields)
                    .lean()
                : null;

            const unifiedTargetsMap = new Map<string, any>();
            const legacyTargetsMap = new Map<string, any>();

            const registerTarget = (map: Map<string, any>, record: any) => {
                if (!record?._id) return;
                map.set(String(record._id), record);
            };

            registerTarget(unifiedTargetsMap, primaryUnifiedPurchase);
            registerTarget(legacyTargetsMap, primaryLegacyPurchase);

            const relatedPaymentLinkId =
                primaryUnifiedPurchase?.paymentLink?.toString?.() ||
                primaryLegacyPurchase?.paymentLink?.toString?.() ||
                null;

            if (relatedPaymentLinkId) {
                const [linkedUnifiedTargets, linkedLegacyTargets] = await Promise.all([
                    UnifiedPayment.find({ paymentLink: relatedPaymentLinkId })
                        .select(selectPurchaseFields)
                        .lean(),
                    ClientPurchase.find({ paymentLink: relatedPaymentLinkId })
                        .select(selectPurchaseFields)
                        .lean()
                ]);

                linkedUnifiedTargets.forEach((record: any) => registerTarget(unifiedTargetsMap, record));
                linkedLegacyTargets.forEach((record: any) => registerTarget(legacyTargetsMap, record));
            }

            // Backward compatibility: in older data, mealPlan.purchaseId may contain a paymentLink id.
            if (unifiedTargetsMap.size === 0 && legacyTargetsMap.size === 0) {
                const [fallbackUnifiedTargets, fallbackLegacyTargets] = await Promise.all([
                    UnifiedPayment.find({ paymentLink: purchaseId })
                        .select(selectPurchaseFields)
                        .lean(),
                    ClientPurchase.find({ paymentLink: purchaseId })
                        .select(selectPurchaseFields)
                        .lean()
                ]);

                fallbackUnifiedTargets.forEach((record: any) => registerTarget(unifiedTargetsMap, record));
                fallbackLegacyTargets.forEach((record: any) => registerTarget(legacyTargetsMap, record));
            }

            const resolveBaselineEndDate = (record: any): Date | null => {
                if (record?.expectedEndDate) return new Date(record.expectedEndDate);
                if (record?.endDate) return new Date(record.endDate);
                return null;
            };

            const baselineCandidates = [
                primaryUnifiedPurchase,
                ...Array.from(unifiedTargetsMap.values()),
                primaryLegacyPurchase,
                ...Array.from(legacyTargetsMap.values())
            ];

            for (const candidate of baselineCandidates) {
                const candidateDate = resolveBaselineEndDate(candidate);
                if (candidateDate) {
                    previousExpectedEndDate = candidateDate;
                    break;
                }
            }

            if (!previousExpectedEndDate && mealPlan?.endDate) {
                previousExpectedEndDate = new Date(mealPlan.endDate);
            }

            if (previousExpectedEndDate) {
                newExpectedEndDate = addDays(previousExpectedEndDate, extendDays);
                purchaseUpdate.$set = {
                    ...(purchaseUpdate.$set || {}),
                    expectedEndDate: newExpectedEndDate,
                    endDate: newExpectedEndDate
                };
            }

            const unifiedTargetIds = Array.from(unifiedTargetsMap.keys());
            const legacyTargetIds = Array.from(legacyTargetsMap.keys());

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
                mealPlanEndDateUnchanged: format(currentMealPlanEndDate, 'yyyy-MM-dd'),
                remainingExtendDays: remainingExtendDays - extendDays
            }
        });

        return NextResponse.json({
            success: true,
            message: newExpectedEndDate
                ? `Extended expected end date by ${extendDays} days. New expected end: ${format(newExpectedEndDate, 'MMM d, yyyy')}`
                : `Extended allocation by ${extendDays} days.`,
            plan: {
                _id: mealPlan._id,
                name: mealPlan.name,
                startDate: mealPlan.startDate,
                endDate: mealPlan.endDate,
                duration: mealPlan.duration,
                status: mealPlan.status
            },
            extendInfo: {
                maxExtendDays,
                usedExtendDays: alreadyExtended + extendDays,
                remainingExtendDays: remainingExtendDays - extendDays,
                previousExpectedEndDate,
                newExpectedEndDate,
                mealPlanEndDate: mealPlan.endDate
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

        // Calculate used extend days from all extended plans linked to this payment
        let usedExtendDays = 0;
        if (purchaseId) {
            const extendedPlans = await ClientMealPlan.find({
                purchaseId: purchaseId,
                isExtendedPlan: true
            }).lean();
            usedExtendDays = extendedPlans.reduce((total: number, plan: any) => {
                return total + (plan.durationDays || 0);
            }, 0);
        }

        const remainingExtendDays = Math.max(0, maxExtendDays - usedExtendDays);

        // Get plan name if available
        let servicePlanName = '';
        if (purchaseId) {
            const clientPurchase: any = await ClientPurchase.findById(purchaseId).lean();
            if (clientPurchase?.planName) {
                servicePlanName = clientPurchase.planName;
            } else {
                const unifiedPayment: any = await UnifiedPayment.findById(purchaseId).lean();
                servicePlanName = unifiedPayment?.planName || '';
            }
        }

        return NextResponse.json({
            success: true,
            canExtend: remainingExtendDays > 0 && mealPlan.status === 'active',
            maxExtendDays,
            usedExtendDays,
            remainingExtendDays,
            currentEndDate: mealPlan.endDate,
            planStatus: mealPlan.status,
            servicePlanName,
            // Additional info for UI
            isExtendedPlan: mealPlan.isExtendedPlan || false,
            willCreateNewPlan: true // Inform UI that extend creates a new plan
        });
    } catch (error) {
        console.error('Error getting extend info:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to get extend info' },
            { status: 500 }
        );
    }
}
