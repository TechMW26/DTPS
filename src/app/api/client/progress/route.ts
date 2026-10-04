import {nativeResponseJson} from '@/lib/api/native-response';
import { NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getNativeDatabase } from '@/lib/db/firestore-native';
import { nativeProgressHistory, saveNativeProgress, deleteNativeProgress, NativeProgressError } from '@/lib/db/repository/native-progress';
import { startOfDay, endOfDay, parseISO } from "date-fns";
import { withCache, clearCacheByTag } from "@/lib/api/utils";
import { logActivity } from "@/lib/utils/activityLogger";
import { emitClientWeightUpdate } from "@/lib/realtime/weight-notify";
import { notifyClientDataUpdate } from "@/lib/notifications/staffPushService";
import {
  addNutrition,
  buildDailyNutritionSummary,
  calculateCompletedMealNutrition,
  calculateFoodLogNutrition,
  getNutritionDateKey,
  roundNutrition,
  type NutritionTotals,
} from '@/lib/meal-nutrition';

// Helper to get date range based on filter
function getStartDate(range: string): Date {
  const now = new Date();
  switch (range) {
    case "ALL":
      return new Date(0);
    case "1W":
      return new Date(now.setDate(now.getDate() - 7));
    case "1M":
      return new Date(now.setMonth(now.getMonth() - 1));
    case "3M":
      return new Date(now.setMonth(now.getMonth() - 3));
    case "6M":
      return new Date(now.setMonth(now.getMonth() - 6));
    case "1Y":
      return new Date(now.setFullYear(now.getFullYear() - 1));
    default:
      return new Date(now.setDate(now.getDate() - 7));
  }
}

export async function GET(request: Request) {
  try {
    // OPTIMIZATION: Parse URL params BEFORE async operations (sync)
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "1W";
    const includeAllWeights = searchParams.get("allWeights") === "true";
    const startDate = getStartDate(range);
    const progressStartDate = range === "ALL" ? new Date(0) : startDate;
    const todayStr = getNutritionDateKey(new Date());
    const today = startOfDay(parseISO(todayStr));
    const todayEnd = endOfDay(today);

    // OPTIMIZATION: Run auth + DB connect in PARALLEL
    const [session] = await Promise.all([
      getServerSession(authOptions),
    ]);

    if (!session?.user?.id) {
      return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const {user,allProgressEntries,allWeightEntriesRaw,foodLogs,relevantMealPlans} = await nativeProgressHistory(getNativeDatabase(),userId,progressStartDate,includeAllWeights);

    const todayFoodLog = (foodLogs as any[]).find(
      (log) => getNutritionDateKey(new Date(log.date)) === todayStr,
    );
    const activeMealPlan = (relevantMealPlans as any[]).find((plan) => {
      const planStart = new Date(plan.startDate).getTime();
      const planEnd = new Date(plan.endDate).getTime();
      return (
        ["active", "completed", "paused"].includes(plan.status) &&
        planStart <= todayEnd.getTime() &&
        planEnd >= today.getTime()
      );
    });
    const mealPlansWithCompletions = (relevantMealPlans as any[]).filter(
      (plan) => Array.isArray(plan.mealCompletions) && plan.mealCompletions.length > 0,
    );

    // Filter measurements from allProgressEntries (no separate query needed)
    const measurementTypes = [
      "waist",
      "abdomen",
      "hips",
      "chest",
      "arms",
      "thighs",
    ];
    const allMeasurementEntries = (allProgressEntries as any[]).filter((e) =>
      measurementTypes.includes(e.type),
    );

    // Use allWeightEntriesRaw if requested, otherwise filter from allProgressEntries
    const allWeightEntriesSource = allWeightEntriesRaw || allProgressEntries;

    // Get weight entries
    const weightEntries = (allWeightEntriesSource as any[])
      .filter((entry) => entry.type === "weight" && entry.value)
      .map((entry) => ({
        _id: entry._id,
        date: entry.recordedAt,
        weight: Number(entry.value),
      }));

    // Progress weight is independent from profile weight (no fallback to user.weightKg)
    const latestWeight = weightEntries[0]?.weight || 0;
    const userAny = user as any;
    const baselineFirstWeight = Number(userAny?.firstWeight?.value || 0);
    const startWeight =
      Number.isFinite(baselineFirstWeight) && baselineFirstWeight > 0
        ? baselineFirstWeight
        : weightEntries[weightEntries.length - 1]?.weight || latestWeight;
    const targetWeight =
      parseFloat(userAny?.targetWeightKg) ||
      parseFloat(userAny?.goals?.targetWeight) ||
      0;

    // Calculate week's change
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weekAgoEntry = weightEntries.find(
      (entry) => new Date(entry.date) <= oneWeekAgo,
    );
    const weightChange = weekAgoEntry ? latestWeight - weekAgoEntry.weight : 0;

    // Calculate BMI - ensure proper calculation with validation
    const heightCm = parseFloat(userAny?.heightCm);
    const heightM =
      heightCm && !isNaN(heightCm) && heightCm > 0 ? heightCm / 100 : 0;
    const bmi =
      latestWeight > 0 && heightM > 0
        ? Math.round((latestWeight / (heightM * heightM)) * 10) / 10
        : 0;

    // Validate BMI is in reasonable range (10-60)
    const validBmi = bmi > 10 && bmi < 60 ? bmi : 0;

    // Get latest measurements - each type is stored separately
    const measurements: Record<string, number> = {};

    for (const type of measurementTypes) {
      const latestEntry = allMeasurementEntries.find(
        (entry) => entry.type === type,
      );
      measurements[type] = latestEntry ? Number(latestEntry.value) : 0;
    }

    // Get today's measurements specifically
    const todayMeasurements: Record<string, number> = {};

    for (const type of measurementTypes) {
      const todayEntry = allMeasurementEntries.find((entry) => {
        const entryDate = new Date(entry.recordedAt)
          .toISOString()
          .split("T")[0];
        return entry.type === type && entryDate === todayStr;
      });
      todayMeasurements[type] = todayEntry ? Number(todayEntry.value) : 0;
    }

    // Build measurement history - group by minute (keeps multiple entries on same day)
    const measurementHistoryMap = new Map<string, any>();

    for (const entry of allMeasurementEntries) {
      if (measurementTypes.includes(entry.type)) {
        const dateObj = new Date(entry.recordedAt);
        const minuteBucket = new Date(
          Math.floor(dateObj.getTime() / 60000) * 60000,
        );
        const dateKey = minuteBucket.toISOString();

        if (!measurementHistoryMap.has(dateKey)) {
          measurementHistoryMap.set(dateKey, { date: minuteBucket });
        }

        const existing = measurementHistoryMap.get(dateKey);
        existing[entry.type] = Number(entry.value);
      }
    }

    const measurementHistory = Array.from(measurementHistoryMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    // Get last measurement date for 7-day restriction check
    const lastMeasurementEntry = allMeasurementEntries.find((entry) =>
      measurementTypes.includes(entry.type),
    );
    const lastMeasurementDate = lastMeasurementEntry?.recordedAt
      ? new Date(lastMeasurementEntry.recordedAt).toISOString()
      : null;

    // Check if user can add new measurement (7 days restriction)
    const canAddMeasurement =
      !lastMeasurementEntry ||
      new Date().getTime() -
        new Date(lastMeasurementEntry.recordedAt).getTime() >=
        7 * 24 * 60 * 60 * 1000;

    // Calculate days until next measurement
    const daysUntilNextMeasurement = lastMeasurementEntry
      ? Math.max(
          0,
          7 -
            Math.floor(
              (new Date().getTime() -
                new Date(lastMeasurementEntry.recordedAt).getTime()) /
                (24 * 60 * 60 * 1000),
            ),
        )
      : 0;

    // Calculate progress percentage
    const totalToLose = startWeight - targetWeight;
    const lost = startWeight - latestWeight;
    const progressPercent =
      totalToLose > 0 ? Math.round((lost / totalToLose) * 100) : 0;

    const dailyNutrition = buildDailyNutritionSummary({
      plan: activeMealPlan as any,
      foodLog: todayFoodLog as any,
      user: userAny,
      date: todayStr,
    });
    const todayIntake = dailyNutrition.consumed;
    const goals = {
      ...dailyNutrition.goal,
      water: userAny?.goals?.water || 8,
      steps: userAny?.goals?.steps || userAny?.dailyGoals?.steps || 10000,
    };

    // Build nutrition history with macros - foodLogs already fetched in parallel
    const nutritionHistoryMap = new Map<string, NutritionTotals>();
    const historyStartKey = getNutritionDateKey(progressStartDate);

    // Add food log data to history
    for (const log of foodLogs as any[]) {
      const dateKey = getNutritionDateKey(new Date(log.date));
      const existing = nutritionHistoryMap.get(dateKey) || {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      };
      nutritionHistoryMap.set(
        dateKey,
        roundNutrition(addNutrition(existing, calculateFoodLogNutrition(log))),
      );
    }

    // Add the nutrition represented by each completed meal picture. Grouping
    // by date ensures multiple completions are calculated once per day.
    for (const plan of mealPlansWithCompletions as any[]) {
      if (!plan.mealCompletions?.length) continue;
      const completionDates = new Set<string>(
        plan.mealCompletions
          .filter((completion: any) => completion?.completed && completion?.date)
          .map((completion: any) => getNutritionDateKey(new Date(completion.date)))
          .filter((dateKey: string) => dateKey >= historyStartKey),
      );

      for (const completionDate of completionDates) {
        const completed = calculateCompletedMealNutrition(plan, completionDate);
        if (completed.completedMeals === 0) continue;
        const existing = nutritionHistoryMap.get(completionDate) || {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        };
        nutritionHistoryMap.set(
          completionDate,
          roundNutrition(addNutrition(existing, completed.nutrition)),
        );
      }
    }

    // Convert map to arrays sorted by date
    const sortedDates = Array.from(nutritionHistoryMap.keys()).sort();
    const nutritionHistory = sortedDates.map((date) => ({
      date,
      ...nutritionHistoryMap.get(date)!,
    }));

    const calorieHistory = nutritionHistory.map((n) => ({
      date: n.date,
      calories: Math.round(n.calories),
    }));

    // Get transformation photos
    const transformationPhotos = allProgressEntries
      .filter((entry) => entry.type === "photo")
      .map((entry) => ({
        _id: entry._id,
        url: entry.value as string,
        date: entry.recordedAt,
        notes: entry.notes || "",
        side: entry.unit || "front",
      }));

    return nativeResponseJson({
      currentWeight: latestWeight,
      startWeight: startWeight,
      targetWeight: targetWeight || 0,
      weightChange: Math.round(weightChange * 10) / 10,
      bmi: validBmi,
      heightCm: heightCm || 0,
      progressPercent: Math.max(0, Math.min(100, progressPercent)),
      // Newest first for history list rendering on the client
      weightHistory: weightEntries,
      measurements: measurements,
      todayMeasurements: todayMeasurements,
      measurementHistory: measurementHistory,
      lastMeasurementDate: lastMeasurementDate,
      canAddMeasurement: canAddMeasurement,
      daysUntilNextMeasurement: daysUntilNextMeasurement,
      goals: goals,
      todayIntake: todayIntake,
      calorieHistory: calorieHistory,
      nutritionHistory: nutritionHistory,
      transformationPhotos: transformationPhotos,
    });
  } catch (error) {
    console.error("Error fetching progress:", error);
    return nativeResponseJson(
      { error: "Failed to fetch progress" },
      { status: 500 },
    );
  }
}

export async function POST(request:Request){
 try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 const data=await request.json(),result=await saveNativeProgress(getNativeDatabase(),session.user.id,data,request.headers.get('x-idempotency-key'));
 if(result.created)after(async()=>{
  await logActivity({userId:session.user.id,userRole:'client',userName:session.user.name||'',userEmail:session.user.email||'',action:'Logged progress',actionType:'create',category:'fitness',description:`Recorded ${data.type||'weight'} progress.`});
  if(process.env.NODE_ENV==='production'&&['weight','measurements'].includes(data.type))await notifyClientDataUpdate({clientId:session.user.id,updateType:data.type==='weight'?'weight_update':'measurements',eventKey:`progress:${result.entries[0]._id}`});
 });
 return nativeResponseJson({success:true,...(data.type==='measurements'?{entries:result.entries}:{entry:result.entries[0]})});
 }catch(error){return nativeResponseJson({error:error instanceof NativeProgressError?error.message:'Failed to save progress'},{status:error instanceof NativeProgressError?error.status:503});}
}
export async function DELETE(request:Request){
 try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 const params=new URL(request.url).searchParams;
 const deletedCount=await deleteNativeProgress(getNativeDatabase(),session.user.id,params.get('id'),params.get('type')==='weight'&&params.get('all')==='true');
 return nativeResponseJson({success:true,deletedCount,message:'Progress entries deleted successfully'});
 }catch(error){return nativeResponseJson({error:error instanceof NativeProgressError?error.message:'Failed to delete progress'},{status:error instanceof NativeProgressError?error.status:503});}
}
