import Recipe from '@/lib/db/models/Recipe';

/**
 * Recipe Deduplication Utility
 *
 * Provides broad-match duplicate detection that considers both recipe names
 * AND ingredients so genuinely different dishes (e.g. "Chicken Biryani" vs
 * "Mutton Biryani") are kept separate while true duplicates (e.g. "Paneer
 * Butter Masala" vs "Butter Paneer Masala" vs "Paneer Makhani") are caught.
 */

// ──────────────────────────────────────────────
// Name normalisation
// ──────────────────────────────────────────────

/** Filler words that don't contribute to recipe identity */
const FILLER_WORDS = new Set([
  'recipe', 'style', 'homemade', 'home', 'made', 'special', 'classic',
  'traditional', 'authentic', 'easy', 'quick', 'simple', 'best',
  'delicious', 'tasty', 'yummy', 'healthy', 'indian', 'desi',
  'restaurant', 'hotel', 'dhaba', 'street', 'south', 'north',
  'the', 'a', 'an', 'and', 'or', 'with', 'without', 'in', 'on', 'of',
  'ki', 'ka', 'ke', 'wala', 'wali', 'wale', 'type',
]);

/** Common synonym pairs (order-independent) */
const SYNONYMS: Record<string, string> = {
  makhani: 'butter',
  makhanwala: 'butter',
  aloo: 'potato',
  gobi: 'cauliflower',
  palak: 'spinach',
  saag: 'spinach',
  chana: 'chickpea',
  chole: 'chickpea',
  rajma: 'kidney bean',
  bhindi: 'okra',
  baingan: 'eggplant',
  brinjal: 'eggplant',
  jeera: 'cumin',
  dahi: 'curd',
  yogurt: 'curd',
  yoghurt: 'curd',
  chawal: 'rice',
  chapati: 'roti',
  chapatti: 'roti',
  phulka: 'roti',
  fullka: 'roti',
  naan: 'naan',
  nan: 'naan',
  dal: 'dal',
  dhal: 'dal',
  daal: 'dal',
  lentil: 'dal',
  panir: 'paneer',
  keema: 'mince',
  qeema: 'mince',
  gobhi: 'cauliflower',
  shimla: 'capsicum',
  capsicum: 'capsicum',
  bell: 'capsicum',
  methi: 'fenugreek',
  lassi: 'lassi',
  raita: 'raita',
};

/**
 * Normalise a recipe name into a sorted set of canonical tokens.
 *
 *   "Paneer Butter Masala (Restaurant Style)" →  ["butter", "masala", "paneer"]
 *   "Makhani Paneer"                          →  ["butter", "paneer"]
 */
export function normalizeRecipeName(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')          // remove parenthesised content
    .replace(/[^a-z0-9\s]/g, ' ')     // remove special chars
    .trim();

  const tokens = cleaned.split(/\s+/).filter(Boolean);

  const canonical = tokens
    .filter((t) => !FILLER_WORDS.has(t))
    .map((t) => SYNONYMS[t] || t);

  // dedupe & sort for order-independent comparison
  return [...new Set(canonical)].sort();
}

/**
 * Jaccard-style overlap ratio between two token arrays.
 * Returns a value 0–1.
 */
export function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// ──────────────────────────────────────────────
// Ingredient comparison
// ──────────────────────────────────────────────

/** Protein / main-ingredient keywords that differentiate dishes */
const PRIMARY_INGREDIENT_KEYWORDS = new Set([
  'chicken', 'mutton', 'lamb', 'fish', 'prawn', 'shrimp', 'egg',
  'paneer', 'tofu', 'soya', 'mushroom', 'potato', 'cauliflower',
  'spinach', 'dal', 'chickpea', 'kidney bean', 'eggplant', 'okra',
  'rice', 'roti', 'naan', 'bread',
]);

/**
 * Extract the set of primary ingredient names from an ingredient array.
 */
function extractPrimaryIngredients(ingredients: { name: string }[]): Set<string> {
  const result = new Set<string>();
  for (const ing of ingredients) {
    const low = ing.name.toLowerCase().trim();
    const normalised = SYNONYMS[low] || low;
    // Check if any primary keyword appears in the name
    for (const keyword of PRIMARY_INGREDIENT_KEYWORDS) {
      if (normalised.includes(keyword) || low.includes(keyword)) {
        result.add(keyword);
      }
    }
  }
  return result;
}

/**
 * Compare two ingredient lists.
 * Returns { similar: boolean, overlap: number, primaryMatch: boolean }
 *
 *  - `overlap`  : Jaccard of all ingredient names (0–1)
 *  - `primaryMatch` : true when primary proteins / main ingredients overlap
 *  - `similar`  : true when the recipes are "the same dish"
 */
export function compareIngredients(
  a: { name: string }[],
  b: { name: string }[],
): { similar: boolean; overlap: number; primaryMatch: boolean } {
  if (a.length === 0 || b.length === 0) {
    // Blank records are invalid recipes, not evidence that two dishes are
    // duplicates. Publication validation handles them separately.
    return { similar: false, overlap: 0, primaryMatch: false };
  }

  const namesA = a.map((i) => (SYNONYMS[i.name.toLowerCase().trim()] || i.name.toLowerCase().trim()));
  const namesB = b.map((i) => (SYNONYMS[i.name.toLowerCase().trim()] || i.name.toLowerCase().trim()));

  const setA = new Set(namesA);
  const setB = new Set(namesB);
  let intersection = 0;
  for (const n of setA) if (setB.has(n)) intersection++;
  const union = new Set([...namesA, ...namesB]).size;
  const overlap = union === 0 ? 0 : intersection / union;

  const primaryA = extractPrimaryIngredients(a);
  const primaryB = extractPrimaryIngredients(b);

  let primaryOverlap = 0;
  for (const p of primaryA) if (primaryB.has(p)) primaryOverlap++;
  const primaryUnion = new Set([...primaryA, ...primaryB]).size;
  const primaryMatch = primaryUnion === 0 || primaryOverlap / primaryUnion >= 0.5;

  // Consider similar if ingredient overlap >= 50% AND primary ingredients match
  const similar = overlap >= 0.4 && primaryMatch;

  return { similar, overlap, primaryMatch };
}

// ──────────────────────────────────────────────
// DB queries
// ──────────────────────────────────────────────

/**
 * Find existing recipes whose names broadly match the given name.
 * Returns the matched documents (lean).
 */
export async function findSimilarRecipes(
  recipeName: string,
  limit = 5,
): Promise<any[]> {
  const tokens = normalizeRecipeName(recipeName);
  if (tokens.length === 0) return [];

  // Build a regex that matches names containing ALL significant tokens (in any order)
  // For very short names (1 token), require that token + be lenient
  const regexParts = tokens.map((t) => `(?=.*\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`);
  // Require at least ceil(tokens.length * 0.6) tokens to match
  const minTokens = Math.max(1, Math.ceil(tokens.length * 0.6));

  // Strategy: search with ALL tokens first; if nothing, loosen to subset
  let results: any[] = [];
  try {
    const allPattern = new RegExp(regexParts.join(''), 'i');
    results = await Recipe.find({ mergedInto: null, name: { $regex: allPattern } })
      .select('name ingredients calories protein carbs fat')
      .limit(limit)
      .lean();
  } catch {
    // regex may fail on edge-case chars
  }

  if (results.length === 0 && tokens.length >= 2) {
    // Try with subset combinations: pick minTokens-length subsets
    for (let size = tokens.length - 1; size >= minTokens; size--) {
      const subsetParts = regexParts.slice(0, size);
      try {
        const subsetPattern = new RegExp(subsetParts.join(''), 'i');
        results = await Recipe.find({ mergedInto: null, name: { $regex: subsetPattern } })
          .select('name ingredients calories protein carbs fat')
          .limit(limit)
          .lean();
        if (results.length > 0) break;
      } catch {
        continue;
      }
    }
  }

  return results;
}

/**
 * Batch pre-check: given an array of recipe names, return a Map of 
 * name → existingRecipeName for those that already exist or have a 
 * broad match in the DB.
 *
 * This does ONE aggregated DB query instead of N individual ones.
 * Used by bulk import to skip duplicates before calling AI.
 */
export async function batchFindDuplicates(
  names: string[],
): Promise<Map<string, { existingName: string; existingId: string }>> {
  const duplicates = new Map<string, { existingName: string; existingId: string }>();
  if (names.length === 0) return duplicates;

  // 1. Collect all normalised tokens across all input names
  const inputTokenSets = names.map((n) => ({
    original: n,
    tokens: normalizeRecipeName(n),
  }));

  // 2. Build one big regex that matches any of the significant tokens
  const allTokens = new Set<string>();
  for (const { tokens } of inputTokenSets) {
    for (const t of tokens) allTokens.add(t);
  }
  if (allTokens.size === 0) return duplicates;

  // Regex: name contains at least one of these tokens
  const escapedTokens = [...allTokens].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const broadPattern = new RegExp(`\\b(${escapedTokens.join('|')})\\b`, 'i');

  // 3. One DB call: find all recipes whose name contains any relevant token
  let candidates: any[];
  try {
    candidates = await Recipe.find({ mergedInto: null, name: { $regex: broadPattern } })
      .select('name ingredients')
      .limit(2000) // safety cap
      .lean();
  } catch {
    candidates = [];
  }

  if (candidates.length === 0) return duplicates;

  // 4. Pre-normalise candidate names
  const candidateNormalisedMap = candidates.map((c: any) => ({
    id: c._id.toString(),
    name: c.name,
    tokens: normalizeRecipeName(c.name),
    ingredients: c.ingredients || [],
  }));

  // 5. For each input name, check against candidates
  for (const { original, tokens: inputTokens } of inputTokenSets) {
    if (inputTokens.length === 0) continue;

    for (const candidate of candidateNormalisedMap) {
      const overlap = tokenOverlap(inputTokens, candidate.tokens);

      // High name overlap ≥ 0.6 → potential duplicate
      if (overlap >= 0.6) {
        // No ingredients to compare at this stage (pre-AI-generation),
        // so we rely on name similarity alone.
        // BUT we check that the primary ingredient tokens in the NAME 
        // itself are compatible (to avoid merging "Chicken Biryani" with "Mutton Biryani")
        const inputNameIngredients = inputTokens
          .filter((t) => PRIMARY_INGREDIENT_KEYWORDS.has(t));
        const candidateNameIngredients = candidate.tokens
          .filter((t) => PRIMARY_INGREDIENT_KEYWORDS.has(t));

        // If both have primary keywords but they differ → NOT a duplicate
        if (
          inputNameIngredients.length > 0 &&
          candidateNameIngredients.length > 0
        ) {
          const sharedPrimary = inputNameIngredients.filter((t) =>
            candidateNameIngredients.includes(t),
          );
          if (sharedPrimary.length === 0) continue; // different primary ingredient
        }

        duplicates.set(original, {
          existingName: candidate.name,
          existingId: candidate.id,
        });
        break; // first match wins
      }
    }
  }

  return duplicates;
}

// ──────────────────────────────────────────────
// Merge
// ──────────────────────────────────────────────

/**
 * Merge new AI-generated data into an existing recipe document.
 * Strategy: fill missing / empty fields from new data, keep existing values.
 * Ingredients are union-merged by name.
 */
export async function mergeRecipeData(
  existingId: string,
  newData: {
    description?: string;
    prepTime?: number;
    cookTime?: number;
    servings?: number;
    servingSize?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    ingredients?: { name: string; quantity: number; unit: string; remarks?: string }[];
    instructions?: string[];
    dietaryRestrictions?: string[];
    medicalContraindications?: string[];
  },
): Promise<any> {
  const existing = await Recipe.findById(existingId);
  if (!existing) return null;

  // Fill empty text fields
  if (!existing.description && newData.description) existing.description = newData.description;

  // Fill zero numeric fields
  if (!existing.prepTime && newData.prepTime) existing.prepTime = newData.prepTime;
  if (!existing.cookTime && newData.cookTime) existing.cookTime = newData.cookTime;
  if (!existing.calories && newData.calories) existing.calories = newData.calories;
  if (!existing.protein && newData.protein) existing.protein = newData.protein;
  if (!existing.carbs && newData.carbs) existing.carbs = newData.carbs;
  if (!existing.fat && newData.fat) existing.fat = newData.fat;

  // Merge ingredients: union by normalised name
  if (newData.ingredients && newData.ingredients.length > 0) {
    const existingNames = new Set(
      existing.ingredients.map((i: any) => i.name.toLowerCase().trim()),
    );
    for (const newIng of newData.ingredients) {
      if (!existingNames.has(newIng.name.toLowerCase().trim())) {
        existing.ingredients.push(newIng);
      }
    }
  }

  // Fill empty instructions
  if ((!existing.instructions || existing.instructions.length === 0) && newData.instructions) {
    existing.instructions = newData.instructions;
  }

  // Union dietary restrictions
  if (newData.dietaryRestrictions) {
    const existing_set = new Set(existing.dietaryRestrictions || []);
    for (const r of newData.dietaryRestrictions) existing_set.add(r);
    existing.dietaryRestrictions = [...existing_set];
  }

  // Union medical contraindications
  if (newData.medicalContraindications) {
    const existing_set = new Set(existing.medicalContraindications || []);
    for (const c of newData.medicalContraindications) existing_set.add(c);
    existing.medicalContraindications = [...existing_set];
  }

  await existing.save();
  return existing;
}
