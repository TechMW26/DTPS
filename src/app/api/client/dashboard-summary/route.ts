import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db/connection";
import JournalTracking from "@/lib/db/models/JournalTracking";
import User from "@/lib/db/models/User";
import { withCache } from '@/lib/api/utils';
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

    // Build date range (same logic as individual endpoints)
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    targetDate.setHours(0, 0, 0, 0);
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
          }).lean() as any,
          User.findById(userId)
            .select('goals heightCm weightKg bmi bmiCategory generalGoal firstName lastName avatar')
            .lean() as any,
        ]);

        // --- Hydration ---
        const waterEntries = journal?.hydration?.entries || [];
        const totalWater = waterEntries.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
        const waterGoal = user?.goals?.water || journal?.targets?.water || 2500;
        const assignedWater = journal?.hydration?.assigned || null;

        // --- Sleep ---
        const sleepEntries = journal?.sleep?.entries || [];
        const totalSleep = sleepEntries.reduce((sum: number, e: any) => {
          return sum + (e.hours || 0) + (e.minutes || 0) / 60;
        }, 0);
        const sleepGoal = journal?.targets?.sleep || 8;
        const assignedSleep = journal?.sleep?.assigned || null;

        // --- Activity ---
        const activityEntries = journal?.activity?.entries || [];
        const totalActivity = activityEntries.reduce(
          (sum: number, e: any) => sum + (e.duration || 0),
          0
        );
        const activityGoal = journal?.targets?.activityMinutes || 30;
        const assignedActivity = journal?.activity?.assigned || null;

        // --- Steps ---
        const stepsEntries = journal?.steps?.entries || [];
        const totalSteps = stepsEntries.reduce(
          (sum: number, e: any) => sum + (e.steps || 0),
          0
        );
        const stepsGoal = journal?.targets?.steps || 10000;
        const assignedSteps = journal?.steps?.assigned || null;

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
      { ttl: 60000, tags: ['client'] } // 60s cache — health data changes infrequently
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
