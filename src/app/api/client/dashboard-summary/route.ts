import {nativeResponseJson} from '@/lib/api/native-response';
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getNativeDatabase } from '@/lib/db/database';
import { readNativeHabit, nativeHabitDay, NativeHabitError } from '@/lib/db/repository/native-habits';
import { nativePlanForDate } from '@/lib/db/repository/native-client-meals';
import { nativeDates } from '@/lib/db/repository/native-plan-editor';
import { hydrateNativeDocument } from '@/lib/storage/native-document';
import {
  buildDailyNutritionSummary,
  getNutritionDateKey,
} from '@/lib/meal-nutrition';

function toArray<T>(value: T[] | T | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export async function GET(request: Request) {
  try {
    const [session] = await Promise.all([
      getServerSession(authOptions),
    ]);

    if (!session?.user?.id) {
      return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    const day = nativeHabitDay(dateParam);
    const targetDate = day.start, nextDay = day.end, db = getNativeDatabase();
    const [journal, userRow, mealPlan, foodRows] = await Promise.all([
      readNativeHabit(db,userId,dateParam),
      db.collection('users').doc(userId).get(),
      nativePlanForDate(db,userId,targetDate,new Date(nextDay.getTime()-1)),
      db.collection('foodlogs').where('client','==',userId).where('date','>=',targetDate).where('date','<',nextDay).limit(2).get(),
    ]);
    if(foodRows.size>1) throw new NativeHabitError('Duplicate food logs require reconciliation',409);
    const user=userRow.data(), foodLog=foodRows.empty?null:nativeDates(await hydrateNativeDocument(foodRows.docs[0].data()));
    const data = (() => {
        const waterEntries = toArray(journal?.water ?? journal?.hydration?.entries);
        const sleepEntries = toArray(journal?.sleep ?? journal?.sleep?.entries);
        const activityEntries = toArray(journal?.activities ?? journal?.activity?.entries);
        const stepsEntries = toArray(journal?.steps ?? journal?.steps?.entries);

        // --- Hydration ---
        const units:Record<string,number>={'Glass (250ml)':250,'Bottle (500ml)':500,'Bottle (1L)':1000,'Cup (200ml)':200,glasses:250,ml:1};
        const totalWater = waterEntries.reduce((sum: number, e: any) => sum + Number(e.amount || 0)*(units[e.unit]||1), 0);
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
        const nutrition = buildDailyNutritionSummary({
          plan: mealPlan,
          foodLog,
          user,
          date: targetDate,
        });

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
          nutrition,
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
    })();

    return nativeResponseJson(data);
  } catch (error: any) {
    console.error('Dashboard summary error:', error);
    return nativeResponseJson(
      { error: error instanceof NativeHabitError ? error.message : 'Failed to load dashboard data' },
      { status: error instanceof NativeHabitError ? error.status : 503 }
    );
  }
}
