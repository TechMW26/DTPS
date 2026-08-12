function normalizeRecipeWords(value: string): string[] {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort();
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
