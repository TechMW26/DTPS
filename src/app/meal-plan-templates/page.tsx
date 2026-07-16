'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import {
  Search,
  Plus,
  CheckCircle,
  ChefHat,
  Pencil,
  Trash2,
  Copy,
  Loader2
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Link from 'next/link';
import { UserRole } from '@/types';
import { toast } from 'sonner';


interface MealPlanTemplate {
  _id: string;
  templateType?: 'plan' | 'diet';
  isActive?: boolean;
  name: string;
  description: string;
  category: string;
  duration: number;
  targetCalories: { min: number; max: number; };
  targetMacros: {
    protein: { min: number; max: number; };
    carbs: { min: number; max: number; };
    fat: { min: number; max: number; };
  };
  dietaryRestrictions: string[];
  tags: string[];
  isPublic: boolean;
  createdBy: { firstName: string; lastName: string; };
  usageCount: number;
  averageRating?: number;
  averageDailyCalories: number;
  totalRecipes: number;
  createdAt: string;
}

function MealPlanTemplatesPageContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'plans' | 'diet'>('plans');

  // Authorization check - only admin and dietitian can access
  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/login');
      return;
    }
    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.DIETITIAN) {
      router.push('/dashboard');
    }
  }, [session, status, router]);

  // Plan templates state (no days filter)
  const [planTemplates, setPlanTemplates] = useState<MealPlanTemplate[]>([]);
  const [planSearch, setPlanSearch] = useState('');
  const [planLoading, setPlanLoading] = useState(false);

  // Diet templates state (no days filter)
  const [dietTemplates, setDietTemplates] = useState<MealPlanTemplate[]>([]);
  const [dietSearchTerm, setDietSearchTerm] = useState('');
  const [dietDietaryRestrictions, setDietDietaryRestrictions] = useState<string[]>([]);
  const [dietViewTab, setDietViewTab] = useState<'active' | 'archived'>('active');
  const [dietLoading, setDietLoading] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    templateId: string;
    templateType: 'plan' | 'diet';
    templateName: string;
  }>({ open: false, templateId: '', templateType: 'plan', templateName: '' });
  const [duplicateDialog, setDuplicateDialog] = useState<{
    open: boolean;
    templateId: string;
    templateType: 'plan' | 'diet';
    originalName: string;
    newName: string;
  }>({ open: false, templateId: '', templateType: 'plan', originalName: '', newName: '' });
  const dietaryRestrictionsList = [
    'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 'egg-free', 'soy-free', 'keto', 'paleo', 'low-carb', 'low-fat', 'diabetic-friendly'
  ];

  useEffect(() => { if (activeTab === 'plans' && session) fetchPlanTemplates(); }, [activeTab, planSearch, session]);
  useEffect(() => { if (activeTab === 'diet' && session) fetchDietTemplates(); }, [activeTab, dietSearchTerm, dietDietaryRestrictions, dietViewTab, session]);

  useEffect(() => {
    if (searchParams?.get('success') === 'created') {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const fetchPlanTemplates = async () => {
    try {
      setPlanLoading(true);
      const params = new URLSearchParams();
      params.append('templateType', 'plan');
      params.append('limit', '1000');
      params.append('_t', Date.now().toString()); // Cache-bust
      if (planSearch) params.append('search', planSearch);
      const response = await fetch(`/api/meal-plan-templates?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setPlanTemplates((data.templates || []).filter((t: MealPlanTemplate) => t.templateType === 'plan' || t.templateType === undefined));
      } else {
        setPlanTemplates([]);
      }
    } catch { setPlanTemplates([]); }
    finally { setPlanLoading(false); }
  };

  const fetchDietTemplates = async () => {
    try {
      setDietLoading(true);
      const params = new URLSearchParams();
      params.append('limit', '1000');
      params.append('_t', Date.now().toString()); // Cache-bust
      if (session?.user?.role === UserRole.ADMIN) {
        params.append('includeInactive', 'true');
      }
      if (session?.user?.role === UserRole.DIETITIAN && session.user.id) {
        params.append('createdBy', session.user.id);
      }
      if (dietSearchTerm) params.append('search', dietSearchTerm);
      if (dietDietaryRestrictions.length > 0)
        params.append('dietaryRestrictions', dietDietaryRestrictions.join(','));
      const response = await fetch(`/api/diet-templates?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setDietTemplates(data.templates || []);
      } else {
        setDietTemplates([]);
      }
    } catch { setDietTemplates([]); }
    finally { setDietLoading(false); }
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'weight-loss': 'bg-red-100 text-red-800',
      'weight-gain': 'bg-green-100 text-green-800',
      'maintenance': 'bg-blue-100 text-blue-800',
      'muscle-gain': 'bg-purple-100 text-purple-800',
      'diabetes': 'bg-orange-100 text-orange-800',
      'heart-healthy': 'bg-pink-100 text-pink-800',
      'keto': 'bg-yellow-100 text-yellow-800',
      'vegan': 'bg-emerald-100 text-emerald-800',
      'custom': 'bg-gray-100 text-gray-800'
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  const formatCategoryName = (category: string) => category.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

  // Delete template — opens confirmation dialog
  const handleDeleteTemplate = (templateId: string, templateType: 'plan' | 'diet', templateName: string) => {
    setDeleteDialog({ open: true, templateId, templateType, templateName });
  };

  // Execute confirmed delete
  const executeDelete = async () => {
    const { templateId, templateType } = deleteDialog;
    setDeleteDialog(prev => ({ ...prev, open: false }));
    setDeletingId(templateId);
    try {
      const apiUrl = templateType === 'diet'
        ? `/api/diet-templates/${templateId}`
        : `/api/meal-plan-templates/${templateId}`;

      const response = await fetch(apiUrl, { method: 'DELETE' });

      if (response.ok) {
        toast.success('Template deleted successfully');
        if (templateType === 'plan') {
          setPlanTemplates(prev => prev.filter(t => t._id !== templateId));
        } else {
          setDietTemplates(prev => prev.filter(t => t._id !== templateId));
        }
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete template');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    } finally {
      setDeletingId(null);
    }
  };

  // Duplicate template - opens dialog
  const handleDuplicateTemplate = (templateId: string, templateType: 'plan' | 'diet', templateName: string) => {
    setDuplicateDialog({
      open: true,
      templateId,
      templateType,
      originalName: templateName,
      newName: `${templateName} (Copy)`
    });
  };

  // Execute the actual duplication after user confirms
  const executeDuplicate = async () => {
    const { templateId, templateType, newName } = duplicateDialog;
    if (!newName.trim()) {
      toast.error('Please enter a name for the duplicate template');
      return;
    }

    setDuplicateDialog(prev => ({ ...prev, open: false }));
    setDuplicatingId(templateId);
    try {
      // First, fetch the full template details
      const getApiUrl = templateType === 'diet'
        ? `/api/diet-templates/${templateId}`
        : `/api/meal-plan-templates/${templateId}`;

      const getResponse = await fetch(getApiUrl);
      if (!getResponse.ok) {
        toast.error('Failed to fetch template details');
        return;
      }

      const templateData = await getResponse.json();
      const src = templateData.template || templateData;

      // Helper: strip _id from nested objects/arrays recursively
      const stripIds = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(stripIds);
        if (obj && typeof obj === 'object') {
          const cleaned: any = {};
          for (const [k, v] of Object.entries(obj)) {
            if (k === '_id' || k === '__v' || k === 'id') continue;
            cleaned[k] = stripIds(v);
          }
          return cleaned;
        }
        return obj;
      };

      const formatNum = (value: number): string => {
        if (!Number.isFinite(value)) return '0';
        return parseFloat(value.toFixed(2)).toString();
      };

      // Ensure duplicated diet templates do not carry stale top-level nutrition values
      // when the source option has stacked `foods` entries.
      const normalizeDuplicatedMeals = (meals: any[]): any[] => {
        return meals.map((day: any) => {
          if (!day?.meals || typeof day.meals !== 'object') return day;

          const normalizedMeals: Record<string, any> = {};
          Object.entries(day.meals).forEach(([mealKey, mealValue]) => {
            const meal = mealValue as any;
            if (!meal?.foodOptions || !Array.isArray(meal.foodOptions)) {
              normalizedMeals[mealKey] = meal;
              return;
            }

            const normalizedOptions = meal.foodOptions.map((option: any) => {
              const isAlternative = option?.isAlternative === true || (typeof option?.label === 'string' && /alternative/i.test(option.label));

              if (!Array.isArray(option?.foods) || option.foods.length === 0) {
                return {
                  ...option,
                  isAlternative
                };
              }

              const totals = option.foods.reduce((acc: any, food: any) => {
                acc.cal += parseFloat(food?.cal) || 0;
                acc.carbs += parseFloat(food?.carbs) || 0;
                acc.fats += parseFloat(food?.fats) || 0;
                acc.protein += parseFloat(food?.protein) || 0;
                return acc;
              }, { cal: 0, carbs: 0, fats: 0, protein: 0 });

              return {
                ...option,
                isAlternative,
                food: option.foods.map((food: any) => food?.food || '').filter(Boolean).join(' + '),
                unit: option.foods.length > 1 ? 'Multiple' : (option.foods[0]?.unit || option.unit || ''),
                cal: formatNum(totals.cal),
                carbs: formatNum(totals.carbs),
                fats: formatNum(totals.fats),
                protein: formatNum(totals.protein)
              };
            });

            normalizedMeals[mealKey] = {
              ...meal,
              foodOptions: normalizedOptions
            };
          });

          return {
            ...day,
            meals: normalizedMeals
          };
        });
      };

      // Build a clean payload with only the fields the POST API expects
      const duplicateData: any = {
        name: newName.trim(),
        description: src.description || '',
        category: src.category,
        duration: src.duration,
        meals: normalizeDuplicatedMeals(stripIds(src.meals || [])),
        mealTypes: (src.mealTypes || []).map((mt: any) => ({ name: mt.name, time: mt.time || '' })),
        dietaryRestrictions: src.dietaryRestrictions || [],
        tags: src.tags || [],
        isPublic: false,
        isPremium: src.isPremium || false,
        difficulty: src.difficulty || 'intermediate',
      };

      // Copy optional structured fields if present
      if (src.targetCalories) {
        duplicateData.targetCalories = { min: src.targetCalories.min, max: src.targetCalories.max };
      }
      if (src.targetMacros) {
        duplicateData.targetMacros = {
          protein: { min: src.targetMacros.protein?.min || 0, max: src.targetMacros.protein?.max || 0 },
          carbs: { min: src.targetMacros.carbs?.min || 0, max: src.targetMacros.carbs?.max || 0 },
          fat: { min: src.targetMacros.fat?.min || 0, max: src.targetMacros.fat?.max || 0 },
        };
      }
      if (src.prepTime) {
        duplicateData.prepTime = { daily: src.prepTime.daily || 0, weekly: src.prepTime.weekly || 0 };
      }
      if (src.targetAudience) {
        duplicateData.targetAudience = {
          ageGroup: src.targetAudience.ageGroup || [],
          activityLevel: src.targetAudience.activityLevel || [],
          healthConditions: src.targetAudience.healthConditions || [],
          goals: src.targetAudience.goals || [],
        };
      }

      // For plan templates, also copy templateType
      if (templateType === 'plan') {
        duplicateData.templateType = 'plan';
      }

      // Create the duplicate
      const createApiUrl = templateType === 'diet'
        ? '/api/diet-templates'
        : '/api/meal-plan-templates';

      const createResponse = await fetch(createApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicateData)
      });

      if (createResponse.ok) {
        toast.success(`Template duplicated as "${newName.trim()}"`);
        // Refresh the appropriate list
        if (templateType === 'plan') {
          fetchPlanTemplates();
        } else {
          fetchDietTemplates();
        }
      } else {
        const errorData = await createResponse.json();
        console.error('Duplicate failed:', errorData);
        toast.error(errorData.error || 'Failed to duplicate template');
      }
    } catch (error) {
      console.error('Error duplicating template:', error);
      toast.error('Failed to duplicate template');
    } finally {
      setDuplicatingId(null);
    }
  };

  const filteredPlanTemplates = planTemplates
    .filter(t => (t.templateType === 'plan' || t.templateType === undefined))
    .filter(t => planSearch === '' || t.name.toLowerCase().includes(planSearch.toLowerCase()));

  const filteredDietTemplates = dietTemplates
    .filter(t =>
      (dietViewTab === 'archived'
        ? (session?.user?.role === UserRole.ADMIN && t.isActive === false)
        : t.isActive !== false) &&
      (dietSearchTerm === '' || t.name.toLowerCase().includes(dietSearchTerm.toLowerCase())) &&
      (dietDietaryRestrictions.length === 0 || dietDietaryRestrictions.every(r => t.dietaryRestrictions?.includes(r)))
    );

  const handleRestoreDietTemplate = async (templateId: string) => {
    if (!confirm('Restore this archived diet template?')) return;

    try {
      const response = await fetch(`/api/diet-templates/${templateId}/restore`, {
        method: 'POST'
      });

      if (response.ok) {
        toast.success('Diet template restored successfully');
        fetchDietTemplates();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to restore diet template');
      }
    } catch (error) {
      console.error('Error restoring diet template:', error);
      toast.error('Failed to restore diet template');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Create Templates</h1>
            <p className="text-gray-600 mt-1">
              Create plan templates and diet templates for your clients
            </p>
          </div>
        </div>
        {showSuccess && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              plan template created successfully! 🎉
            </AlertDescription>
          </Alert>
        )}
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'plans' | 'diet')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="plans">Plan Templates</TabsTrigger>
            <TabsTrigger value="diet">Diet Templates</TabsTrigger>
          </TabsList>
          <TabsContent value="plans" className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative flex-1 min-w-55">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input placeholder="Search plan templates..." value={planSearch} onChange={e => setPlanSearch(e.target.value)} className="pl-10" />
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <ChefHat className="h-4 w-4" />
                    <span>{filteredPlanTemplates.length} Templates</span>
                  </div>
                  {(session?.user?.role === UserRole.DIETITIAN || session?.user?.role === UserRole.ADMIN) && (
                    <Button asChild>
                      <Link href="/meal-plan-templates/plans/create">
                        <Plus className="h-4 w-4 mr-2" />Create Plan Template
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            {planLoading ? (
              <div className="flex items-center justify-center h-32"><LoadingSpinner /></div>
            ) : filteredPlanTemplates.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No plan templates found</h3>
                  <p className="text-gray-600 mb-4">Create your first template to get started</p>
                  {(session?.user?.role === UserRole.DIETITIAN || session?.user?.role === UserRole.ADMIN) && (
                    <Button asChild>
                      <Link href="/meal-plan-templates/plans/create">
                        <Plus className="h-4 w-4 mr-2" />Create Plan Template
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              // Only show Name, Category, Cal Range, Actions (NO duration or description)
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left p-4 font-medium text-gray-900">Template Name</th>
                          <th className="text-left p-4 font-medium text-gray-900">Category</th>
                          <th className="text-left p-4 font-medium text-gray-900">Cal Range</th>
                          <th className="text-left p-4 font-medium text-gray-900">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPlanTemplates.map(t => (
                          <tr key={t._id} className="border-b hover:bg-gray-50">
                            <td className="p-4">
                              <div>
                                <p className="font-medium text-gray-900">{t.name}</p>
                              </div>
                            </td>
                            <td className="p-4 text-sm">
                              <Badge className={getCategoryColor(t.category)}>{formatCategoryName(t.category)}</Badge>
                            </td>
                            <td className="p-4 text-sm text-gray-700">{t.targetCalories.min}-{t.targetCalories.max}</td>
                            <td className="p-4">
                              <div className="flex space-x-2">
                                <Button size="sm" variant="outline" asChild>
                                  <Link href={`/meal-plan-templates/${t._id}`}>View</Link>
                                </Button>
                                {(session?.user?.role === UserRole.DIETITIAN || session?.user?.role === UserRole.ADMIN) && (
                                  <>
                                    <Button size="sm" variant="outline" asChild>
                                      <Link href={`/meal-plan-templates/${t._id}/edit`}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Link>
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleDuplicateTemplate(t._id, 'plan', t.name)}
                                      disabled={duplicatingId === t._id}
                                      title="Duplicate template"
                                    >
                                      {duplicatingId === t._id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </>
                                )}
                                {(session?.user?.role === UserRole.ADMIN || session?.user?.role === UserRole.DIETITIAN) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDeleteTemplate(t._id, 'plan', t.name)}
                                    disabled={deletingId === t._id}
                                    title="Delete template"
                                    className="border-red-200 hover:bg-red-50"
                                  >
                                    {deletingId === t._id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="diet" className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative flex-1 min-w-55">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input placeholder="Search diet templates..." value={dietSearchTerm} onChange={e => setDietSearchTerm(e.target.value)} className="pl-10" />
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <ChefHat className="h-4 w-4" />
                    <span>{filteredDietTemplates.length} Templates</span>
                  </div>
                  {(session?.user?.role === UserRole.DIETITIAN || session?.user?.role === UserRole.ADMIN) && (
                    <Button asChild variant="outline">
                      <Link href="/meal-plan-templates/diet/create">
                        <Plus className="h-4 w-4 mr-2" />Create Diet Template
                      </Link>
                    </Button>
                  )}
                </div>
                {session?.user?.role === UserRole.ADMIN && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={dietViewTab === 'active' ? 'default' : 'outline'}
                      onClick={() => setDietViewTab('active')}
                    >
                      Active
                    </Button>
                    <Button
                      size="sm"
                      variant={dietViewTab === 'archived' ? 'default' : 'outline'}
                      onClick={() => setDietViewTab('archived')}
                    >
                      Archived
                    </Button>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-600">Dietary Restrictions</div>
                  <div className="flex flex-wrap gap-2">
                    {dietDietaryRestrictions.length > 0 && (
                      <Button variant="outline" onClick={() => setDietDietaryRestrictions([])} className="h-6 px-2 text-xs">Clear</Button>
                    )}
                    {dietDietaryRestrictions.length === 0 && <span className="text-[11px] text-gray-400">Select restrictions to filter</span>}
                    {dietaryRestrictionsList.map(r => {
                      const selected = dietDietaryRestrictions.includes(r);
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setDietDietaryRestrictions(prev => selected ? prev.filter(x => x !== r) : [...prev, r])}
                          className={`px-2 py-1 rounded border text-xs capitalize transition ${selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                        >
                          {r.replace('-', ' ')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
            {dietLoading ? (
              <div className="flex items-center justify-center h-32"><LoadingSpinner /></div>
            ) : filteredDietTemplates.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {dietViewTab === 'archived' ? 'No archived diet templates found' : 'No diet templates found'}
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {dietViewTab === 'archived' ? 'Archived templates will appear here.' : 'Try adjusting your search or restrictions'}
                  </p>
                  {dietViewTab !== 'archived' && (session?.user?.role === UserRole.DIETITIAN || session?.user?.role === UserRole.ADMIN) && (
                    <Button asChild>
                      <Link href="/meal-plan-templates/diet/create">
                        <Plus className="h-4 w-4 mr-2" />Create Diet Template
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left p-4 font-medium text-gray-900">Template Name</th>
                          <th className="text-left p-4 font-medium text-gray-900">Category</th>
                          <th className="text-left p-4 font-medium text-gray-900">Duration</th>
                          <th className="text-left p-4 font-medium text-gray-900">Restrictions</th>
                          <th className="text-left p-4 font-medium text-gray-900">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDietTemplates.map(t => (
                          <tr key={t._id} className="border-b hover:bg-gray-50">
                            <td className="p-4">
                              <div>
                                <p className="font-medium text-gray-900">{t.name}</p>
                                {t.isActive === false && (
                                  <Badge variant="outline" className="mt-1 border-amber-300 text-amber-700">Archived</Badge>
                                )}
                                <p className="text-xs text-gray-600 line-clamp-1">{t.description}</p>
                              </div>
                            </td>
                            <td className="p-4 text-sm">
                              <Badge className={getCategoryColor(t.category)}>{formatCategoryName(t.category)}</Badge>
                            </td>
                            <td className="p-4 text-sm text-gray-700">{t.duration} days</td>
                            <td className="p-4 text-xs text-gray-700">
                              {t.dietaryRestrictions && t.dietaryRestrictions.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {t.dietaryRestrictions.slice(0, 4).map((r, i) => (
                                    <Badge key={i} variant="outline" className="text-[10px] capitalize">{r.replace('-', ' ')}</Badge>
                                  ))}
                                  {t.dietaryRestrictions.length > 4 && (
                                    <Badge variant="outline" className="text-[10px]">+{t.dietaryRestrictions.length - 4}</Badge>
                                  )}
                                </div>
                              ) : <span className="text-gray-400">None</span>}
                            </td>
                            <td className="p-4">
                              <div className="flex space-x-2">
                                {dietViewTab !== 'archived' && t.isActive !== false && (
                                  <Button size="sm" variant="outline" asChild>
                                    <Link href={`/meal-plan-templates/diet/${t._id}`}>View</Link>
                                  </Button>
                                )}
                                {(session?.user?.role === UserRole.DIETITIAN || session?.user?.role === UserRole.ADMIN) && dietViewTab !== 'archived' && t.isActive !== false && (
                                  <>
                                    <Button size="sm" variant="outline" asChild>
                                      <Link href={`/meal-plan-templates/diet/${t._id}/edit`}>
                                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                                      </Link>
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleDuplicateTemplate(t._id, 'diet', t.name)}
                                      disabled={duplicatingId === t._id}
                                      title="Duplicate template"
                                    >
                                      {duplicatingId === t._id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5 mr-1" />
                                      )}
                                      Duplicate
                                    </Button>
                                  </>
                                )}
                                {(session?.user?.role === UserRole.ADMIN || session?.user?.role === UserRole.DIETITIAN) && dietViewTab !== 'archived' && t.isActive !== false && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDeleteTemplate(t._id, 'diet', t.name)}
                                    disabled={deletingId === t._id}
                                    title="Delete template"
                                    className="border-red-200 hover:bg-red-50"
                                  >
                                    {deletingId === t._id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                                    )}
                                  </Button>
                                )}
                                {session?.user?.role === UserRole.ADMIN && t.isActive === false && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleRestoreDietTemplate(t._id)}
                                  >
                                    Restore
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}>
          <DialogContent className="max-w-sm w-full rounded-xl p-5">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-600" />
                Delete Template
              </DialogTitle>
              <DialogDescription className="text-sm">
                Are you sure you want to delete{' '}
                <span className="font-semibold text-gray-900">&ldquo;{deleteDialog.templateName}&rdquo;</span>?
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeleteDialog(prev => ({ ...prev, open: false }))}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={executeDelete}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Yes, Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Duplicate Template Dialog */}
        <Dialog open={duplicateDialog.open} onOpenChange={(open) => setDuplicateDialog(prev => ({ ...prev, open }))}>
          <DialogContent className="max-w-sm w-100 rounded-xl p-5">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base flex items-center gap-2">
                <Copy className="h-4 w-4 text-blue-600" />
                Duplicate Template
              </DialogTitle>
              <DialogDescription className="text-xs">
                Copy of &ldquo;{duplicateDialog.originalName}&rdquo;
              </DialogDescription>
            </DialogHeader>
            <div className="pt-2 pb-3">
              <Label htmlFor="duplicate-name" className="text-xs font-medium mb-1.5 block text-gray-700">
                New Name
              </Label>
              <Input
                id="duplicate-name"
                value={duplicateDialog.newName}
                onChange={(e) => setDuplicateDialog(prev => ({ ...prev, newName: e.target.value }))}
                placeholder="Enter template name..."
                className="h-9 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') executeDuplicate();
                }}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setDuplicateDialog(prev => ({ ...prev, open: false }))}>
                Cancel
              </Button>
              <Button size="sm" onClick={executeDuplicate} disabled={!duplicateDialog.newName.trim()}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Duplicate
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

export default function MealPlanTemplatesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LoadingSpinner /></div>}>
      <MealPlanTemplatesPageContent />
    </Suspense>
  );
}
