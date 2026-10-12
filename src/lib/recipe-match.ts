/** Portion annotations describe the serving, not a different recipe. */
export function mealRecipeName(value: string): string {
  return value.replace(/\([^)]*\)/g, portion => {
    const content=portion.slice(1,-1).replace(/(\d)([a-z])/gi,'$1 $2').replace(/([a-z])(\d)/gi,'$1 $2');
    const units=/\b(?:g|kg|grams?|ml|litres?|cups?|katori|pieces?|servings?|tsp|tbsp)\b/gi;
    if(!/\d/.test(content)||!units.test(content))return portion;
    // Preserve ingredient and preparation qualifiers such as "100 g cucumber".
    return content.replace(units,'').replace(/[\d\s.,/×+-]/g,'')===''?'':portion;
  }).trim();
}

function normalizeRecipeWords(value: string): string[] {
  return mealRecipeName(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

/** Legacy links can survive food-name edits. Never show another dish's recipe. */
export function resolveMealRecipe<T extends { _id?: unknown; uuid?: unknown; name?: string }>(
  recipes: T[], item: { name?: string; recipeId?: unknown; recipeUuid?: unknown },
): T | null {
  const matches = (recipe: T) => !item.name || isSameRecipeName(recipe.name || '', item.name);
  const byId = item.recipeId ? recipes.find(recipe => String(recipe._id) === String(item.recipeId) && matches(recipe)) : null;
  const byUuid = item.recipeUuid ? recipes.find(recipe => String(recipe.uuid) === String(item.recipeUuid) && matches(recipe)) : null;
  return byId || byUuid || (item.name ? findRecipeByName(recipes, item.name) : null);
}

export function isSameRecipeName(candidate: string, requested: string): boolean {
  const candidateWords = normalizeRecipeWords(candidate);
  const requestedWords = normalizeRecipeWords(requested);

  return candidateWords.length > 0 &&
    candidateWords.length === requestedWords.length &&
    candidateWords.every((word, index) => word === requestedWords[index]);
}

export function findRecipeByName<T extends { name?: string }>(
  recipes: T[],
  requested: string,
): T | null {
  return recipes.find((recipe) =>
    typeof recipe.name === 'string' && isSameRecipeName(recipe.name, requested)
  ) || null;
}
