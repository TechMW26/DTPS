/**
 * Utility functions to normalize and sanitize AI-generated recipe data
 * before saving to MongoDB or rendering in components.
 * 
 * Handles common issues:
 * 1. Non-array dietaryRestrictions (string like "Vegetarian, Gluten-Free")
 * 2. Invalid portion sizes (empty, negative, or non-numeric)
 * 3. Double-encoded _id fields ("\"65f8abc123\"" instead of "65f8abc123")
 * 4. Missing or malformed nutrition values
 */

/**
 * Normalize a value that should be an array but might be a string or undefined.
 * Handles comma-separated strings like "Vegetarian, Gluten-Free"
 */
export function normalizeToArray(value: unknown, validValues?: string[]): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    const result = value
      .map(v => typeof v === 'string' ? v.trim() : String(v).trim())
      .filter(Boolean);
    return validValues
      ? result.filter(v => validValues.includes(v))
      : result;
  }

  if (typeof value === 'string') {
    const result = value
      .split(/[,;]+/)
      .map(s => s.trim())
      .filter(Boolean);
    return validValues
      ? result.filter(v => validValues.includes(v))
      : result;
  }

  return [];
}

/**
 * Clean double-encoded strings (e.g., "\"value\"" -> "value")
 */
export function cleanDoubleEncodedString(value: unknown): string {
  if (!value) return '';

  let str = String(value);

  // Remove surrounding quotes if double-encoded
  // Handle cases like: "\"65f8abc123\"" or "\"some text\""
  while (str.startsWith('"') && str.endsWith('"') && str.length > 2) {
    str = str.slice(1, -1);
  }

  // Also handle escaped quotes within
  str = str.replace(/\\"/g, '"');

  return str.trim();
}

/**
 * Normalize MongoDB ObjectId - clean double-encoded IDs
 */
export function normalizeObjectId(value: unknown): string | null {
  if (!value) return null;

  const cleaned = cleanDoubleEncodedString(value);

  // Validate it looks like a MongoDB ObjectId (24 hex characters)
  if (/^[a-f0-9]{24}$/i.test(cleaned)) {
    return cleaned;
  }

  return null;
}

/**
 * Normalize portion size / servings value
 * Ensures it's a valid positive number or meaningful string
 */
export function normalizeServings(value: unknown): number | string {
  if (!value) return 1;

  // If it's already a valid positive number
  if (typeof value === 'number') {
    return value > 0 ? value : 1;
  }

  const str = cleanDoubleEncodedString(value);

  // Empty or whitespace only
  if (!str || !str.trim()) return 1;

  // Try to extract numeric value
  const numMatch = str.match(/^[\s]*([0-9]+(?:\.[0-9]+)?(?:\/[0-9]+)?)/);
  if (numMatch && numMatch[1]) {
    const numStr = numMatch[1];

    // Handle fractions like "1/2"
    if (numStr.includes('/')) {
      const [numerator, denominator] = numStr.split('/').map(Number);
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        const result = numerator / denominator;
        return result > 0 ? result : 1;
      }
    }

    const parsed = parseFloat(numStr);
    if (!isNaN(parsed) && parsed > 0) {
      // If the string has more than just a number, keep the full string for display
      if (str.trim() !== numStr) {
        return str.trim();
      }
      return parsed;
    }
  }

  // Return as string if it's a meaningful portion description
  if (str.length > 0 && str.length < 100) {
    return str;
  }

  return 1;
}

/**
 * Normalize a nutrition value to a non-negative number
 */
export function normalizeNutritionValue(value: unknown, defaultValue = 0): number {
  if (value === null || value === undefined) return defaultValue;

  if (typeof value === 'number') {
    return Math.max(0, isNaN(value) ? defaultValue : value);
  }

  const str = cleanDoubleEncodedString(value);
  const parsed = parseFloat(str);

  return Math.max(0, isNaN(parsed) ? defaultValue : parsed);
}

/**
 * Valid dietary restrictions for recipes
 */
export const VALID_DIETARY_RESTRICTIONS = [
  'Vegetarian', 'Vegan', 'Gluten-Free', 'Non-Vegetarian', 'Dairy-Free',
  'Keto', 'Low-Carb', 'Low-Fat', 'High-Protein', 'Paleo', 'Mediterranean',
  'Nut-Free', 'Egg-Free', 'Soy-Free', 'Sugar-Free', 'Low-Sodium'
];

/**
 * Valid medical contraindications for recipes
 */
export const VALID_MEDICAL_CONTRAINDICATIONS = [
  'Diabetes', 'High Blood Pressure', 'Heart Disease', 'Kidney Disease',
  'Liver Disease', 'High Cholesterol', 'Thyroid Disorders', 'Gout',
  'Acid Reflux/GERD', 'IBS (Irritable Bowel Syndrome)', 'Celiac Disease',
  'Lactose Intolerance', 'Gallbladder Disease', 'Osteoporosis', 'Anemia',
  'Food Allergies', 'Pregnancy', 'Breastfeeding'
];

/**
 * Comprehensive recipe data normalization
 * Call this before saving AI-generated recipes to MongoDB
 */
export function normalizeRecipeData(data: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...data };

  // Normalize _id if present
  if (data._id) {
    const cleanId = normalizeObjectId(data._id);
    if (cleanId) {
      normalized._id = cleanId;
    } else {
      delete normalized._id; // Let MongoDB generate a new one
    }
  }

  // Normalize string fields that might be double-encoded
  const stringFields = ['name', 'description', 'cuisine', 'difficulty', 'image'];
  for (const field of stringFields) {
    if (data[field]) {
      normalized[field] = cleanDoubleEncodedString(data[field]);
    }
  }

  // Normalize array fields
  normalized.dietaryRestrictions = normalizeToArray(
    data.dietaryRestrictions,
    VALID_DIETARY_RESTRICTIONS
  );

  normalized.medicalContraindications = normalizeToArray(
    data.medicalContraindications,
    VALID_MEDICAL_CONTRAINDICATIONS
  );

  normalized.allergens = normalizeToArray(data.allergens);
  normalized.tags = normalizeToArray(data.tags);

  // Normalize instructions array
  if (data.instructions) {
    normalized.instructions = normalizeToArray(data.instructions)
      .map(s => cleanDoubleEncodedString(s))
      .filter(s => s.length > 0);
  }

  // Normalize servings/portion
  if (data.servings !== undefined) {
    normalized.servings = normalizeServings(data.servings);
  }
  if (data.servingSize !== undefined) {
    const servingSize = cleanDoubleEncodedString(data.servingSize);
    normalized.servingSize = servingSize || undefined;
  }
  if (data.portionSize !== undefined) {
    const portionSize = cleanDoubleEncodedString(data.portionSize);
    normalized.portionSize = portionSize || undefined;
  }

  // Normalize nutrition values
  if (data.nutrition && typeof data.nutrition === 'object') {
    const nutrition = data.nutrition as Record<string, unknown>;
    normalized.nutrition = {
      calories: normalizeNutritionValue(nutrition.calories),
      protein: normalizeNutritionValue(nutrition.protein),
      carbs: normalizeNutritionValue(nutrition.carbs),
      fat: normalizeNutritionValue(nutrition.fat),
      sugar: normalizeNutritionValue(nutrition.sugar),
      sodium: normalizeNutritionValue(nutrition.sodium),
    };
  }

  // Normalize flat nutrition values (legacy format)
  normalized.calories = normalizeNutritionValue(data.calories);
  normalized.protein = normalizeNutritionValue(data.protein);
  normalized.carbs = normalizeNutritionValue(data.carbs);
  normalized.fat = normalizeNutritionValue(data.fat);

  // Normalize time values
  normalized.prepTime = normalizeNutritionValue(data.prepTime);
  normalized.cookTime = normalizeNutritionValue(data.cookTime);

  // Normalize ingredients
  if (Array.isArray(data.ingredients)) {
    normalized.ingredients = data.ingredients
      .filter((ing: unknown) => ing && typeof ing === 'object')
      .map((ing: Record<string, unknown>) => ({
        name: cleanDoubleEncodedString(ing.name || ''),
        quantity: normalizeNutritionValue(ing.quantity, 0),
        unit: cleanDoubleEncodedString(ing.unit || 'grams'),
        remarks: cleanDoubleEncodedString(ing.remarks || ''),
      }))
      .filter((ing: { name: string }) => ing.name.length > 0);
  }

  return normalized;
}

/**
 * Normalize recipe data for rendering (client-side safe)
 * Ensures all array fields are actually arrays
 */
export function normalizeRecipeForDisplay(recipe: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!recipe) return recipe;

  return {
    ...recipe,
    dietaryRestrictions: normalizeToArray(recipe.dietaryRestrictions),
    medicalContraindications: normalizeToArray(recipe.medicalContraindications),
    allergens: normalizeToArray(recipe.allergens),
    tags: normalizeToArray(recipe.tags),
    instructions: normalizeToArray(recipe.instructions),
  };
}
