import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import JournalTracking from '@/lib/db/models/JournalTracking';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import { UserRole } from '@/types';
import { subDays, format, differenceInDays } from 'date-fns';
import mongoose from 'mongoose';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// Helper to check if user has permission to access client data
const checkPermission = (session: any, clientId?: string): boolean => {
  const userRole = session?.user?.role;
  const allowedRoles = [UserRole.ADMIN, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR, 'health_counselor', 'admin', 'dietitian'];
  if (allowedRoles.includes(userRole)) {
    return true;
  }
  if (userRole === UserRole.CLIENT || userRole === 'client') {
    return !clientId || clientId === session?.user?.id;
  }
  return false;
};

// GET /api/journal/compliance - Get food compliance data for graphs
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId') || session.user.id;
    const days = parseInt(searchParams.get('days') || '7');
    const mealType = searchParams.get('mealType') || 'all';
    const selectedDateParam = searchParams.get('selectedDate');

    if (!checkPermission(session, clientId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await connectDB();

    // Convert clientId to ObjectId
    const clientObjectId = new mongoose.Types.ObjectId(clientId);

    // Get date range - use selectedDate as end date if provided
    const endDate = selectedDateParam ? new Date(selectedDateParam) : new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = subDays(endDate, days - 1);
    startDate.setHours(0, 0, 0, 0);

    // Get all journal entries in the date range
    const journals = await withCache(
      `journal:compliance:${JSON.stringify({
      client: clientObjectId,
      date: { $gte: startDate, $lte: endDate }
    })}`,
      async () => await JournalTracking.find({
      client: clientObjectId,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 }),
      { ttl: 120000, tags: ['journal'] }
    );

    // Get active meal plans for the date range to check mealCompletions
    const mealPlans = await withCache(
      `journal:compliance:${JSON.stringify({
      clientId: clientObjectId,
      status: 'active',
      startDate: { $lte: endDate },
      endDate: { $gte: startDate }
    })}`,
      async () => await ClientMealPlan.find({
      clientId: clientObjectId,
      status: 'active',
      startDate: { $lte: endDate },
      endDate: { $gte: startDate }
    }),
      { ttl: 120000, tags: ['journal'] }
    );

    // Build a map of meal completions from ClientMealPlan
    const mealCompletionsMap = new Map<string, any[]>();
    for (const plan of mealPlans) {
      if (plan.mealCompletions && Array.isArray(plan.mealCompletions)) {
        for (const completion of plan.mealCompletions) {
          const dateKey = format(new Date(completion.date), 'yyyy-MM-dd');
          if (!mealCompletionsMap.has(dateKey)) {
            mealCompletionsMap.set(dateKey, []);
          }
          mealCompletionsMap.get(dateKey)!.push(completion);
        }
      }
    }

    // Build daily data for chart
    const dailyData: any[] = [];
    let totalTaken = 0;
    let totalMissed = 0;
    let totalNotRecorded = 0;
    let totalOptions = 0;

    for (let i = 0; i < days; i++) {
      const currentDate = subDays(endDate, days - 1 - i);
      currentDate.setHours(0, 0, 0, 0);
      const dateKey = format(currentDate, 'yyyy-MM-dd');
      
      const journal = journals.find(j => {
        const journalDate = new Date(j.date);
        journalDate.setHours(0, 0, 0, 0);
        return journalDate.getTime() === currentDate.getTime();
      });

      // Get meal completions from ClientMealPlan for this date
      const planCompletions = mealCompletionsMap.get(dateKey) || [];
      const completedFromPlan = planCompletions.filter((c: any) => c.completed);
      const pendingFromPlan = planCompletions.filter((c: any) => !c.completed);

      // Also check journal meals
      let journalMeals = journal?.meals || [];
      
      // Filter by meal type if specified
      if (mealType !== 'all') {
        journalMeals = journalMeals.filter((m: any) => m.type?.toLowerCase() === mealType.toLowerCase());
      }

      const consumedFromJournal = journalMeals.filter((m: any) => m.consumed);
      const notConsumedFromJournal = journalMeals.filter((m: any) => !m.consumed);
      
      // Combine completions - prefer plan completions, fallback to journal
      const totalCompleted = completedFromPlan.length > 0 ? completedFromPlan.length : consumedFromJournal.length;
      const totalPending = pendingFromPlan.length > 0 ? pendingFromPlan.length : notConsumedFromJournal.length;
      
      // Calculate expected meals per day (6 by default for full meal plan)
      const expectedMeals = mealType === 'all' ? 6 : 1;
      const recordedMeals = totalCompleted + totalPending;
      const notRecorded = Math.max(0, expectedMeals - recordedMeals);

      const dayData = {
        date: format(currentDate, 'dd/MM'),
        fullDate: currentDate.toISOString(),
        taken: totalCompleted,
        missed: totalPending,
        notRecorded: notRecorded,
        options: 0,
        totalMeals: recordedMeals
      };

      dailyData.push(dayData);

      totalTaken += totalCompleted;
      totalMissed += totalPending;
      totalNotRecorded += notRecorded;
    }

    // Calculate percentages for donut chart
    const total = totalTaken + totalMissed + totalNotRecorded + totalOptions;
    const complianceSummary = {
      taken: total > 0 ? Math.round((totalTaken / total) * 100) : 0,
      missed: total > 0 ? Math.round((totalMissed / total) * 100) : 0,
      notRecorded: total > 0 ? Math.round((totalNotRecorded / total) * 100) : 0,
      options: total > 0 ? Math.round((totalOptions / total) * 100) : 0,
      rawCounts: {
        taken: totalTaken,
        missed: totalMissed,
        notRecorded: totalNotRecorded,
        options: totalOptions,
        total
      }
    };

    return NextResponse.json({
      success: true,
      dailyData,
      complianceSummary,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        days
      }
    });

  } catch (error) {
    console.error('Error fetching compliance data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch compliance data' },
      { status: 500 }
    );
  }
}
