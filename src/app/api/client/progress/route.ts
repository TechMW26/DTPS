import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db/connection";
import User from "@/lib/db/models/User";
import ProgressEntry from "@/lib/db/models/ProgressEntry";
import FoodLog from "@/lib/db/models/FoodLog";
import ClientMealPlan from "@/lib/db/models/ClientMealPlan";
import { startOfDay, endOfDay, format } from 'date-fns';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { MEAL_TYPES, MEAL_TYPE_KEYS } from '@/lib/mealConfig';
import { logActivity } from '@/lib/utils/activityLogger';
import { emitClientWeightUpdate } from '@/lib/realtime/weight-notify';

// Get all possible meal type keys (canonical + common variations for DB compatibility)
const ALL_MEAL_KEYS = [...MEAL_TYPE_KEYS, ...MEAL_TYPE_KEYS.map(k => MEAL_TYPES[k].label)];

// Helper to get date range based on filter
function getStartDate(range: string): Date {
  const now = new Date();
  switch (range) {
    case 'ALL': return new Date(0);
    case '1W': return new Date(now.setDate(now.getDate() - 7));
    case '1M': return new Date(now.setMonth(now.getMonth() - 1));
    case '3M': return new Date(now.setMonth(now.getMonth() - 3));
    case '6M': return new Date(now.setMonth(now.getMonth() - 6));
    case '1Y': return new Date(now.setFullYear(now.getFullYear() - 1));
    default: return new Date(now.setDate(now.getDate() - 7));
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    // Get range from query params
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '1W';
    const includeAllWeights = searchParams.get('allWeights') === 'true';
    const startDate = getStartDate(range);

    // Get user data for current and target weight
    const user = await withCache(
      `client:progress:${JSON.stringify(session.user.id)}`,
      async () => await User.findById(session.user.id).select(
        "weightKg firstWeight targetWeightKg heightCm goals"
      ),
      { ttl: 120000, tags: ['client'] }
    );

    // Get progress entries for requested range (or ALL)
    const progressStartDate = range === 'ALL' ? new Date(0) : startDate;

    const allProgressEntries = await withCache(
      `client:progress:${JSON.stringify({
        user: session.user.id,
        recordedAt: { $gte: progressStartDate }
      })}`,
      async () => await ProgressEntry.find({
        user: session.user.id,
        recordedAt: { $gte: progressStartDate }
      }).sort({ recordedAt: -1 }),
      { ttl: 120000, tags: ['client'] }
    );

    // Optionally fetch complete weight history independently from chart range
    const allWeightEntriesSource = includeAllWeights
      ? await withCache(
        `client:progress:weights:all:${JSON.stringify(session.user.id)}`,
        async () => await ProgressEntry.find({
          user: session.user.id,
          type: 'weight'
        }).sort({ recordedAt: -1 }),
        { ttl: 120000, tags: ['client'] }
      )
      : allProgressEntries;

    // Get weight entries
    const weightEntries = allWeightEntriesSource
      .filter(entry => entry.type === 'weight' && entry.value)
      .map(entry => ({
        _id: entry._id,
        date: entry.recordedAt,
        weight: Number(entry.value)
      }));

    // Progress weight is independent from profile weight (no fallback to user.weightKg)
    const latestWeight = weightEntries[0]?.weight || 0;
    const baselineFirstWeight = Number(user?.firstWeight?.value || 0);
    const startWeight = (Number.isFinite(baselineFirstWeight) && baselineFirstWeight > 0)
      ? baselineFirstWeight
      : (weightEntries[weightEntries.length - 1]?.weight || latestWeight);
    const targetWeight = parseFloat(user?.targetWeightKg) || parseFloat(user?.goals?.targetWeight) || 0;

    // Calculate week's change
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weekAgoEntry = weightEntries.find(entry =>
      new Date(entry.date) <= oneWeekAgo
    );
    const weightChange = weekAgoEntry ? latestWeight - weekAgoEntry.weight : 0;

    // Calculate BMI - ensure proper calculation with validation
    const heightCm = parseFloat(user?.heightCm);
    const heightM = heightCm && !isNaN(heightCm) && heightCm > 0 ? heightCm / 100 : 0;
    const bmi = latestWeight > 0 && heightM > 0
      ? Math.round((latestWeight / (heightM * heightM)) * 10) / 10
      : 0;

    // Validate BMI is in reasonable range (10-60)
    const validBmi = bmi > 10 && bmi < 60 ? bmi : 0;

    // Get latest measurements - each type is stored separately
    const measurementTypes = ['waist', 'hips', 'chest', 'arms', 'thighs'];
    const measurements: Record<string, number> = {};

    for (const type of measurementTypes) {
      const latestEntry = allProgressEntries.find(entry => entry.type === type);
      measurements[type] = latestEntry ? Number(latestEntry.value) : 0;
    }

    // Get today's measurements specifically
    const todayStr = new Date().toISOString().split('T')[0];
    const todayMeasurements: Record<string, number> = {};

    for (const type of measurementTypes) {
      const todayEntry = allProgressEntries.find(entry => {
        const entryDate = new Date(entry.recordedAt).toISOString().split('T')[0];
        return entry.type === type && entryDate === todayStr;
      });
      todayMeasurements[type] = todayEntry ? Number(todayEntry.value) : 0;
    }

    // Build measurement history - group by date
    const measurementHistoryMap = new Map<string, any>();

    for (const entry of allProgressEntries) {
      if (measurementTypes.includes(entry.type)) {
        const dateKey = new Date(entry.recordedAt).toISOString().split('T')[0];

        if (!measurementHistoryMap.has(dateKey)) {
          measurementHistoryMap.set(dateKey, { date: entry.recordedAt });
        }

        const existing = measurementHistoryMap.get(dateKey);
        existing[entry.type] = Number(entry.value);
      }
    }

    const measurementHistory = Array.from(measurementHistoryMap.values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Get last measurement date for 7-day restriction check
    const lastMeasurementEntry = allProgressEntries.find(entry =>
      measurementTypes.includes(entry.type)
    );
    const lastMeasurementDate = lastMeasurementEntry?.recordedAt?.toISOString() || null;

    // Check if user can add new measurement (7 days restriction)
    const canAddMeasurement = !lastMeasurementEntry ||
      (new Date().getTime() - new Date(lastMeasurementEntry.recordedAt).getTime()) >= 7 * 24 * 60 * 60 * 1000;

    // Calculate days until next measurement
    const daysUntilNextMeasurement = lastMeasurementEntry
      ? Math.max(0, 7 - Math.floor((new Date().getTime() - new Date(lastMeasurementEntry.recordedAt).getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

    // Calculate progress percentage
    const totalToLose = startWeight - targetWeight;
    const lost = startWeight - latestWeight;
    const progressPercent = totalToLose > 0 ? Math.round((lost / totalToLose) * 100) : 0;

    // Get today's food intake - combine FoodLog and completed meals from ClientMealPlan
    const today = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    // Initialize nutrition totals
    let todayIntake = { calories: 0, protein: 0, carbs: 0, fat: 0 };

    // 1. Check FoodLog first (manual food logging)
    const todayFoodLog = await withCache(
      `client:progress:${JSON.stringify({
        client: session.user.id,
        date: { $gte: today, $lt: todayEnd }
      })}`,
      async () => await FoodLog.findOne({
        client: session.user.id,
        date: { $gte: today, $lt: todayEnd }
      }),
      { ttl: 120000, tags: ['client'] }
    );

    if (todayFoodLog?.totalNutrition) {
      todayIntake.calories += todayFoodLog.totalNutrition.calories || 0;
      todayIntake.protein += todayFoodLog.totalNutrition.protein || 0;
      todayIntake.carbs += todayFoodLog.totalNutrition.carbs || 0;
      todayIntake.fat += todayFoodLog.totalNutrition.fat || 0;
    }

    // Also check individual food log entries if totalNutrition is empty
    if (todayFoodLog?.entries?.length > 0 && !todayFoodLog.totalNutrition?.calories) {
      for (const entry of todayFoodLog.entries) {
        todayIntake.calories += entry.calories || 0;
        todayIntake.protein += entry.protein || 0;
        todayIntake.carbs += entry.carbs || 0;
        todayIntake.fat += entry.fat || 0;
      }
    }

    // 2. ALWAYS check completed meals from ClientMealPlan (add to existing data)
    try {
      const activeMealPlan = await ClientMealPlan.findOne({
        clientId: session.user.id,
        status: 'active',
        startDate: { $lte: todayEnd },
        endDate: { $gte: today }
      }).lean() as any;

      if (activeMealPlan?.mealCompletions?.length > 0) {
        // Get today's completed meals
        const todayCompletions = activeMealPlan.mealCompletions.filter((mc: any) => {
          const completionDate = format(new Date(mc.date), 'yyyy-MM-dd');
          return completionDate === todayStr && mc.completed;
        });

        if (todayCompletions.length > 0 && activeMealPlan.meals?.length > 0) {
          // Calculate day index
          const planStartDate = startOfDay(new Date(activeMealPlan.startDate));
          const dayIndex = Math.floor((today.getTime() - planStartDate.getTime()) / (1000 * 60 * 60 * 24));
          const dayData = activeMealPlan.meals[dayIndex % activeMealPlan.meals.length];

          if (dayData?.meals) {
            const mealsObj = dayData.meals;

            // Sum nutrition from completed meals
            for (const completion of todayCompletions) {
              const mealType = completion.mealType;
              // Try different case variations and formats
              const mealData = mealsObj[mealType] ||
                mealsObj[mealType.toLowerCase()] ||
                mealsObj[mealType.charAt(0).toUpperCase() + mealType.slice(1).toLowerCase()] ||
                // Also check by meal name (e.g., "Breakfast", "Lunch")
                Object.values(mealsObj).find((m: any) =>
                  m.name?.toLowerCase() === mealType.toLowerCase() ||
                  m.id === mealType
                );

              if (mealData) {
                // Check for foodOptions array (new meal plan structure)
                if (mealData.foodOptions && Array.isArray(mealData.foodOptions)) {
                  for (const food of mealData.foodOptions) {
                    // Parse string values to numbers - handle "cal", "carbs", "fats", "protein" fields
                    todayIntake.calories += parseFloat(food.cal) || parseFloat(food.calories) || 0;
                    todayIntake.protein += parseFloat(food.protein) || 0;
                    todayIntake.carbs += parseFloat(food.carbs) || 0;
                    todayIntake.fat += parseFloat(food.fats) || parseFloat(food.fat) || 0;
                  }
                }
                // Check for direct nutrition values on meal
                else if (mealData.totalCalories || mealData.calories || mealData.cal) {
                  todayIntake.calories += parseFloat(mealData.totalCalories) || parseFloat(mealData.calories) || parseFloat(mealData.cal) || 0;
                  todayIntake.protein += parseFloat(mealData.totalProtein) || parseFloat(mealData.protein) || 0;
                  todayIntake.carbs += parseFloat(mealData.totalCarbs) || parseFloat(mealData.carbs) || 0;
                  todayIntake.fat += parseFloat(mealData.totalFat) || parseFloat(mealData.fat) || parseFloat(mealData.fats) || 0;
                }
                // Calculate nutrition from items array
                else if (mealData.items && Array.isArray(mealData.items)) {
                  for (const item of mealData.items) {
                    todayIntake.calories += parseFloat(item.cal) || parseFloat(item.calories) || item.nutrition?.calories || 0;
                    todayIntake.protein += parseFloat(item.protein) || item.nutrition?.protein || 0;
                    todayIntake.carbs += parseFloat(item.carbs) || item.nutrition?.carbs || 0;
                    todayIntake.fat += parseFloat(item.fats) || parseFloat(item.fat) || item.nutrition?.fat || 0;
                  }
                }
              }
            }
          }
        }
      }
    } catch (mealPlanError) {
      console.error('Error fetching meal plan for nutrition:', mealPlanError);
    }

    // Round nutrition values
    todayIntake = {
      calories: Math.round(todayIntake.calories),
      protein: Math.round(todayIntake.protein),
      carbs: Math.round(todayIntake.carbs),
      fat: Math.round(todayIntake.fat)
    };

    // Get goals from user profile or meal plan
    let goals = {
      calories: user?.goals?.calories || user?.goals?.targetCalories || 2000,
      protein: user?.goals?.protein || user?.goals?.proteinGoal || 120,
      carbs: user?.goals?.carbs || user?.goals?.carbsGoal || 250,
      fat: user?.goals?.fat || user?.goals?.fatGoal || 65,
      water: user?.goals?.water || user?.goals?.waterGoal || 8,
      steps: user?.goals?.steps || user?.goals?.stepsGoal || 10000
    };

    // Try to get goals from active meal plan - calculate from actual meal plan data
    try {
      const mealPlanForGoals = await ClientMealPlan.findOne({
        clientId: session.user.id,
        status: 'active'
      }).select('customizations totalCaloriesPerDay meals startDate').lean() as any;

      if (mealPlanForGoals) {
        // First check if customizations have explicit goals set
        if (mealPlanForGoals.customizations?.targetCalories) {
          goals.calories = mealPlanForGoals.customizations.targetCalories;
        } else if (mealPlanForGoals.totalCaloriesPerDay) {
          goals.calories = mealPlanForGoals.totalCaloriesPerDay;
        }
        if (mealPlanForGoals.customizations?.proteinGoal) {
          goals.protein = mealPlanForGoals.customizations.proteinGoal;
        }
        if (mealPlanForGoals.customizations?.carbsGoal) {
          goals.carbs = mealPlanForGoals.customizations.carbsGoal;
        }
        if (mealPlanForGoals.customizations?.fatGoal) {
          goals.fat = mealPlanForGoals.customizations.fatGoal;
        }

        // Calculate total daily macros from actual meal plan data for today
        if (mealPlanForGoals.meals?.length > 0) {
          const planStart = startOfDay(new Date(mealPlanForGoals.startDate));
          const today = startOfDay(new Date());
          const dayIndex = Math.floor((today.getTime() - planStart.getTime()) / (1000 * 60 * 60 * 24));
          const dayData = mealPlanForGoals.meals[dayIndex % mealPlanForGoals.meals.length];

          if (dayData?.meals) {
            let totalCalories = 0;
            let totalProtein = 0;
            let totalCarbs = 0;
            let totalFat = 0;

            // Iterate through all meal types for the day using canonical config
            for (const mealType of ALL_MEAL_KEYS) {
              const mealData = dayData.meals[mealType];
              if (mealData?.foodOptions && Array.isArray(mealData.foodOptions)) {
                for (const food of mealData.foodOptions) {
                  totalCalories += parseFloat(food.cal) || parseFloat(food.calories) || 0;
                  totalProtein += parseFloat(food.protein) || 0;
                  totalCarbs += parseFloat(food.carbs) || 0;
                  totalFat += parseFloat(food.fats) || parseFloat(food.fat) || 0;
                }
              }
            }

            // Update goals with calculated totals if they are greater than 0
            if (totalCalories > 0) {
              goals.calories = Math.round(totalCalories);
            }
            if (totalProtein > 0) {
              goals.protein = Math.round(totalProtein);
            }
            if (totalCarbs > 0) {
              goals.carbs = Math.round(totalCarbs);
            }
            if (totalFat > 0) {
              goals.fat = Math.round(totalFat);
            }
          }
        }
      }
    } catch (goalsError) {
      console.error('Error fetching meal plan goals:', goalsError);
    }

    // Get calorie history from food logs
    const foodLogs = await withCache(
      `client:progress:${JSON.stringify({
        client: session.user.id,
        date: { $gte: progressStartDate }
      })}`,
      async () => await FoodLog.find({
        client: session.user.id,
        date: { $gte: progressStartDate }
      }).select('date totalNutrition entries').sort({ date: -1 }),
      { ttl: 120000, tags: ['client'] }
    );

    // Build nutrition history with macros
    const nutritionHistoryMap = new Map<string, { calories: number; protein: number; carbs: number; fat: number }>();

    // Add food log data to history
    for (const log of foodLogs) {
      const dateKey = format(new Date(log.date), 'yyyy-MM-dd');
      const existing = nutritionHistoryMap.get(dateKey) || { calories: 0, protein: 0, carbs: 0, fat: 0 };

      if (log.totalNutrition?.calories) {
        existing.calories += log.totalNutrition.calories || 0;
        existing.protein += log.totalNutrition.protein || 0;
        existing.carbs += log.totalNutrition.carbs || 0;
        existing.fat += log.totalNutrition.fat || 0;
      } else if (log.entries?.length > 0) {
        for (const entry of log.entries) {
          existing.calories += entry.calories || 0;
          existing.protein += entry.protein || 0;
          existing.carbs += entry.carbs || 0;
          existing.fat += entry.fat || 0;
        }
      }

      nutritionHistoryMap.set(dateKey, existing);
    }

    // Also get nutrition history from meal completions
    try {
      const mealPlansWithCompletions = await ClientMealPlan.find({
        clientId: session.user.id,
        'mealCompletions.0': { $exists: true }
      }).select('meals mealCompletions startDate').lean() as any[];

      for (const plan of mealPlansWithCompletions) {
        if (!plan.mealCompletions?.length || !plan.meals?.length) continue;

        for (const completion of plan.mealCompletions) {
          if (!completion.completed) continue;

          const completionDate = format(new Date(completion.date), 'yyyy-MM-dd');
          const existing = nutritionHistoryMap.get(completionDate) || { calories: 0, protein: 0, carbs: 0, fat: 0 };

          // Calculate day index
          const planStart = startOfDay(new Date(plan.startDate));
          const completionDay = startOfDay(new Date(completion.date));
          const dayIdx = Math.floor((completionDay.getTime() - planStart.getTime()) / (1000 * 60 * 60 * 24));
          const dayData = plan.meals[dayIdx % plan.meals.length];

          if (dayData?.meals) {
            const mealType = completion.mealType;
            const mealData = dayData.meals[mealType] ||
              dayData.meals[mealType.toLowerCase()] ||
              dayData.meals[mealType.charAt(0).toUpperCase() + mealType.slice(1).toLowerCase()];

            if (mealData?.foodOptions && Array.isArray(mealData.foodOptions)) {
              for (const food of mealData.foodOptions) {
                existing.calories += parseFloat(food.cal) || parseFloat(food.calories) || 0;
                existing.protein += parseFloat(food.protein) || 0;
                existing.carbs += parseFloat(food.carbs) || 0;
                existing.fat += parseFloat(food.fats) || parseFloat(food.fat) || 0;
              }
            }
          }

          nutritionHistoryMap.set(completionDate, existing);
        }
      }
    } catch (historyError) {
      console.error('Error fetching meal completion history:', historyError);
    }

    // Convert map to arrays sorted by date
    const sortedDates = Array.from(nutritionHistoryMap.keys()).sort();
    const nutritionHistory = sortedDates.map(date => ({
      date,
      ...nutritionHistoryMap.get(date)!
    }));

    const calorieHistory = nutritionHistory.map(n => ({
      date: n.date,
      calories: Math.round(n.calories)
    }));

    // Get transformation photos
    const transformationPhotos = allProgressEntries
      .filter(entry => entry.type === 'photo')
      .map(entry => ({
        _id: entry._id,
        url: entry.value as string,
        date: entry.recordedAt,
        notes: entry.notes || '',
        side: entry.unit || 'front'
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
      transformationPhotos: transformationPhotos
    });
  } catch (error) {
    console.error("Error fetching progress:", error);
    return NextResponse.json({ error: "Failed to fetch progress" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const data = await request.json();

    const { type, value, measurements, notes, photoUrl, side } = data;

    // Handle transformation photo
    if (type === 'photo' && photoUrl) {
      const progressEntry = new ProgressEntry({
        user: session.user.id,
        type: 'photo',
        value: photoUrl,
        unit: side || 'front',
        notes: notes || '',
        recordedAt: new Date()
      });
      await progressEntry.save();

      // Log activity
      logActivity({
        userId: session.user.id,
        userRole: 'client',
        userName: session.user.name || '',
        userEmail: session.user.email || '',
        action: 'upload_progress_photo',
        actionType: 'create',
        category: 'fitness',
        description: `Uploaded transformation photo (${side || 'front'} view)`,
        targetUserId: session.user.id,
        targetUserName: session.user.name || '',
        details: { side: side || 'front' }
      }).catch(console.error);

      return NextResponse.json({ success: true, entry: progressEntry });
    }

    // Handle saving body measurements (multiple entries)
    if (type === 'measurements' && measurements) {
      const measurementTypes = ['waist', 'hips', 'chest', 'arms', 'thighs'];
      const savedEntries = [];

      for (const measureType of measurementTypes) {
        if (measurements[measureType] && measurements[measureType] > 0) {
          const progressEntry = new ProgressEntry({
            user: session.user.id,
            type: measureType,
            value: measurements[measureType],
            unit: 'cm',
            notes: notes,
            recordedAt: new Date()
          });
          await progressEntry.save();
          savedEntries.push(progressEntry);
        }
      }

      // Log activity
      if (savedEntries.length > 0) {
        logActivity({
          userId: session.user.id,
          userRole: 'client',
          userName: session.user.name || '',
          userEmail: session.user.email || '',
          action: 'log_body_measurements',
          actionType: 'create',
          category: 'fitness',
          description: `Recorded body measurements: ${savedEntries.map(e => e.type).join(', ')}`,
          targetUserId: session.user.id,
          targetUserName: session.user.name || '',
          details: measurements
        }).catch(console.error);
      }

      return NextResponse.json({ success: true, entries: savedEntries });
    }

    // Handle single entry (weight, etc.)
    const progressEntry = new ProgressEntry({
      user: session.user.id,
      type: type || 'weight',
      value: value,
      unit: type === 'weight' ? 'kg' : 'cm',
      notes: notes,
      recordedAt: new Date()
    });

    await progressEntry.save();

    // Keep progress weights independent from profile/basic form weight
    if (type === 'weight' && value) {
      clearCacheByTag('client');

      // Realtime: update current weight on assigned staff dashboards
      const numericWeight = Number(value);
      if (Number.isFinite(numericWeight) && numericWeight > 0) {
        await emitClientWeightUpdate({
          clientId: session.user.id,
          weightKg: numericWeight,
          source: 'client_progress'
        });
      }
    }

    // Log activity
    logActivity({
      userId: session.user.id,
      userRole: 'client',
      userName: session.user.name || '',
      userEmail: session.user.email || '',
      action: type === 'weight' ? 'log_weight' : 'log_progress',
      actionType: 'create',
      category: 'fitness',
      description: `Recorded ${type}: ${value}${type === 'weight' ? ' kg' : ' cm'}`,
      targetUserId: session.user.id,
      targetUserName: session.user.name || '',
      details: { type, value, unit: type === 'weight' ? 'kg' : 'cm' }
    }).catch(console.error);

    return NextResponse.json({ success: true, entry: progressEntry });
  } catch (error) {
    console.error("Error saving progress:", error);
    return NextResponse.json({ error: "Failed to save progress" }, { status: 500 });
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
    const entryId = searchParams.get('id');
    const deleteType = searchParams.get('type');
    const deleteAll = searchParams.get('all') === 'true';

    // Bulk reset: delete all weight entries for current user
    if (deleteType === 'weight' && deleteAll) {
      const result = await ProgressEntry.deleteMany({
        user: session.user.id,
        type: 'weight'
      });

      clearCacheByTag('client');

      return NextResponse.json({
        success: true,
        message: 'All weight entries deleted successfully',
        deletedCount: result.deletedCount || 0
      });
    }

    if (!entryId) {
      return NextResponse.json({ error: "Entry ID is required" }, { status: 400 });
    }

    // Find and delete the entry, ensuring it belongs to the current user
    const deletedEntry = await ProgressEntry.findOneAndDelete({
      _id: entryId,
      user: session.user.id
    });

    if (!deletedEntry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Entry deleted successfully" });
  } catch (error) {
    console.error("Error deleting progress entry:", error);
    return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 });
  }
}
