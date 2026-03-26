'use client';

import { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatTimeIST } from '@/lib/utils/formatDateIST';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  Trash2,
  Search,
  ChefHat,
  Target,
  Calendar,
  AlertCircle,
  RefreshCw,
  Check
} from 'lucide-react';
import { DietPlanDashboard } from '@/components/dietplandashboard/DietPlanDashboard';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { LifestyleForm, type LifestyleData } from '@/components/clients/LifestyleForm';
import { MedicalForm, type MedicalData } from '@/components/clients/MedicalForm';
import { RecallForm, RecallEntry } from '@/components/clients/RecallForm';
import { toast } from 'sonner';
import { useMealPlanAutoSave, type MealPlanFormData } from '@/hooks/useAutoSave';

interface Client {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  type?: string;
  programStart?: string;
  programEnd?: string;
  dateJoined?: string;
}

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
  recipe: string;
  quantity: number;
}

export default function CreateMealPlanPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><LoadingSpinner /></div>}>
      <CreateMealPlanPageContent />
    </Suspense>
  );
}

function CreateMealPlanPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [clients, setClients] = useState<Client[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [selectedClient, setSelectedClient] = useState('');
  const [planName, setPlanName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');

  const [endDate, setEndDate] = useState('');
  const [targetCalories, setTargetCalories] = useState('');
  const [targetProtein, setTargetProtein] = useState('');
  const [targetCarbs, setTargetCarbs] = useState('');
  const [targetFat, setTargetFat] = useState('');
  const [meals, setMeals] = useState<MealPlanMeal[]>([]);
  // Overlay section states
  const [showLifestyle, setShowLifestyle] = useState(false);
  const [showMedical, setShowMedical] = useState(false);
  const [showRecall, setShowRecall] = useState(false);

  // Loading states for forms
  const [savingMedical, setSavingMedical] = useState(false);
  const [savingLifestyle, setSavingLifestyle] = useState(false);
  const [loadingClientData, setLoadingClientData] = useState(false);

  // Full Lifestyle form state
  const [lifestyleData, setLifestyleData] = useState<LifestyleData>({
    foodPreference: '',
    preferredCuisine: [],
    allergiesFood: [],
    fastDays: [],
    nonVegExemptDays: [],
    foodLikes: '',
    foodDislikes: '',
    eatOutFrequency: '',
    smokingFrequency: '',
    alcoholFrequency: '',
    activityRate: '',
    cookingOil: [],
    monthlyOilConsumption: '',
    cookingSalt: '',
    carbonatedBeverageFrequency: '',
    cravingType: '',
    sleepPattern: '',
    stressLevel: ''
  });

  // Full Medical form state
  const [medicalData, setMedicalData] = useState<MedicalData>({
    medicalConditions: '',
    allergies: '',
    dietaryRestrictions: '',
    notes: '',
    diseaseHistory: [],
    medicalHistory: '',
    familyHistory: '',
    medication: '',
    bloodGroup: '',
    gutIssues: [],
    reports: [],
    isPregnant: false,
    isLactating: false,
    menstrualCycle: '',
    bloodFlow: ''
  });

  // Client gender for medical form
  const [clientGender, setClientGender] = useState('');

  const [recallEntries, setRecallEntries] = useState<RecallEntry[]>([]);

  // Recipe search
  const [recipeSearch, setRecipeSearch] = useState('');
  const [showRecipeSearch, setShowRecipeSearch] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedMealType, setSelectedMealType] = useState('breakfast');
  const [draftRestored, setDraftRestored] = useState(false);

  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
  const planDuration = 7; // 7-day meal plan

  // Memoize form data for auto-save
  const formData: MealPlanFormData = useMemo(() => ({
    clientId: selectedClient,
    planName,
    description,
    startDate,
    endDate,
    targetCalories,
    targetProtein,
    targetCarbs,
    targetFat,
    meals,
    medicalHistory: medicalData.medicalHistory,
    notes: medicalData.notes,
  }), [selectedClient, planName, description, startDate, endDate, targetCalories, targetProtein, targetCarbs, targetFat, meals, medicalData.medicalHistory, medicalData.notes]);

  // Auto-save hook (saves draft every 2 seconds, expires after 24 hours)
  const {
    isSaving,
    lastSaved,
    hasDraft,
    clearDraft,
    restoreDraft
  } = useMealPlanAutoSave('new-meal-plan', formData, {
    debounceMs: 2000,
    enabled: !!session?.user?.id,
  });

  // Restore draft on mount
  useEffect(() => {
    if (!draftRestored && session?.user?.id) {
      const restored = restoreDraft();
      if (restored) {
        // Restore all form fields
        setSelectedClient(restored.clientId || '');
        setPlanName(restored.planName || '');
        setDescription(restored.description || '');
        setStartDate(restored.startDate || '');
        setEndDate(restored.endDate || '');
        setTargetCalories(restored.targetCalories || '');
        setTargetProtein(restored.targetProtein || '');
        setTargetCarbs(restored.targetCarbs || '');
        setTargetFat(restored.targetFat || '');
        setMeals(restored.meals?.length ? restored.meals : []);
        // Medical history and notes are restored when client data is fetched

        toast.success('Draft restored', {
          description: 'Your previous meal plan draft has been restored. Draft expires in 24 hours.',
          duration: 4000
        });
      }
      setDraftRestored(true);
    }
  }, [session?.user?.id, draftRestored, restoreDraft]);

  // Handle clear draft
  const handleClearDraft = useCallback(() => {
    clearDraft();
    // Reset all form fields
    setSelectedClient('');
    setPlanName('');
    setDescription('');
    setStartDate('');
    setEndDate('');
    setTargetCalories('');
    setTargetProtein('');
    setTargetCarbs('');
    setTargetFat('');
    setMeals([]);
    // Reset medical and lifestyle data
    setMedicalData({
      medicalConditions: '',
      allergies: '',
      dietaryRestrictions: '',
      notes: '',
      diseaseHistory: [],
      medicalHistory: '',
      familyHistory: '',
      medication: '',
      bloodGroup: '',
      gutIssues: [],
      reports: [],
      isPregnant: false,
      isLactating: false,
      menstrualCycle: '',
      bloodFlow: ''
    });
    setLifestyleData({
      foodPreference: '',
      preferredCuisine: [],
      allergiesFood: [],
      fastDays: [],
      nonVegExemptDays: [],
      foodLikes: '',
      foodDislikes: '',
      eatOutFrequency: '',
      smokingFrequency: '',
      alcoholFrequency: '',
      activityRate: '',
      cookingOil: [],
      monthlyOilConsumption: '',
      cookingSalt: '',
      carbonatedBeverageFrequency: '',
      cravingType: '',
      sleepPattern: '',
      stressLevel: ''
    });
    setRecallEntries([]);
    setError('');
    toast.success('Draft cleared', { description: 'Starting fresh.' });
  }, [clearDraft]);

  // Only fetch when session is authenticated
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchClients();
      fetchRecipes();
    }
  }, [status, session?.user?.id]);

  // When clients load, if client query param present, auto-select
  useEffect(() => {
    const clientParam = searchParams?.get('client');
    if (clientParam && clients.length > 0) {
      const found = clients.find(c => c._id === clientParam);
      if (found && selectedClient !== found._id) {
        setSelectedClient(found._id);
        if (!description) {
          setDescription(`Nutrition plan for ${found.firstName} ${found.lastName}`);
        }
      }
    }
  }, [searchParams, clients]);

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/users?role=client');
      if (response.ok) {
        const data = await response.json();
        setClients(data.users);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  // Fetch client medical and lifestyle data when client is selected
  const fetchClientData = useCallback(async (clientId: string) => {
    if (!clientId) return;

    setLoadingClientData(true);
    try {
      // Fetch user basic info for gender
      const userRes = await fetch(`/api/users/${clientId}`);
      if (userRes.ok) {
        const userData = await userRes.json();
        setClientGender(userData?.user?.gender || '');
      }

      // Fetch medical data
      const medicalRes = await fetch(`/api/users/${clientId}/medical`);
      if (medicalRes.ok) {
        const medicalInfo = await medicalRes.json();
        if (medicalInfo?.medicalInfo) {
          const mi = medicalInfo.medicalInfo;
          setMedicalData({
            medicalConditions: Array.isArray(mi.medicalConditions) ? mi.medicalConditions.join(', ') : mi.medicalConditions || '',
            allergies: Array.isArray(mi.allergies) ? mi.allergies.join(', ') : mi.allergies || '',
            dietaryRestrictions: Array.isArray(mi.dietaryRestrictions) ? mi.dietaryRestrictions.join(', ') : mi.dietaryRestrictions || '',
            notes: mi.notes || '',
            diseaseHistory: mi.diseaseHistory || [],
            medicalHistory: mi.medicalHistory || '',
            familyHistory: mi.familyHistory || '',
            medication: mi.medication || '',
            bloodGroup: mi.bloodGroup || '',
            gutIssues: mi.gutIssues || [],
            reports: mi.reports || [],
            isPregnant: mi.isPregnant || false,
            isLactating: mi.isLactating || false,
            menstrualCycle: mi.menstrualCycle || '',
            bloodFlow: mi.bloodFlow || ''
          });
        }
      }

      // Fetch lifestyle data
      const lifestyleRes = await fetch(`/api/users/${clientId}/lifestyle`);
      if (lifestyleRes.ok) {
        const lifestyleInfo = await lifestyleRes.json();
        if (lifestyleInfo?.lifestyleInfo) {
          const li = lifestyleInfo.lifestyleInfo;
          setLifestyleData({
            foodPreference: li.foodPreference || '',
            preferredCuisine: li.preferredCuisine || [],
            allergiesFood: li.allergiesFood || [],
            fastDays: li.fastDays || [],
            nonVegExemptDays: li.nonVegExemptDays || [],
            foodLikes: li.foodLikes || '',
            foodDislikes: li.foodDislikes || '',
            eatOutFrequency: li.eatOutFrequency || '',
            smokingFrequency: li.smokingFrequency || '',
            alcoholFrequency: li.alcoholFrequency || '',
            activityRate: li.activityRate || '',
            cookingOil: li.cookingOil || [],
            monthlyOilConsumption: li.monthlyOilConsumption || '',
            cookingSalt: li.cookingSalt || '',
            carbonatedBeverageFrequency: li.carbonatedBeverageFrequency || '',
            cravingType: li.cravingType || '',
            sleepPattern: li.sleepPattern || '',
            stressLevel: li.stressLevel || ''
          });
        }
      }

      // Fetch recall entries
      const recallRes = await fetch(`/api/users/${clientId}/recall`);
      if (recallRes.ok) {
        const recallData = await recallRes.json();
        setRecallEntries(recallData?.entries || []);
      }
    } catch (error) {
      console.error('Error fetching client data:', error);
      toast.error('Failed to load client data');
    } finally {
      setLoadingClientData(false);
    }
  }, []);

  // Fetch client data when client is selected
  useEffect(() => {
    if (selectedClient) {
      fetchClientData(selectedClient);
    }
  }, [selectedClient, fetchClientData]);

  const fetchRecipes = async () => {
    try {
      const response = await fetch('/api/recipes');
      if (response.ok) {
        const data = await response.json();
        setRecipes(data.recipes);
      }
    } catch (error) {
      console.error('Error fetching recipes:', error);
    }
  };

  // Save medical data
  const handleSaveMedical = async () => {
    if (!selectedClient) {
      toast.error('Please select a client first');
      return;
    }
    setSavingMedical(true);
    try {
      const response = await fetch(`/api/users/${selectedClient}/medical`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medicalConditions: medicalData.medicalConditions.split(',').map(s => s.trim()).filter(Boolean),
          allergies: medicalData.allergies.split(',').map(s => s.trim()).filter(Boolean),
          dietaryRestrictions: medicalData.dietaryRestrictions.split(',').map(s => s.trim()).filter(Boolean),
          notes: medicalData.notes,
          diseaseHistory: medicalData.diseaseHistory,
          medicalHistory: medicalData.medicalHistory,
          familyHistory: medicalData.familyHistory,
          medication: medicalData.medication,
          bloodGroup: medicalData.bloodGroup,
          gutIssues: medicalData.gutIssues,
          isPregnant: medicalData.isPregnant,
          isLactating: medicalData.isLactating,
          menstrualCycle: medicalData.menstrualCycle,
          bloodFlow: medicalData.bloodFlow
        })
      });
      if (response.ok) {
        toast.success('Medical information saved');
        setShowMedical(false);
      } else {
        toast.error('Failed to save medical information');
      }
    } catch (error) {
      console.error('Error saving medical data:', error);
      toast.error('Failed to save medical information');
    } finally {
      setSavingMedical(false);
    }
  };

  // Save lifestyle data
  const handleSaveLifestyle = async () => {
    if (!selectedClient) {
      toast.error('Please select a client first');
      return;
    }
    setSavingLifestyle(true);
    try {
      const response = await fetch(`/api/users/${selectedClient}/lifestyle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lifestyleData)
      });
      if (response.ok) {
        toast.success('Lifestyle information saved');
        setShowLifestyle(false);
      } else {
        toast.error('Failed to save lifestyle information');
      }
    } catch (error) {
      console.error('Error saving lifestyle data:', error);
      toast.error('Failed to save lifestyle information');
    } finally {
      setSavingLifestyle(false);
    }
  };

  // Save recall data
  const handleSaveRecall = async () => {
    if (!selectedClient) {
      toast.error('Please select a client first');
      return;
    }
    try {
      const response = await fetch(`/api/users/${selectedClient}/recall`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: recallEntries })
      });
      if (response.ok) {
        toast.success('Recall information saved');
        setShowRecall(false);
      } else {
        toast.error('Failed to save recall information');
      }
    } catch (error) {
      console.error('Error saving recall data:', error);
      toast.error('Failed to save recall information');
    }
  };

  // Handle medical form field change
  const handleMedicalChange = (field: keyof MedicalData, value: any) => {
    setMedicalData(prev => ({ ...prev, [field]: value }));
  };

  // Handle lifestyle form field change
  const handleLifestyleChange = (field: keyof LifestyleData, value: any) => {
    setLifestyleData(prev => ({ ...prev, [field]: value }));
  };

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

  const filteredRecipes = recipes.filter(recipe =>
    recipe.name.toLowerCase().includes(recipeSearch.toLowerCase()) ||
    recipe.description.toLowerCase().includes(recipeSearch.toLowerCase())
  );

  // Lookup selected client object
  const selectedClientObj = clients.find(c => c._id === selectedClient);
  const dietClientData = {
    name: selectedClientObj ? `${selectedClientObj.firstName} ${selectedClientObj.lastName}` : 'Select a client',
    age: 0,
    goal: description ? description.slice(0, 30) : 'Goal not set',
    planType: planName || 'Untitled Plan',
    // Pass client dietary restrictions for recipe filtering
    dietaryRestrictions: medicalData.dietaryRestrictions || '',
    medicalConditions: medicalData.medicalConditions || '',
    allergies: medicalData.allergies || ''
  };

  const handleSubmit = async () => {
    if (!selectedClient || !planName || !startDate || !endDate) {
      setError('Fill required fields first');
      toast.error('Missing required fields', { description: 'Please fill in all required fields.' });
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient,
          name: planName,
          description,
          startDate,
          endDate,
          meals,
          targetCalories: targetCalories ? parseInt(targetCalories) : undefined,
          targetMacros: {
            protein: targetProtein ? parseInt(targetProtein) : 0,
            carbs: targetCarbs ? parseInt(targetCarbs) : 0,
            fat: targetFat ? parseInt(targetFat) : 0
          }
        })
      });
      if (response.ok) {
        // Clear draft after successful save
        clearDraft();
        toast.success('Meal plan created successfully!');
        router.push('/meal-plans?success=created');
      } else {
        const data = await response.json();
        const errorMsg = data.error || 'Failed to create meal plan';
        setError(errorMsg);
        toast.error('Failed to create meal plan', { description: errorMsg });
      }
    } catch (err) {
      console.error('Error creating meal plan:', err);
      setError('Failed to create meal plan');
      toast.error('Network error', { description: 'Please check your connection and try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Create Meal Plan</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Design a personalized nutrition plan for your client</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-save indicator */}
            {isSaving && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            )}
            {!isSaving && lastSaved && (
              <span className="text-xs text-green-600 dark:text-green-400">
                Saved {formatTimeIST(lastSaved)}
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
                Clear Draft
              </Button>
            )}
          </div>
        </div>

        {/* Summary Header & Controls */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Card className="border border-slate-300 shadow-sm dark:border-slate-700">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs font-semibold">Client<span className="text-red-500">*</span></Label>
                {selectedClientObj ? (
                  <div className="flex items-center gap-2">
                    <div className="h-9 flex items-center px-3 text-xs rounded border border-slate-300 bg-slate-50 font-medium">
                      {selectedClientObj.firstName} {selectedClientObj.lastName}
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedClient('')}>Change</Button>
                  </div>
                ) : (
                  <Select value={selectedClient} onValueChange={setSelectedClient}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent>{clients.map(c => (
                      <SelectItem key={c._id} value={c._id}>{c.firstName} {c.lastName}</SelectItem>
                    ))}</SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label className="text-xs font-semibold">Plan Name<span className="text-red-500">*</span></Label>
                <Input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="Week 1 Plan" className="h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Start Date<span className="text-red-500">*</span></Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-semibold">End Date<span className="text-red-500">*</span></Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs font-semibold">Calories</Label>
                <Input type="number" value={targetCalories} onChange={e => setTargetCalories(e.target.value)} placeholder="1800" className="h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Protein (g)</Label>
                <Input type="number" value={targetProtein} onChange={e => setTargetProtein(e.target.value)} placeholder="120" className="h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Carbs (g)</Label>
                <Input type="number" value={targetCarbs} onChange={e => setTargetCarbs(e.target.value)} placeholder="200" className="h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Fat (g)</Label>
                <Input type="number" value={targetFat} onChange={e => setTargetFat(e.target.value)} placeholder="60" className="h-9 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value.slice(0, 240))} rows={3} className="text-xs" placeholder="Goals and approach..." />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLifestyle(true)}
                className="gap-1"
                disabled={!selectedClient}
              >
                Lifestyle
                {lifestyleData.foodPreference && <Check className="h-3 w-3 text-green-500" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMedical(true)}
                className="gap-1"
                disabled={!selectedClient}
              >
                Medical
                {medicalData.medicalConditions && <Check className="h-3 w-3 text-green-500" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRecall(true)}
                className="gap-1"
                disabled={!selectedClient}
              >
                Recall
                {recallEntries.length > 0 && <Check className="h-3 w-3 text-green-500" />}
              </Button>
              {loadingClientData && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Loading client data...
                </span>
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={() => router.back()}>Back</Button>
                <Button size="sm" onClick={handleSubmit} disabled={loading} className="bg-slate-900 text-white">
                  {loading ? 'Saving...' : 'Save Plan'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Client Data Summary */}
        {selectedClient && (medicalData.dietaryRestrictions || medicalData.allergies || lifestyleData.foodPreference) && (
          <Card className="border border-slate-200 dark:border-slate-700">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Client Dietary Profile</CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-4">
              <div className="flex flex-wrap gap-4 text-xs">
                {medicalData.dietaryRestrictions && (
                  <div>
                    <span className="font-semibold text-gray-600">Dietary Restrictions:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {medicalData.dietaryRestrictions.split(',').map((r, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{r.trim()}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {medicalData.allergies && (
                  <div>
                    <span className="font-semibold text-gray-600">Allergies:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {medicalData.allergies.split(',').map((a, i) => (
                        <Badge key={i} variant="destructive" className="text-xs">{a.trim()}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {lifestyleData.foodPreference && (
                  <div>
                    <span className="font-semibold text-gray-600">Food Preference:</span>
                    <Badge variant="secondary" className="ml-1 text-xs">{lifestyleData.foodPreference}</Badge>
                  </div>
                )}
                {medicalData.medicalConditions && (
                  <div>
                    <span className="font-semibold text-gray-600">Medical Conditions:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {medicalData.medicalConditions.split(',').slice(0, 3).map((c, i) => (
                        <Badge key={i} variant="outline" className="text-xs bg-yellow-50">{c.trim()}</Badge>
                      ))}
                      {medicalData.medicalConditions.split(',').length > 3 && (
                        <Badge variant="outline" className="text-xs">+{medicalData.medicalConditions.split(',').length - 3} more</Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className='mt-6'>
          <DietPlanDashboard
            clientData={dietClientData}
            onBack={() => router.back()}
            onSavePlan={handleSubmit}
          />
        </Card>

        {/* Lifestyle Dialog */}
        <Dialog open={showLifestyle} onOpenChange={setShowLifestyle}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <LifestyleForm
              {...lifestyleData}
              onChange={handleLifestyleChange}
              onSave={handleSaveLifestyle}
              loading={savingLifestyle}
            />
          </DialogContent>
        </Dialog>

        {/* Medical Dialog */}
        <Dialog open={showMedical} onOpenChange={setShowMedical}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <MedicalForm
              {...medicalData}
              onChange={handleMedicalChange}
              onSave={handleSaveMedical}
              loading={savingMedical}
              clientGender={clientGender}
              clientId={selectedClient}
            />
          </DialogContent>
        </Dialog>

        {/* Recall Dialog */}
        <Dialog open={showRecall} onOpenChange={setShowRecall}>
          <DialogContent className="max-w-3xl backdrop-blur flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between mb-3">
              <CardTitle className="text-sm">Dietary Recall</CardTitle>
            </div>
            <div className="overflow-y-auto pr-2 space-y-4">
              <RecallForm entries={recallEntries} onChange={setRecallEntries} onSave={handleSaveRecall} />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}