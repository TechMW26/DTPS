import { findRecipeByName, isSameRecipeName } from '@/lib/recipe-match';

describe('legacy recipe name matching', () => {
  it('matches names whose words were stored in a different order', () => {
    expect(isSameRecipeName('Sauteed Capsicum', 'Capsicum Sauteed')).toBe(true);
  });

  it('normalizes punctuation and case without accepting partial results', () => {
    const recipes = [
      { name: 'Capsicum Salad' },
      { name: 'SAUTEED-CAPSICUM', ingredients: ['capsicum'] },
    ];

    expect(findRecipeByName(recipes, 'Capsicum sauteed')).toEqual(recipes[1]);
    expect(findRecipeByName(recipes, 'Capsicum')).toBeNull();
  });
});
