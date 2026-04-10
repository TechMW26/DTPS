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

// POST - Extend meal plan by creating a NEW meal plan for the extra days
// Does NOT modify the original meal plan's end date
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

        // ====== Extend the CURRENT meal plan in-place ======
        const originalEndDate = new Date(mealPlan.endDate);
        const newEndDate = addDays(originalEndDate, extendDays);
        const originalDuration = mealPlan.duration || Math.ceil((originalEndDate.getTime() - new Date(mealPlan.startDate).getTime()) / (1000 * 60 * 60 * 24));
        const newDuration = originalDuration + extendDays;

        // Update the meal plan's endDate and duration
        mealPlan.endDate = newEndDate;
        mealPlan.duration = newDuration;
        if (!mealPlan.customizations) {
            mealPlan.customizations = {};
        }
        (mealPlan.customizations as any).lastExtension = {
            extendedDays: extendDays,
            previousEndDate: originalEndDate,
            extendedAt: new Date(),
            extendedBy: session.user.id
        };
        await mealPlan.save();

        // ====== Update the linked purchase so totalPurchasedDays / expectedEndDate stay in sync ======
        if (purchaseId) {
            const purchaseUpdate: any = {
                $inc: { durationDays: extendDays }
            };

            // Also extend expectedEndDate if it exists
            const purchase: any = await UnifiedPayment.findById(purchaseId).lean();
            if (purchase) {
                if (purchase.expectedEndDate) {
                    purchaseUpdate.$set = {
                        ...(purchaseUpdate.$set || {}),
                        expectedEndDate: addDays(new Date(purchase.expectedEndDate), extendDays)
                    };
                }
                if (purchase.endDate) {
                    purchaseUpdate.$set = {
                        ...(purchaseUpdate.$set || {}),
                        endDate: addDays(new Date(purchase.endDate), extendDays)
                    };
                }
            }
            await UnifiedPayment.updateOne({ _id: purchaseId }, purchaseUpdate);
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
            description: `Extended meal plan "${mealPlan.name}" by ${extendDays} days (new end: ${format(newEndDate, 'yyyy-MM-dd')})`,
            performedById: session.user.id,
            metadata: {
                mealPlanId: id,
                extendDays,
                previousEndDate: format(originalEndDate, 'yyyy-MM-dd'),
                newEndDate: format(newEndDate, 'yyyy-MM-dd'),
                newDuration,
                remainingExtendDays: remainingExtendDays - extendDays
            }
        });

        return NextResponse.json({
            success: true,
            message: `Extended meal plan by ${extendDays} days. New end date: ${format(newEndDate, 'MMM d, yyyy')}`,
            plan: {
                _id: mealPlan._id,
                name: mealPlan.name,
                startDate: mealPlan.startDate,
                endDate: newEndDate,
                duration: newDuration,
                status: mealPlan.status
            },
            extendInfo: {
                maxExtendDays,
                usedExtendDays: alreadyExtended + extendDays,
                remainingExtendDays: remainingExtendDays - extendDays,
                previousEndDate: originalEndDate,
                newEndDate
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
