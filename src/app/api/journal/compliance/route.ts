import {nativeResponseJson} from '@/lib/api/native-response';
import {getNativeDatabase} from '@/lib/db/database';
import {journalHistory} from '@/lib/db/repository/native-journal';
import {taskClientAccess} from '@/lib/db/repository/native-staff-tasks';
import {nativeDates} from '@/lib/db/repository/native-plan-editor';
import {hydrateNativeDocument} from '@/lib/storage/native-document';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { UserRole } from '@/types';
import { subDays, format, differenceInDays } from 'date-fns';

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
      return nativeResponseJson({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId') || session.user.id;
    const days = parseInt(searchParams.get('days') || '7');
    const mealType = searchParams.get('mealType') || 'all';
    const selectedDateParam = searchParams.get('selectedDate');

    if (!checkPermission(session, clientId)) {
      return nativeResponseJson({ error: 'Access denied' }, { status: 403 });
    }

    const db=getNativeDatabase();
    await taskClientAccess(db,session.user.id,clientId);

    // Convert clientId to ObjectId
    const clientObjectId = clientId;

    // Get date range - use selectedDate as end date if provided
    const endDate = selectedDateParam ? new Date(selectedDateParam) : new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = subDays(endDate, days - 1);
    startDate.setHours(0, 0, 0, 0);

    // Get all journal entries in the date range
    const journals=await journalHistory(db,clientId,undefined,startDate,endDate);

    // Get active meal plans for the date range to check mealCompletions
    const planRows=await db.collection('clientmealplans').where('clientId','==',clientId).where('status','in',['active','paused','completed']).where('startDate','<=',endDate).where('endDate','>=',startDate).get();
    const mealPlans=await Promise.all(planRows.docs.filter(row=>!row.get('isDeleted')).map(async row=>nativeDates(await hydrateNativeDocument(row.data()))));

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

    return nativeResponseJson({
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
    return nativeResponseJson(
      { error: 'Failed to fetch compliance data' },
      { status: 500 }
    );
  }
}