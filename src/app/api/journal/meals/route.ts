import {nativeResponseJson} from '@/lib/api/native-response';
import {formatInTimeZone} from 'date-fns-tz';
import {TASK_TIME_ZONE} from '@/lib/task-schedule';
import {getNativeDatabase} from '@/lib/db/database';
import {journalDay,journalLegacyPlan,journalProfile} from '@/lib/db/repository/native-journal';
import {taskClientAccess} from '@/lib/db/repository/native-staff-tasks';
import {nativePlanForDate,nativeTemplateMeals} from '@/lib/db/repository/native-client-meals';
import {nativeHabitDay} from '@/lib/db/repository/native-habits';
import {nativeJournalRoute} from '@/lib/api/native-journal-route';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { format, differenceInDays } from 'date-fns';
import { UserRole } from '@/types';
import { logHistoryServer } from '@/lib/server/history';
import { normalizeMealType, DEFAULT_MEAL_TYPES_LIST } from '@/lib/mealConfig';

// Helper to get date without time
const getDateOnly = (date: Date | string): Date => {
  return nativeHabitDay(formatInTimeZone(new Date(date),TASK_TIME_ZONE,'yyyy-MM-dd')).start;
};

// Helper to normalize meal type keys for consistent matching
// Uses canonical normalization from mealConfig
const normalizeMealTypeKey = (mealType: string): string => {
  const canonical = normalizeMealType(mealType);
  if (canonical) return canonical.toLowerCase().replace(/_/g, '');
  // Fallback: simple lowercase strip
  return mealType.toLowerCase().replace(/[\s_]/g, '');
};

// Helper to check if user has permission to access client data
const checkPermission = (session: any, clientId?: string): boolean => {
  const userRole = session?.user?.role;
  // Admins, dietitians, and health counselors can access any client
  const allowedRoles = [UserRole.ADMIN, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR, 'health_counselor', 'admin', 'dietitian'];
  if (allowedRoles.includes(userRole)) {
    return true;
  }
  // Clients can only access their own data
  if (userRole === UserRole.CLIENT || userRole === 'client') {
    return !clientId || clientId === session?.user?.id;
  }
  return false;
};

// GET /api/journal/meals - Get meals entries for a date
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return nativeResponseJson({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const clientId = searchParams.get('clientId') || session.user.id;

    // Check permission
    if (!checkPermission(session, clientId)) {
      return nativeResponseJson({ error: 'Access denied' }, { status: 403 });
    }

    const db=getNativeDatabase();
    await taskClientAccess(db,session.user.id,clientId);

    const day=nativeHabitDay(dateParam),date=day.start;

    // Fetch user's goals from the User database
    const {user}=await journalProfile(db,clientId);
    // Fetch user's targets from their profile goals
    const userGoals = user?.goals || {};
    const targets = {
      calories: userGoals.calories || 2000,
      protein: userGoals.protein || 150,
      carbs: userGoals.carbs || 250,
      fat: userGoals.fat || 65
    };

    // Get journal entries for tracking consumed meals
    const journal=await journalDay(db,clientId,day.key);
    // Create a map of consumed meals from journal (by mealPlanId)
    const journalMealsMap = new Map<string, any>();
    if (journal?.meals) {
      for (const meal of journal.meals) {
        if (meal.mealPlanId) {
          journalMealsMap.set(meal.mealPlanId, meal);
        }
      }
    }

    let meals: any[] = [];
    let activePlanInfo: any = null;

    // Always check for assigned diet plans first
    // First check ClientMealPlan (assigned diet templates or direct meal plans)
    const clientMealPlan=await nativePlanForDate(db,clientId,day.start,day.end);
    if(clientMealPlan&&typeof clientMealPlan.templateId==='string')clientMealPlan.templateId=await nativeTemplateMeals(db,clientMealPlan.templateId);

    if (clientMealPlan) {
      // Calculate which day of the plan this is
      const dayIndex = differenceInDays(date, getDateOnly(clientMealPlan.startDate));

      // Check if this date is frozen
      const dateStr = day.key;
      const freezedDays = clientMealPlan.freezedDays || [];
      const isFrozen = freezedDays.some((fd: any) => {
        const freezeDate = formatInTimeZone(new Date(fd.date),TASK_TIME_ZONE,'yyyy-MM-dd');
        return freezeDate === dateStr;
      });

      // Get freeze info if frozen
      const freezeInfo = isFrozen ? freezedDays.find((fd: any) =>
        formatInTimeZone(new Date(fd.date),TASK_TIME_ZONE,'yyyy-MM-dd') === dateStr
      ) : null;

      // If frozen, return empty meals with frozen status
      if (isFrozen) {
        const summary = {
          totalMeals: 0,
          consumedMeals: 0,
          totalCalories: 0,
          consumedCalories: 0,
          consumedProtein: 0,
          consumedCarbs: 0,
          consumedFat: 0,
          targets,
          percentage: 0
        };

        return nativeResponseJson({
          success: true,
          meals: [],
          targets,
          summary,
          activeMealPlan: {
            _id: clientMealPlan._id,
            name: clientMealPlan.name || (clientMealPlan.templateId as any)?.name,
            startDate: clientMealPlan.startDate,
            endDate: clientMealPlan.endDate
          },
          isFrozen: true,
          freezeInfo: freezeInfo ? {
            date: freezeInfo.date,
            reason: freezeInfo.reason || 'Day frozen by dietitian',
            frozenAt: freezeInfo.createdAt
          } : null,
          user: user ? { firstName: user.firstName, lastName: user.lastName } : null
        });
      }

      // Get meal completions for this date from ClientMealPlan
      const mealCompletionsMap = new Map<string, any>();
      if (clientMealPlan.mealCompletions && Array.isArray(clientMealPlan.mealCompletions)) {
        for (const completion of clientMealPlan.mealCompletions) {
          const completionDate = getDateOnly(completion.date);
          if (completionDate.getTime() === date.getTime()) {
            // Use normalized key for consistent matching
            const normalizedKey = normalizeMealTypeKey(completion.mealType);
            mealCompletionsMap.set(normalizedKey, completion);
          }
        }
      }

      // Get meal types from plan or template or use defaults
      const mealTypes = clientMealPlan.mealTypes ||
        (clientMealPlan.templateId as any)?.mealTypes || DEFAULT_MEAL_TYPES_LIST;

      // Check if meals are stored directly in clientMealPlan
      let dayPlan = null;
      if (clientMealPlan.meals && Array.isArray(clientMealPlan.meals) && clientMealPlan.meals.length > 0) {
        // Meals stored directly in the plan
        dayPlan = clientMealPlan.meals[dayIndex % clientMealPlan.meals.length];
      } else if (clientMealPlan.templateId) {
        // Fallback to template meals
        const template = clientMealPlan.templateId as any;
        if (template.meals && template.meals.length > 0) {
          dayPlan = template.meals[dayIndex % template.meals.length];
        }
      }

      if (dayPlan && dayPlan.meals) {
        // Extract meals from the day plan
        for (const mealType of mealTypes) {
          const mealData = dayPlan.meals[mealType.name];
          if (mealData && mealData.foodOptions && mealData.foodOptions.length > 0) {
            for (const [foodIndex,food] of mealData.foodOptions.entries()) {
              if (food.food) { // Only add if food name exists
                const mealPlanId = `${clientMealPlan._id}-${dayIndex}-${mealType.name}-${food.id || foodIndex}`;

                // Check if this meal was already tracked in journal
                const journalMeal = journalMealsMap.get(mealPlanId);

                // Check meal completion from ClientMealPlan mealCompletions
                // Use normalized key for consistent matching
                const normalizedMealTypeKey = normalizeMealTypeKey(mealType.name);
                const mealCompletion = mealCompletionsMap.get(normalizedMealTypeKey);

                meals.push({
                  _id: journalMeal?._id || mealPlanId,
                  name: food.food || food.label || 'Unnamed Food',
                  calories: parseFloat(food.cal) || 0,
                  protein: parseFloat(food.protein) || 0,
                  carbs: parseFloat(food.carbs) || 0,
                  fat: parseFloat(food.fats) || 0,
                  type: mealType.name as any,
                  time: mealData.time || mealType.time,
                  consumed: mealCompletion?.completed || journalMeal?.consumed || false,
                  photo: mealCompletion?.imagePath || journalMeal?.photo || '',
                  notes: mealCompletion?.notes || journalMeal?.notes || '',
                  fromMealPlan: true,
                  mealPlanId: mealPlanId,
                  unit: food.unit || ''
                });
              }
            }
          }
        }

        activePlanInfo = {
          _id: clientMealPlan._id,
          name: clientMealPlan.name || (clientMealPlan.templateId as any)?.name,
          startDate: clientMealPlan.startDate,
          endDate: clientMealPlan.endDate,
          templateName: (clientMealPlan.templateId as any)?.name
        };

        // Update targets from customizations or template
        if (clientMealPlan.customizations?.targetCalories) {
          targets.calories = clientMealPlan.customizations.targetCalories;
        } else if ((clientMealPlan.templateId as any)?.targetCalories) {
          const tc = (clientMealPlan.templateId as any).targetCalories;
          targets.calories = tc.max || tc.min || targets.calories;
        }

        if (clientMealPlan.customizations?.targetMacros) {
          targets.protein = clientMealPlan.customizations.targetMacros.protein || targets.protein;
          targets.carbs = clientMealPlan.customizations.targetMacros.carbs || targets.carbs;
          targets.fat = clientMealPlan.customizations.targetMacros.fat || targets.fat;
        } else if ((clientMealPlan.templateId as any)?.targetMacros) {
          const tm = (clientMealPlan.templateId as any).targetMacros;
          targets.protein = tm.protein?.max || targets.protein;
          targets.carbs = tm.carbs?.max || targets.carbs;
          targets.fat = tm.fat?.max || targets.fat;
        }
      }
    }

    // If still no meals, check legacy MealPlan model
    if (meals.length === 0) {
      const activeMealPlan=await journalLegacyPlan(db,clientId,day.start,day.end);

      if (activeMealPlan) {
        // Calculate which day of the meal plan this is
        const dayNumber = differenceInDays(date, getDateOnly(activeMealPlan.startDate)) % 7 + 1;
        const dayMeals = activeMealPlan.meals.find((m: any) => m.day === dayNumber);

        if (dayMeals) {
          const mealTypes = [
            { type: 'Breakfast', items: dayMeals.breakfast, time: '09:00 AM' },
            { type: 'Lunch', items: dayMeals.lunch, time: '01:00 PM' },
            { type: 'Dinner', items: dayMeals.dinner, time: '07:00 PM' },
            { type: 'Mid Evening', items: dayMeals.snacks, time: '04:00 PM' }
          ];

          for (const mealType of mealTypes) {
            if (mealType.items && mealType.items.length > 0) {
              for (const recipe of mealType.items) {
                if (recipe) {
                  meals.push({
                    _id: `${activeMealPlan._id}-${recipe._id}-${mealType.type}`,
                    name: recipe.name || 'Unnamed Recipe',
                    calories: recipe.calories || 0,
                    protein: recipe.protein || 0,
                    carbs: recipe.carbs || 0,
                    fat: recipe.fat || 0,
                    type: mealType.type,
                    time: mealType.time,
                    consumed: false,
                    fromMealPlan: true
                  });
                }
              }
            }
          }
        }

        // Update targets from meal plan
        if (activeMealPlan.dailyCalorieTarget) {
          targets.calories = activeMealPlan.dailyCalorieTarget;
        }
        if (activeMealPlan.dailyMacros) {
          targets.protein = activeMealPlan.dailyMacros.protein || targets.protein;
          targets.carbs = activeMealPlan.dailyMacros.carbs || targets.carbs;
          targets.fat = activeMealPlan.dailyMacros.fat || targets.fat;
        }

        activePlanInfo = {
          _id: activeMealPlan._id,
          name: activeMealPlan.name,
          startDate: activeMealPlan.startDate,
          endDate: activeMealPlan.endDate
        };
      }
    }

    // Add any custom meals from journal that aren't from meal plans
    if (journal?.meals) {
      for (const meal of journal.meals) {
        if (!meal.fromMealPlan && !meal.mealPlanId) {
          meals.push({
            _id: meal._id,
            name: meal.name,
            calories: meal.calories || 0,
            protein: meal.protein || 0,
            carbs: meal.carbs || 0,
            fat: meal.fat || 0,
            type: meal.type,
            time: meal.time,
            consumed: meal.consumed,
            photo: meal.photo || '',
            notes: meal.notes || '',
            fromMealPlan: false,
            unit: meal.unit || ''
          });
        }
      }
    }

    const consumedMeals = meals.filter((m: { consumed: boolean }) => m.consumed);

    const totalCalories = meals.reduce((sum: number, m: { calories: number }) => sum + (m.calories || 0), 0);
    const consumedCalories = consumedMeals.reduce((sum: number, m: { calories: number }) => sum + (m.calories || 0), 0);
    const consumedProtein = consumedMeals.reduce((sum: number, m: { protein: number }) => sum + (m.protein || 0), 0);
    const consumedCarbs = consumedMeals.reduce((sum: number, m: { carbs: number }) => sum + (m.carbs || 0), 0);
    const consumedFat = consumedMeals.reduce((sum: number, m: { fat: number }) => sum + (m.fat || 0), 0);

    return nativeResponseJson({
      success: true,
      meals,
      activeMealPlan: activePlanInfo,
      user: user ? {
        firstName: user.firstName,
        lastName: user.lastName
      } : null,
      summary: {
        totalMeals: meals.length,
        consumedMeals: consumedMeals.length,
        totalCalories,
        consumedCalories,
        consumedProtein,
        consumedCarbs,
        consumedFat,
        targets,
        percentage: Math.min(Math.round((consumedCalories / targets.calories) * 100), 100)
      }
    });

  } catch (error) {
    console.error('Error fetching meals:', error);
    return nativeResponseJson(
      { error: 'Failed to fetch meals' },
      { status: 500 }
    );
  }
}

// POST /api/journal/meals - Add new meal entry
const mutation=nativeJournalRoute('meals');
export const POST=mutation;export const PUT=mutation;export const DELETE=mutation;
