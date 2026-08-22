/// <reference types="jest" />

import request from 'supertest';
import { getServerSession } from 'next-auth';
import Recipe from '@/lib/db/models/Recipe';
import { UserRole } from '@/types';
import {
  getRecipePublicationIssues,
  getStrictRecipeFingerprint,
} from '@/lib/recipe-quality';
import { createRouteTestServer } from '../utils/supertest-route';
import {
  createAssignedDietitianClientPair,
  ensureDatabaseConnection,
} from '../utils/database';
import { entityId } from '../utils/assertions';

function validRecipe(createdBy: unknown, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Salad',
    description: 'Fresh mixed salad',
    ingredients: [
      { name: 'Cucumber', quantity: 100, unit: 'g', remarks: '' },
      { name: 'Tomato', quantity: 100, unit: 'g', remarks: '' },
    ],
    instructions: ['Wash the vegetables', 'Chop, mix and serve'],
    prepTime: 10,
    cookTime: 0,
    servings: 1,
    servingSize: '1 SMALL BOWL (200 gm/ml)',
    calories: 45,
    protein: 2,
    carbs: 9,
    fat: 0,
    tags: ['vegetarian'],
    dietaryRestrictions: ['Vegetarian'],
    createdBy,
    isActive: true,
    ...overrides,
  };
}

describe('recipe quality and exact client lookup', () => {
  beforeEach(async () => {
    await ensureDatabaseConnection();
  });

  it('rejects active blank recipes while still allowing incomplete drafts', async () => {
    const { dietitian } = await createAssignedDietitianClientPair();

    await expect(Recipe.create({
      ...validRecipe(dietitian._id),
      name: 'Invalid active recipe',
      ingredients: [],
      instructions: [],
    })).rejects.toThrow('Recipe cannot be published');

    const draft = await Recipe.create({
      ...validRecipe(dietitian._id),
      name: 'Incomplete draft',
      ingredients: [],
      instructions: [],
      isActive: false,
    });

    expect(draft.isActive).toBe(false);
    expect(getRecipePublicationIssues(draft.toObject())).toEqual([
      'At least one ingredient is required',
      'At least one preparation instruction is required',
    ]);
  });

  it('blocks query-based updates from blanking an active recipe', async () => {
    const { dietitian } = await createAssignedDietitianClientPair();
    const recipe = await Recipe.create(validRecipe(dietitian._id));

    await expect(Recipe.findByIdAndUpdate(
      recipe._id,
      { $set: { ingredients: [], instructions: [] } },
      { new: true, runValidators: true },
    )).rejects.toThrow('Recipe cannot be published');

    const unchanged = await Recipe.findById(recipe._id).lean();
    expect(unchanged?.ingredients).toHaveLength(2);
    expect(unchanged?.instructions).toHaveLength(2);
  });

  it('uses content identity rather than IDs, creators or array ordering', () => {
    const first = validRecipe('creator-a');
    const reordered = {
      ...validRecipe('creator-b'),
      ingredients: [...(first.ingredients as any[])].reverse(),
      tags: [...(first.tags as string[])].reverse(),
    };

    expect(getStrictRecipeFingerprint(first)).toBe(
      getStrictRecipeFingerprint(reordered),
    );
    expect(getStrictRecipeFingerprint({
      ...reordered,
      instructions: [...(first.instructions as string[])].reverse(),
    })).not.toBe(getStrictRecipeFingerprint(first));
  });

  it('returns the exact complete recipe instead of a limited broad-search result', async () => {
    const { dietitian, client } = await createAssignedDietitianClientPair();
    await Recipe.create(validRecipe(dietitian._id));

    await Recipe.create(validRecipe(dietitian._id, {
      name: 'Apple Salad',
      description: 'A different salad recipe',
    }));

    (getServerSession as jest.Mock).mockResolvedValue({
      user: {
        id: entityId(client),
        email: client.email,
        role: UserRole.CLIENT,
      },
    });

    const recipesRoute = await import('@/app/api/recipes/route');
    const server = createRouteTestServer((nextRequest) => recipesRoute.GET(nextRequest));

    try {
      const response = await request(server)
        .get('/api/recipes?exactName=Salad&limit=10');

      expect(response.status).toBe(200);
      expect(response.body?.recipes).toHaveLength(1);
      expect(response.body?.recipes?.[0]?.name).toBe('Salad');
      expect(response.body?.recipes?.[0]?.ingredients).toHaveLength(2);
      expect(response.body?.recipes?.[0]?.instructions).toHaveLength(2);
    } finally {
      server.close();
    }
  });
});
