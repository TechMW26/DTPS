import {
  buildDailyNutritionSummary,
  calculateCompletedMealNutrition,
  resolveDailyNutritionGoal,
} from '@/lib/meal-nutrition';

describe('meal completion nutrition', () => {
  const date = '2026-08-22';
  const plan = {
    startDate: new Date('2026-08-20T00:00:00+05:30'),
    customizations: {
      targetCalories: 1800,
      targetMacros: { protein: 90, carbs: 210, fat: 60 },
    },
    meals: [
      { date: new Date('2026-08-20T00:00:00+05:30'), meals: {} },
      { date: new Date('2026-08-21T00:00:00+05:30'), meals: {} },
      {
        date: new Date('2026-08-22T00:00:00+05:30'),
        meals: {
          BREAKFAST: {
            foodOptions: [
              { food: 'Poha', cal: '320', protein: '10', carbs: '52', fats: '8' },
              { food: 'Upma', cal: '280', protein: '8', carbs: '48', fats: '7', isAlternative: true },
            ],
          },
          'Second Breakfast': {
            items: [{ name: 'Fruit bowl', calories: 140, protein: 2, carbs: 34, fat: 1 }],
          },
          LUNCH: {
            foods: [{ name: 'Dal rice', nutrition: { calories: 520, protein: 20, carbs: 85, fat: 12 } }],
          },
        },
      },
    ],
    mealCompletions: [
      { date: new Date('2026-08-22T09:00:00+05:30'), mealType: 'BREAKFAST', completed: true },
      {
        date: new Date('2026-08-22T10:30:00+05:30'),
        mealType: 'MID_MORNING',
        mealTypeOriginal: 'Second Breakfast',
        completed: true,
      },
    ],
  };

  it('counts only completed main meal options for the requested calendar date', () => {
    expect(calculateCompletedMealNutrition(plan, date)).toEqual({
      nutrition: { calories: 460, protein: 12, carbs: 86, fat: 9 },
      completedMeals: 2,
      totalMeals: 3,
    });
  });

  it('uses assigned daily nutrition as the goal and current schema fallbacks otherwise', () => {
    expect(resolveDailyNutritionGoal(plan, date)).toEqual({
      calories: 980,
      protein: 32,
      carbs: 171,
      fat: 21,
    });

    expect(resolveDailyNutritionGoal({ ...plan, meals: [] }, date)).toEqual({
      calories: 1800,
      protein: 90,
      carbs: 210,
      fat: 60,
    });
  });

  it('adds manual logs without counting uncompleted diet meals', () => {
    expect(buildDailyNutritionSummary({
      plan,
      date,
      foodLog: {
        totalNutrition: { calories: 100, protein: 5, carbs: 10, fat: 4 },
      },
    })).toEqual(expect.objectContaining({
      consumed: { calories: 560, protein: 17, carbs: 96, fat: 13 },
      remaining: { calories: 420, protein: 15, carbs: 75, fat: 8 },
      completedMeals: 2,
      totalMeals: 3,
    }));
  });

  it('prefers the immutable completion snapshot for historical accuracy', () => {
    const snapshottedPlan = {
      ...plan,
      meals: [],
      mealCompletions: [{
        date: new Date('2026-08-22T09:00:00+05:30'),
        mealType: 'BREAKFAST',
        completed: true,
        nutrition: { calories: 300, protein: 9, carbs: 50, fat: 7 },
      }],
    };

    expect(calculateCompletedMealNutrition(snapshottedPlan, date).nutrition).toEqual({
      calories: 300,
      protein: 9,
      carbs: 50,
      fat: 7,
    });
  });
});
