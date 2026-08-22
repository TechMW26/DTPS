import { formatInTimeZone } from 'date-fns-tz';

export type NutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type LooseRecord = Record<string, any>;

const ZERO_NUTRITION: NutritionTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
};

const NUTRITION_TIMEZONE = process.env.MEAL_NOTIFICATION_TIMEZONE || 'Asia/Kolkata';

export function getNutritionDateKey(date: Date): string {
  return formatInTimeZone(date, NUTRITION_TIMEZONE, 'yyyy-MM-dd');
}

function numberValue(...values: unknown[]): number {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
}

export function roundNutrition(value: NutritionTotals): NutritionTotals {
  return {
    calories: Math.round(value.calories),
    protein: Math.round(value.protein),
    carbs: Math.round(value.carbs),
    fat: Math.round(value.fat),
  };
}

export function addNutrition(
  first: NutritionTotals,
  second: NutritionTotals,
): NutritionTotals {
  return {
    calories: first.calories + second.calories,
    protein: first.protein + second.protein,
    carbs: first.carbs + second.carbs,
    fat: first.fat + second.fat,
  };
}

function normalized(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[\s_-]+/g, '');
}

function dateKeyDayNumber(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function targetDateKey(date: Date | string): string {
  return typeof date === 'string' ? date.slice(0, 10) : getNutritionDateKey(date);
}

export function resolveMealPlanDay(
  plan: LooseRecord | null | undefined,
  date: Date | string,
): LooseRecord | null {
  const days = Array.isArray(plan?.meals) ? plan.meals : [];
  if (!days.length || !plan?.startDate) return null;

  const requestedKey = targetDateKey(date);
  const exactDay = days.find((day: LooseRecord) => {
    if (!day?.date) return false;
    return getNutritionDateKey(new Date(day.date)) === requestedKey;
  });
  if (exactDay) return exactDay;

  const startKey = getNutritionDateKey(new Date(plan.startDate));
  const dayIndex = dateKeyDayNumber(requestedKey) - dateKeyDayNumber(startKey);
  return dayIndex >= 0 && dayIndex < days.length ? days[dayIndex] : null;
}

function mealEntries(day: LooseRecord | null): Array<[string, LooseRecord]> {
  const meals = day?.meals || day;
  if (!meals) return [];

  if (Array.isArray(meals)) {
    return meals
      .filter((meal) => meal && typeof meal === 'object')
      .map((meal, index) => [
        String(meal.mealType || meal.type || meal.name || meal.id || index),
        meal,
      ]);
  }

  if (typeof meals !== 'object') return [];
  return Object.entries(meals).filter(([, meal]) =>
    Boolean(meal) && typeof meal === 'object' && !Array.isArray(meal),
  ) as Array<[string, LooseRecord]>;
}

function flattenFoods(meal: LooseRecord): LooseRecord[] {
  const foods = meal?.foods || meal?.items || meal?.foodOptions || [];
  if (!Array.isArray(foods)) return [];

  return foods.flatMap((food: LooseRecord) => {
    if (Array.isArray(food?.foods) && food.foods.length > 0) {
      return food.foods.map((nestedFood: LooseRecord) => ({
        ...nestedFood,
        isAlternative: Boolean(food.isAlternative || nestedFood.isAlternative),
      }));
    }
    return [food];
  }).filter(Boolean);
}

function foodNutrition(food: LooseRecord): NutritionTotals {
  return {
    calories: numberValue(food.calories, food.cal, food.nutrition?.calories),
    protein: numberValue(food.protein, food.nutrition?.protein),
    carbs: numberValue(food.carbs, food.nutrition?.carbs),
    fat: numberValue(food.fats, food.fat, food.nutrition?.fat),
  };
}

export function calculateMealNutrition(meal: LooseRecord): NutritionTotals {
  const foods = flattenFoods(meal);
  if (foods.length > 0) {
    const mainFoods = foods.filter((food) => !food?.isAlternative);
    // Legacy plans occasionally contain only alternative rows. In that case,
    // use the first available option rather than reporting a zero-value meal.
    const selectedFoods = mainFoods.length > 0 ? mainFoods : foods.slice(0, 1);
    const foodTotals = selectedFoods.reduce<NutritionTotals>(
      (sum, food) => addNutrition(sum, foodNutrition(food)),
      { ...ZERO_NUTRITION },
    );
    if (Object.values(foodTotals).some((value) => value > 0)) return foodTotals;
  }

  return {
    calories: numberValue(meal.totalCalories, meal.calories, meal.cal),
    protein: numberValue(meal.totalProtein, meal.protein),
    carbs: numberValue(meal.totalCarbs, meal.carbs),
    fat: numberValue(meal.totalFat, meal.fat, meal.fats),
  };
}

export function calculateDayNutrition(
  plan: LooseRecord | null | undefined,
  date: Date | string,
): NutritionTotals {
  return roundNutrition(
    mealEntries(resolveMealPlanDay(plan, date)).reduce(
      (sum, [, meal]) => addNutrition(sum, calculateMealNutrition(meal)),
      { ...ZERO_NUTRITION },
    ),
  );
}

function mealKeys(key: string, meal: LooseRecord): string[] {
  return [key, meal.mealType, meal.type, meal.name, meal.id, meal.label]
    .map(normalized)
    .filter(Boolean);
}

function findMealForCompletion(
  entries: Array<[string, LooseRecord]>,
  completion: LooseRecord,
): LooseRecord | null {
  const originalKey = normalized(completion.mealTypeOriginal);
  const canonicalKey = normalized(completion.mealType);
  const preferredKeys = originalKey ? [originalKey, canonicalKey] : [canonicalKey];

  for (const completionKey of preferredKeys.filter(Boolean)) {
    const match = entries.find(([key, meal]) => mealKeys(key, meal).includes(completionKey));
    if (match) return match[1];
  }
  return null;
}

export function calculateCompletedMealNutrition(
  plan: LooseRecord | null | undefined,
  date: Date | string,
): { nutrition: NutritionTotals; completedMeals: number; totalMeals: number } {
  const requestedKey = targetDateKey(date);
  const entries = mealEntries(resolveMealPlanDay(plan, requestedKey));
  const completions = Array.isArray(plan?.mealCompletions) ? plan.mealCompletions : [];
  const seenMeals = new Set<string>();
  let nutrition = { ...ZERO_NUTRITION };
  let completedMeals = 0;

  for (const completion of completions) {
    if (!completion?.completed || !completion?.date) continue;
    if (getNutritionDateKey(new Date(completion.date)) !== requestedKey) continue;

    const completionKey = normalized(completion.mealTypeOriginal || completion.mealType);
    if (!completionKey || seenMeals.has(completionKey)) continue;

    const snapshot = completion.nutrition
      ? roundNutrition(foodNutrition(completion.nutrition))
      : null;
    const hasSnapshot = Boolean(
      snapshot && Object.values(snapshot).some((value) => value > 0),
    );
    const meal = findMealForCompletion(entries, completion);
    if (!meal && !hasSnapshot) continue;

    seenMeals.add(completionKey);
    nutrition = addNutrition(
      nutrition,
      hasSnapshot ? snapshot! : calculateMealNutrition(meal!),
    );
    completedMeals += 1;
  }

  return {
    nutrition: roundNutrition(nutrition),
    completedMeals,
    totalMeals: entries.length,
  };
}

export function calculateFoodLogNutrition(foodLog: LooseRecord | null | undefined): NutritionTotals {
  if (!foodLog) return { ...ZERO_NUTRITION };
  if (foodLog.totalNutrition) {
    return roundNutrition(foodNutrition(foodLog.totalNutrition));
  }

  const entries = Array.isArray(foodLog.entries) ? foodLog.entries : [];
  if (entries.length > 0) {
    return roundNutrition(entries.reduce(
      (sum: NutritionTotals, entry: LooseRecord) => addNutrition(sum, foodNutrition(entry)),
      { ...ZERO_NUTRITION },
    ));
  }

  const foods = Array.isArray(foodLog.meals)
    ? foodLog.meals.flatMap((meal: LooseRecord) => Array.isArray(meal.foods) ? meal.foods : [])
    : [];
  return roundNutrition(foods.reduce(
    (sum: NutritionTotals, food: LooseRecord) => addNutrition(sum, foodNutrition(food)),
    { ...ZERO_NUTRITION },
  ));
}

export function resolveDailyNutritionGoal(
  plan: LooseRecord | null | undefined,
  date: Date | string,
  user?: LooseRecord | null,
): NutritionTotals {
  const assigned = calculateDayNutrition(plan, date);
  const customizations = plan?.customizations || {};
  const targetMacros = customizations.targetMacros || {};
  const profileGoals = user?.goals || user || {};
  const dailyGoals = user?.dailyGoals || {};

  return roundNutrition({
    calories: assigned.calories || numberValue(
      customizations.targetCalories,
      dailyGoals.calories,
      profileGoals.calories,
      profileGoals.targetCalories,
      2000,
    ),
    protein: assigned.protein || numberValue(
      targetMacros.protein,
      customizations.proteinGoal,
      profileGoals.protein,
      profileGoals.proteinGoal,
      120,
    ),
    carbs: assigned.carbs || numberValue(
      targetMacros.carbs,
      customizations.carbsGoal,
      profileGoals.carbs,
      profileGoals.carbsGoal,
      250,
    ),
    fat: assigned.fat || numberValue(
      targetMacros.fat,
      customizations.fatGoal,
      profileGoals.fat,
      profileGoals.fatGoal,
      65,
    ),
  });
}

export function buildDailyNutritionSummary(args: {
  plan?: LooseRecord | null;
  foodLog?: LooseRecord | null;
  user?: LooseRecord | null;
  date: Date | string;
}) {
  const completion = calculateCompletedMealNutrition(args.plan, args.date);
  const manuallyLogged = calculateFoodLogNutrition(args.foodLog);
  const consumed = roundNutrition(addNutrition(completion.nutrition, manuallyLogged));
  const goal = resolveDailyNutritionGoal(args.plan, args.date, args.user);

  return {
    date: targetDateKey(args.date),
    goal,
    consumed,
    remaining: {
      calories: Math.max(0, Math.round(goal.calories - consumed.calories)),
      protein: Math.max(0, Math.round(goal.protein - consumed.protein)),
      carbs: Math.max(0, Math.round(goal.carbs - consumed.carbs)),
      fat: Math.max(0, Math.round(goal.fat - consumed.fat)),
    },
    completedMeals: completion.completedMeals,
    totalMeals: completion.totalMeals,
  };
}
