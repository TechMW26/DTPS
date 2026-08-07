import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { UserRole } from '@/types';
import { differenceInDays } from 'date-fns';

// GET /api/dashboard/pending-plans - Get clients with pending meal plans
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const dietitianFilterId = searchParams.get('dietitianId');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build query based on user role
    // Pending work must not disappear merely because a paying client is marked
    // inactive/paused. Only suspended accounts are excluded.
    let clientQuery: any = { role: UserRole.CLIENT, status: { $ne: 'suspended' } };

    if (session.user.role === UserRole.DIETITIAN) {
      clientQuery.$or = [
        { assignedDietitian: session.user.id },
        { assignedDietitians: session.user.id }
      ];
    } else if (session.user.role === UserRole.HEALTH_COUNSELOR) {
      clientQuery.$or = [
        { assignedHealthCounselor: session.user.id },
        { assignedHealthCounselors: session.user.id },
        { assignedDietitian: session.user.id },
        { assignedDietitians: session.user.id }
      ];
    } else if (session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Admin can filter by specific dietitian
    if (session.user.role === UserRole.ADMIN && dietitianFilterId) {
      clientQuery.$or = [
        { assignedDietitian: dietitianFilterId },
        { assignedDietitians: dietitianFilterId }
      ];
    }

    // Get all clients
    const clients = await User.find(clientQuery)
      .select('_id firstName lastName email phone clientId assignedDietitian assignedDietitians')
      .lean();

    const clientIds = clients.map((c: any) => c._id);

    // Get all meal plans for these clients (active and completed)
    const [mealPlans, purchases] = await Promise.all([
      ClientMealPlan.find({
        clientId: { $in: clientIds },
        status: { $in: ['active', 'paused', 'completed'] },
        isDeleted: { $ne: true },
      })
        .select('clientId name startDate endDate duration status purchaseId')
        .sort({ startDate: 1 })
        .lean(),
      UnifiedPayment.find({
        client: { $in: clientIds },
        status: { $in: ['active', 'paid', 'completed'] }
      })
        .select('client planName durationDays durationLabel expectedStartDate expectedEndDate mealPlanCreated daysUsed parentPaymentId status createdAt')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    // Group meal plans by client
    const mealPlansByClient: Record<string, any[]> = {};
    mealPlans.forEach((plan: any) => {
      const clientId = plan.clientId.toString();
      if (!mealPlansByClient[clientId]) {
        mealPlansByClient[clientId] = [];
      }
      mealPlansByClient[clientId].push(plan);
    });

    // Group purchases by client
    const purchasesByClient: Record<string, any[]> = {};
    purchases.forEach((purchase: any) => {
      const clientId = purchase.client.toString();
      if (!purchasesByClient[clientId]) {
        purchasesByClient[clientId] = [];
      }
      purchasesByClient[clientId].push(purchase);
    });

    const pendingPlans: any[] = [];

    for (const client of clients) {
      const clientId = (client as any)._id.toString();
      const clientMealPlans = mealPlansByClient[clientId] || [];
      const clientPurchases = purchasesByClient[clientId] || [];

      if (clientPurchases.length === 0) continue;

      // Sort meal plans by start date
      const sortedMealPlans = [...clientMealPlans].sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );

      // Prefer the newest purchase that still has unallocated days. Falling
      // back to the newest record preserves the previous response contract.
      const latestPurchase = clientPurchases.find((purchase: any) =>
        Math.max(0, Number(purchase.durationDays || 0) - Number(purchase.daysUsed || 0)) > 0
      ) || clientPurchases[0];

      // Calculate total purchased days from the purchase record
      const totalPurchasedDays = latestPurchase.durationDays || 0;

      // Get days already used from the purchase record
      const daysUsed = latestPurchase.daysUsed || 0;

      // Pending days to create = purchased days - days used
      const pendingDaysToCreate = Math.max(0, totalPurchasedDays - daysUsed);

      // Calculate total meal plan days created (for display purposes)
      const totalMealPlanDays = daysUsed;

      // Find current running plan
      const currentPlan = sortedMealPlans.find((plan: any) => {
        const planStart = new Date(plan.startDate);
        const planEnd = new Date(plan.endDate);
        planStart.setHours(0, 0, 0, 0);
        planEnd.setHours(23, 59, 59, 999);
        return today >= planStart && today <= planEnd;
      });

      // Find upcoming plans (starting in future)
      const upcomingPlans = sortedMealPlans.filter((plan: any) => {
        const planStart = new Date(plan.startDate);
        planStart.setHours(0, 0, 0, 0);
        return planStart > today;
      });

      // Find the most recent completed/previous plan
      const previousPlans = sortedMealPlans.filter((plan: any) => {
        const planEnd = new Date(plan.endDate);
        planEnd.setHours(23, 59, 59, 999);
        return planEnd < today;
      });
      const lastPlan = previousPlans.length > 0 ? previousPlans[previousPlans.length - 1] : null;

      // CASE 1: Has purchase but NO meal plan created at all
      if (clientMealPlans.length === 0) {
        pendingPlans.push({
          clientId: (client as any)._id,
          displayClientId: (client as any).clientId || null,
          assignedDietitianId: (client as any).assignedDietitian?.toString() || null,
          clientName: `${(client as any).firstName} ${(client as any).lastName}`,
          phone: (client as any).phone || 'N/A',
          email: (client as any).email,

          // Current plan info
          currentPlanName: null,
          currentPlanStartDate: null,
          currentPlanEndDate: null,
          currentPlanRemainingDays: 0,

          // Previous plan info
          previousPlanName: null,

          // Purchase info
          purchasedPlanName: latestPurchase.planName,
          totalPurchasedDays,
          totalMealPlanDays,
          pendingDaysToCreate,

          // Expected dates from purchase
          expectedStartDate: latestPurchase.expectedStartDate,
          expectedEndDate: latestPurchase.expectedEndDate,

          // Status
          reason: 'no_meal_plan',
          reasonText: 'No meal plan created',
          urgency: 'critical',
          hasNextPhase: false
        });
        continue;
      }

      // CASE 2: Current plan ends within 5 days AND there are pending days
      if (currentPlan && pendingDaysToCreate > 0) {
        const planEndDate = new Date(currentPlan.endDate);
        planEndDate.setHours(0, 0, 0, 0);
        const daysRemaining = differenceInDays(planEndDate, today);

        if (daysRemaining <= 5 && daysRemaining >= 0) {
          // Check if next phase/plan already exists
          const hasNextPlan = upcomingPlans.length > 0;

          if (!hasNextPlan) {
            // Updated urgency logic based on days remaining
            // 0 days or expired = Highly Critical
            // 1-3 days = High Priority
            // 4+ days = Medium
            let urgency: 'critical' | 'high' | 'medium' = 'medium';
            if (daysRemaining <= 0) {
              urgency = 'critical';
            } else if (daysRemaining <= 3) {
              urgency = 'high';
            } else {
              urgency = 'medium';
            }

            pendingPlans.push({
              clientId: (client as any)._id,
              displayClientId: (client as any).clientId || null,
              assignedDietitianId: (client as any).assignedDietitian?.toString() || null,
              clientName: `${(client as any).firstName} ${(client as any).lastName}`,
              phone: (client as any).phone || 'N/A',
              email: (client as any).email,

              // Current plan info
              currentPlanName: currentPlan.name,
              currentPlanStartDate: currentPlan.startDate,
              currentPlanEndDate: currentPlan.endDate,
              currentPlanRemainingDays: daysRemaining,

              // Previous plan info
              previousPlanName: lastPlan?.name || null,

              // Purchase info
              purchasedPlanName: latestPurchase.planName,
              totalPurchasedDays,
              totalMealPlanDays,
              pendingDaysToCreate,

              // Expected dates from purchase
              expectedStartDate: latestPurchase.expectedStartDate,
              expectedEndDate: latestPurchase.expectedEndDate,

              // Status
              reason: 'current_ending_soon',
              reasonText: `Current phase ends in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`,
              urgency,
              hasNextPhase: false
            });
          }
        }
      }

      // CASE 3: No current running plan but has pending days (gap between phases)
      if (!currentPlan && pendingDaysToCreate > 0 && lastPlan) {
        // Check if the last plan ended recently (within last 7 days) or there's a gap
        const lastPlanEnd = new Date(lastPlan.endDate);
        const daysSinceLastPlan = differenceInDays(today, lastPlanEnd);

        if (daysSinceLastPlan >= 0 && daysSinceLastPlan <= 7 && upcomingPlans.length === 0) {
          pendingPlans.push({
            clientId: (client as any)._id,
            displayClientId: (client as any).clientId || null,
            assignedDietitianId: (client as any).assignedDietitian?.toString() || null,
            clientName: `${(client as any).firstName} ${(client as any).lastName}`,
            phone: (client as any).phone || 'N/A',
            email: (client as any).email,

            // Current plan info (none currently running)
            currentPlanName: null,
            currentPlanStartDate: null,
            currentPlanEndDate: null,
            currentPlanRemainingDays: 0,

            // Previous plan info
            previousPlanName: lastPlan.name,
            previousPlanEndDate: lastPlan.endDate,

            // Purchase info
            purchasedPlanName: latestPurchase.planName,
            totalPurchasedDays,
            totalMealPlanDays,
            pendingDaysToCreate,

            // Expected dates
            expectedStartDate: latestPurchase.expectedStartDate,
            expectedEndDate: latestPurchase.expectedEndDate,

            // Status
            // Status
            reason: 'phase_gap',
            reasonText: `Previous phase ended ${daysSinceLastPlan} day${daysSinceLastPlan !== 1 ? 's' : ''} ago`,
            // 3+ days since last plan = critical (client without active plan)
            // 1-2 days = high
            // 0 days = medium (just ended today)
            urgency: daysSinceLastPlan >= 3 ? 'critical' : daysSinceLastPlan >= 1 ? 'high' : 'medium',
            hasNextPhase: false
          });
        }
      }

      // If all meal plans are completed and the last plan ended more than 30 days ago,
      // the client's program is truly finished — don't show as pending regardless of purchase counters.
      const allPlansCompleted = sortedMealPlans.length > 0 &&
        sortedMealPlans.every((p: any) => p.status === 'completed');
      const lastPlanEndedLongAgo = lastPlan &&
        differenceInDays(today, new Date(lastPlan.endDate)) > 30;
      const purchaseExpectedEndPassed = latestPurchase.expectedEndDate &&
        differenceInDays(today, new Date(latestPurchase.expectedEndDate)) > 30;
      const programTrulyFinished = allPlansCompleted &&
        (lastPlanEndedLongAgo || purchaseExpectedEndPassed);

      // CASE 4: Has pending days to create (general case - show all clients with pending days)
      // This covers: upcoming plans, no current plan, any situation where more meal plans need to be created
      // Skip clients whose program is truly finished (all plans completed + ended > 30 days ago)
      if (pendingDaysToCreate > 0 && !programTrulyFinished) {
        // Check if already added in previous cases
        const alreadyAdded = pendingPlans.some(p => p.clientId.toString() === clientId);

        if (!alreadyAdded) {
          // Determine the "current" plan to show - either running plan or the upcoming one
          const displayPlan = currentPlan || (upcomingPlans.length > 0 ? upcomingPlans[0] : null);

          let daysUntilNextAction = 0;
          let reasonText = '';
          let urgency: 'critical' | 'high' | 'medium' = 'medium';

          if (currentPlan) {
            // Has a running plan
            daysUntilNextAction = differenceInDays(new Date(currentPlan.endDate), today);
            reasonText = `Current plan ends in ${daysUntilNextAction} days`;
            urgency = daysUntilNextAction <= 2 ? 'critical' : daysUntilNextAction <= 5 ? 'high' : 'medium';
          } else if (upcomingPlans.length > 0) {
            // Has upcoming plan but no current
            const nextPlan = upcomingPlans[0];
            daysUntilNextAction = differenceInDays(new Date(nextPlan.startDate), today);
            reasonText = `Next plan starts in ${daysUntilNextAction} days, ${pendingDaysToCreate} days pending`;
            urgency = pendingDaysToCreate > 10 ? 'high' : 'medium';
          } else {
            // No current or upcoming plan - needs immediate attention
            reasonText = `${pendingDaysToCreate} days need meal plans`;
            urgency = 'critical';
          }

          pendingPlans.push({
            clientId: (client as any)._id,
            displayClientId: (client as any).clientId || null,
            assignedDietitianId: (client as any).assignedDietitian?.toString() || null,
            clientName: `${(client as any).firstName} ${(client as any).lastName}`,
            phone: (client as any).phone || 'N/A',
            email: (client as any).email,

            // Current/Display plan info
            currentPlanName: currentPlan?.name || null,
            currentPlanStartDate: currentPlan?.startDate || null,
            currentPlanEndDate: currentPlan?.endDate || null,
            currentPlanRemainingDays: currentPlan ? differenceInDays(new Date(currentPlan.endDate), today) : 0,

            // Previous plan info
            previousPlanName: lastPlan?.name || null,
            previousPlanEndDate: lastPlan?.endDate || null,

            // Upcoming plan info
            upcomingPlanName: upcomingPlans.length > 0 ? upcomingPlans[0].name : null,
            upcomingPlanStartDate: upcomingPlans.length > 0 ? upcomingPlans[0].startDate : null,
            upcomingPlanEndDate: upcomingPlans.length > 0 ? upcomingPlans[0].endDate : null,

            // Purchase info
            purchasedPlanName: latestPurchase.planName,
            totalPurchasedDays,
            totalMealPlanDays,
            pendingDaysToCreate,

            // Expected dates
            expectedStartDate: latestPurchase.expectedStartDate,
            expectedEndDate: latestPurchase.expectedEndDate,

            // Status
            reason: currentPlan ? 'current_ending_soon' : (upcomingPlans.length > 0 ? 'upcoming_with_pending' : 'phase_gap'),
            reasonText,
            urgency,
            hasNextPhase: upcomingPlans.length > 0
          });
        }
      }
    }

    // Sort by urgency (critical first) and then by pending days
    pendingPlans.sort((a, b) => {
      const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
      const urgencyDiff = (urgencyOrder[a.urgency] || 3) - (urgencyOrder[b.urgency] || 3);
      if (urgencyDiff !== 0) return urgencyDiff;
      return (b.pendingDaysToCreate || 0) - (a.pendingDaysToCreate || 0); // Higher pending days first
    });

    return NextResponse.json({
      success: true,
      pendingPlans,
      totalCount: pendingPlans.length,
      criticalCount: pendingPlans.filter(p => p.urgency === 'critical').length,
      highCount: pendingPlans.filter(p => p.urgency === 'high').length,
      mediumCount: pendingPlans.filter(p => p.urgency === 'medium').length
    });

  } catch (error) {
    console.error('Error fetching pending plans:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
