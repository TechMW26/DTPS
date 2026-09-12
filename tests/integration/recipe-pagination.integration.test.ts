import Recipe from '@/lib/db/models/Recipe';
import { numericRecipePagePipeline } from '@/lib/services/recipe-pagination';
import { ensureDatabaseConnection, createAssignedDietitianClientPair } from '../utils/database';
import { invokeRoute } from '../utils/routes';

it('paginates numeric IDs in the database and preserves legacy IDs, ties, and filters', async () => {
  await ensureDatabaseConnection();
  const { dietitian } = await createAssignedDietitianClientPair();
  for (const uuid of ['100', '2', '10', 'abc', '12abc', '002', '-3', '  +5']) {
    await Recipe.create({ uuid, name: `Recipe ${uuid}`, description: 'Pagination fixture',
      ingredients: [{ name: 'Carrot', quantity: 100, unit: 'g' }], instructions: ['Boil and serve'],
      prepTime: 5, cookTime: 10, servings: 1, calories: 50, protein: 2, carbs: 10, fat: 1,
      createdBy: dietitian._id, isActive: true,
    });
  }
  const raw = await Recipe.find({}).sort({ _id: 1 }).lean();
  const ascending = raw.slice().sort((a, b) => (parseInt(a.uuid || '0') || 0) - (parseInt(b.uuid || '0') || 0));
  const descending = raw.slice().sort((a, b) => (parseInt(b.uuid || '0') || 0) - (parseInt(a.uuid || '0') || 0));
  for (const [direction, expected] of [[1, ascending], [-1, descending]] as const) {
    for (const page of [1, 2, 3]) {
      const result = await Recipe.aggregate(numericRecipePagePipeline({}, direction, page, 3));
      expect(result.map(r => r.uuid)).toEqual(expected.slice((page - 1) * 3, page * 3).map(r => r.uuid));
      expect(result[0]?.ingredients).toBeDefined();
      expect(result[0]?.numericUuid).toBeUndefined();
    }
  }
  const { GET } = await import('@/app/api/recipes/route');
  const response = await invokeRoute(GET, { method: 'GET', user: dietitian,
    url: 'http://localhost/api/recipes?sortBy=uuid&limit=3&page=2' });
  expect(response.status).toBe(200);
  expect(response.json.recipes.map((r: any) => r.uuid)).toEqual(ascending.slice(3, 6).map(r => r.uuid));
  const filtered = await Recipe.aggregate(numericRecipePagePipeline({ uuid: { $in: ['2', '10', '100'] } }, -1, 1, 2));
  expect(filtered.map(r => r.uuid)).toEqual(['100', '10']);
});
