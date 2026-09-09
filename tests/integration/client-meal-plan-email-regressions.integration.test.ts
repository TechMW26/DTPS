import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import DietTemplate from '@/lib/db/models/DietTemplate';
import Recipe from '@/lib/db/models/Recipe';
import { createAssignedDietitianClientPair, ensureDatabaseConnection } from '../utils/database';
import { invokeRoute } from '../utils/routes';

// Regression coverage for the email's missing history and recipe reports.
describe('client access to published diet history and recipes', () => {
  beforeEach(ensureDatabaseConnection);

  it('returns previous published plans and their recipes without exposing drafts or deleted plans', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const recipe = await Recipe.create({
      name: 'Test cucumber salad', createdBy: dietitian._id, isActive: true,
      ingredients: [{ name: 'Cucumber', quantity: 100, unit: 'g' }],
      instructions: ['Wash, chop and serve'],
    });
    const oldDate = '2026-08-10';
    const fields = {
      clientId: client._id, dietitianId: dietitian._id,
      startDate: `${oldDate}T00:00:00Z`, endDate: `${oldDate}T23:59:59Z`, duration: 1,
      goals: { primaryGoal: 'weight-loss' },
      meals: [{ date: oldDate, meals: { BREAKFAST: { foodOptions: [
        { food: recipe.name, recipeId: String(recipe._id) },
      ] } } }],
    };
    const oldPlan = await ClientMealPlan.create({ ...fields, name: 'Previous diet', status: 'completed' });
    await ClientMealPlan.create({ ...fields, name: 'Unpublished draft', status: 'draft' });
    await ClientMealPlan.create({ ...fields, name: 'Deleted diet', status: 'active', isDeleted: true });
    const route = await import('@/app/api/client/meal-plan/route');
    const history = await invokeRoute(route.GET, {
      method: 'GET', url: 'http://localhost/api/client/meal-plan?list=true', user: client,
    });
    expect(history.status).toBe(200);
    expect(history.json.plans.map((plan: { _id: string }) => plan._id)).toEqual([String(oldPlan._id)]);
    const day = await invokeRoute(route.GET, {
      method: 'GET', url: `http://localhost/api/client/meal-plan?date=${oldDate}`, user: client,
    });
    expect(day.status).toBe(200);
    expect(day.json.hasPlan).toBe(true);
    expect(JSON.stringify(day.json)).toContain('Wash, chop and serve');
  });
  it('loads templates only when published daily meals are absent', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const date = '2026-08-12';
    const template = await DietTemplate.create({
      name: 'Fallback template', category: 'weight-loss', duration: 1, createdBy: dietitian._id,
      meals: [{ date, meals: { BREAKFAST: { foodOptions: [{ food: 'Template oats' }] } } }],
    });
    const plan = await ClientMealPlan.create({
      clientId: client._id, dietitianId: dietitian._id, templateId: template._id,
      name: 'Published diet', status: 'active', startDate: `${date}T00:00:00Z`,
      endDate: `${date}T23:59:59Z`, duration: 1, goals: { primaryGoal: 'weight-loss' },
      meals: [{ date, meals: { BREAKFAST: { foodOptions: [{ food: 'Published oats' }] } } }],
    });
    const templateReads = jest.spyOn(DietTemplate, 'findById');
    const templatePopulation = jest.spyOn(DietTemplate, 'find');
    const route = await import('@/app/api/client/meal-plan/route');
    const options = { method: 'GET' as const, url: `http://localhost/api/client/meal-plan?date=${date}`, user: client };
    const published = await invokeRoute(route.GET, options);
    expect(published.status).toBe(200);
    expect(JSON.stringify(published.json)).toContain('Published oats');
    expect(templateReads).not.toHaveBeenCalled();
    expect(templatePopulation).not.toHaveBeenCalled();
    await ClientMealPlan.updateOne({ _id: plan._id }, { $set: { meals: [], mealTypes: [] } });
    const fallback = await invokeRoute(route.GET, options);
    expect(fallback.status).toBe(200);
    expect(JSON.stringify(fallback.json)).toContain('Template oats');
    expect(templateReads).toHaveBeenCalledTimes(1);
  });

});
