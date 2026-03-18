'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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
import { DEFAULT_MEAL_TYPES_LIST, DIETARY_RESTRICTIONS } from '@/lib/mealConfig';
import { Checkbox } from '@/components/ui/checkbox';
import { ChefHat, Target, Calendar, AlertCircle, ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DietPlanDashboard } from '@/components/dietplandashboard/DietPlanDashboard';
import { MEAL_TYPE_KEYS } from '@/lib/mealConfig';
import Link from 'next/link';
import { UserRole } from '@/types';
import { useDietTemplateAutoSave } from '@/hooks/useAutoSave';
import { toast } from 'sonner';

// ------------------ INTERFACES ------------------

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
  rating: { average: number; count: number };
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
  prepTime: { daily: number; weekly: number };
  targetAudience: {
    ageGroup: string[];
    activityLevel: string[];
    healthConditions: string[];
    goals: string[];
  };
}

// ---------- CONSTANTS ----------------

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

const difficultyLevels = [
  { value: 'beginner', label: 'Beginner', description: 'Simple recipes, minimal prep' },
  { value: 'intermediate', label: 'Intermediate', description: 'Moderate complexity' },
  { value: 'advanced', label: 'Advanced', description: 'Complex recipes, extensive prep' }
];

// Normalize dietary restrictions for consistent matching
const normalizeRestriction = (restriction: string): string => {
  return restriction.trim().toLowerCase();
};

// Normalize array of restrictions and match against canonical list
const normalizeRestrictionsArray = (restrictions: string[] | undefined): string[] => {
  if (!Array.isArray(restrictions)) return [];

  return restrictions
    .map(r => {
      const normalized = normalizeRestriction(r);
      // Find matching restriction from canonical list (case-insensitive)
      const match = DIETARY_RESTRICTIONS.find(
        canonical => normalizeRestriction(canonical) === normalized
      );
      return match || r; // Return canonical form or original if no match
    })
    .filter(Boolean);
};

// ------------------- MAIN COMPONENT ------------------

export default function CreateDietTemplatePage() {
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

  // Template loading states
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Default template state - ensure dietaryRestrictions is always an array
  const defaultTemplate: MealPlanTemplate = {
    name: '', description: '', category: '', duration: 7,
    targetCalories: { min: 1200, max: 2500 },
    targetMacros: { protein: { min: 50, max: 150 }, carbs: { min: 100, max: 300 }, fat: { min: 30, max: 100 } },
    dietaryRestrictions: [] as string[], tags: [], meals: [], isPublic: false, isPremium: false,
    difficulty: 'intermediate', prepTime: { daily: 30, weekly: 210 },
    targetAudience: { ageGroup: [], activityLevel: [], healthConditions: [], goals: [] }
  };

  // Main template state
  const [template, setTemplate] = useState<MealPlanTemplate>(defaultTemplate);

  // Store weekPlan and mealTypes data from DietPlanDashboard
  const [weekPlanData, setWeekPlanData] = useState<any[]>([]);
  const [mealTypesData, setMealTypesData] = useState<{ name: string; time: string }[]>(DEFAULT_MEAL_TYPES_LIST);

  // Combined draft data for auto-save (includes all state that should be persisted)
  const draftData = useMemo(() => ({
    template,
    weekPlanData,
    mealTypesData,
    currentStep,
  }), [template, weekPlanData, mealTypesData, currentStep]);

  // Auto-save hook for diet templates
  const {
    isSaving,
    lastSaved,
    hasDraft,
    clearDraft,
    saveDraft,
    restoreDraft
  } = useDietTemplateAutoSave('new-diet-template', draftData, {
    debounceMs: 2000,
    enabled: !!session?.user?.id,
    onSaveSuccess: () => { },
    onSaveError: (error) => {
      console.error('Auto-save error:', error);
    }
  });

  // Restore draft on mount
  useEffect(() => {
    if (!draftRestored && session?.user?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const restored: any = restoreDraft();
      if (restored && typeof restored === 'object' && Object.keys(restored).length > 0) {
        // Handle new combined draft format
        if ('template' in restored && restored.template) {
          // New format: { template, weekPlanData, mealTypesData, currentStep }
          setTemplate(prev => ({
            ...prev,
            ...restored.template,
            dietaryRestrictions: normalizeRestrictionsArray(restored.template?.dietaryRestrictions)
          }));
          if (Array.isArray(restored.weekPlanData) && restored.weekPlanData.length > 0) {
            setWeekPlanData(restored.weekPlanData);
          }
          if (Array.isArray(restored.mealTypesData) && restored.mealTypesData.length > 0) {
            setMealTypesData(restored.mealTypesData);
          }
          if (typeof restored.currentStep === 'number' && restored.currentStep >= 1 && restored.currentStep <= 3) {
            setCurrentStep(restored.currentStep);
          }
          toast.success('Draft restored', {
            description: 'Your previous work has been restored. Draft expires in 24 hours.',
            duration: 4000
          });
        } else if ('name' in restored && restored.name !== undefined) {
          // Legacy format: direct template object (old drafts)
          setTemplate(prev => ({
            ...prev,
            ...restored,
            dietaryRestrictions: normalizeRestrictionsArray(restored.dietaryRestrictions)
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
    setWeekPlanData([]);
    setMealTypesData(DEFAULT_MEAL_TYPES_LIST);
    toast.success('Draft cleared', { description: 'Starting fresh.' });
  }, [clearDraft]);

  // ----------- AUTO REDIRECT FOR ROLE ---------
  useEffect(() => {
    if (!session) return;
    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.DIETITIAN) {
      router.push('/dashboard');
    }
  }, [session, router]);



  // ----------- AUTO-REFRESH RECIPES ----------
  useEffect(() => { fetchRecipes(); }, [searchQuery, selectedFilters]);

  // ----------- FETCH DIET TEMPLATES ----------
  const fetchDietTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const res = await fetch('/api/diet-templates?isActive=true');
      if (res.ok) {
        const data = await res.json();
        setAvailableTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Error fetching diet templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };



  // ----------- LOAD TEMPLATE DATA ----------
  const loadTemplateData = (tmpl: any) => {
    if (!tmpl) return;

    // Load basic info
    setTemplate(prev => ({
      ...prev,
      name: tmpl.name || prev.name,
      description: tmpl.description || '',
      category: tmpl.category || prev.category,
      duration: Math.min(15, tmpl.duration || 7),
      targetCalories: tmpl.targetCalories || prev.targetCalories,
      targetMacros: tmpl.targetMacros || prev.targetMacros,
      dietaryRestrictions: tmpl.dietaryRestrictions || [],
      difficulty: tmpl.difficulty || 'intermediate',
      targetAudience: tmpl.targetAudience || prev.targetAudience,
    }));

    // Load meal types if available
    if (tmpl.mealTypes && tmpl.mealTypes.length > 0) {
      setMealTypesData(tmpl.mealTypes);
    }

    // Load meals if available
    if (tmpl.meals && tmpl.meals.length > 0) {
      setWeekPlanData(tmpl.meals);
    }

    setSelectedTemplateId(tmpl._id);
    setShowTemplateDialog(false);
    setSuccess(`Template "${tmpl.name}" loaded successfully!`);
    setTimeout(() => setSuccess(''), 3000);
  };

  // ----------- FETCH RECIPES -------------
  const fetchRecipes = async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      let normalizedMeals = template.meals;
      if (!Array.isArray(normalizedMeals) || normalizedMeals.length !== template.duration) {
        normalizedMeals = Array.from({ length: template.duration }).map((_, i) => ({
          day: i + 1,
          breakfast: [],
          morningSnack: [],
          lunch: [],
          afternoonSnack: [],
          dinner: [],
          eveningSnack: [],
          totalNutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, sodium: 0 },
          notes: ''
        }));
      }
      const submitPayload = { ...template, meals: normalizedMeals, templateType: 'diet' };
      if (selectedFilters.difficulty) params.append('difficulty', selectedFilters.difficulty);
      const res = await fetch(`/api/recipes?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecipes(data.recipes || []);
      }
    } catch (e) { console.error(e); }
  };

  // --------- DURATION CHANGE RESET MEALS ---------
  useEffect(() => {
    setTemplate(prev => {
      const days = prev.duration;
      if (prev.meals.length === days) return prev;
      const meals: DailyMeal[] = Array.from({ length: days }).map((_, i) => ({
        day: i + 1, breakfast: [], lunch: [], dinner: [], morningSnack: [], afternoonSnack: [], eveningSnack: [],
        totalNutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, sodium: 0 }, notes: ''
      }));
      return { ...prev, meals };
    });
  }, [template.duration]);

  // --------- NUTRITION RE-CALCULATION ---------
  const recalcDayTotals = (dayIdx: number) => {
    setTemplate(prev => {
      const day = prev.meals[dayIdx];
      const sum = (items?: MealItem[]) => (items || []).reduce((acc, item) => {
        if (item.type === 'recipe' && item.recipe) {
          const s = item.servings || 1;
          acc.calories += item.recipe.nutrition.calories * s;
          acc.protein += item.recipe.nutrition.protein * s;
          acc.carbs += item.recipe.nutrition.carbs * s;
          acc.fat += item.recipe.nutrition.fat * s;
          acc.sugar += item.recipe.nutrition.sugar * s;
          acc.sodium += item.recipe.nutrition.sodium * s;
        }
        return acc;
      }, { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, sodium: 0 });
      const total = MEAL_TYPE_KEYS
        .map(k => sum((day as any)[k]))
        .reduce((a, b) => ({ calories: a.calories + b.calories, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, sugar: a.sugar + b.sugar, sodium: a.sodium + b.sodium }), { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, sodium: 0 });
      const meals = [...prev.meals];
      meals[dayIdx] = { ...day, totalNutrition: total };
      return { ...prev, meals };
    });
  };

  // ----------------- ADD/REMOVE MEALS ------------
  const addRecipeTo = (dayIdx: number, slot: keyof DailyMeal, recipe: Recipe) => {
    setTemplate(prev => {
      const meals = [...prev.meals];
      const arr = ([...(meals[dayIdx] as any)[slot]] as MealItem[]);
      arr.push({ type: 'recipe', recipeId: recipe._id, recipe, servings: 1 });
      (meals[dayIdx] as any)[slot] = arr;
      return { ...prev, meals };
    });
    setTimeout(() => recalcDayTotals(dayIdx), 0);
  };

  const removeMealItem = (dayIdx: number, slot: keyof DailyMeal, index: number) => {
    setTemplate(prev => {
      const meals = [...prev.meals];
      const arr = ([...(meals[dayIdx] as any)[slot]] as MealItem[]).filter((_, i) => i !== index);
      (meals[dayIdx] as any)[slot] = arr;
      return { ...prev, meals };
    });
    setTimeout(() => recalcDayTotals(dayIdx), 0);
  };

  const dayMeals = useMemo(() => template.meals[selectedDay - 1], [template.meals, selectedDay]);

  // -------------- SAVE/PUBLISH TEMPLATE -------------
  const saveTemplate = async (weekPlan?: any[], mealTypes?: { name: string; time: string }[]) => {
    try {
      setLoading(true); setError('');

      // Validate required fields
      if (!template.name?.trim()) {
        setError('Template name is required');
        setLoading(false);
        return;
      }
      if (!template.category) {
        setError('Category is required');
        setLoading(false);
        return;
      }

      const mealsToSave = weekPlan || weekPlanData;
      const mealTypesToSave = mealTypes || mealTypesData;
      const submitPayload = {
        ...template,
        meals: mealsToSave,
        mealTypes: mealTypesToSave,
        // Ensure defaults
        targetCalories: template.targetCalories || { min: 1200, max: 2500 },
        targetMacros: template.targetMacros || {
          protein: { min: 50, max: 150 },
          carbs: { min: 100, max: 300 },
          fat: { min: 30, max: 100 }
        }
      };
      // Remove templateType as it's not needed for diet templates (separate collection)
      delete (submitPayload as any).templateType;


      const res = await fetch('/api/diet-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitPayload) });
      if (res.ok) {
        // Clear draft and localStorage after successful save
        clearDraft();
        try {
          localStorage.removeItem(`dietPlan_week_${template.duration}`);
        } catch { }
        toast.success('Diet template saved successfully!');
        router.push('/meal-plan-templates?success=created&tab=diet');
      } else {
        let errMsg = 'Failed to save template';
        try {
          const data = await res.json();
          console.error('API error response:', data);
          if (data?.error) errMsg = data.error;
          if (data?.details && Array.isArray(data.details) && data.details.length) {
            errMsg = `${data.error || 'Validation failed'}: ${data.details[0].message || data.details[0].path?.join('.')}`;
          }
        } catch { /* ignore parse */ }
        setError(errMsg);
        toast.error('Failed to save template', { description: errMsg });
      }
    } catch (err) {
      console.error('Save error:', err);
      setError('Failed to save template');
      toast.error('Failed to save template', { description: 'Please try again.' });
    } finally { setLoading(false); }
  };

  if (!session) return <LoadingPage />;

  // ------------------ RENDER -----------------------

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/meal-plan-templates">
                <ArrowLeft className="h-4 w-4 mr-2" />Back
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Create Diet Template</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">Multi-step diet template builder</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {/* Auto-save indicator */}
            {isSaving && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            )}
            {!isSaving && lastSaved && (
              <span className="text-xs text-gray-500">
                Saved {new Date(lastSaved).toLocaleTimeString()}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleClearDraft}>
              <Trash2 className="h-4 w-4 mr-1" />
              Clear Draft
            </Button>
          </div>
        </div>
        {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}



        {/* Steps indicator (3 steps) */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              {[1, 2, 3].map(step => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep >= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{step}</div>
                  <div className="ml-2 text-xs font-medium {currentStep>=step?'text-blue-600':'text-gray-500'}">
                    {step === 1 && 'Basic'}{step === 2 && 'Targets'}{step === 3 && 'Diet planner'}
                  </div>
                  {step < 3 && <div className={`w-12 h-0.5 ml-2 ${currentStep > step ? 'bg-blue-600' : 'bg-gray-200'}`}></div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Step 1: Basic Info */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ChefHat className="h-5 w-5" />Basic Info</CardTitle>
              <CardDescription>Template basics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2"><Label>Name *</Label><Input value={template.name} onChange={e => setTemplate({ ...template, name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Category *</Label><Select value={template.category} onValueChange={v => setTemplate({ ...template, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select></div>
                <div className="space-y-2"><Label>Duration *</Label>
                  <Input
                    type="number"
                    min={1}
                    value={template.duration}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 1;
                      setTemplate({ ...template, duration: Math.max(1, val) });
                    }}
                    placeholder="Enter days"
                  /></div>
                <div className="space-y-2"><Label>Difficulty</Label><Select value={template.difficulty} onValueChange={v => setTemplate({ ...template, difficulty: v })}>
                  <SelectTrigger><SelectValue placeholder="Difficulty" /></SelectTrigger>
                  <SelectContent>{difficultyLevels.map(dl => <SelectItem key={dl.value} value={dl.value}>{dl.label}</SelectItem>)}</SelectContent>
                </Select></div>
              </div>
              <div className="space-y-2"><Label>Description</Label>
                <Textarea rows={3} value={template.description} onChange={e => setTemplate({ ...template, description: e.target.value })} />
              </div>
              <div className="space-y-2"><Label>Dietary Restrictions</Label>
                <div className="flex flex-wrap gap-2">{DIETARY_RESTRICTIONS.map(r => {
                  const sel = Array.isArray(template.dietaryRestrictions) && template.dietaryRestrictions.includes(r);
                  return (
                    <Button
                      key={r}
                      type="button"
                      variant={sel ? 'default' : 'outline'}
                      size="sm"
                      className={`text-xs capitalize ${sel
                        ? 'bg-yellow-400 text-black hover:bg-yellow-500 border-yellow-500'
                        : 'hover:bg-gray-100'
                        }`}
                      onClick={() => setTemplate({ ...template, dietaryRestrictions: sel ? (template.dietaryRestrictions || []).filter(x => x !== r) : [...(template.dietaryRestrictions || []), r] })}
                    >
                      {r.replace('-', ' ')}
                    </Button>
                  );
                })}</div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    if (!template.name.trim() || !template.category.trim()) {
                      setError('Name and category are required');
                      return;
                    }
                    setError('');
                    setCurrentStep(2);
                  }}
                >
                  Next <Target className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Nutrition Targets */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" />Nutrition Targets</CardTitle>
              <CardDescription>Define calorie & macros</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-start mb-2">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />Back
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2"><Label>Calories Min</Label><Input type="number" value={template.targetCalories.min} onChange={e => setTemplate({ ...template, targetCalories: { ...template.targetCalories, min: parseInt(e.target.value) } })} /></div>
                <div className="space-y-2"><Label>Calories Max</Label><Input type="number" value={template.targetCalories.max} onChange={e => setTemplate({ ...template, targetCalories: { ...template.targetCalories, max: parseInt(e.target.value) } })} /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2"><Label>Protein Min</Label><Input type="number" value={template.targetMacros.protein.min} onChange={e => setTemplate({ ...template, targetMacros: { ...template.targetMacros, protein: { ...template.targetMacros.protein, min: parseInt(e.target.value) } } })} /></div>
                <div className="space-y-2"><Label>Carbs Min</Label><Input type="number" value={template.targetMacros.carbs.min} onChange={e => setTemplate({ ...template, targetMacros: { ...template.targetMacros, carbs: { ...template.targetMacros.carbs, min: parseInt(e.target.value) } } })} /></div>
                <div className="space-y-2"><Label>Fat Min</Label><Input type="number" value={template.targetMacros.fat.min} onChange={e => setTemplate({ ...template, targetMacros: { ...template.targetMacros, fat: { ...template.targetMacros.fat, min: parseInt(e.target.value) } } })} /></div>
                <div className="space-y-2"><Label>Protein Max</Label><Input type="number" value={template.targetMacros.protein.max} onChange={e => setTemplate({ ...template, targetMacros: { ...template.targetMacros, protein: { ...template.targetMacros.protein, max: parseInt(e.target.value) } } })} /></div>
                <div className="space-y-2"><Label>Carbs Max</Label><Input type="number" value={template.targetMacros.carbs.max} onChange={e => setTemplate({ ...template, targetMacros: { ...template.targetMacros, carbs: { ...template.targetMacros.carbs, max: parseInt(e.target.value) } } })} /></div>
                <div className="space-y-2"><Label>Fat Max</Label><Input type="number" value={template.targetMacros.fat.max} onChange={e => setTemplate({ ...template, targetMacros: { ...template.targetMacros, fat: { ...template.targetMacros.fat, max: parseInt(e.target.value) } } })} /></div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setCurrentStep(3)}>
                  Next <Calendar className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Plan Dashboard */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Templates</CardTitle>
              <CardDescription>Use dashboard tools to finalize and publish ({template.duration} days)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <DietPlanDashboard
                key={`diet-dashboard-${template.duration}`}
                clientId="template-create-new"
                clientData={{
                  name: template.name || 'Untitled Template',
                  age: 0,
                  goal: template.description ? template.description.slice(0, 30) : 'Goal not set',
                  planType: template.category || 'Uncategorized'
                }}
                duration={template.duration}
                onDurationChange={(nextDuration) =>
                  setTemplate(prev => ({ ...prev, duration: nextDuration }))
                }
                initialMealTypes={mealTypesData}
                clientDietaryRestrictions={template.dietaryRestrictions?.join(', ') || ''}
                onBack={() => setCurrentStep(2)}
                onSavePlan={(weekPlan, mealTypes) => {
                  setWeekPlanData(weekPlan);
                  if (mealTypes) setMealTypesData(mealTypes);
                  saveTemplate(weekPlan, mealTypes);
                }}
              />
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setCurrentStep(2)} className="mr-2">
                  <ArrowLeft className="h-4 w-4 mr-1" />Back
                </Button>
                <Button disabled={loading || !template.name || !template.category} onClick={() => saveTemplate()}>{loading ? 'Saving...' : 'Publish Template'}</Button>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </DashboardLayout>
  );
}
