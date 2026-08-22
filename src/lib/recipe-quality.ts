export type RecipeIngredientLike = {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  remarks?: unknown;
};

export type RecipeQualityInput = {
  name?: unknown;
  description?: unknown;
  ingredients?: unknown;
  instructions?: unknown;
  tags?: unknown;
  dietTypes?: unknown;
  dietaryRestrictions?: unknown;
  allergens?: unknown;
  medicalContraindications?: unknown;
  calories?: unknown;
  protein?: unknown;
  carbs?: unknown;
  fat?: unknown;
  prepTime?: unknown;
  cookTime?: unknown;
  servings?: unknown;
  servingSize?: unknown;
  category?: unknown;
  mealType?: unknown;
};

const normalizeText = (value: unknown): string =>
  typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
    : '';

const normalizeNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 1000) / 1000 : 0;
};

const normalizeStringSet = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.map(normalizeText).filter(Boolean))].sort()
    : [];

export function normalizeRecipeIngredients(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((ingredient: RecipeIngredientLike | string) => {
      if (typeof ingredient === 'string') {
        return {
          name: normalizeText(ingredient),
          quantity: 0,
          unit: '',
          remarks: '',
        };
      }

      return {
        name: normalizeText(ingredient?.name),
        quantity: normalizeNumber(ingredient?.quantity),
        unit: normalizeText(ingredient?.unit),
        remarks: normalizeText(ingredient?.remarks),
      };
    })
    .filter((ingredient) => ingredient.name)
    .sort((a, b) =>
      `${a.name}|${a.quantity}|${a.unit}|${a.remarks}`.localeCompare(
        `${b.name}|${b.quantity}|${b.unit}|${b.remarks}`,
      ),
    );
}

export function normalizeRecipeInstructions(value: unknown): string[] {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : [];
}

export function getRecipePublicationIssues(recipe: RecipeQualityInput): string[] {
  const issues: string[] = [];
  if (!normalizeText(recipe.name)) issues.push('Recipe name is required');
  if (normalizeRecipeIngredients(recipe.ingredients).length === 0) {
    issues.push('At least one ingredient is required');
  }
  if (normalizeRecipeInstructions(recipe.instructions).length === 0) {
    issues.push('At least one preparation instruction is required');
  }
  return issues;
}

export function isRecipePublishable(recipe: RecipeQualityInput): boolean {
  return getRecipePublicationIssues(recipe).length === 0;
}

/**
 * Strict content identity used by the cleanup tool. Metadata such as IDs,
 * creator, counters, images and timestamps are deliberately excluded so two
 * independently-created but substantively identical recipes can be merged.
 */
export function getStrictRecipeFingerprint(recipe: RecipeQualityInput): string {
  return JSON.stringify({
    name: normalizeText(recipe.name),
    description: normalizeText(recipe.description),
    category: normalizeText(recipe.category),
    mealType: normalizeText(recipe.mealType),
    ingredients: normalizeRecipeIngredients(recipe.ingredients),
    instructions: normalizeRecipeInstructions(recipe.instructions),
    tags: normalizeStringSet(recipe.tags),
    dietTypes: normalizeStringSet(recipe.dietTypes),
    dietaryRestrictions: normalizeStringSet(recipe.dietaryRestrictions),
    allergens: normalizeStringSet(recipe.allergens),
    medicalContraindications: normalizeStringSet(recipe.medicalContraindications),
    calories: normalizeNumber(recipe.calories),
    protein: normalizeNumber(recipe.protein),
    carbs: normalizeNumber(recipe.carbs),
    fat: normalizeNumber(recipe.fat),
    prepTime: normalizeNumber(recipe.prepTime),
    cookTime: normalizeNumber(recipe.cookTime),
    servings: normalizeNumber(recipe.servings),
    servingSize: normalizeText(recipe.servingSize),
  });
}

export function recipeCompletenessScore(recipe: RecipeQualityInput): number {
  return (
    normalizeRecipeIngredients(recipe.ingredients).length * 5 +
    normalizeRecipeInstructions(recipe.instructions).length * 3 +
    normalizeText(recipe.description).length / 50 +
    normalizeStringSet(recipe.tags).length +
    (normalizeNumber(recipe.calories) > 0 ? 2 : 0) +
    (normalizeNumber(recipe.protein) > 0 ? 1 : 0) +
    (normalizeNumber(recipe.carbs) > 0 ? 1 : 0) +
    (normalizeNumber(recipe.fat) > 0 ? 1 : 0)
  );
}
