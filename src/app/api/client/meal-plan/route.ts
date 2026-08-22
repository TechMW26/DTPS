import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import Recipe from '@/lib/db/models/Recipe';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { startOfDay, endOfDay, parseISO, format, isValid } from 'date-fns';
import { withCache } from '@/lib/api/utils';
import {
  MEAL_TYPES,
  MEAL_TYPE_KEYS,
  type MealTypeKey
} from '@/lib/mealConfig';

// Convert MealTypeKey (uppercase) to camelCase for frontend compatibility
// Each meal type maps to a UNIQUE camelCase key to avoid duplicates
const mealTypeKeyToCamelCase: Record<MealTypeKey, string> = {
  'EARLY_MORNING': 'earlyMorning',
  'BREAKFAST': 'breakfast',
  'MID_MORNING': 'midMorning',
  'LUNCH': 'lunch',
  'MID_EVENING': 'midEvening',
  'EVENING': 'evening',
  'DINNER': 'dinner',
  'PAST_DINNER': 'pastDinner'
};

function convertMealTypeToCamelCase(mealTypeKey: MealTypeKey | string): string {
  if (mealTypeKey in mealTypeKeyToCamelCase) {
    return mealTypeKeyToCamelCase[mealTypeKey as MealTypeKey];
  }
  // Fallback: try to convert manually
  return mealTypeKey.toLowerCase().replace(/_([a-z])/g, (match, char) => char.toUpperCase());
}

function resolveBuiltInMealTypeKey(input: string): MealTypeKey | null {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const canonicalCandidate = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (MEAL_TYPE_KEYS.includes(canonicalCandidate as MealTypeKey)) {
    return canonicalCandidate as MealTypeKey;
  }

  const camelToCanonical = Object.entries(mealTypeKeyToCamelCase).find(([, camel]) => camel === raw);
  if (camelToCanonical) {
    return camelToCanonical[0] as MealTypeKey;
  }

  // Preserve compatibility for a few legacy frontend keys only.
  const legacyMap: Record<string, MealTypeKey> = {
    morningSnack: 'MID_MORNING',
    afternoonSnack: 'MID_EVENING',
    eveningSnack: 'EVENING',
  };

  return legacyMap[raw] || null;
}

function resolveRequestedDate(dateParam: string | null): Date | null {
  const requestedDate = dateParam ? parseISO(dateParam) : new Date();
  if (!isValid(requestedDate)) {
    return null;
  }

  return startOfDay(requestedDate);
}

// GET /api/client/meal-plan - Get client's meal plan for a specific date
export async function GET(request: NextRequest) {
  try {
    // Run auth + DB connection in PARALLEL
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB()
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== UserRole.CLIENT) {
      return NextResponse.json({ error: 'Only clients can access this endpoint' }, { status: 403 });
    }

    // Check if client is on hold - if so, hide meal plans
    const clientUser = await User.findById(session.user.id).select('holdStatus').lean() as any;
    if (clientUser?.holdStatus?.isOnHold) {
      return NextResponse.json({
        success: true,
        hasPlan: false,
        isOnHold: true,
        message: 'Your account is currently on hold. Please contact your administrator.'
      });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const listAll = searchParams.get('list') === 'true';
    const normalizedDate = resolveRequestedDate(dateParam);
    if (!normalizedDate && !listAll) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }

    // If listing all plans, return all non-deleted plans for the client
    if (listAll) {
      const allPlans = await ClientMealPlan.find({
        clientId: session.user.id,
        status: { $in: ['active', 'completed', 'paused'] },
      })
        .select('name status startDate endDate duration createdAt')
        .sort({ createdAt: -1 })
        .lean();
      return NextResponse.json({ success: true, plans: allPlans });
    }

    // At this point normalizedDate is guaranteed non-null since !listAll
    const effectiveDate = normalizedDate!;

    const cacheKey = `client:meal-plan:${session.user.id}:${effectiveDate.toISOString().slice(0, 10)}`;

    const data = await withCache(
      cacheKey,
      async () => {
        // Find active OR completed meal plan for the client on this date
        const mealPlan = await ClientMealPlan.findOne({
          clientId: session.user.id,
          status: { $in: ['active', 'completed', 'paused'] },
          isDeleted: { $ne: true },
          startDate: { $lte: endOfDay(effectiveDate) },
          endDate: { $gte: startOfDay(effectiveDate) }
        })
          .sort({ startDate: -1, lastPublishedAt: -1, createdAt: -1 })
          .select('clientId status startDate endDate meals mealTypes templateId mealCompletions freezedDays customizations goals name')
          .populate('templateId')
          .lean() as any;

        if (!mealPlan) {
          return {
            success: true,
            hasPlan: false,
            message: 'No active meal plan for this date'
          };
        }

        // Calculate day index within the plan
        const planStartDate = startOfDay(new Date(mealPlan.startDate));
        const dayIndex = Math.floor((effectiveDate.getTime() - planStartDate.getTime()) / (1000 * 60 * 60 * 24));

        // Get meals for this day
        let dayMeals: any[] = [];
        let mealsSource = 'none';

        // Store daily note
        let dailyNote = '';

        // 1. Try direct meals array on the plan
        if (mealPlan.meals?.length > 0) {
          // Prefer the stored calendar date. Index-only lookup serves the wrong
          // day when legacy plans have gaps or freeze recovery days appended.
          const requestedDateKey = format(effectiveDate, 'yyyy-MM-dd');
          const dayData = mealPlan.meals.find((entry: any) => {
            if (!entry?.date) return false;
            const entryDate = new Date(entry.date);
            return isValid(entryDate) && format(entryDate, 'yyyy-MM-dd') === requestedDateKey;
          }) || mealPlan.meals[dayIndex];

          // Capture daily note
          if (dayData?.note) {
            dailyNote = dayData.note;
          }

          if (dayData?.meals) {
            const mealsObj = dayData.meals;
            // Get ALL meal keys - both canonical and custom meal types
            // Don't filter by MEAL_TYPE_KEYS to include custom meals
            const mealKeys = Object.keys(mealsObj).filter(k => {
              // Skip non-meal properties
              if (['note', 'date', 'id', '_id'].includes(k)) return false;
              const meal = mealsObj[k];
              // Include if it's an object (could be a meal)
              return meal && typeof meal === 'object' && !Array.isArray(meal);
            });

            if (mealKeys.length > 0) {
              mealsSource = 'plan-meals';
              dayMeals = extractMeals(mealsObj, mealPlan._id, dayIndex, effectiveDate, mealPlan.mealCompletions);
            }
          }
        }

        // 2. Fallback to mealTypes if no meals found (show empty slots)
        if (dayMeals.length === 0 && mealPlan.mealTypes?.length > 0) {
          mealsSource = 'meal-types-empty';
          dayMeals = mealPlan.mealTypes.map((mealType: any, index: number) => ({
            id: `${mealPlan._id}-${dayIndex}-${index}`,
            type: mealType.name?.toLowerCase().replace(/\s+/g, '') || getMealTypeByIndex(index),
            time: mealType.time || getDefaultMealTime(mealType.name || getMealTypeByIndex(index)),
            totalCalories: 0,
            items: [],
            isCompleted: false,
            isEmpty: true
          }));
        }

        // 3. Fallback to template if available
        if (dayMeals.length === 0 && mealPlan.templateId) {
          const template = mealPlan.templateId as any;

          if (template?.meals?.length > 0) {
            const templateDay = template.meals[dayIndex % template.meals.length];
            if (templateDay) {
              mealsSource = 'template';
              dayMeals = extractMeals(templateDay.meals || templateDay, mealPlan._id, dayIndex, effectiveDate, mealPlan.mealCompletions);
            }
          }
        }

        // 4. Ultimate fallback - show default empty meal slots
        if (dayMeals.length === 0) {
          mealsSource = 'default-empty';
          dayMeals = getDefaultMealSlots(mealPlan._id, dayIndex);
        }

        // 5. Enrich meals with full recipe details from Recipe model
        dayMeals = await enrichMealsWithRecipeDetails(dayMeals);

        // Calculate total calories
        const totalCalories = Math.round((dayMeals.reduce((sum, meal) => sum + (meal.totalCalories || 0), 0) ||
          mealPlan.customizations?.targetCalories || 0) * 100) / 100;

        // Check if this date is frozen
        const dateStr = format(effectiveDate, 'yyyy-MM-dd');
        const freezedDays = mealPlan.freezedDays || [];
        const isFrozen = freezedDays.some((fd: any) => {
          const freezeDate = format(new Date(fd.date), 'yyyy-MM-dd');
          return freezeDate === dateStr;
        });

        // Get freeze day details if frozen
        const freezeInfo = isFrozen ? freezedDays.find((fd: any) =>
          format(new Date(fd.date), 'yyyy-MM-dd') === dateStr
        ) : null;

        return {
          success: true,
          hasPlan: true,
          date: effectiveDate.toISOString(),
          totalCalories,
          meals: dayMeals,
          dailyNote, // Dietitian's note for the day
          mealsSource, // For debugging
          isFrozen,
          freezeInfo: freezeInfo ? {
            date: freezeInfo.date,
            addedDate: freezeInfo.addedDate || null,
            reason: freezeInfo.reason || 'Day frozen by dietitian',
            frozenAt: freezeInfo.createdAt
          } : null,
          mealTypes: mealPlan.mealTypes || [], // Return dietitian's custom meal types
          planDetails: {
            id: mealPlan._id,
            name: mealPlan.name,
            startDate: mealPlan.startDate,
            endDate: mealPlan.endDate,
            status: mealPlan.status,
            goals: mealPlan.goals,
            dayIndex,
            hasMealsData: dayMeals.some(m => m.items?.length > 0)
          }
        };
      },
      { ttl: 60000, tags: ['client'] }
    );

    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching client meal plan:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: 'Failed to fetch meal plan'
    }, { status: 500 });
  }
}

// Helper functions - using canonical meal config
function getMealTypeByIndex(index: number): MealTypeKey {
  return MEAL_TYPE_KEYS[index % MEAL_TYPE_KEYS.length] || 'BREAKFAST';
}

function getDefaultMealTime(mealType: string): string {
  // Resolve only strict built-in meal types; custom types should not be coerced.
  const builtInKey = resolveBuiltInMealTypeKey(mealType);
  if (builtInKey && MEAL_TYPE_KEYS.includes(builtInKey)) {
    return MEAL_TYPES[builtInKey].time12h;
  }
  return '12:00 PM';
}

function getDefaultMealSlots(planId: string, dayIndex: number): any[] {
  // Use canonical meal types from config, convert to camelCase for frontend
  return MEAL_TYPE_KEYS.map((key, index) => ({
    id: `${planId}-${dayIndex}-${index}`,
    type: convertMealTypeToCamelCase(key), // Convert to camelCase
    time: MEAL_TYPES[key].time12h,
    label: MEAL_TYPES[key].label,
    totalCalories: 0,
    items: [],
    isCompleted: false,
    isEmpty: true
  }));
}

const normalizeTypeForCompare = (type: string | undefined | null): string =>
  (type || '').toLowerCase().replace(/[\s_-]+/g, '');

function flattenMealFoods(meal: any): any[] {
  if (!meal) return [];

  const foods = meal.foods || meal.items || meal.foodOptions || [];
  if (!Array.isArray(foods)) return [];

  return foods.flatMap((food: any) => {
    if (Array.isArray(food?.foods) && food.foods.length > 0) {
      return food.foods.map((nestedFood: any) => ({
        ...nestedFood,
        isAlternative: Boolean(food.isAlternative || nestedFood.isAlternative),
        recipeId: nestedFood.recipeId || food.recipeId,
        recipeUuid: nestedFood.recipeUuid || food.recipeUuid,
        recipe: nestedFood.recipe || food.recipe,
      }));
    }

    return [food];
  }).filter(Boolean);
}

function calculateMealCalories(meal: any): number {
  if (!meal) return 0;
  if (meal.totalCalories) return Number(meal.totalCalories) || 0;

  const foods = flattenMealFoods(meal);
  if (!foods.length) return 0;

  // Only count main foods — exclude alternatives (client eats one OR the other, not both)
  const mainFoods = foods.filter((f: any) => !f.isAlternative);
  return mainFoods.reduce((sum: number, food: any) => {
    const cal = Number(food.calories) || Number(food.cal) || 0;
    return sum + cal;
  }, 0);
}

// Calculate all macros from a meal
function calculateMealMacros(meal: any): { calories: number; protein: number; carbs: number; fat: number } {
  const result = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  if (!meal) return result;

  const foods = flattenMealFoods(meal);
  if (!foods.length) return result;

  // Only count main foods — exclude alternatives (client eats one OR the other, not both)
  const mainFoods = foods.filter((f: any) => !f.isAlternative);
  for (const food of mainFoods) {
    result.calories += Number(food.calories) || Number(food.cal) || 0;
    result.protein += Number(food.protein) || 0;
    result.carbs += Number(food.carbs) || 0;
    result.fat += Number(food.fats) || Number(food.fat) || 0;
  }

  // Round to 2 decimal places
  result.calories = Math.round(result.calories * 100) / 100;
  result.protein = Math.round(result.protein * 100) / 100;
  result.carbs = Math.round(result.carbs * 100) / 100;
  result.fat = Math.round(result.fat * 100) / 100;

  return result;
}

function checkMealCompletion(completions: any[], date: Date, mealType: string, originalMealType?: string): boolean {
  if (!completions?.length) return false;

  const dateStart = startOfDay(date);
  const dateEnd = endOfDay(date);
  const targetMealKey = normalizeTypeForCompare(mealType);
  const targetOriginalKey = normalizeTypeForCompare(originalMealType || mealType);

  return completions.some(c => {
    const cDate = new Date(c.date);
    if (!(cDate >= dateStart && cDate <= dateEnd && c.completed)) {
      return false;
    }

    const completionMealTypeKey = normalizeTypeForCompare(c.mealType);
    const completionOriginalTypeKey = normalizeTypeForCompare(c.mealTypeOriginal);

    return completionMealTypeKey === targetMealKey ||
      completionMealTypeKey === targetOriginalKey ||
      completionOriginalTypeKey === targetOriginalKey ||
      completionOriginalTypeKey === targetMealKey;
  });
}

// Main extraction function - handles all meal structures WITHOUT filtering
function extractMeals(mealsData: any, planId: string, dayIndex: number, date: Date, completions: any[]): any[] {
  if (!mealsData) return [];

  const results: any[] = [];

  // If it's an array of meals
  if (Array.isArray(mealsData)) {
    mealsData.forEach((meal: any, index: number) => {
      const mealType = meal.mealType || meal.type || getMealTypeByIndex(index);
      const builtInKey = resolveBuiltInMealTypeKey(String(mealType));
      const isKnownMealType = Boolean(builtInKey);
      // For known types, convert to camelCase; for custom types, use original name
      const camelCaseType = isKnownMealType
        ? convertMealTypeToCamelCase(builtInKey as MealTypeKey)
        : mealType; // Preserve custom meal type name as-is
      const items = extractFoodItems(meal, planId, dayIndex, index);
      const macros = calculateMealMacros(meal);

      results.push({
        id: `${planId}-${dayIndex}-${index}`,
        type: camelCaseType, // Use camelCase for known types, original for custom types
        originalType: mealType, // Keep original for debugging
        time: meal.time || getDefaultMealTime(mealType),
        totalCalories: macros.calories || calculateMealCalories(meal),
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        notes: meal.notes || meal.note || '',
        items: items,
        itemCount: items.length, // Explicit count for debugging
        isCompleted: checkMealCompletion(completions, date, String(builtInKey || mealType), String(mealType)),
        isEmpty: items.length === 0
      });
    });
    return results;
  }

  // If it's an object with meal types as keys (breakfast, lunch, etc.)
  if (typeof mealsData === 'object') {
    let mealIndex = 0;

    // Process ALL keys - don't filter by canonical types only
    Object.entries(mealsData).forEach(([mealType, meal]: [string, any]) => {
      // Skip non-meal properties (like 'note', 'date', etc.)
      if (typeof meal !== 'object' || meal === null || Array.isArray(meal)) {
        return;
      }

      // Check if it looks like a meal (has foods/items or is a recognized meal type)
      const hasFoodData = meal.foods || meal.items || meal.foodOptions;
      const builtInKey = resolveBuiltInMealTypeKey(String(mealType));
      const isKnownMealType = Boolean(builtInKey);
      // For known types, convert to camelCase; for custom types, use original name
      const camelCaseType = isKnownMealType
        ? convertMealTypeToCamelCase(builtInKey as MealTypeKey)
        : mealType; // Preserve custom meal type name as-is

      if (hasFoodData || isKnownMealType) {
        const items = extractFoodItems(meal, planId, dayIndex, mealIndex);
        const macros = calculateMealMacros(meal);

        results.push({
          id: `${planId}-${dayIndex}-${mealIndex}`,
          type: camelCaseType, // Use camelCase for known types, original for custom types
          originalType: mealType,
          time: meal.time || getDefaultMealTime(mealType),
          totalCalories: macros.calories || calculateMealCalories(meal),
          protein: macros.protein,
          carbs: macros.carbs,
          fat: macros.fat,
          notes: meal.notes || meal.note || '',
          items: items,
          itemCount: items.length,
          isCompleted: checkMealCompletion(completions, date, String(builtInKey || mealType), String(mealType)),
          isEmpty: items.length === 0
        });
        mealIndex++;
      }
    });
  }

  return results;
}

function hasFood(meal: any): boolean {
  const foods = flattenMealFoods(meal);
  return foods.length > 0 && foods.some((f: any) => f.food || f.name || f.foodName);
}

function extractFoodItems(meal: any, planId: string, dayIndex: number, mealIndex: number): any[] {
  if (!meal) return [];

  const foods = flattenMealFoods(meal);
  if (!foods.length) return [];

  // Extract ALL food items - no filtering, include everything
  return foods.map((food: any, foodIndex: number) => {
    // Get the food name from various possible fields
    const foodName = food.food || food.name || food.foodName || food.recipeName || '';

    // Skip only if completely empty (no name at all)
    if (!foodName && !food.recipeId && !food.recipeUuid) {
      return null;
    }

    return {
      id: `${planId}-${dayIndex}-${mealIndex}-${foodIndex}`,
      name: foodName || 'Food Item',
      portion: food.unit || food.portion || food.quantity || food.servingSize || '1 serving',
      calories: Math.round((Number(food.calories) || Number(food.cal) || 0) * 100) / 100,
      // Alternatives - ensure proper structure with full nutrition
      alternatives: Array.isArray(food.alternatives) ? food.alternatives.map((alt: any) => ({
        name: alt.name || alt.food || 'Alternative',
        portion: alt.portion || alt.unit || '1 serving',
        calories: Math.round((Number(alt.calories) || 0) * 100) / 100,
        protein: Math.round((Number(alt.protein) || 0) * 100) / 100,
        carbs: Math.round((Number(alt.carbs) || 0) * 100) / 100,
        fats: Math.round((Number(alt.fats) || Number(alt.fat) || 0) * 100) / 100
      })) : [],
      // Flag for alternative food type
      isAlternative: food.isAlternative || false,
      // Recipe data - include if present
      recipe: food.recipe || null,
      recipeId: food.recipeId || food.recipe?._id || null,
      recipeUuid: food.recipeUuid || null,
      // Tags
      tags: Array.isArray(food.tags) ? food.tags : [],
      // Full nutrition info
      protein: Math.round((Number(food.protein) || 0) * 100) / 100,
      carbs: Math.round((Number(food.carbs) || 0) * 100) / 100,
      fats: Math.round((Number(food.fats) || Number(food.fat) || 0) * 100) / 100,
      // Additional details for full view
      notes: food.note || food.notes || food.dietitianNotes || food.remarks || '',
      timing: food.timing || food.whenToEat || food.timeToEat || '',
      quantity: food.quantity || food.servingSize || food.amount || '',
      // Type indicator (recipe vs plain food)
      isRecipe: !!(food.recipeId || food.recipeUuid || food.recipe),
      // Original data for debugging
      _rawData: process.env.NODE_ENV === 'development' ? food : undefined
    };
  }).filter(Boolean); // Remove null entries
}

// Fetch full recipe details from Recipe model
async function enrichMealsWithRecipeDetails(meals: any[]): Promise<any[]> {
  // Collect all recipe IDs and UUIDs that need to be fetched
  const recipeIds: string[] = [];
  const recipeUuids: string[] = [];
  const recipeNames: string[] = [];

  meals.forEach(meal => {
    if (meal.items) {
      meal.items.forEach((item: any) => {
        const hasCompleteEmbeddedRecipe =
          Array.isArray(item.recipe?.ingredients) &&
          item.recipe.ingredients.length > 0 &&
          Array.isArray(item.recipe?.instructions) &&
          item.recipe.instructions.length > 0;

        if (!hasCompleteEmbeddedRecipe) {
          if (item.recipeUuid) {
            recipeUuids.push(item.recipeUuid);
          } else if (item.recipeId) {
            recipeIds.push(item.recipeId.toString());
          } else if (item.name) {
            recipeNames.push(String(item.name).trim());
          }
        }
      });
    }
  });

  if (recipeIds.length === 0 && recipeUuids.length === 0 && recipeNames.length === 0) return meals;

  try {
    // Fetch all recipes in one query (by ID or UUID)
    const query: any = { $or: [] };
    if (recipeIds.length > 0) {
      query.$or.push({ _id: { $in: recipeIds } });
    }
    if (recipeUuids.length > 0) {
      query.$or.push({ uuid: { $in: recipeUuids } });
    }
    if (recipeNames.length > 0) {
      const exactNamePatterns = [...new Set(recipeNames.filter(Boolean))].map(
        (name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      );
      query.$or.push({
        $and: [
          { name: { $in: exactNamePatterns } },
          { isActive: { $ne: false } },
          { 'ingredients.0': { $exists: true } },
          { 'instructions.0': { $exists: true } },
        ],
      });
    }

    const recipes = await Recipe.find(query).lean() as any[];

    // Create maps for quick lookup by both ID and UUID
    const recipeMapById = new Map(recipes.map((r: any) => [r._id.toString(), r]));
    const recipeMapByUuid = new Map(
      recipes.filter((r: any) => r.uuid).map((r: any) => [String(r.uuid), r]),
    );
    const recipeMapByName = new Map(
      recipes.map((r: any) => [String(r.name || '').trim().toLowerCase(), r]),
    );

    // Enrich meal items with recipe details
    return meals.map(meal => ({
      ...meal,
      items: meal.items?.map((item: any) => {
        // Look up recipe by UUID first, then by ID
        let fullRecipe = null;
        if (item.recipeUuid) {
          fullRecipe = recipeMapByUuid.get(String(item.recipeUuid));
        }
        if (!fullRecipe && item.recipeId) {
          fullRecipe = recipeMapById.get(item.recipeId.toString());
        }
        if (!fullRecipe && item.name) {
          fullRecipe = recipeMapByName.get(String(item.name).trim().toLowerCase());
        }

        if (fullRecipe) {
          return {
            ...item,
            recipe: {
              ingredients: fullRecipe.ingredients?.map((ing: any) =>
                `${ing.quantity} ${ing.unit} ${ing.name}${ing.remarks ? ` (${ing.remarks})` : ''}`
              ) || [],
              instructions: fullRecipe.instructions || [],
              prepTime: fullRecipe.prepTime ? `${fullRecipe.prepTime} min` : null,
              cookTime: fullRecipe.cookTime ? `${fullRecipe.cookTime} min` : null,
              servings: fullRecipe.servings,
              difficulty: fullRecipe.difficulty,
              cuisine: fullRecipe.cuisine,
              tips: fullRecipe.tips || [],
              nutrition: {
                calories: Number(fullRecipe.calories) || 0,
                protein: Number(fullRecipe.protein) || 0,
                carbs: Number(fullRecipe.carbs) || 0,
                fat: Number(fullRecipe.fat) || 0,
              },
              image: fullRecipe.image || fullRecipe.images?.[0] || '',
              video: fullRecipe.video,
              equipment: fullRecipe.equipment || [],
              storage: fullRecipe.storage,
              tags: fullRecipe.tags || [],
              dietaryRestrictions: fullRecipe.dietaryRestrictions || [],
              allergens: fullRecipe.allergens || []
            }
          };
        }
        return item;
      }) || []
    }));
  } catch (error) {
    console.error('Error fetching recipe details:', error);
    return meals; // Return original meals if error
  }
}
