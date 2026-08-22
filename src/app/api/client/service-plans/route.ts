import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import dbConnect from '@/lib/db/connect';
import { ServicePlan } from '@/lib/db/models/ServicePlan';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import User from '@/lib/db/models/User';
import { withCache } from '@/lib/api/utils';
import { prioritizeClientDashboardPurchases } from '@/lib/client-plan-visibility';

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
                status: { $in: ['paid', 'completed', 'active'] },
                paymentStatus: 'paid'
            })}`,
            async () => await UnifiedPayment.find({
                client: session.user.id,
                status: { $in: ['paid', 'completed', 'active'] },
                paymentStatus: 'paid'
            }).populate('dietitian', 'firstName lastName email phone avatar role').sort({ createdAt: -1 }),
            { ttl: 120000, tags: ['client'] }
        );

        // Check if client has an active meal plan running (current date within plan dates)
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);

        const activeClientMealPlan = await ClientMealPlan.findOne({
            clientId: session.user.id,
            status: 'active',
            isDeleted: { $ne: true },
            startDate: { $lte: endOfToday },
            endDate: { $gte: startOfToday }
        })
            .sort({ startDate: -1, lastPublishedAt: -1, createdAt: -1 })
            .lean() as any;

        const hasActiveMealPlan = !!activeClientMealPlan;

        // Get the current active meal plan details (for showing correct dates)
        const currentMealPlanDetails = activeClientMealPlan ? {
            name: activeClientMealPlan.name || activeClientMealPlan.planName,
            startDate: activeClientMealPlan.startDate,
            endDate: activeClientMealPlan.endDate,
            duration: activeClientMealPlan.duration || Math.ceil((new Date(activeClientMealPlan.endDate).getTime() - new Date(activeClientMealPlan.startDate).getTime()) / (1000 * 60 * 60 * 24)),
            goal: activeClientMealPlan.goal,
            purchaseId: activeClientMealPlan.purchaseId ? String(activeClientMealPlan.purchaseId) : null
        } : null;

        // With UnifiedPayment, we already have all payment data in allPurchases
        const completedPayments = allPurchases;

        // Check for active purchases specifically (paid and not expired)
        const activePurchaseRecords = allPurchases.filter((p: any) =>
            p.paymentStatus === 'paid' &&
            (
                (!p.expectedEndDate && !p.endDate) ||
                new Date(p.expectedEndDate || p.endDate) >= startOfToday
            )
        );
        const hasActivePlan = activePurchaseRecords.length > 0;

        // Early-retention records are newer than the purchase currently delivering
        // the client's diet. Always surface the purchase that owns today's published
        // meal plan first so a future renewal cannot produce a false "Plan Soon" state.
        const purchasesToDisplay = prioritizeClientDashboardPurchases(
            activePurchaseRecords.length > 0 ? activePurchaseRecords : allPurchases,
            activeClientMealPlan?.purchaseId,
            now,
        );

        // Build a per-purchase map of the latest created meal plan (active/paused/completed),
        // so upcoming plans are shown as created even before their start date.
        const purchaseIds = purchasesToDisplay
            .map((purchase: any) => purchase?._id)
            .filter(Boolean);

        const linkedMealPlans = purchaseIds.length > 0
            ? await ClientMealPlan.find({
                clientId: session.user.id,
                purchaseId: { $in: purchaseIds },
                status: { $in: ['active', 'paused', 'completed'] },
                isDeleted: { $ne: true }
            })
                .select('purchaseId name startDate endDate duration goals status createdAt')
                .sort({ createdAt: -1 })
                .lean()
            : [];

        const latestMealPlanByPurchaseId = new Map<string, any>();
        for (const plan of linkedMealPlans as any[]) {
            const key = plan?.purchaseId ? String(plan.purchaseId) : null;
            if (!key) continue;
            if (!latestMealPlanByPurchaseId.has(key)) {
                latestMealPlanByPurchaseId.set(key, plan);
            }
        }

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
            activePurchases: purchasesToDisplay.map(p => {
                const paymentDietitian = p.dietitian as any;
                // Use primary dietitian from User model if available and is a dietitian role
                // Otherwise fall back to payment dietitian only if they are a dietitian (not health_counselor)
                const isPrimaryDietitian = primaryDietitian && primaryDietitian.role === 'dietitian';
                const isPaymentDietitian = paymentDietitian && paymentDietitian.role === 'dietitian';

                // Prefer primary dietitian, then payment dietitian (only if role is dietitian)
                const dietitianToShow = isPrimaryDietitian ? primaryDietitian : (isPaymentDietitian ? paymentDietitian : null);

                const purchaseId = String(p._id);
                const isCurrentMealPlanForThisPurchase = Boolean(
                    currentMealPlanDetails?.purchaseId && currentMealPlanDetails.purchaseId === purchaseId
                );
                const linkedMealPlan = latestMealPlanByPurchaseId.get(purchaseId) || null;

                const expectedStartDate = p.expectedStartDate || p.startDate || null;
                const expectedEndDate = p.expectedEndDate || p.endDate || null;

                // A purchase counts as meal-plan-created if payment indicates so OR current active meal plan links to this purchase.
                const isMealPlanCreatedForPurchase = Boolean(p.mealPlanCreated) || isCurrentMealPlanForThisPurchase || Boolean(linkedMealPlan);

                const mealPlanStartDate = linkedMealPlan?.startDate || (isCurrentMealPlanForThisPurchase ? currentMealPlanDetails?.startDate : null);
                const mealPlanEndDate = linkedMealPlan?.endDate || (isCurrentMealPlanForThisPurchase ? currentMealPlanDetails?.endDate : null);
                const mealPlanDuration = linkedMealPlan?.duration
                    || (linkedMealPlan?.startDate && linkedMealPlan?.endDate
                        ? Math.ceil((new Date(linkedMealPlan.endDate).getTime() - new Date(linkedMealPlan.startDate).getTime()) / (1000 * 60 * 60 * 24))
                        : null)
                    || (isCurrentMealPlanForThisPurchase ? currentMealPlanDetails?.duration : null);

                const mealPlanGoal = linkedMealPlan?.goals?.primaryGoal || (isCurrentMealPlanForThisPurchase ? currentMealPlanDetails?.goal : null);
                const mealPlanName = linkedMealPlan?.name || (isCurrentMealPlanForThisPurchase ? currentMealPlanDetails?.name : null);

                return {
                    _id: p._id,
                    planName: p.planName,
                    planCategory: p.planCategory,
                    durationDays: p.durationDays,
                    durationLabel: p.durationLabel,
                    startDate: p.startDate,
                    endDate: p.endDate,
                    expectedStartDate,
                    expectedEndDate,
                    status: p.status,
                    hasDietitian: !!dietitianToShow,
                    mealPlanCreated: isMealPlanCreatedForPurchase,
                    hasOngoingMealPlan: Boolean(mealPlanStartDate && mealPlanEndDate),
                    ongoingMealPlanStartDate: mealPlanStartDate || null,
                    ongoingMealPlanEndDate: mealPlanEndDate || null,
                    ongoingMealPlanDuration: mealPlanDuration || null,
                    // Also include meal plan specific info
                    mealPlanName: mealPlanName || null,
                    mealPlanGoal: mealPlanGoal || null,
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
