import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db/connection";
import JournalTracking from "@/lib/db/models/JournalTracking";
import User from "@/lib/db/models/User";
import { withCache } from '@/lib/api/utils';
import { isValid, parseISO, startOfDay } from 'date-fns';

function toArray<T>(value: T[] | T | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function resolveTargetDate(dateParam: string | null): Date | null {
  const requestedDate = dateParam ? parseISO(dateParam) : new Date();
  if (!isValid(requestedDate)) {
    return null;
  }

  return startOfDay(requestedDate);
}

export async function GET(request: Request) {
  try {
    const [session] = await Promise.all([
      getServerSession(authOptions),
      dbConnect(),
    ]);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    // Build a safe date range that matches the day-based journal endpoints
    const targetDate = resolveTargetDate(dateParam);
    if (!targetDate) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }

    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Single DB query for ALL journal tracking data (hydration, sleep, activity, steps)
    // + user profile for goals — run in parallel
    const cacheKey = `dashboard:${userId}:${targetDate.toISOString().slice(0, 10)}`;

    const data = await withCache(
      cacheKey,
      async () => {
        const [journal, user] = await Promise.all([
          JournalTracking.findOne({
            client: userId,
            date: { $gte: targetDate, $lt: nextDay },
          })
            .select('water sleep activities steps assignedWater assignedSteps assignedSleep assignedActivities targets updatedAt hydration activity')
            .lean() as any,
          User.findById(userId)
            .select('goals dailyGoals heightCm weightKg bmi bmiCategory generalGoal firstName lastName avatar')
            .lean() as any,
        ]);

        const waterEntries = toArray(journal?.water ?? journal?.hydration?.entries);
        const sleepEntries = toArray(journal?.sleep ?? journal?.sleep?.entries);
        const activityEntries = toArray(journal?.activities ?? journal?.activity?.entries);
        const stepsEntries = toArray(journal?.steps ?? journal?.steps?.entries);

        // --- Hydration ---
        const totalWater = waterEntries.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
        // `dailyGoals.water` is stored in ml (e.g. 2500). The legacy `goals.water`
        // is stored in GLASSES (e.g. 8), so convert it (1 glass = 250ml).
        const dailyWaterMl = user?.dailyGoals?.water;
        const waterGlasses = user?.goals?.water;
        const waterGoal =
          dailyWaterMl && dailyWaterMl >= 100
            ? dailyWaterMl
            : waterGlasses && waterGlasses > 0
              ? waterGlasses * 250
              : journal?.targets?.water || 2500;
        const assignedWater = journal?.assignedWater ?? journal?.hydration?.assigned ?? null;

        // --- Sleep ---
        const totalSleep = sleepEntries.reduce((sum: number, e: any) => {
          return sum + (e.hours || 0) + (e.minutes || 0) / 60;
        }, 0);
        const sleepGoal = journal?.targets?.sleep || 8;
        const assignedSleep = journal?.assignedSleep ?? journal?.sleep?.assigned ?? null;

        // --- Activity ---
        const totalActivity = activityEntries.reduce(
          (sum: number, e: any) => sum + (e.duration || 0),
          0
        );
        const activityGoal = journal?.targets?.activityMinutes || 30;
        const assignedActivity = journal?.assignedActivities ?? journal?.activity?.assigned ?? null;

        // --- Steps ---
        const totalSteps = stepsEntries.reduce(
          (sum: number, e: any) => sum + (e.steps || 0),
          0
        );
        const stepsGoal = journal?.targets?.steps || 10000;
        const assignedSteps = journal?.assignedSteps ?? journal?.steps?.assigned ?? null;

        // --- Profile (BMI + goals + name) ---
        const bmi = user?.bmi || '';
        const bmiCategory = user?.bmiCategory || '';
        const weightKg = user?.weightKg || '';
        const heightCm = user?.heightCm || '';
        const generalGoal = user?.generalGoal || '';
        const firstName = user?.firstName || '';
        const lastName = user?.lastName || '';
        const avatar = user?.avatar || '';

        return {
          hydration: {
            totalToday: totalWater,
            goal: waterGoal,
            entries: waterEntries,
            assignedWater,
          },
          sleep: {
            totalToday: parseFloat(totalSleep.toFixed(2)),
            goal: sleepGoal,
            entries: sleepEntries,
            assignedSleep,
          },
          activity: {
            totalToday: Math.round(totalActivity),
            goal: activityGoal,
            entries: activityEntries,
            assignedActivity,
          },
          steps: {
            totalToday: totalSteps,
            goal: stepsGoal,
            entries: stepsEntries,
            assignedSteps,
          },
          profile: {
            bmi,
            bmiCategory,
            weightKg,
            heightCm,
            generalGoal,
            firstName,
            lastName,
            avatar,
          },
        };
      },
      { ttl: 5000, tags: ['client'] } // Short 5s cache: this summary is NOT invalidated by tracker writes, so keep it brief to stay near real-time
    );

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Dashboard summary error:', error);
    return NextResponse.json(
      { error: 'Failed to load dashboard data' },
      { status: 500 }
    );
  }
}
