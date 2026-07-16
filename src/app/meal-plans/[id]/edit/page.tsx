'use client';

import { useState, useEffect, useMemo, useCallback, use } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { formatTimeIST } from '@/lib/utils/formatDateIST';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  Trash2,
  ArrowLeft,
  Save,
  AlertCircle,
  RefreshCw,
  ChefHat
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useMealPlanAutoSave, type MealPlanFormData } from '@/hooks/useAutoSave';

interface Recipe {
  _id: string;
  name: string;
  description: string;
  calories: number;
  macros: {
    protein: number;
    carbs: number;
    fat: number;
  };
  servings: number;
  category: string;
}

interface MealPlanMeal {
  day: number;
  mealType: string;
  recipe: string | Recipe;
  quantity: number;
}

interface MealPlan {
  _id: string;
  name: string;
  description?: string;
  client: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  startDate: string;
  endDate: string;
  meals: MealPlanMeal[];
  targetCalories?: number;
  targetMacros?: {
    protein: number;
    carbs: number;
    fat: number;
  };
  status: string;
}

export default function EditMealPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();

  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [planName, setPlanName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [targetCalories, setTargetCalories] = useState('');
  const [targetProtein, setTargetProtein] = useState('');
  const [targetCarbs, setTargetCarbs] = useState('');
  const [targetFat, setTargetFat] = useState('');
  const [meals, setMeals] = useState<MealPlanMeal[]>([]);
  const [planStatus, setPlanStatus] = useState('active');

  // Recipe search
  const [recipeSearch, setRecipeSearch] = useState('');
  const [showRecipeSearch, setShowRecipeSearch] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedMealType, setSelectedMealType] = useState('breakfast');
  const [draftRestored, setDraftRestored] = useState(false);

  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];

  // Memoize form data for auto-save
  const formData: MealPlanFormData = useMemo(() => ({
    clientId: mealPlan?.client?._id || '',
    planName,
    description,
    startDate,
    endDate,
    targetCalories,
    targetProtein,
    targetCarbs,
    targetFat,
    meals: meals.map(m => ({
      day: m.day,
      mealType: m.mealType,
      recipe: typeof m.recipe === 'string' ? m.recipe : m.recipe._id,
      quantity: m.quantity
    })),
    notes: '',
  }), [mealPlan?.client?._id, planName, description, startDate, endDate, targetCalories, targetProtein, targetCarbs, targetFat, meals]);

  // Auto-save hook
  const {
    isSaving: isAutoSaving,
    lastSaved,
    hasDraft,
    clearDraft,
    restoreDraft
  } = useMealPlanAutoSave(`edit-meal-plan-${id}`, formData, {
    debounceMs: 2000,
    enabled: !!session?.user?.id && !!mealPlan,
  });

  // Fetch meal plan and recipes
  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch meal plan
        const mealPlanRes = await fetch(`/api/meals/${id}`);
        if (!mealPlanRes.ok) {
          const data = await mealPlanRes.json();
          throw new Error(data.error || 'Failed to fetch meal plan');
        }
        const mealPlanData = await mealPlanRes.json();
        setMealPlan(mealPlanData);

        // Set form values
        setPlanName(mealPlanData.name || '');
        setDescription(mealPlanData.description || '');
        setStartDate(mealPlanData.startDate ? new Date(mealPlanData.startDate).toISOString().split('T')[0] : '');
        setEndDate(mealPlanData.endDate ? new Date(mealPlanData.endDate).toISOString().split('T')[0] : '');
        setTargetCalories(mealPlanData.targetCalories?.toString() || '');
        setTargetProtein(mealPlanData.targetMacros?.protein?.toString() || '');
        setTargetCarbs(mealPlanData.targetMacros?.carbs?.toString() || '');
        setTargetFat(mealPlanData.targetMacros?.fat?.toString() || '');
        setMeals(mealPlanData.meals || []);
        setPlanStatus(mealPlanData.status || 'active');

        // Fetch recipes
        const recipesRes = await fetch('/api/recipes');
        if (recipesRes.ok) {
          const recipesData = await recipesRes.json();
          setRecipes(recipesData.recipes || []);
        }

      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message || 'Failed to load meal plan');
        toast.error('Failed to load meal plan', { description: err.message });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, session, status, router]);

  // Restore draft on mount (after data loads)
  useEffect(() => {
    if (!draftRestored && mealPlan && session?.user?.id) {
      const restored = restoreDraft();
      if (restored && restored.planName) {
        setPlanName(restored.planName);
        setDescription(restored.description || '');
        setStartDate(restored.startDate || '');
        setEndDate(restored.endDate || '');
        setTargetCalories(restored.targetCalories || '');
        setTargetProtein(restored.targetProtein || '');
        setTargetCarbs(restored.targetCarbs || '');
        setTargetFat(restored.targetFat || '');
        setMeals(restored.meals?.length ? restored.meals as any : mealPlan.meals);

        toast.success('Draft restored', {
          description: 'Your unsaved changes have been restored.',
          duration: 4000
        });
      }
      setDraftRestored(true);
    }
  }, [mealPlan, session?.user?.id, draftRestored, restoreDraft]);

  // Handle clear draft
  const handleClearDraft = useCallback(() => {
    if (!mealPlan) return;
    clearDraft();
    // Reset to original values
    setPlanName(mealPlan.name || '');
    setDescription(mealPlan.description || '');
    setStartDate(mealPlan.startDate ? new Date(mealPlan.startDate).toISOString().split('T')[0] : '');
    setEndDate(mealPlan.endDate ? new Date(mealPlan.endDate).toISOString().split('T')[0] : '');
    setTargetCalories(mealPlan.targetCalories?.toString() || '');
    setTargetProtein(mealPlan.targetMacros?.protein?.toString() || '');
    setTargetCarbs(mealPlan.targetMacros?.carbs?.toString() || '');
    setTargetFat(mealPlan.targetMacros?.fat?.toString() || '');
    setMeals(mealPlan.meals || []);
    setError('');
    toast.success('Changes discarded', { description: 'Reverted to saved version.' });
  }, [clearDraft, mealPlan]);

  const addMealToDay = (recipeId: string) => {
    const newMeal: MealPlanMeal = {
      day: selectedDay,
      mealType: selectedMealType,
      recipe: recipeId,
      quantity: 1
    };
    setMeals([...meals, newMeal]);
    setShowRecipeSearch(false);
    setRecipeSearch('');
  };

  const removeMeal = (index: number) => {
    setMeals(meals.filter((_, i) => i !== index));
  };

  const updateMealQuantity = (index: number, quantity: number) => {
    const updatedMeals = [...meals];
    updatedMeals[index].quantity = quantity;
    setMeals(updatedMeals);
  };

  const getMealsForDay = (day: number) => {
    return meals.filter(meal => meal.day === day);
  };

  const getRecipeById = (recipeId: string) => {
    return recipes.find(recipe => recipe._id === recipeId);
  };

  const getRecipeFromMeal = (meal: MealPlanMeal): Recipe | undefined => {
    if (typeof meal.recipe === 'string') {
      return getRecipeById(meal.recipe);
    }
    return meal.recipe;
  };

  const filteredRecipes = recipes.filter(recipe =>
    recipe.name.toLowerCase().includes(recipeSearch.toLowerCase()) ||
    recipe.description?.toLowerCase().includes(recipeSearch.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!planName || !startDate || !endDate) {
      setError('Please fill in all required fields');
      toast.error('Missing required fields');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/meals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: planName,
          description,
          startDate,
          endDate,
          meals: meals.map(m => ({
            day: m.day,
            mealType: m.mealType,
            recipe: typeof m.recipe === 'string' ? m.recipe : m.recipe._id,
            quantity: m.quantity
          })),
          targetCalories: targetCalories ? parseInt(targetCalories) : undefined,
          targetMacros: {
            protein: targetProtein ? parseInt(targetProtein) : 0,
            carbs: targetCarbs ? parseInt(targetCarbs) : 0,
            fat: targetFat ? parseInt(targetFat) : 0
          },
          status: planStatus
        })
      });

      if (response.ok) {
        clearDraft();
        toast.success('Meal plan updated successfully!');
        router.push('/meal-plans?success=updated');
      } else {
        const data = await response.json();
        const errorMsg = data.error || 'Failed to update meal plan';
        setError(errorMsg);
        toast.error('Failed to update meal plan', { description: errorMsg });
      }
    } catch (err) {
      console.error('Error updating meal plan:', err);
      setError('Failed to update meal plan');
      toast.error('Network error', { description: 'Please check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return <LoadingPage />;
  }

  if (error && !mealPlan) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button className="mt-4" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/meal-plans">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Edit Meal Plan</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Editing plan for {mealPlan?.client?.firstName} {mealPlan?.client?.lastName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-save indicator */}
            {isAutoSaving && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Saving draft...
              </span>
            )}
            {!isAutoSaving && lastSaved && (
              <span className="text-xs text-green-600 dark:text-green-400">
                Draft saved {formatTimeIST(lastSaved)}
              </span>
            )}
            {hasDraft && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearDraft}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Discard Changes
              </Button>
            )}
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Form */}
        <Card className="border border-slate-300 dark:border-slate-700 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ChefHat className="h-5 w-5" />
              Meal Plan Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Plan Name <span className="text-red-500">*</span></Label>
                <Input
                  value={planName}
                  onChange={e => setPlanName(e.target.value)}
                  placeholder="e.g., Week 1 - Weight Loss Plan"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={planStatus} onValueChange={setPlanStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Start Date <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                placeholder="Plan goals and approach..."
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Target Calories</Label>
                <Input
                  type="number"
                  value={targetCalories}
                  onChange={e => setTargetCalories(e.target.value)}
                  placeholder="1800"
                />
              </div>
              <div className="space-y-2">
                <Label>Protein (g)</Label>
                <Input
                  type="number"
                  value={targetProtein}
                  onChange={e => setTargetProtein(e.target.value)}
                  placeholder="120"
                />
              </div>
              <div className="space-y-2">
                <Label>Carbs (g)</Label>
                <Input
                  type="number"
                  value={targetCarbs}
                  onChange={e => setTargetCarbs(e.target.value)}
                  placeholder="200"
                />
              </div>
              <div className="space-y-2">
                <Label>Fat (g)</Label>
                <Input
                  type="number"
                  value={targetFat}
                  onChange={e => setTargetFat(e.target.value)}
                  placeholder="60"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Meals Section */}
        <Card className="border border-slate-300 dark:border-slate-700 shadow-sm">
          <CardHeader>
            <CardTitle>Meal Schedule</CardTitle>
            <CardDescription>Add and manage meals for each day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Day selector */}
              <div className="flex items-center gap-2 flex-wrap">
                {[1, 2, 3, 4, 5, 6, 7].map(day => (
                  <Button
                    key={day}
                    variant={selectedDay === day ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedDay(day)}
                  >
                    Day {day}
                  </Button>
                ))}
              </div>

              {/* Meals for selected day */}
              <div className="space-y-4">
                {mealTypes.map(mealType => {
                  const mealsForType = getMealsForDay(selectedDay).filter(m => m.mealType === mealType);
                  return (
                    <div key={mealType} className="p-4 border rounded-lg dark:border-slate-700">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium capitalize">{mealType}</h4>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedMealType(mealType);
                            setShowRecipeSearch(true);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>
                      {mealsForType.length > 0 ? (
                        <div className="space-y-2">
                          {mealsForType.map((meal, idx) => {
                            const recipe = getRecipeFromMeal(meal);
                            const mealIndex = meals.findIndex(m => m === meal);
                            return (
                              <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                <div>
                                  <p className="font-medium">{recipe?.name || 'Unknown Recipe'}</p>
                                  <p className="text-xs text-gray-500">
                                    {recipe?.calories || 0} cal | Qty: {meal.quantity}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={meal.quantity}
                                    onChange={e => updateMealQuantity(mealIndex, parseInt(e.target.value) || 1)}
                                    className="w-16 h-8"
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => removeMeal(mealIndex)}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No meals added</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Recipe search modal */}
              {showRecipeSearch && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-auto">
                    <h3 className="text-lg font-semibold mb-4">Add Recipe to {selectedMealType}</h3>
                    <Input
                      placeholder="Search recipes..."
                      value={recipeSearch}
                      onChange={e => setRecipeSearch(e.target.value)}
                      className="mb-4"
                    />
                    <div className="space-y-2 max-h-60 overflow-auto">
                      {filteredRecipes.map(recipe => (
                        <div
                          key={recipe._id}
                          className="p-3 border rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700"
                          onClick={() => addMealToDay(recipe._id)}
                        >
                          <p className="font-medium">{recipe.name}</p>
                          <p className="text-xs text-gray-500">
                            {recipe.calories} cal | P: {(recipe.macros?.protein || 0).toFixed(2)}g | C: {(recipe.macros?.carbs || 0).toFixed(2)}g | F: {(recipe.macros?.fat || 0).toFixed(2)}g
                          </p>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      className="mt-4 w-full"
                      onClick={() => {
                        setShowRecipeSearch(false);
                        setRecipeSearch('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
