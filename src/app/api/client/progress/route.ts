import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db/connection";
import User from "@/lib/db/models/User";
import ProgressEntry from "@/lib/db/models/ProgressEntry";
import FoodLog from "@/lib/db/models/FoodLog";
import ClientMealPlan from "@/lib/db/models/ClientMealPlan";
import JournalTracking from "@/lib/db/models/JournalTracking";
import { startOfDay, endOfDay, parseISO } from "date-fns";
import { withCache, clearCacheByTag } from "@/lib/api/utils";
import { logActivity } from "@/lib/utils/activityLogger";
import { emitClientWeightUpdate } from "@/lib/realtime/weight-notify";
import { notifyClientDataUpdate } from "@/lib/notifications/staffPushService";
import mongoose from "mongoose";
import { deleteFromBlob } from "@/lib/storage/blob-storage";
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
      dbConnect(),
    ]);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch each collection once. Today's food log is part of the history query,
    // and today's plan is part of the completion-plan query, so separate reads
    // only increase Mongo round-trips and payload duplication.
    const [
      user,
      allProgressEntries,
      allWeightEntriesRaw,
      foodLogs,
      relevantMealPlans,
    ] = await Promise.all([
      // User data - CACHED
      withCache(
        `client:progress:user:${userId}`,
        () =>
          User.findById(userId)
            .select("weightKg firstWeight targetWeightKg heightCm goals dailyGoals")
            .lean(),
        { ttl: 120000, tags: ["client"] },
      ),
      // ALL progress entries (includes measurements) - single query instead of two
      withCache(
        `client:progress:all:${userId}:${range}`,
        () =>
          ProgressEntry.find({
            user: userId,
            recordedAt: { $gte: progressStartDate },
          })
            .sort({ recordedAt: -1 })
            .lean(),
        { ttl: 120000, tags: ["client"] },
      ),
      // All weights (only if specifically requested separately)
      includeAllWeights
        ? withCache(
            `client:progress:weights:${userId}`,
            () =>
              ProgressEntry.find({ user: userId, type: "weight" })
                .sort({ recordedAt: -1 })
                .lean(),
            { ttl: 120000, tags: ["client"] },
          )
        : Promise.resolve(null),
      // One food-log query supplies both today's summary and history.
      withCache(
        `client:progress:foodlogs:${userId}:${range}`,
        () =>
          FoodLog.find({
            client: userId,
            date: { $gte: progressStartDate },
          })
            .select("date totalNutrition entries")
            .sort({ date: -1 })
            .lean(),
        { ttl: 120000, tags: ["client"] },
      ),
      // One meal-plan query supplies today's applicable plan and historical
      // completion nutrition. The date predicate prevents loading unrelated
      // historical plans and their large meal arrays.
      withCache(
        `client:progress:plans:${userId}:${range}:${todayStr}`,
        () =>
          ClientMealPlan.find({
            clientId: userId,
            isDeleted: { $ne: true },
            $or: [
              {
                status: { $in: ["active", "completed", "paused"] },
                startDate: { $lte: todayEnd },
                endDate: { $gte: today },
              },
              {
                mealCompletions: {
                  $elemMatch: {
                    completed: true,
                    date: { $gte: progressStartDate },
                  },
                },
              },
            ],
          })
            .select(
              "startDate endDate status lastPublishedAt createdAt meals mealCompletions customizations",
            )
            .sort({ startDate: -1, lastPublishedAt: -1, createdAt: -1 })
            .lean(),
        { ttl: 120000, tags: ["client"] },
      ),
    ]);

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

    return NextResponse.json({
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
    return NextResponse.json(
      { error: "Failed to fetch progress" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    // OPTIMIZATION: Run auth + DB connection + body parsing in PARALLEL
    const [session, , data] = await Promise.all([
      getServerSession(authOptions),
      dbConnect(),
      request.json(),
    ]);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type, value, measurements, notes, photoUrl, side } = data;

    // Handle transformation photo
    if (type === "photo" && photoUrl) {
      const progressEntry = new ProgressEntry({
        user: session.user.id,
        type: "photo",
        value: photoUrl,
        unit: side || "front",
        notes: notes || "",
        recordedAt: new Date(),
      });
      await progressEntry.save();
      clearCacheByTag("dietitian_panel");

      // Log activity
      logActivity({
        userId: session.user.id,
        userRole: "client",
        userName: session.user.name || "",
        userEmail: session.user.email || "",
        action: "upload_progress_photo",
        actionType: "create",
        category: "fitness",
        description: `Uploaded transformation photo (${side || "front"} view)`,
        targetUserId: session.user.id,
        targetUserName: session.user.name || "",
        details: { side: side || "front" },
      }).catch(console.error);

      return NextResponse.json({ success: true, entry: progressEntry });
    }

    // Handle saving body measurements (multiple entries)
    if (type === "measurements" && measurements) {
      const measurementTypes = [
        "waist",
        "abdomen",
        "hips",
        "chest",
        "arms",
        "thighs",
      ];
      const savedEntries = [];
      const today = startOfDay(new Date());

      for (const measureType of measurementTypes) {
        if (measurements[measureType] && measurements[measureType] > 0) {
          const progressEntry = new ProgressEntry({
            user: session.user.id,
            type: measureType,
            value: measurements[measureType],
            unit: "cm",
            notes: notes,
            recordedAt: new Date(),
          });
          await progressEntry.save();
          savedEntries.push(progressEntry);
        }
      }

      // Also save to JournalTracking.measurements so it shows on dietitian's journal
      try {
        const clientObjectId = new mongoose.Types.ObjectId(session.user.id);

        // Find or create journal entry for today
        let journal = await JournalTracking.findOne({
          client: clientObjectId,
          date: today,
        });

        if (!journal) {
          journal = new JournalTracking({
            client: clientObjectId,
            date: today,
            activities: [],
            steps: [],
            water: [],
            sleep: [],
            meals: [],
            progress: [],
            bca: [],
            measurements: [],
          });
        } else if (!journal.measurements) {
          journal.measurements = [];
        }

        // Add measurement entry in journal format
        const journalMeasurement = {
          arm: measurements.arms || 0,
          waist: measurements.waist || 0,
          abd: measurements.abdomen || 0,
          chest: measurements.chest || 0,
          hips: measurements.hips || 0,
          thigh: measurements.thighs || 0,
          date: new Date(),
          createdAt: new Date(),
        };

        journal.measurements.push(journalMeasurement);
        await journal.save();

        // Clear caches
        clearCacheByTag("journal");
        clearCacheByTag("client");
      } catch (journalError) {
        console.error("Error saving to JournalTracking:", journalError);
        // Don't fail the request
      }

      // Log activity
      if (savedEntries.length > 0) {
        logActivity({
          userId: session.user.id,
          userRole: "client",
          userName: session.user.name || "",
          userEmail: session.user.email || "",
          action: "log_body_measurements",
          actionType: "create",
          category: "fitness",
          description: `Recorded body measurements: ${savedEntries.map((e) => e.type).join(", ")}`,
          targetUserId: session.user.id,
          targetUserName: session.user.name || "",
          details: measurements,
        }).catch(console.error);

        try {
          await notifyClientDataUpdate({
            clientId: session.user.id,
            updateType: "measurements",
            eventKey: `measurements:${savedEntries[0]?._id || Date.now()}`,
          });
        } catch (notificationError) {
          console.error(
            "Error sending measurements update notification:",
            notificationError,
          );
        }
      }

      return NextResponse.json({ success: true, entries: savedEntries });
    }

    // Handle single entry (weight, etc.) - ULTRA-AGGRESSIVELY OPTIMIZED
    // Generate ObjectId upfront so we can return immediately
    const entryId = new mongoose.Types.ObjectId();
    const recordedAt = new Date();
    const entryType = type || "weight";
    const entryUnit = type === "weight" ? "kg" : "cm";

    const progressData = {
      _id: entryId,
      user: session.user.id,
      type: entryType,
      value: value,
      unit: entryUnit,
      notes: notes || "",
      recordedAt: recordedAt,
    };

    // ULTRA-FAST: Return IMMEDIATELY with pending entry, DB write is fire-and-forget
    const pendingEntry = {
      _id: entryId.toString(),
      type: entryType,
      value: value,
      unit: entryUnit,
      notes: notes || "",
      recordedAt: recordedAt,
    };

    // FIRE-AND-FORGET: DB write happens in background
    ProgressEntry.create(progressData).catch((err) => {
      console.error("Background progress entry create failed:", err);
    });

    // ALL SIDE EFFECTS IN BACKGROUND (fire-and-forget)
    if (type === "weight" && value) {
      Promise.resolve().then(() => {
        clearCacheByTag("client");

        const numericWeight = Number(value);
        if (Number.isFinite(numericWeight) && numericWeight > 0) {
          emitClientWeightUpdate({
            clientId: session.user.id,
            weightKg: numericWeight,
            source: "client_progress",
          }).catch(() => {});
        }

        notifyClientDataUpdate({
          clientId: session.user.id,
          updateType: "weight_update",
          eventKey: `progress-weight:${entryId}`,
        }).catch(() => {});

        logActivity({
          userId: session.user.id,
          userRole: "client",
          userName: session.user.name || "",
          userEmail: session.user.email || "",
          action: "log_weight",
          actionType: "create",
          category: "fitness",
          description: `Recorded weight: ${value} kg`,
          targetUserId: session.user.id,
          targetUserName: session.user.name || "",
          details: { type: "weight", value, unit: "kg" },
        }).catch(() => {});
      });
    } else {
      // Non-weight entries - just log activity in background
      logActivity({
        userId: session.user.id,
        userRole: "client",
        userName: session.user.name || "",
        userEmail: session.user.email || "",
        action: "log_progress",
        actionType: "create",
        category: "fitness",
        description: `Recorded ${type}: ${value} cm`,
        targetUserId: session.user.id,
        targetUserName: session.user.name || "",
        details: { type, value, unit: "cm" },
      }).catch(() => {});
    }

    // Return immediately with pending entry
    return NextResponse.json({ success: true, entry: pendingEntry });
  } catch (error) {
    console.error("Error saving progress:", error);
    return NextResponse.json(
      { error: "Failed to save progress" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get("id");
    const deleteType = searchParams.get("type");
    const deleteAll = searchParams.get("all") === "true";

    // Bulk reset: delete all weight entries for current user
    if (deleteType === "weight" && deleteAll) {
      const result = await ProgressEntry.deleteMany({
        user: session.user.id,
        type: "weight",
      });

      clearCacheByTag("client");

      return NextResponse.json({
        success: true,
        message: "All weight entries deleted successfully",
        deletedCount: result.deletedCount || 0,
      });
    }

    if (!entryId) {
      return NextResponse.json(
        { error: "Entry ID is required" },
        { status: 400 },
      );
    }

    const entry = await ProgressEntry.findOne({
      _id: entryId,
      user: session.user.id,
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (entry.type === "photo") {
      await deleteFromBlob(entry.metadata?.imageKitFileId || (typeof entry.value === "string" ? entry.value : undefined));
    }
    await ProgressEntry.deleteOne({ _id: entry._id });

    return NextResponse.json({
      success: true,
      message: "Entry deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting progress entry:", error);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 },
    );
  }
}
