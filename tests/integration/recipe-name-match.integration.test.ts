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

it('ignores a legacy portion annotation without confusing ingredient variants', () => {
  expect(isSameRecipeName('Salad', 'SALAD (1 Katori 100.0g)')).toBe(true);
  expect(isSameRecipeName('Raita', 'Raita (Low Fat Curd)')).toBe(false);
  expect(isSameRecipeName('Raita', 'Raita (100g cucumber)')).toBe(false);
});
