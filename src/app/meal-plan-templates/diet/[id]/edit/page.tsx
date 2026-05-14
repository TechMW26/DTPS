'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_MEAL_TYPES_LIST, DIETARY_RESTRICTIONS, MEAL_TYPES, normalizeMealType } from '@/lib/mealConfig';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ChefHat, Target, AlertCircle, Save, Leaf, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { UserRole } from '@/types';
import { toast } from 'sonner';
import { DietPlanDashboard } from '@/components/dietplandashboard/DietPlanDashboard';

const categories = [
  { value: 'weight-loss', label: 'Weight Loss' },
  { value: 'weight-gain', label: 'Weight Gain' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'muscle-gain', label: 'Muscle Gain' },
  { value: 'diabetes', label: 'Diabetes Friendly' },
  { value: 'heart-healthy', label: 'Heart Healthy' },
  { value: 'keto', label: 'Keto' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'custom', label: 'Custom' }
];

const difficultyLevels = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' }
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

const normalizeTemplateTime = (value?: string): string => {
  if (!value || !value.trim()) return '';
  const trimmed = value.trim();

  const twelveHour = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHour) {
    const hours = parseInt(twelveHour[1], 10);
    const minutes = twelveHour[2];
    const period = twelveHour[3].toUpperCase();
    if (hours >= 1 && hours <= 12) {
      return `${String(hours).padStart(2, '0')}:${minutes} ${period}`;
    }
  }

  const twentyFourHour = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (twentyFourHour) {
    const h24 = parseInt(twentyFourHour[1], 10);
    const minutes = twentyFourHour[2];
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${minutes} ${period}`;
  }

  return trimmed;
};

const normalizeTemplateMealName = (rawName?: string): string => {
  const name = String(rawName || '').trim();
  if (!name) return name;
  const mealKey = normalizeMealType(name);
  return mealKey ? MEAL_TYPES[mealKey].label : name;
};

const buildTemplateMealSchedule = (
  meals: any[],
  mealTypes: { name: string; time: string }[]
): { name: string; time: string }[] => {
  const schedule = new Map<string, string>();

  mealTypes.forEach((mealType) => {
    const name = normalizeTemplateMealName(mealType?.name);
    if (!name) return;

    const mealKey = normalizeMealType(name);
    const fallbackTime = mealKey ? MEAL_TYPES[mealKey].time12h : '12:00 PM';
    const time = normalizeTemplateTime(mealType?.time) || fallbackTime;
    if (!schedule.has(name)) {
      schedule.set(name, time);
    }
  });

  meals.forEach((day: any) => {
    const dayMeals = day?.meals && typeof day.meals === 'object' ? day.meals : {};
    Object.entries(dayMeals).forEach(([mealKeyRaw, mealRaw]) => {
      const meal = mealRaw as any;
      const name = normalizeTemplateMealName(meal?.name || mealKeyRaw);
      if (!name) return;

      const normalizedTime = normalizeTemplateTime(meal?.time);
      if (!schedule.has(name)) {
        const key = normalizeMealType(name);
        schedule.set(name, normalizedTime || (key ? MEAL_TYPES[key].time12h : '12:00 PM'));
      } else if (normalizedTime) {
        schedule.set(name, normalizedTime);
      }
    });
  });

  // Sort by canonical sortOrder so columns always render in chronological order
  // (guards against previously-saved templates that stored mealTypes in wrong order)
  const sortedEntries = Array.from(schedule.entries()).sort(([aName, aTime], [bName, bTime]) => {
    const aKey = normalizeMealType(aName);
    const bKey = normalizeMealType(bName);
    const aOrder = aKey ? MEAL_TYPES[aKey].sortOrder : 99;
    const bOrder = bKey ? MEAL_TYPES[bKey].sortOrder : 99;
    // For custom meal types (sortOrder 99), secondary-sort by time
    if (aOrder === bOrder && aOrder === 99) {
      return (aTime || '').localeCompare(bTime || '');
    }
    return aOrder - bOrder;
  });

  return sortedEntries.map(([name, time]) => ({ name, time }));
};

const syncMealsWithSchedule = (
  meals: any[],
  mealTypes: { name: string; time: string }[]
): any[] => {
  const schedule = new Map<string, string>(mealTypes.map((mealType) => [mealType.name, mealType.time]));

  return meals.map((day: any) => {
    const dayMeals = day?.meals && typeof day.meals === 'object' ? day.meals : {};
    const normalizedMeals: Record<string, any> = {};

    Object.entries(dayMeals).forEach(([mealKeyRaw, mealRaw]) => {
      const meal = mealRaw as any;
      const name = normalizeTemplateMealName(meal?.name || mealKeyRaw);
      if (!name) return;

      const normalizedTime =
        schedule.get(name) ||
        normalizeTemplateTime(meal?.time) ||
        (normalizeMealType(name) ? MEAL_TYPES[normalizeMealType(name) as keyof typeof MEAL_TYPES].time12h : '12:00 PM');

      if (!normalizedMeals[name]) {
        normalizedMeals[name] = {
          ...meal,
          name,
          time: normalizedTime
        };
      }
    });

    return {
      ...day,
      meals: normalizedMeals
    };
  });
};

export default function EditDietTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isOwner, setIsOwner] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [duration, setDuration] = useState('7');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [calMin, setCalMin] = useState('1200');
  const [calMax, setCalMax] = useState('2500');
  const [proteinMin, setProteinMin] = useState('50');
  const [proteinMax, setProteinMax] = useState('150');
  const [carbMin, setCarbMin] = useState('100');
  const [carbMax, setCarbMax] = useState('300');
  const [fatMin, setFatMin] = useState('30');
  const [fatMax, setFatMax] = useState('100');
  const [selectedRestrictions, setSelectedRestrictions] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);

  // Meals and meal types state
  const [meals, setMeals] = useState<any[]>([]);
  const [mealTypes, setMealTypes] = useState<{ name: string; time: string }[]>(DEFAULT_MEAL_TYPES_LIST);
  const [dashboardInitialMeals, setDashboardInitialMeals] = useState<any[] | undefined>(undefined);
  const [dashboardInitialMealTypes, setDashboardInitialMealTypes] = useState<{ name: string; time: string }[] | undefined>(undefined);
  const latestMealsRef = useRef<any[]>([]);
  const latestMealTypesRef = useRef<{ name: string; time: string }[]>(DEFAULT_MEAL_TYPES_LIST);
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    latestMealsRef.current = meals;
  }, [meals]);

  useEffect(() => {
    latestMealTypesRef.current = mealTypes;
  }, [mealTypes]);

  useEffect(() => {
    if (!session) return;
    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.DIETITIAN) {
      router.push('/dashboard');
    }
  }, [session, router]);

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/diet-templates/${id}`);
        if (res.ok) {
          const data = await res.json();
          const t = data.template;

          // All dietitians can edit any template
          setIsOwner(true);

          setName(t.name || '');
          setDescription(t.description || '');
          setCategory(t.category || '');
          setDuration(t.duration?.toString() || '7');
          setCalMin(t.targetCalories?.min?.toString() || '1200');
          setCalMax(t.targetCalories?.max?.toString() || '2500');
          setProteinMin(t.targetMacros?.protein?.min?.toString() || '50');
          setProteinMax(t.targetMacros?.protein?.max?.toString() || '150');
          setCarbMin(t.targetMacros?.carbs?.min?.toString() || '100');
          setCarbMax(t.targetMacros?.carbs?.max?.toString() || '300');
          setFatMin(t.targetMacros?.fat?.min?.toString() || '30');
          setFatMax(t.targetMacros?.fat?.max?.toString() || '100');
          setDifficulty(t.difficulty || 'intermediate');
          // Normalize and load dietary restrictions
          const restrictions = normalizeRestrictionsArray(t.dietaryRestrictions);
          setSelectedRestrictions(restrictions);
          setIsPublic(t.isPublic || false);
          // Load meals and mealTypes
          if (t.meals && Array.isArray(t.meals)) {
            setMeals(t.meals);
            setDashboardInitialMeals(t.meals);
            latestMealsRef.current = t.meals;
          }
          if (t.mealTypes && Array.isArray(t.mealTypes)) {
            setMealTypes(t.mealTypes);
            setDashboardInitialMealTypes(t.mealTypes);
            latestMealTypesRef.current = t.mealTypes;
          }
        } else {
          const data = await res.json();
          setError(data.error || 'Failed to load template');
        }
      } catch (e) {
        setError('Failed to load template');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchTemplate();
  }, [id]);

  const handleSave = async (mealsOverride?: any[], mealTypesOverride?: { name: string; time: string }[]) => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!category) {
      setError('Category is required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const mealsToSave = mealsOverride || latestMealsRef.current;
      const mealTypesToSave = mealTypesOverride || latestMealTypesRef.current;
      const normalizedMealTypes = buildTemplateMealSchedule(mealsToSave, mealTypesToSave);
      const normalizedMeals = syncMealsWithSchedule(mealsToSave, normalizedMealTypes);

      const updateData = {
        name: name.trim(),
        description: description.trim(),
        category,
        duration: Number(duration),
        difficulty,
        targetCalories: { min: Number(calMin), max: Number(calMax) },
        targetMacros: {
          protein: { min: Number(proteinMin), max: Number(proteinMax) },
          carbs: { min: Number(carbMin), max: Number(carbMax) },
          fat: { min: Number(fatMin), max: Number(fatMax) }
        },
        dietaryRestrictions: Array.isArray(selectedRestrictions) ? selectedRestrictions : [],
        isPublic,
        meals: normalizedMeals,
        mealTypes: normalizedMealTypes
      };

      const res = await fetch(`/api/diet-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (res.ok) {
        toast.success('Diet template updated successfully');
        router.push(`/meal-plan-templates/diet/${id}`);
      } else {
        const data = await res.json();
        const errorMsg = data.error || 'Failed to update template';
        setError(errorMsg);
        toast.error('Failed to update template', { description: errorMsg });
      }
    } catch (e) {
      setError('Failed to update template');
      toast.error('Failed to update template', { description: 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleRestriction = (restriction: string) => {
    setSelectedRestrictions(prev =>
      prev.includes(restriction)
        ? prev.filter(r => r !== restriction)
        : [...prev, restriction]
    );
  };

  if (!session) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner />
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/meal-plan-templates/diet/${id}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />Back to Template
            </Link>
          </Button>
          <Button onClick={() => handleSave()} disabled={saving}>
            {saving ? <LoadingSpinner className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Tabs for Details and Meals */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details" className="flex items-center gap-2">
              <ChefHat className="h-4 w-4" />
              Template Details
            </TabsTrigger>
            <TabsTrigger value="meals" className="flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4" />
              Edit Meals
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6 mt-6">

            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ChefHat className="h-5 w-5 text-emerald-600" />
                  Edit Diet Template
                </CardTitle>
                <CardDescription>Update your diet template details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Template Name *</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., 7-Day Keto Plan" />
                  </div>
                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (days) *</Label>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      value={duration}
                      onChange={e => setDuration(e.target.value)}
                      placeholder="e.g., 7"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Difficulty</Label>
                    <Select value={difficulty} onValueChange={setDifficulty}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {difficultyLevels.map(dl => (
                          <SelectItem key={dl.value} value={dl.value}>{dl.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your diet template..." />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="isPublic" checked={isPublic} onCheckedChange={setIsPublic} />
                  <Label htmlFor="isPublic">Make this template public</Label>
                </div>
              </CardContent>
            </Card>

            {/* Dietary Restrictions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Leaf className="h-5 w-5 text-emerald-600" />
                  Dietary Restrictions
                </CardTitle>
                <CardDescription>Select applicable dietary restrictions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {DIETARY_RESTRICTIONS.map(r => {
                    const selected = selectedRestrictions.includes(r);
                    return (
                      <Button
                        key={r}
                        type="button"
                        variant={selected ? 'default' : 'outline'}
                        size="sm"
                        className={`text-xs capitalize ${selected
                          ? 'bg-yellow-400 text-black hover:bg-yellow-500 border-yellow-500'
                          : 'hover:bg-gray-100'
                          }`}
                        onClick={() => toggleRestriction(r)}
                      >
                        {r.replace('-', ' ')}
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Nutrition Targets */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-600" />
                  Nutrition Targets
                </CardTitle>
                <CardDescription>Set daily nutrition goals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Calories Min</Label>
                    <Input type="number" value={calMin} onChange={e => setCalMin(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Calories Max</Label>
                    <Input type="number" value={calMax} onChange={e => setCalMax(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Protein Min (g)</Label>
                    <Input type="number" value={proteinMin} onChange={e => setProteinMin(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Protein Max (g)</Label>
                    <Input type="number" value={proteinMax} onChange={e => setProteinMax(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Carbs Min (g)</Label>
                    <Input type="number" value={carbMin} onChange={e => setCarbMin(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Carbs Max (g)</Label>
                    <Input type="number" value={carbMax} onChange={e => setCarbMax(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Fat Min (g)</Label>
                    <Input type="number" value={fatMin} onChange={e => setFatMin(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Fat Max (g)</Label>
                    <Input type="number" value={fatMax} onChange={e => setFatMax(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button size="lg" onClick={() => handleSave()} disabled={saving}>
                {saving ? <LoadingSpinner className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Diet Template
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="meals" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UtensilsCrossed className="h-5 w-5 text-emerald-600" />
                  Edit Meals
                </CardTitle>
                <CardDescription>Modify the meal plan for this diet template</CardDescription>
              </CardHeader>
              <CardContent>
                <DietPlanDashboard
                  clientId={`template-${id}`}
                  clientData={{
                    name: name || 'Untitled Template',
                    age: 0,
                    goal: description ? description.slice(0, 30) : 'Goal not set',
                    planType: category || 'Uncategorized'
                  }}
                  duration={Number(duration)}
                  onDurationChange={(nextDuration) => setDuration(String(nextDuration))}
                  initialMeals={dashboardInitialMeals}
                  initialMealTypes={dashboardInitialMealTypes}
                  clientDietaryRestrictions={selectedRestrictions?.join(', ') || ''}
                  onBack={() => setActiveTab('details')}
                  onMealDataChange={(weekPlan, newMealTypes) => {
                    // Sync meal changes to state for auto-save
                    setMeals(weekPlan);
                    latestMealsRef.current = weekPlan;
                    if (newMealTypes) {
                      setMealTypes(newMealTypes);
                      latestMealTypesRef.current = newMealTypes;
                    }
                  }}
                  onSavePlan={(weekPlan, newMealTypes) => {
                    setMeals(weekPlan);
                    latestMealsRef.current = weekPlan;
                    if (newMealTypes) {
                      setMealTypes(newMealTypes);
                      latestMealTypesRef.current = newMealTypes;
                    }
                    handleSave(weekPlan, newMealTypes);
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
