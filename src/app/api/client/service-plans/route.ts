import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import dbConnect from '@/lib/db/connect';
import { ServicePlan } from '@/lib/db/models/ServicePlan';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import User from '@/lib/db/models/User';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET - Fetch service plans visible to clients (for user dashboard)
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        // Fetch the client's primary dietitian from User model (not from payment)
        const clientUser = await User.findById(session.user.id)
            .select('assignedDietitian')
            .populate('assignedDietitian', 'firstName lastName email phone avatar role')
            .lean() as any;

        const primaryDietitian = clientUser?.assignedDietitian;

        // Check if client has any purchases in UnifiedPayment collection (paid status)
        const allPurchases = await withCache(
            `client:service-plans:${JSON.stringify({
                client: session.user.id,
                status: { $in: ['paid', 'completed'] },
                paymentStatus: 'paid'
            })}`,
            async () => await UnifiedPayment.find({
                client: session.user.id,
                status: { $in: ['paid', 'completed'] },
                paymentStatus: 'paid'
            }).populate('dietitian', 'firstName lastName email phone avatar role').sort({ createdAt: -1 }),
            { ttl: 120000, tags: ['client'] }
        );

        // Check if client has an active meal plan running (current date within plan dates)
        const activeClientMealPlan = await ClientMealPlan.findOne({
            clientId: session.user.id,
            status: 'active',
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() }
        }).lean() as any;

        const hasActiveMealPlan = !!activeClientMealPlan;

        // Get the current active meal plan details (for showing correct dates)
        const currentMealPlanDetails = activeClientMealPlan ? {
            name: activeClientMealPlan.name || activeClientMealPlan.planName,
            startDate: activeClientMealPlan.startDate,
            endDate: activeClientMealPlan.endDate,
            duration: activeClientMealPlan.duration || Math.ceil((new Date(activeClientMealPlan.endDate).getTime() - new Date(activeClientMealPlan.startDate).getTime()) / (1000 * 60 * 60 * 24)),
            goal: activeClientMealPlan.goal
        } : null;

        // With UnifiedPayment, we already have all payment data in allPurchases
        const completedPayments = allPurchases;

        // Check for active purchases specifically (paid and not expired)
        const activePurchases = allPurchases.filter(p =>
            p.paymentStatus === 'paid' && (!p.endDate || new Date(p.endDate) >= new Date())
        );
        const hasActivePlan = activePurchases.length > 0;

        // Check if there are any purchases OR payments at all (to hide swiper)
        const hasAnyPurchase = allPurchases.length > 0 || completedPayments.length > 0;

        // Check for pending purchases (purchased but no dietitian assigned yet)
        const hasPendingDietitianAssignment = allPurchases.some(p => !p.dietitian);

        // Fetch service plans that are active and visible to clients
        const plans = await withCache(
            `client:service-plans:${JSON.stringify({
                isActive: true,
                showToClients: true
            })}`,
            async () => await ServicePlan.find({
                isActive: true,
                showToClients: true
            }).sort({ createdAt: -1 }),
            { ttl: 120000, tags: ['client'] }
        );

        return NextResponse.json({
            success: true,
            plans,
            hasActivePlan,
            hasAnyPurchase,
            hasPendingDietitianAssignment,
            hasActiveMealPlan,
            currentMealPlan: currentMealPlanDetails,
            activePurchases: allPurchases.map(p => {
                const paymentDietitian = p.dietitian as any;
                // Use primary dietitian from User model if available and is a dietitian role
                // Otherwise fall back to payment dietitian only if they are a dietitian (not health_counselor)
                const isPrimaryDietitian = primaryDietitian && primaryDietitian.role === 'dietitian';
                const isPaymentDietitian = paymentDietitian && paymentDietitian.role === 'dietitian';

                // Prefer primary dietitian, then payment dietitian (only if role is dietitian)
                const dietitianToShow = isPrimaryDietitian ? primaryDietitian : (isPaymentDietitian ? paymentDietitian : null);

                // Check if this purchase has an active meal plan running
                // Either mealPlanCreated flag is true OR there's an active ClientMealPlan
                const isMealPlanActive = Boolean(p.mealPlanCreated) || hasActiveMealPlan;

                // Use meal plan dates if available, otherwise use payment dates
                const mealPlanStartDate = hasActiveMealPlan && currentMealPlanDetails ? currentMealPlanDetails.startDate : p.startDate;
                const mealPlanEndDate = hasActiveMealPlan && currentMealPlanDetails ? currentMealPlanDetails.endDate : p.endDate;
                const mealPlanDuration = hasActiveMealPlan && currentMealPlanDetails ? currentMealPlanDetails.duration : p.durationDays;

                return {
                    _id: p._id,
                    planName: p.planName,
                    planCategory: p.planCategory,
                    durationDays: mealPlanDuration,
                    durationLabel: p.durationLabel,
                    startDate: mealPlanStartDate,
                    endDate: mealPlanEndDate,
                    status: p.status,
                    hasDietitian: !!dietitianToShow,
                    mealPlanCreated: isMealPlanActive,
                    // Also include meal plan specific info
                    mealPlanName: currentMealPlanDetails?.name || null,
                    mealPlanGoal: currentMealPlanDetails?.goal || null,
                    // Show only the primary dietitian (from User.assignedDietitian), not health counselors
                    dietitian: dietitianToShow ? {
                        id: dietitianToShow._id,
                        name: `${dietitianToShow.firstName || ''} ${dietitianToShow.lastName || ''}`.trim(),
                        email: dietitianToShow.email,
                        phone: dietitianToShow.phone,
                        avatar: dietitianToShow.avatar
                    } : null
                };
            })
        });
    } catch (error) {
        console.error('Error fetching service plans for client:', error);
        return NextResponse.json({ error: 'Failed to fetch service plans' }, { status: 500 });
    }
}
