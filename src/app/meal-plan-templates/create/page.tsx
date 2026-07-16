'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { MEAL_TYPE_KEYS } from '@/lib/mealConfig';
import {
  Plus,
  Trash2,
  ChefHat,
  Target,
  Calendar,
  AlertCircle,
  Save,
  ArrowLeft,
  Search,
  Filter,
  Star,
  Clock,
  Users,
  Utensils,
  Apple,
  Zap,
  Heart,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { UserRole } from '@/types';
import { useMealPlanAutoSave } from '@/hooks/useAutoSave';
import { useDurationPresets } from '@/hooks/useDurationPresets';
import { toast } from 'sonner';

interface Recipe {
  _id: string;
  name: string;
  description: string;
  category: string;
  cuisine: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  difficulty: string;
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar: number;
    sodium: number;
  };
  tags: string[];
  dietaryRestrictions: string[];
  allergens: string[];
  image: string;
  rating: {
    average: number;
    count: number;
  };
  isPublic: boolean;
  isPremium: boolean;
}

interface MealItem {
  type: 'recipe' | 'custom';
  recipeId?: string;
  recipe?: Recipe;
  customMeal?: {
    name: string;
    description: string;
    ingredients: string[];
    instructions: string[];
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar: number;
    sodium: number;
    servings: number;
    prepTime: number;
    cookTime: number;
  };
  servings: number;
  alternatives?: MealItem[];
  notes?: string;
}

interface DailyMeal {
  day: number;
  breakfast: MealItem[];
  morningSnack?: MealItem[];
  lunch: MealItem[];
  afternoonSnack?: MealItem[];
  dinner: MealItem[];
  eveningSnack?: MealItem[];
  totalNutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar: number;
    sodium: number;
  };
  notes?: string;
}

interface MealPlanTemplate {
  name: string;
  description: string;
  category: string;
  duration: number;
  targetCalories: { min: number; max: number };
  targetMacros: {
    protein: { min: number; max: number };
    carbs: { min: number; max: number };
    fat: { min: number; max: number };
  };
  dietaryRestrictions: string[];
  tags: string[];
  meals: DailyMeal[];
  isPublic: boolean;
  isPremium: boolean;
  difficulty: string;
  prepTime: {
    daily: number;
    weekly: number;
  };
  targetAudience: {
    ageGroup: string[];
    activityLevel: string[];
    healthConditions: string[];
    goals: string[];
  };
}

const categories = [
  { value: 'weight-loss', label: 'Weight Loss', icon: '⚖️' },
  { value: 'weight-gain', label: 'Weight Gain', icon: '💪' },
  { value: 'maintenance', label: 'Maintenance', icon: '⚖️' },
  { value: 'muscle-gain', label: 'Muscle Gain', icon: '🏋️' },
  { value: 'diabetes', label: 'Diabetes Friendly', icon: '🩺' },
  { value: 'heart-healthy', label: 'Heart Healthy', icon: '❤️' },
  { value: 'keto', label: 'Keto', icon: '🥑' },
  { value: 'vegan', label: 'Vegan', icon: '🌱' },
  { value: 'custom', label: 'Custom', icon: '⚙️' }
];

const dietaryRestrictions = [
  'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free',
  'egg-free', 'soy-free', 'keto', 'paleo', 'low-carb', 'low-fat', 'diabetic-friendly'
];

const difficultyLevels = [
  { value: 'beginner', label: 'Beginner', description: 'Simple recipes, minimal prep' },
  { value: 'intermediate', label: 'Intermediate', description: 'Moderate complexity' },
  { value: 'advanced', label: 'Advanced', description: 'Complex recipes, extensive prep' }
];

const ageGroups = ['18-25', '26-35', '36-45', '46-55', '56-65', '65+'];
const activityLevels = ['sedentary', 'lightly-active', 'moderately-active', 'very-active', 'extremely-active'];
const healthConditions = ['diabetes', 'hypertension', 'heart-disease', 'obesity', 'pcos', 'thyroid', 'none'];
const goals = ['weight-loss', 'weight-gain', 'muscle-gain', 'maintenance', 'improved-health', 'better-energy'];

const parseIntegerInput = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default function CreateMealPlanTemplatePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<any>({});
  const [selectedDay, setSelectedDay] = useState(1);
  const [draftRestored, setDraftRestored] = useState(false);

  // Fetch dynamic duration presets
  const { presets: durationPresets } = useDurationPresets();

  // Default template state
  const defaultTemplate: MealPlanTemplate = {
    name: '',
    description: '',
    category: '',
    duration: 0,
    targetCalories: { min: 1200, max: 2500 },
    targetMacros: {
      protein: { min: 50, max: 150 },
      carbs: { min: 100, max: 300 },
      fat: { min: 30, max: 100 }
    },
    dietaryRestrictions: [],
    tags: [],
    meals: [],
    isPublic: false,
    isPremium: false,
    difficulty: 'intermediate',
    prepTime: {
      daily: 30,
      weekly: 210
    },
    targetAudience: {
      ageGroup: [],
      activityLevel: [],
      healthConditions: [],
      goals: []
    }
  };

  // Form state
  const [template, setTemplate] = useState<MealPlanTemplate>(defaultTemplate);

  // Auto-save hook for meal plan templates
  const {
    isSaving,
    lastSaved,
    hasDraft,
    clearDraft,
    saveDraft,
    restoreDraft
  } = useMealPlanAutoSave('new-template', template, {
    debounceMs: 2000,
    enabled: !!session?.user?.id,
    onSaveSuccess: () => {
      // Optional: show subtle indicator
    },
    onSaveError: (error) => {
      console.error('Auto-save error:', error);
    }
  });

  // Restore draft on mount
  useEffect(() => {
    if (!draftRestored && session?.user?.id) {
      const restored = restoreDraft();
      if (restored && Object.keys(restored).length > 0) {
        // Validate the restored data
        if (restored.name !== undefined) {
          setTemplate(prev => ({
            ...prev,
            ...restored,
          }));
          toast.success('Draft restored', {
            description: 'Your previous work has been restored.',
            duration: 3000
          });
        }
      }
      setDraftRestored(true);
    }
  }, [session?.user?.id, draftRestored, restoreDraft]);

  // Handle clear draft
  const handleClearDraft = useCallback(() => {
    clearDraft();
    setTemplate(defaultTemplate);
    setCurrentStep(1);
    setSelectedDay(1);
    toast.success('Draft cleared', { description: 'Starting fresh.' });
  }, [clearDraft]);

  // Check authentication and role
  useEffect(() => {
    if (!session) {
      router.push('/auth/signin');
      return;
    }

    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.DIETITIAN) {
      router.push('/dashboard');
      return;
    }
  }, [session, router]);

  // Fetch recipes for meal planning
  useEffect(() => {
    fetchRecipes();
  }, [searchQuery, selectedFilters]);

  const fetchRecipes = async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedFilters.category) params.append('category', selectedFilters.category);
      if (selectedFilters.difficulty) params.append('difficulty', selectedFilters.difficulty);

      const response = await fetch(`/api/recipes?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setRecipes(data.recipes || []);
      }
    } catch (error) {
      console.error('Error fetching recipes:', error);
    }
  };

  // Ensure meals array matches duration
  useEffect(() => {
    setTemplate(prev => {
      const days = prev.duration;
      if (prev.meals.length === days) return prev;
      const meals: DailyMeal[] = Array.from({ length: days }).map((_, idx) => ({
        day: idx + 1,
        breakfast: [],
        lunch: [],
        dinner: [],
        morningSnack: [],
        afternoonSnack: [],
        eveningSnack: [],
        totalNutrition: {
          calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, sodium: 0
        },
        notes: ''
      }));
      return { ...prev, meals };
    });
  }, [template.duration]);

  const recalcDayTotals = (dayIdx: number) => {
    setTemplate(prev => {
      const day = prev.meals[dayIdx];
      const sumFromItems = (items?: MealItem[]) => (items || []).reduce((acc, item) => {
        if (item.type === 'recipe' && item.recipe) {
          const s = item.servings || 1;
          acc.calories += (item.recipe.nutrition.calories || 0) * s;
          acc.protein += (item.recipe.nutrition.protein || 0) * s;
          acc.carbs += (item.recipe.nutrition.carbs || 0) * s;
          acc.fat += (item.recipe.nutrition.fat || 0) * s;
          acc.sugar += (item.recipe.nutrition.sugar || 0) * s;
          acc.sodium += (item.recipe.nutrition.sodium || 0) * s;
        }
        return acc;
      }, { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, sodium: 0 });
      const totals = MEAL_TYPE_KEYS
        .map((k) => sumFromItems((day as any)[k]))
        .reduce((a, b) => ({
          calories: a.calories + b.calories,
          protein: a.protein + b.protein,
          carbs: a.carbs + b.carbs,
          fat: a.fat + b.fat,
          sugar: a.sugar + b.sugar,
          sodium: a.sodium + b.sodium
        }), { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, sodium: 0 });
      const newMeals = [...prev.meals];
      newMeals[dayIdx] = { ...day, totalNutrition: totals };
      return { ...prev, meals: newMeals };
    });
  };

  const addRecipeTo = (dayIdx: number, slot: keyof DailyMeal, recipe: Recipe) => {
    if (!MEAL_TYPE_KEYS.includes(slot as any)) return;
    setTemplate(prev => {
      const day = prev.meals[dayIdx];
      const list = ([...(day as any)[slot]] as MealItem[]);
      list.push({ type: 'recipe', recipeId: recipe._id, recipe, servings: 1 });
      const newMeals = [...prev.meals];
      (newMeals[dayIdx] as any)[slot] = list;
      return { ...prev, meals: newMeals };
    });
    // recalc totals after state update
    setTimeout(() => recalcDayTotals(dayIdx), 0);
  };

  const removeMealItem = (dayIdx: number, slot: keyof DailyMeal, index: number) => {
    setTemplate(prev => {
      const day = prev.meals[dayIdx];
      const list = ([...(day as any)[slot]] as MealItem[]).filter((_, i) => i !== index);
      const newMeals = [...prev.meals];
      (newMeals[dayIdx] as any)[slot] = list;
      return { ...prev, meals: newMeals };
    });
    setTimeout(() => recalcDayTotals(dayIdx), 0);
  };

  const dayMeals = useMemo(() => template.meals[selectedDay - 1], [template.meals, selectedDay]);

  const saveTemplate = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/meal-plan-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template)
      });
      if (res.ok) {
        // Clear draft after successful save
        clearDraft();
        toast.success('Template saved successfully!');
        router.push('/meal-plan-templates?success=created');
      } else {
        const data = await res.json();
        const errorMsg = data.error || 'Failed to save template';
        setError(errorMsg);
        toast.error('Failed to save template', { description: errorMsg });
      }
    } catch (e: any) {
      console.error(e);
      setError('Failed to save template');
      toast.error('Failed to save template', { description: 'Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return <LoadingPage />;
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/meal-plan-templates">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Templates
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Create Meal Plan Template</h1>
              <p className="text-gray-600 mt-1">
                Design a comprehensive meal plan template like DTPS
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Auto-save indicator */}
            {isSaving && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            )}
            {!isSaving && lastSaved && (
              <span className="text-xs text-gray-500">
                Saved {formatTimeIST(lastSaved)}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearDraft}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear draft
            </Button>
          </div>
        </div>

        {/* Progress Steps */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep >= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                    }`}>
                    {step}
                  </div>
                  <div className="ml-3">
                    <p className={`text-sm font-medium ${currentStep >= step ? 'text-blue-600' : 'text-gray-500'
                      }`}>
                      {step === 1 && 'Basic Info'}
                      {step === 2 && 'Nutrition Targets'}
                      {step === 3 && 'Meal Planning'}
                      {step === 4 && 'Review & Publish'}
                    </p>
                  </div>
                  {step < 4 && (
                    <div className={`w-16 h-0.5 ml-4 ${currentStep > step ? 'bg-blue-600' : 'bg-gray-200'
                      }`} />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Error/Success Messages */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Step Content */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <ChefHat className="h-5 w-5" />
                <span>Basic Information</span>
              </CardTitle>
              <CardDescription>
                Set up the basic details for your meal plan template
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Template Name *</Label>
                  <Input
                    id="name"
                    value={template.name}
                    onChange={(e) => setTemplate({ ...template, name: e.target.value })}
                    placeholder="e.g., 7-Day Weight Loss Plan"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select value={template.category} onValueChange={(value) => setTemplate({ ...template, category: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          <span className="flex items-center space-x-2">
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (days) *</Label>
                  <Select value={template.duration.toString()} onValueChange={(value) => setTemplate({ ...template, duration: parseInt(value) })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      {durationPresets.map(preset => (
                        <SelectItem key={preset.days} value={preset.days.toString()}>
                          {preset.days} Days ({preset.label})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="difficulty">Difficulty Level</Label>
                  <Select value={template.difficulty} onValueChange={(value) => setTemplate({ ...template, difficulty: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select difficulty" />
                    </SelectTrigger>
                    <SelectContent>
                      {difficultyLevels.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          <div>
                            <div className="font-medium">{level.label}</div>
                            <div className="text-sm text-gray-500">{level.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={template.description}
                  onChange={(e) => setTemplate({ ...template, description: e.target.value })}
                  placeholder="Describe your meal plan template, its benefits, and target audience..."
                  rows={4}
                />
              </div>

              <div className="space-y-4">
                <Label>Dietary Restrictions</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {dietaryRestrictions.map((restriction) => (
                    <div key={restriction} className="flex items-center space-x-2">
                      <Checkbox
                        id={restriction}
                        checked={template.dietaryRestrictions.includes(restriction)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setTemplate({
                              ...template,
                              dietaryRestrictions: [...template.dietaryRestrictions, restriction]
                            });
                          } else {
                            setTemplate({
                              ...template,
                              dietaryRestrictions: template.dietaryRestrictions.filter(r => r !== restriction)
                            });
                          }
                        }}
                      />
                      <Label htmlFor={restriction} className="text-sm capitalize">
                        {restriction.replace('-', ' ')}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setCurrentStep(2)}>
                  Next: Nutrition Targets
                  <Target className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Target className="h-5 w-5" />
                <span>Nutrition Targets</span>
              </CardTitle>
              <CardDescription>
                Define the nutritional goals for this meal plan template
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Daily Calorie Range</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="minCalories">Minimum Calories</Label>
                      <Input
                        id="minCalories"
                        type="number"
                        value={template.targetCalories.min}
                        onChange={(e) => setTemplate({
                          ...template,
                          targetCalories: { ...template.targetCalories, min: parseIntegerInput(e.target.value, template.targetCalories.min) }
                        })}
                        min="800"
                        max="5000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxCalories">Maximum Calories</Label>
                      <Input
                        id="maxCalories"
                        type="number"
                        value={template.targetCalories.max}
                        onChange={(e) => setTemplate({
                          ...template,
                          targetCalories: { ...template.targetCalories, max: parseIntegerInput(e.target.value, template.targetCalories.max) }
                        })}
                        min="800"
                        max="5000"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Macro Targets (grams)</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Protein Min</Label>
                        <Input
                          type="number"
                          value={template.targetMacros.protein.min}
                          onChange={(e) => setTemplate({
                            ...template,
                            targetMacros: {
                              ...template.targetMacros,
                              protein: { ...template.targetMacros.protein, min: parseIntegerInput(e.target.value, template.targetMacros.protein.min) }
                            }
                          })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Protein Max</Label>
                        <Input
                          type="number"
                          value={template.targetMacros.protein.max}
                          onChange={(e) => setTemplate({
                            ...template,
                            targetMacros: {
                              ...template.targetMacros,
                              protein: { ...template.targetMacros.protein, max: parseIntegerInput(e.target.value, template.targetMacros.protein.max) }
                            }
                          })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Carbs Min</Label>
                        <Input
                          type="number"
                          value={template.targetMacros.carbs.min}
                          onChange={(e) => setTemplate({
                            ...template,
                            targetMacros: {
                              ...template.targetMacros,
                              carbs: { ...template.targetMacros.carbs, min: parseIntegerInput(e.target.value, template.targetMacros.carbs.min) }
                            }
                          })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Carbs Max</Label>
                        <Input
                          type="number"
                          value={template.targetMacros.carbs.max}
                          onChange={(e) => setTemplate({
                            ...template,
                            targetMacros: {
                              ...template.targetMacros,
                              carbs: { ...template.targetMacros.carbs, max: parseIntegerInput(e.target.value, template.targetMacros.carbs.max) }
                            }
                          })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Fat Min</Label>
                        <Input
                          type="number"
                          value={template.targetMacros.fat.min}
                          onChange={(e) => setTemplate({
                            ...template,
                            targetMacros: {
                              ...template.targetMacros,
                              fat: { ...template.targetMacros.fat, min: parseIntegerInput(e.target.value, template.targetMacros.fat.min) }
                            }
                          })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Fat Max</Label>
                        <Input
                          type="number"
                          value={template.targetMacros.fat.max}
                          onChange={(e) => setTemplate({
                            ...template,
                            targetMacros: {
                              ...template.targetMacros,
                              fat: { ...template.targetMacros.fat, max: parseIntegerInput(e.target.value, template.targetMacros.fat.max) }
                            }
                          })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
                <Button onClick={() => setCurrentStep(3)}>
                  Next: Meal Planning
                  <Calendar className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5" />
                <span>Meal Planning</span>
              </CardTitle>
              <CardDescription>Add recipes to each meal slot for every day</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Day selector and recipe search */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label>Day</Label>
                  <Select value={selectedDay.toString()} onValueChange={(v) => setSelectedDay(parseInt(v))}>
                    <SelectTrigger className="w-32"><SelectValue placeholder="Day" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: template.duration }).map((_, i) => (
                        <SelectItem key={i} value={(i + 1).toString()}>Day {i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="relative flex-1 min-w-55">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search recipes to add..." className="pl-10" />
                </div>
              </div>

              {/* Meal slots */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {([
                  { key: 'breakfast', label: 'Breakfast', icon: '🍳' },
                  { key: 'morningSnack', label: 'Mid Morning', icon: '🥜' },
                  { key: 'lunch', label: 'Lunch', icon: '🍛' },
                  { key: 'afternoonSnack', label: 'Mid Evening', icon: '🍎' },
                  { key: 'dinner', label: 'Dinner', icon: '🍽️' },
                  { key: 'eveningSnack', label: 'Past Dinner', icon: '🍪' }
                ] as { key: keyof DailyMeal; label: string; icon: string; }[]).map(slot => (
                  <div key={slot.key} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-medium">{slot.icon} {slot.label}</div>
                      <div className="text-xs text-gray-500">{(dayMeals && (dayMeals as any)[slot.key]?.length) || 0} items</div>
                    </div>
                    {/* Added items */}
                    <div className="space-y-2">
                      {(dayMeals && (dayMeals as any)[slot.key] || []).map((mi: MealItem, index: number) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 rounded p-2">
                          <div className="text-sm">
                            {mi.type === 'recipe' && mi.recipe ? (
                              <div className="font-medium">{mi.recipe.name}</div>
                            ) : (
                              <div className="font-medium">Custom item</div>
                            )}
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => removeMealItem(selectedDay - 1, slot.key, index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    {/* Quick add from recipes */}
                    <div className="mt-3">
                      <div className="text-xs text-gray-600 mb-1">Add from recipes</div>
                      <div className="max-h-40 overflow-y-auto border rounded">
                        {(recipes || []).slice(0, 8).map(r => (
                          <div key={r._id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                            <div>
                              <div className="text-sm font-medium line-clamp-1">{r.name}</div>
                              <div className="text-xs text-gray-500">{r.nutrition.calories} kcal</div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => addRecipeTo(selectedDay - 1, slot.key, r)}>Add</Button>
                          </div>
                        ))}
                        {recipes.length === 0 && (
                          <div className="text-xs text-gray-500 p-3">No recipes found</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Day totals */}
              {dayMeals && (
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                  <div className="bg-gray-50 rounded p-2 text-center"><div className="font-semibold">{dayMeals.totalNutrition.calories}</div><div className="text-gray-600">Cal</div></div>
                  <div className="bg-gray-50 rounded p-2 text-center"><div className="font-semibold">{dayMeals.totalNutrition.protein}g</div><div className="text-gray-600">Protein</div></div>
                  <div className="bg-gray-50 rounded p-2 text-center"><div className="font-semibold">{dayMeals.totalNutrition.carbs}g</div><div className="text-gray-600">Carbs</div></div>
                  <div className="bg-gray-50 rounded p-2 text-center"><div className="font-semibold">{dayMeals.totalNutrition.fat}g</div><div className="text-gray-600">Fat</div></div>
                  <div className="bg-gray-50 rounded p-2 text-center"><div className="font-semibold">{dayMeals.totalNutrition.sugar}g</div><div className="text-gray-600">Sugar</div></div>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(2)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
                <Button onClick={() => setCurrentStep(4)}>
                  Next: Review & Publish
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Save className="h-5 w-5" />
                <span>Review & Publish</span>
              </CardTitle>
              <CardDescription>Review details and publish your diet template</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-gray-600">Name</div>
                  <div className="font-medium">{template.name || '—'}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-gray-600">Category</div>
                  <div className="font-medium capitalize">{template.category || '—'}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-gray-600">Duration</div>
                  <div className="font-medium">{template.duration} days</div>
                </div>
              </div>
              <div className="text-sm">
                <div className="text-gray-600 mb-1">Dietary Restrictions</div>
                <div className="flex flex-wrap gap-1">
                  {template.dietaryRestrictions.length ? template.dietaryRestrictions.map((r, i) => (
                    <Badge key={i} variant="outline" className="text-xs capitalize">{r.replace('-', ' ')}</Badge>
                  )) : <span className="text-gray-500">None</span>}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox id="isPublic" checked={template.isPublic} onCheckedChange={(c) => setTemplate({ ...template, isPublic: !!c })} />
                  <Label htmlFor="isPublic">Make Public</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="isPremium" checked={template.isPremium} onCheckedChange={(c) => setTemplate({ ...template, isPremium: !!c })} />
                  <Label htmlFor="isPremium">Premium</Label>
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(3)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
                <Button onClick={saveTemplate} disabled={loading || !template.name || !template.category}>
                  {loading ? 'Saving...' : 'Publish Template'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
