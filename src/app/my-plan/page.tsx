'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { 
  Utensils, 
  Clock, 
  Target, 
  Calendar,
  ChefHat,
  Info
} from 'lucide-react';

interface MealPlan {
  _id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  targetCalories: number;
  targetMacros: {
    protein: number;
    carbs: number;
    fat: number;
  };
  meals: Array<{
    day: number;
    mealType: string;
    recipe: {
      _id: string;
      name: string;
      description: string;
      calories: number;
      macros: {
        protein: number;
        carbs: number;
        fat: number;
      };
      prepTime: number;
      cookTime: number;
      servings: number;
      ingredients: Array<{
        name: string;
        quantity: number;
        unit: string;
      }>;
      instructions: string[];
    };
    quantity: number;
  }>;
  dietitian: {
    firstName: string;
    lastName: string;
  };
}

export default function MyPlanPage() {
  const { data: session, status } = useSession();
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(1);

  // Only fetch when session is authenticated
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchMealPlan();
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status, session?.user?.id]);

  const fetchMealPlan = async () => {
    try {
      const response = await fetch('/api/meals?active=true');
      if (response.ok) {
        const data = await response.json();
        if (data.mealPlans.length > 0) {
          setMealPlan(data.mealPlans[0]); // Get the active meal plan
        }
      }
    } catch (error) {
      console.error('Error fetching meal plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDayMeals = (day: number) => {
    if (!mealPlan) return [];
    return mealPlan.meals.filter(meal => meal.day === day);
  };

  const getMealsByType = (day: number) => {
    const dayMeals = getDayMeals(day);
    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
    
    return mealTypes.map(type => ({
      type,
      meals: dayMeals.filter(meal => meal.mealType.toLowerCase() === type)
    })).filter(group => group.meals.length > 0);
  };

  const calculateDayTotals = (day: number) => {
    const dayMeals = getDayMeals(day);
    return dayMeals.reduce((totals, meal) => {
      const calories = (meal.recipe.calories * meal.quantity) / meal.recipe.servings;
      const protein = (meal.recipe.macros.protein * meal.quantity) / meal.recipe.servings;
      const carbs = (meal.recipe.macros.carbs * meal.quantity) / meal.recipe.servings;
      const fat = (meal.recipe.macros.fat * meal.quantity) / meal.recipe.servings;
      
      return {
        calories: totals.calories + calories,
        protein: totals.protein + protein,
        carbs: totals.carbs + carbs,
        fat: totals.fat + fat
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
        </div>
      </DashboardLayout>
    );
  }

  if (!mealPlan) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="text-center py-12">
            <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Meal Plan Assigned</h3>
            <p className="text-gray-600 mb-4">
              You don't have an active meal plan yet. Contact your dietitian to get started.
            </p>
            <Button>Contact Dietitian</Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const planDuration = Math.ceil(
    (new Date(mealPlan.endDate).getTime() - new Date(mealPlan.startDate).getTime()) / 
    (1000 * 60 * 60 * 24)
  );

  const dayTotals = calculateDayTotals(selectedDay);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Meal Plan</h1>
            <p className="text-gray-600 mt-1">
              Created by Dt. {mealPlan.dietitian.firstName} {mealPlan.dietitian.lastName}
            </p>
          </div>
        </div>

        {/* Plan Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-green-600" />
              <span>{mealPlan.name}</span>
            </CardTitle>
            <CardDescription>{mealPlan.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{mealPlan.targetCalories}</p>
                <p className="text-sm text-gray-600">Daily Calories</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{mealPlan.targetMacros.protein}g</p>
                <p className="text-sm text-gray-600">Protein</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">{mealPlan.targetMacros.carbs}g</p>
                <p className="text-sm text-gray-600">Carbs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">{mealPlan.targetMacros.fat}g</p>
                <p className="text-sm text-gray-600">Fat</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Day Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-green-600" />
              <span>Daily Meal Plan</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedDay.toString()} onValueChange={(value) => setSelectedDay(parseInt(value))}>
              <TabsList className="grid w-full grid-cols-7">
                {Array.from({ length: Math.min(planDuration, 7) }, (_, i) => (
                  <TabsTrigger key={i + 1} value={(i + 1).toString()}>
                    Day {i + 1}
                  </TabsTrigger>
                ))}
              </TabsList>

              {Array.from({ length: Math.min(planDuration, 7) }, (_, i) => (
                <TabsContent key={i + 1} value={(i + 1).toString()} className="space-y-4">
                  {/* Day Totals */}
                  <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <p className="text-lg font-semibold">{Math.round(dayTotals.calories)}</p>
                      <p className="text-sm text-gray-600">Calories</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">{Math.round(dayTotals.protein)}g</p>
                      <p className="text-sm text-gray-600">Protein</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">{Math.round(dayTotals.carbs)}g</p>
                      <p className="text-sm text-gray-600">Carbs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">{Math.round(dayTotals.fat)}g</p>
                      <p className="text-sm text-gray-600">Fat</p>
                    </div>
                  </div>

                  {/* Meals by Type */}
                  <div className="space-y-4">
                    {getMealsByType(i + 1).map((mealGroup) => (
                      <Card key={mealGroup.type}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg capitalize flex items-center space-x-2">
                            <Utensils className="h-4 w-4" />
                            <span>{mealGroup.type}</span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {mealGroup.meals.map((meal, mealIndex) => (
                            <div key={mealIndex} className="border rounded-lg p-4">
                              <div className="flex items-start justify-between mb-2">
                                <h4 className="font-medium">{meal.recipe.name}</h4>
                                <Badge variant="outline">
                                  {meal.quantity} serving{meal.quantity > 1 ? 's' : ''}
                                </Badge>
                              </div>
                              
                              <p className="text-sm text-gray-600 mb-3">{meal.recipe.description}</p>
                              
                              <div className="flex items-center space-x-4 text-sm text-gray-500 mb-3">
                                <span className="flex items-center space-x-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{meal.recipe.prepTime + meal.recipe.cookTime} min</span>
                                </span>
                                <span>{Math.round((meal.recipe.calories * meal.quantity) / meal.recipe.servings)} cal</span>
                              </div>

                              <details className="text-sm">
                                <summary className="cursor-pointer text-green-600 hover:text-green-700">
                                  View Recipe Details
                                </summary>
                                <div className="mt-3 space-y-3">
                                  <div>
                                    <h5 className="font-medium mb-1">Ingredients:</h5>
                                    <ul className="list-disc list-inside space-y-1">
                                      {meal.recipe.ingredients.map((ingredient, idx) => (
                                        <li key={idx}>
                                          {ingredient.quantity * meal.quantity} {ingredient.unit} {ingredient.name}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  
                                  <div>
                                    <h5 className="font-medium mb-1">Instructions:</h5>
                                    <ol className="list-decimal list-inside space-y-1">
                                      {meal.recipe.instructions.map((instruction, idx) => (
                                        <li key={idx}>{instruction}</li>
                                      ))}
                                    </ol>
                                  </div>
                                </div>
                              </details>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
