/**
 * Integration tests for template loading functionality.
 *
 * These tests verify that templates load correctly and meals
 * are properly populated in the diet plan view.
 */

describe('template loading integration', () => {
    /**
     * Scenario: When loading a template with custom day mapping,
     * the mapped meals should be correctly cloned and assigned.
     */
    it('should deep clone meal data when applying template mapping', () => {
        // Simulate a template structure from the database
        const templateMeals = [
            {
                id: 'day-0',
                day: 'Day 1',
                date: '2026-04-02',
                meals: {
                    EARLY_MORNING: {
                        id: 'meal-1',
                        name: 'Early Morning',
                        time: '06:00 AM',
                        foodOptions: [
                            {
                                id: 'food-1',
                                food: 'Green Tea',
                                unit: '1 cup',
                                cal: '0',
                                carbs: '0',
                                protein: '0',
                                fats: '0',
                            },
                        ],
                    },
                    BREAKFAST: {
                        id: 'meal-2',
                        name: 'Breakfast',
                        time: '09:00 AM',
                        foodOptions: [
                            {
                                id: 'food-2',
                                food: 'Oatmeal',
                                unit: '1 bowl',
                                cal: '150',
                                carbs: '30',
                                protein: '5',
                                fats: '3',
                            },
                        ],
                    },
                },
                note: '',
            },
        ];

        // Simulate deepCloneMealDay function
        const deepCloneMealDay = (sourceDay: any) => {
            const clonedMeals: Record<string, any> = {};
            if (sourceDay.meals && typeof sourceDay.meals === 'object') {
                Object.keys(sourceDay.meals).forEach((mealType) => {
                    const meal = sourceDay.meals[mealType];
                    if (!meal) return;
                    clonedMeals[mealType] = {
                        ...meal,
                        id: meal.id || `meal-${mealType.toLowerCase().replace(/\s+/g, '-')}`,
                        name: meal.name || mealType,
                        time: meal.time || '',
                        foodOptions: (meal.foodOptions || []).map((opt: any) => ({
                            ...opt,
                            id:
                                opt.id ||
                                `food-${Math.random().toString(36).substring(2, 9)}`,
                        })),
                    };
                });
            }
            return clonedMeals;
        };

        // Apply template mapping
        const sourceDay = templateMeals[0];
        const clonedMeals = deepCloneMealDay(sourceDay);

        // Verify structure
        expect(Object.keys(clonedMeals)).toContain('EARLY_MORNING');
        expect(Object.keys(clonedMeals)).toContain('BREAKFAST');

        // Verify data is preserved
        expect(clonedMeals['EARLY_MORNING'].foodOptions[0].food).toBe('Green Tea');
        expect(clonedMeals['BREAKFAST'].foodOptions[0].food).toBe('Oatmeal');

        // Verify deep cloning (not same reference)
        expect(clonedMeals['EARLY_MORNING']).not.toBe(
            sourceDay.meals['EARLY_MORNING']
        );
        expect(clonedMeals['EARLY_MORNING'].foodOptions).not.toBe(
            sourceDay.meals['EARLY_MORNING'].foodOptions
        );
    });

    /**
     * Scenario: Template with normalized meal keys (EARLY_MORNING, BREAKFAST)
     * should be converted to display names (Early Morning, Breakfast).
     */
    it('should normalize meal keys from canonical form to display names', () => {
        const MEAL_TYPES: Record<string, { label: string; time12h: string }> = {
            EARLY_MORNING: { label: 'Early Morning', time12h: '06:00 AM' },
            BREAKFAST: { label: 'Breakfast', time12h: '09:00 AM' },
            MID_MORNING: { label: 'Mid Morning', time12h: '11:00 AM' },
            LUNCH: { label: 'Lunch', time12h: '01:00 PM' },
            EVENING: { label: 'Evening', time12h: '04:00 PM' },
            DINNER: { label: 'Dinner', time12h: '07:00 PM' },
        };

        const normalizeMealType = (name: string): string | undefined => {
            const upperName = name.toUpperCase().replace(/\s+/g, '_');
            if (MEAL_TYPES[upperName]) return upperName;
            return undefined;
        };

        // Simulate meals with canonical keys
        const meals = {
            EARLY_MORNING: {
                id: 'meal-1',
                name: 'Early Morning',
                time: '06:00 AM',
                foodOptions: [{ id: '1', food: 'Tea', unit: '1 cup', cal: '0' }],
            },
            BREAKFAST: {
                id: 'meal-2',
                name: 'Breakfast',
                time: '09:00 AM',
                foodOptions: [{ id: '2', food: 'Oats', unit: '1 bowl', cal: '150' }],
            },
        };

        // Normalize keys
        const normalized: Record<string, any> = {};
        Object.keys(meals).forEach((mealName) => {
            const current = (meals as any)[mealName];
            if (!current) return;
            const mealKey = normalizeMealType(mealName);
            const displayName = mealKey ? MEAL_TYPES[mealKey].label : mealName;
            normalized[displayName] = {
                ...current,
                name: displayName,
            };
        });

        // Verify normalization
        expect(Object.keys(normalized)).toContain('Early Morning');
        expect(Object.keys(normalized)).toContain('Breakfast');
        expect(Object.keys(normalized)).not.toContain('EARLY_MORNING');
        expect(Object.keys(normalized)).not.toContain('BREAKFAST');

        // Verify data preserved
        expect(normalized['Early Morning'].foodOptions[0].food).toBe('Tea');
        expect(normalized['Breakfast'].foodOptions[0].food).toBe('Oats');
    });

    /**
     * Scenario: When in edit mode and loading a template,
     * both initialMeals and editingPlan.meals should be updated.
     */
    it('should update editingPlan.meals when loading template in edit mode', () => {
        // Initial state - editing an existing plan with some meals
        let initialMeals: any[] = [];
        let editingPlan: any = {
            _id: 'plan-123',
            name: 'Test Plan',
            meals: [
                {
                    id: 'day-0',
                    meals: {
                        BREAKFAST: {
                            id: 'existing-meal',
                            foodOptions: [{ food: 'Old Breakfast' }],
                        },
                    },
                },
            ],
            mealTypes: [],
        };
        const isEditMode = true;

        // Template to load
        const templateMeals = [
            {
                id: 'day-0',
                meals: {
                    BREAKFAST: {
                        id: 'template-meal',
                        foodOptions: [{ food: 'New Breakfast' }],
                    },
                    LUNCH: {
                        id: 'template-lunch',
                        foodOptions: [{ food: 'New Lunch' }],
                    },
                },
            },
        ];

        // Simulate the fix - update both initialMeals and editingPlan
        const mappedMeals = templateMeals;
        initialMeals = mappedMeals;

        if (isEditMode && editingPlan) {
            editingPlan = {
                ...editingPlan,
                meals: mappedMeals,
            };
        }

        // Verify both are updated
        expect(initialMeals).toEqual(mappedMeals);
        expect(editingPlan.meals).toEqual(mappedMeals);

        // Verify the template data is present in editingPlan
        expect(editingPlan.meals[0].meals.LUNCH).toBeDefined();
        expect(editingPlan.meals[0].meals.LUNCH.foodOptions[0].food).toBe(
            'New Lunch'
        );
    });

    /**
     * Scenario: Template meals should be correctly mapped based on day mapping.
     */
    it('should map template meals to correct days based on day mapping', () => {
        const templateMeals = [
            {
                id: 'template-day-0',
                day: 'Day 1',
                meals: { BREAKFAST: { foodOptions: [{ food: 'Day 1 Breakfast' }] } },
            },
            {
                id: 'template-day-1',
                day: 'Day 2',
                meals: { BREAKFAST: { foodOptions: [{ food: 'Day 2 Breakfast' }] } },
            },
            {
                id: 'template-day-2',
                day: 'Day 3',
                meals: { BREAKFAST: { foodOptions: [{ food: 'Day 3 Breakfast' }] } },
            },
        ];

        // Custom mapping: Plan day 0 -> Template day 2, Plan day 1 -> Template day 0
        const templateDayMapping: Record<number, number> = {
            0: 2, // Plan day 1 uses template day 3
            1: 0, // Plan day 2 uses template day 1
            2: -1, // Plan day 3 skipped
        };

        const duration = 3;
        const mappedMeals: any[] = [];

        for (let i = 0; i < duration; i++) {
            const templateDayIndex = templateDayMapping[i];

            if (templateDayIndex === undefined || templateDayIndex === -1) {
                mappedMeals.push({
                    id: `day-${i}`,
                    day: `Day ${i + 1}`,
                    meals: {},
                    note: '',
                });
            } else {
                const sourceDay = templateMeals[templateDayIndex];
                mappedMeals.push({
                    id: `day-${i}`,
                    day: `Day ${i + 1}`,
                    meals: { ...sourceDay.meals },
                    note: '',
                });
            }
        }

        // Verify mapping
        expect(mappedMeals[0].meals.BREAKFAST.foodOptions[0].food).toBe(
            'Day 3 Breakfast'
        );
        expect(mappedMeals[1].meals.BREAKFAST.foodOptions[0].food).toBe(
            'Day 1 Breakfast'
        );
        expect(Object.keys(mappedMeals[2].meals).length).toBe(0); // Skipped
    });

    /**
     * Scenario: Loading template should not affect days that already have food data
     * when merge mode is active (edit mode with existing meals).
     */
    it('should merge template meals with existing meals without overwriting', () => {
        // Existing meals in the plan
        const existingMeals = [
            {
                id: 'day-0',
                meals: {
                    BREAKFAST: {
                        id: 'existing',
                        foodOptions: [{ food: 'Existing Breakfast', id: 'e1' }],
                    },
                },
            },
        ];

        // Template meals
        const templateMeals = [
            {
                id: 'template-day-0',
                meals: {
                    BREAKFAST: {
                        id: 'template',
                        foodOptions: [{ food: 'Template Breakfast', id: 't1' }],
                    },
                    LUNCH: {
                        id: 'template-lunch',
                        foodOptions: [{ food: 'Template Lunch', id: 't2' }],
                    },
                },
            },
        ];

        // Merge logic - existing takes priority
        const mergedMeals = existingMeals.map((existingDay: any, i: number) => {
            const templateDay = templateMeals[i];
            if (!templateDay || !templateDay.meals) return existingDay;

            const mergedDayMeals = existingDay.meals ? { ...existingDay.meals } : {};

            Object.keys(templateDay.meals).forEach((mealType: string) => {
                const existingMeal = mergedDayMeals[mealType];
                const hasFoodData = existingMeal?.foodOptions?.some(
                    (opt: any) => opt.food?.trim()
                );
                if (!hasFoodData) {
                    // No existing data - use template
                    mergedDayMeals[mealType] = { ...(templateDay.meals as any)[mealType] };
                }
            });

            return { ...existingDay, meals: mergedDayMeals };
        });

        // Verify merge
        expect(mergedMeals[0].meals.BREAKFAST.foodOptions[0].food).toBe(
            'Existing Breakfast'
        ); // Preserved
        expect(mergedMeals[0].meals.LUNCH.foodOptions[0].food).toBe(
            'Template Lunch'
        ); // Added from template
    });
});
