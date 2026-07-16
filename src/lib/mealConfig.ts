/**
 * GLOBAL MEAL CONFIGURATION
 * 
 * Single source of truth for all meal types and times in the application.
 * All times are in IST (Asia/Kolkata timezone).
 * 
 * IMPORTANT: This file is the ONLY place where meal types and times should be defined.
 * All other files must import from here.
 */

// ============================================================================
// TYPES
// ============================================================================

export type MealTypeKey =
  | 'EARLY_MORNING'
  | 'BREAKFAST'
  | 'MID_MORNING'
  | 'LUNCH'
  | 'MID_EVENING'
  | 'EVENING'
  | 'DINNER'
  | 'PAST_DINNER';

export interface MealTypeConfig {
  key: MealTypeKey;
  label: string;
  time24h: string;      // 24-hour format for logic (HH:MM)
  time12h: string;      // 12-hour format for display (hh:MM AM/PM)
  sortOrder: number;    // For chronological ordering
  timeMinutes: number;  // Minutes since midnight for calculations
}

// ============================================================================
// CANONICAL MEAL CONFIGURATION
// ============================================================================

/**
 * The canonical meal types with their exact IST times.
 * This is the SINGLE SOURCE OF TRUTH for the entire application.
 */
export const MEAL_TYPES: Record<MealTypeKey, MealTypeConfig> = {
  EARLY_MORNING: {
    key: 'EARLY_MORNING',
    label: 'Early Morning',
    time24h: '06:00',
    time12h: '06:00 AM',
    sortOrder: 1,
    timeMinutes: 360, // 6 * 60
  },
  BREAKFAST: {
    key: 'BREAKFAST',
    label: 'Breakfast',
    time24h: '09:00',
    time12h: '09:00 AM',
    sortOrder: 2,
    timeMinutes: 540, // 9 * 60
  },
  MID_MORNING: {
    key: 'MID_MORNING',
    label: 'Mid Morning',
    time24h: '11:00',
    time12h: '11:00 AM',
    sortOrder: 3,
    timeMinutes: 660, // 11 * 60
  },
  LUNCH: {
    key: 'LUNCH',
    label: 'Lunch',
    time24h: '13:00',
    time12h: '01:00 PM',
    sortOrder: 4,
    timeMinutes: 780, // 13 * 60
  },
  MID_EVENING: {
    key: 'MID_EVENING',
    label: 'Mid Evening',
    time24h: '16:00',
    time12h: '04:00 PM',
    sortOrder: 5,
    timeMinutes: 960, // 16 * 60
  },
  EVENING: {
    key: 'EVENING',
    label: 'Evening',
    time24h: '18:00',
    time12h: '06:00 PM',
    sortOrder: 6,
    timeMinutes: 1080, // 18 * 60
  },
  DINNER: {
    key: 'DINNER',
    label: 'Dinner',
    time24h: '19:00',
    time12h: '07:00 PM',
    sortOrder: 7,
    timeMinutes: 1140, // 19 * 60
  },
  PAST_DINNER: {
    key: 'PAST_DINNER',
    label: 'Post Dinner',
    time24h: '21:00',
    time12h: '09:00 PM',
    sortOrder: 8,
    timeMinutes: 1260, // 21 * 60
  },
} as const;


// ============================================================================
// ARRAYS FOR ITERATION & VALIDATION
// ============================================================================
/**
 * All meal type keys in chronological order
 */
export const MEAL_TYPE_KEYS: MealTypeKey[] = [
  'EARLY_MORNING',
  'BREAKFAST',
  'MID_MORNING',
  'LUNCH',
  'MID_EVENING',
  'EVENING',
  'DINNER',
  'PAST_DINNER',
];

/**
 * All meal configs sorted by time (chronological order)
 */
export const MEAL_TYPES_SORTED: MealTypeConfig[] = MEAL_TYPE_KEYS.map(key => MEAL_TYPES[key]);

/**
 * Meal type values for MongoDB enum validation
 */
export const MEAL_TYPE_ENUM_VALUES: string[] = MEAL_TYPE_KEYS as string[];

// ============================================================================
// DROPDOWN OPTIONS (for UI)
// ============================================================================

/**
 * Options for select/dropdown components
 */
export const MEAL_TYPE_OPTIONS: { value: MealTypeKey; label: string; time: string }[] =
  MEAL_TYPES_SORTED.map(meal => ({
    value: meal.key,
    label: meal.label,
    time: meal.time12h,
  }));

// ============================================================================
// DIETARY RESTRICTIONS
// ============================================================================

/**
 * Canonical list of dietary restrictions
 * This is the SINGLE SOURCE OF TRUTH for dietary restrictions across the application
 */
export const DIETARY_RESTRICTIONS = [
  'Vegetarian',
  'Vegan',
  'Eggitarian',
  'Gluten-Free',
  'Non-Vegetarian',
  'Dairy-Free',
  'Egg-Free',
  'Nut-Free',
  'Soy-Free',
  'Keto',
  'Low-Carb',
  'Low-Fat',
  'High-Protein',
  'Paleo',
  'Mediterranean',
  'Diabetic Friendly',
  'Jain',
  'Halal',
  'Kosher'
] as const;

/**
 * Options with time in label (e.g., "Breakfast (09:00 AM)")
 */
export const MEAL_TYPE_OPTIONS_WITH_TIME: { value: MealTypeKey; label: string }[] =
  MEAL_TYPES_SORTED.map(meal => ({
    value: meal.key,
    label: `${meal.label} (${meal.time12h})`,
  }));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a string is a valid meal type key
 */
export function isValidMealType(value: string | undefined | null): value is MealTypeKey {
  if (!value) return false;
  return MEAL_TYPE_KEYS.includes(value.toUpperCase() as MealTypeKey);
}

/**
 * Get meal config by key (case-insensitive)
 */
export function getMealConfig(key: string | undefined | null): MealTypeConfig | null {
  if (!key) return null;
  const normalizedKey = key.toUpperCase() as MealTypeKey;
  return MEAL_TYPES[normalizedKey] || null;
}

/**
 * Get meal display label
 */
export function getMealLabel(key: string | undefined | null): string {
  const config = getMealConfig(key);
  return config?.label || key || 'Unknown';
}

/**
 * Get meal time in 12-hour format
 */
export function getMealTime12h(key: string | undefined | null): string {
  const config = getMealConfig(key);
  return config?.time12h || '';
}

/**
 * Get meal time in 24-hour format
 */
export function getMealTime24h(key: string | undefined | null): string {
  const config = getMealConfig(key);
  return config?.time24h || '';
}

/**
 * Get default time for a meal type (returns 24h format for storage)
 */
export function getDefaultMealTime(key: string): string {
  const config = getMealConfig(key);
  return config?.time24h || '12:00';
}

/**
 * Sort meal items by their canonical order
 */
export function sortMealsByType<T extends { mealType: string }>(meals: T[]): T[] {
  return [...meals].sort((a, b) => {
    const configA = getMealConfig(a.mealType);
    const configB = getMealConfig(b.mealType);
    return (configA?.sortOrder ?? 99) - (configB?.sortOrder ?? 99);
  });
}

/**
 * Normalize meal type to canonical key
 * Maps common variations to the correct key
 */
export function normalizeMealType(input: string | undefined | null): MealTypeKey | null {
  if (!input) return null;

  const normalized = input.toUpperCase().trim().replace(/[\s_-]+/g, '_');

  // Direct match
  if (MEAL_TYPE_KEYS.includes(normalized as MealTypeKey)) {
    return normalized as MealTypeKey;
  }

  // Map common variations
  const mappings: Record<string, MealTypeKey> = {
    // Early Morning variations
    'EARLYMORNING': 'EARLY_MORNING',
    'EARLY': 'EARLY_MORNING',
    'WAKE_UP': 'EARLY_MORNING',
    'WAKEUP': 'EARLY_MORNING',
    'PRE_BREAKFAST': 'EARLY_MORNING',
    'PREBREAKFAST': 'EARLY_MORNING',

    // Breakfast variations
    'BF': 'BREAKFAST',
    'BFAST': 'BREAKFAST',
    'MORNING': 'BREAKFAST',

    // Mid Morning variations
    'MIDMORNING': 'MID_MORNING',
    'MID_DAY': 'MID_MORNING',
    'MIDDAY': 'MID_MORNING',
    'BRUNCH': 'MID_MORNING',
    'SNACK_1': 'MID_MORNING',
    'SNACK1': 'MID_MORNING',
    'MORNING_SNACK': 'MID_MORNING',

    // Lunch variations
    'NOON': 'LUNCH',
    'AFTERNOON': 'LUNCH',

    // Mid Evening variations (Snack)
    'MIDEVENING': 'MID_EVENING',
    'SNACK': 'MID_EVENING',
    'SNACK_2': 'MID_EVENING',
    'SNACK2': 'MID_EVENING',
    'AFTERNOON_SNACK': 'MID_EVENING',
    'TEA_TIME': 'MID_EVENING',
    'TEATIME': 'MID_EVENING',
    'TEA': 'MID_EVENING',

    // Evening variations
    'EVE': 'EVENING',
    'EVENING_SNACK': 'EVENING',

    // Dinner variations
    'SUPPER': 'DINNER',
    'NIGHT': 'DINNER',

    // Post Dinner / Bedtime variations
    'PASTDINNER': 'PAST_DINNER',
    'PAST_DINNER_LABEL': 'PAST_DINNER',
    'POST_DINNER': 'PAST_DINNER',
    'POSTDINNER': 'PAST_DINNER',
    'BEDTIME': 'PAST_DINNER',
    'BED_TIME': 'PAST_DINNER',
    'LATE_NIGHT': 'PAST_DINNER',
    'LATENIGHT': 'PAST_DINNER',
    'BEFORE_BED': 'PAST_DINNER',
    'BEFOREBED': 'PAST_DINNER',
  };

  return mappings[normalized] || null;
}

/**
 * Validate and normalize a meal type, returning the canonical key or throwing an error
 */
export function validateMealType(input: string | undefined | null): MealTypeKey {
  const normalized = normalizeMealType(input);
  if (!normalized) {
    throw new Error(`Invalid meal type: "${input}". Valid types are: ${MEAL_TYPE_KEYS.join(', ')}`);
  }
  return normalized;
}

/**
 * Safely validate meal type, returning null instead of throwing
 */
export function validateMealTypeSafe(input: string | undefined | null): MealTypeKey | null {
  try {
    return validateMealType(input);
  } catch {
    return null;
  }
}

// ============================================================================
// TIME UTILITIES
// ============================================================================

/**
 * Convert 24h time string to minutes since midnight
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

/**
 * Convert minutes since midnight to 24h time string
 */
export function minutesToTime24h(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Convert 24h time to 12h format with AM/PM
 */
export function time24hTo12h(time24h: string): string {
  const [hours, minutes] = time24h.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Convert 12h time to 24h format
 */
export function time12hTo24h(time12h: string): string {
  const match = time12h.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return time12h;

  let [, hours, minutes, period] = match;
  let hour = parseInt(hours);

  if (period.toUpperCase() === 'PM' && hour !== 12) {
    hour += 12;
  } else if (period.toUpperCase() === 'AM' && hour === 12) {
    hour = 0;
  }

  return `${hour.toString().padStart(2, '0')}:${minutes}`;
}

/**
 * Find the closest meal type based on a given time
 */
export function findClosestMealType(time24h: string): MealTypeKey {
  const inputMinutes = timeToMinutes(time24h);

  let closest: MealTypeKey = 'BREAKFAST';
  let minDiff = Infinity;

  for (const meal of MEAL_TYPES_SORTED) {
    const diff = Math.abs(meal.timeMinutes - inputMinutes);
    if (diff < minDiff) {
      minDiff = diff;
      closest = meal.key;
    }
  }

  return closest;
}

// ============================================================================
// DEFAULT MEAL TYPE ARRAYS (for UI state initialization)
// ============================================================================

/**
 * Returns the canonical 8 meal types as { name, time } array.
 * Use this everywhere you need default meal types for state initialization.
 * name = display label, time = 12h IST time.
 */
export function getDefaultMealTypesList(): { name: string; time: string }[] {
  return MEAL_TYPE_KEYS.map(key => ({
    name: MEAL_TYPES[key].label,
    time: MEAL_TYPES[key].time12h,
  }));
}

/**
 * Default meal types constant (frozen array, safe for static use).
 */
export const DEFAULT_MEAL_TYPES_LIST: { name: string; time: string }[] = getDefaultMealTypesList();

// ============================================================================
// MONGOOSE SCHEMA HELPERS
// ============================================================================

/**
 * Mongoose schema definition for mealType field
 */
export const mealTypeSchemaDefinition = {
  type: String,
  enum: MEAL_TYPE_ENUM_VALUES,
  required: true,
  uppercase: true,
  set: (val: string) => normalizeMealType(val) || val?.toUpperCase(),
};

/**
 * Mongoose schema definition for mealTime field (stores 24h format)
 */
export const mealTimeSchemaDefinition = {
  type: String,
  default: function (this: { mealType?: string }) {
    return getDefaultMealTime(this.mealType || 'BREAKFAST');
  },
  validate: {
    validator: function (v: string) {
      return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
    },
    message: 'Time must be in HH:MM format (24-hour)',
  },
};

// ============================================================================
// DEFAULT EXPORTS
// ============================================================================

export default {
  MEAL_TYPES,
  MEAL_TYPE_KEYS,
  MEAL_TYPES_SORTED,
  MEAL_TYPE_ENUM_VALUES,
  DEFAULT_MEAL_TYPES_LIST,
  getDefaultMealTypesList,
  MEAL_TYPE_OPTIONS,
  MEAL_TYPE_OPTIONS_WITH_TIME,
  isValidMealType,
  getMealConfig,
  getMealLabel,
  getMealTime12h,
  getMealTime24h,
  getDefaultMealTime,
  sortMealsByType,
  normalizeMealType,
  validateMealType,
  validateMealTypeSafe,
  findClosestMealType,
};
