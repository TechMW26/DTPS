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

/**
 * Food-name synonyms so equivalent ingredients share one canonical term.
 * Mirrors the pairs used by recipe de-duplication (yogurt/dahi → curd).
 */
export const RECIPE_FOOD_SYNONYMS: Record<string, string> = {
  yogurt: 'curd', yoghurt: 'curd', dahi: 'curd',
  aloo: 'potato', gobi: 'cauliflower', gobhi: 'cauliflower',
  palak: 'spinach', saag: 'spinach', chana: 'chickpea', chole: 'chickpea',
  rajma: 'kidney bean', bhindi: 'okra', baingan: 'eggplant', brinjal: 'eggplant',
  jeera: 'cumin', chawal: 'rice', chapati: 'roti', chapatti: 'roti',
  phulka: 'roti', fullka: 'roti', nan: 'naan', dhal: 'dal', daal: 'dal',
  lentil: 'dal', panir: 'paneer', makhan: 'butter', makhanwala: 'butter',
  makhani: 'butter', maida: 'flour', atta: 'flour',
};

/** Every stored spelling (lowercased) that canonicalizes to the same token (e.g. curd → curd, yogurt, yoghurt, dahi). */
export const RECIPE_FOOD_SYNONYM_FORMS: Record<string, string[]> = Object.entries(RECIPE_FOOD_SYNONYMS).reduce<Record<string, string[]>>((forms, [alias, canonical]) => {
  (forms[canonical] ||= []).push(alias);
  return forms;
}, {});

/** Canonical synonym form for a single food token (e.g. yogurt → curd). */
export function canonicalFoodToken(token: string): string {
  const low = String(token || '').trim().toLowerCase();
  return RECIPE_FOOD_SYNONYMS[low] || low;
}

/** All spellings a single token should match: itself plus synonyms when it canonicalizes to a known group (yogurt → curd, curd, yoghurt, dahi). */
export function foodTokenForms(token: string): string[] {
  const low = String(token || '').trim().toLowerCase();
  if (!low) return [];
  const canonical = canonicalFoodToken(low);
  return [...new Set([low, canonical, ...(RECIPE_FOOD_SYNONYM_FORMS[canonical] || [])])];
}

/**
 * Canonical synonym groups a multi-word search can expand to. A word like "yogurt"
 * expands to curd/yoghurt/dahi, so "yogurt smoothie" also finds "Curd Smoothie".
 * Multi-word groups ("kidney bean") expand as whole phrases, never word by word.
 */
function phraseForms(term: string): string[][] {
  return canonicalFoodText(term)
    .split(' ')
    .filter(Boolean)
    .map(token => RECIPE_FOOD_SYNONYM_FORMS[token]?.length ? [...new Set([token, ...RECIPE_FOOD_SYNONYM_FORMS[token]])] : [token]);
}

/**
 * Does the text contain the search term, honouring food synonyms in both
 * directions ("yogurt" matches "Ragi Curd Bowl" and "curd" matches "Ragi Yogurt Bowl")?
 * Words must match on token boundaries: "curd" must not match "Vegetable Oats Chilla".
 * Multi-word searches match in any order ("curd salad" finds "Curd & Cucumber Salad").
 */
export function matchesFoodSearch(text: string, search: string): boolean {
  const raw = String(text || '').toLowerCase();
  const term = String(search || '').trim().toLowerCase();
  if (!term) return true;
  if (raw.includes(term)) return true;
  const groups = phraseForms(term);
  if (!groups.length) return false;
  const tokens = canonicalFoodText(raw).split(' ').filter(Boolean);
  return groups.every(forms => forms.some(form => tokens.includes(form)));
}

/**
 * Canonicalize free text word-by-word so a search for a synonym matches the
 * stored spelling. Non-synonym words are preserved verbatim.
 */
export function canonicalFoodText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(canonicalFoodToken)
    .join(' ');
}

export interface RecipeSearchFields {
  name?: unknown;
  description?: unknown;
  tags?: unknown;
  ingredients?: unknown;
}

function ingredientNames(ingredients: unknown): string[] {
  return (Array.isArray(ingredients) ? ingredients : [])
    .map(item => String((item as { name?: unknown })?.name ?? item ?? ''))
    .filter(Boolean);
}

/**
 * Lower is more relevant. Ordering is exact name → name prefix → foods in the
 * name → synonym match → tag → ingredient → description. Alphabetical sorting is
 * deliberately the last tiebreaker so a real match never falls behind an unrelated
 * recipe, and generic one-word names ("Curd") never outrank named dishes.
 */
export function recipeSearchRelevance(recipe: RecipeSearchFields, search: string): number {
  const term = String(search || '').trim().toLowerCase();
  if (!term) return 0;
  const name = String(recipe.name || '').toLowerCase();
  const description = String(recipe.description || '').toLowerCase();
  const tags = normalizeToArray(recipe.tags).map(tag => tag.toLowerCase());
  const ingredients = ingredientNames(recipe.ingredients);
  const canonicalTerm = canonicalFoodText(term);
  const nameTokens = name.split(/[^a-z0-9]+/).filter(Boolean);
  const forms = foodTokenForms(term).filter(form => !form.includes(' '));

  // A bare ingredient name ("Curd") describes nothing, so any title that actually names a dish outranks it.
  const descriptive = nameTokens.length > term.split(/[^a-z0-9]+/).filter(Boolean).length;
  if (name === term) return descriptive ? 0 : 2;
  if (forms.some(form => nameTokens.includes(form))) return descriptive ? 1 : 2;
  if (name.startsWith(term)) return descriptive ? 1.5 : 2;
  if (canonicalTerm && canonicalFoodText(name).includes(canonicalTerm)) return 3;
  if (name.includes(term)) return 4;
  if (tags.some(tag => tag === term || matchesFoodSearch(tag, term))) return 5;
  if (ingredients.some(ingredient => ingredient.toLowerCase() === term)) return 6;
  if (ingredients.some(ingredient => matchesFoodSearch(ingredient, term))) return 7;
  if (description.includes(term)) return 8;
  if (canonicalTerm && canonicalFoodText(description).includes(canonicalTerm)) return 9;
  return 10;
}
