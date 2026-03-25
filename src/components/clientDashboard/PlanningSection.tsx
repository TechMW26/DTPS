'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Plus, Edit, Trash2, Copy, ArrowLeft, ArrowRight, Utensils, Dumbbell, Eye, FileText, Image as ImageIcon, Video, Search, Loader2, Check, X, AlertTriangle, CreditCard, Clock, RefreshCw, MoreVertical, Repeat2, Pause, Play, Zap, Snowflake, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { DietPlanDashboard } from '@/components/dietplandashboard/DietPlanDashboard';
import { useDataRefresh, emitDataChange, DataEventTypes } from '@/lib/events/useDataRefresh';
import { DEFAULT_MEAL_TYPES_LIST } from '@/lib/mealConfig';

// Client Purchase interface
interface ClientPurchase {
  _id: string;
  planName: string;
  planCategory: string;
  durationDays: number;
  durationLabel: string;
  startDate: string;
  endDate: string;
  expectedStartDate?: string;
  expectedEndDate?: string;
  parentPurchaseId?: string;
  mealPlanCreated: boolean;
  daysUsed: number;
}

interface PaymentDetails {
  _id: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  transactionId?: string;
  paidAt: string;
  mealPlanCreated: boolean;
  mealPlanId?: string;
}

interface PurchaseNeedingMealPlan {
  _id: string;
  planName: string;
  planCategory: string;
  durationDays: number;
  durationLabel: string;
  daysUsed: number;
  remainingDays: number;
  mealPlanCreated: boolean;
  startDate: string;
  endDate: string;
  expectedStartDate?: string;
  expectedEndDate?: string;
  parentPurchaseId?: string;
}

interface PaymentCheckResult {
  hasPaidPlan: boolean;
  canCreateMealPlan: boolean;
  purchase?: ClientPurchase;
  payment?: PaymentDetails;
  remainingDays: number;
  maxDays: number;
  totalDaysUsed?: number;
  totalPurchasedDays?: number;
  message: string;
  // Aggregated data across all active purchases
  aggregated?: {
    totalPurchases: number;
    totalPurchasedDays: number;
    totalDaysUsed: number;
    totalRemainingDays: number;
    purchasesNeedingMealPlan: number;
  };
  // All purchases that need meal plans created
  allPurchasesNeedingMealPlan?: PurchaseNeedingMealPlan[];
}

interface DietPlan {
  _id?: string;
  title: string;
  status: string;
  calories: string;
  type: string;
  notes: string;
  startDate: string;
  endDate: string;
  days: number;
  progress: string;
}

interface DietTemplate {
  _id: string;
  name: string;
  description?: string;
  category: string;
  duration: number;
  targetCalories?: { min: number; max: number };
  targetMacros?: {
    protein: { min: number; max: number };
    carbs: { min: number; max: number };
    fat: { min: number; max: number };
  };
  mealTypes?: { name: string; time: string }[];
  meals?: any[];
  tags?: string[];
  goals?: {
    primaryGoal?: string;
    secondaryGoals?: string[];
  };
  dietaryRestrictions?: string[];
}

interface ClientData {
  _id: string;
  firstName: string;
  lastName: string;
  dietPlans?: DietPlan[];
  // Medical/dietary info for filtering recipes (can be string or array)
  dietaryRestrictions?: string | string[];
  medicalConditions?: string | string[];
  allergies?: string | string[];
}

interface PlanningSectionProps {
  client: ClientData;
  viewOnly?: boolean; // If true, hides create/edit options (for health counselor)
  onRegisterReset?: (fn: () => void) => void;
}

// Helper to convert array or string to comma-separated string
const toCommaString = (val?: string | string[]): string => {
  if (!val) return '';
  if (Array.isArray(val)) return val.join(', ');
  return val;
};

export default function PlanningSection({ client, viewOnly = false, onRegisterReset }: PlanningSectionProps) {
  // Form states
  const [step, setStep] = useState<'list' | 'form' | 'meals' | 'view'>('list');
  const [planTitle, setPlanTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(7);
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 6), 'yyyy-MM-dd'));
  const [primaryGoal, setPrimaryGoal] = useState<string>('weight-loss');

  // Template states
  const [templates, setTemplates] = useState<DietTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<DietTemplate | null>(null);
  const [templateType, setTemplateType] = useState<'plan' | 'diet'>('plan'); // Default to plan templates in planning flow
  const [templateSearch, setTemplateSearch] = useState('');
  const [templatePage, setTemplatePage] = useState(1);
  const [totalTemplates, setTotalTemplates] = useState(0);
  const TEMPLATES_PER_PAGE = 50;

  // Diet Date Selection modal state
  const [showDateSelectionModal, setShowDateSelectionModal] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<DietTemplate | null>(null);
  // Mapping: dateIndex → templateDayIndex (0-based), or -1 for Skip
  const [templateDayMapping, setTemplateDayMapping] = useState<Record<number, number>>({});

  // Meal plan states
  const [initialMeals, setInitialMeals] = useState<any[]>([]);
  const [initialMealTypes, setInitialMealTypes] = useState<{ name: string; time: string }[]>(DEFAULT_MEAL_TYPES_LIST);

  // Loading and saving states
  const [saving, setSaving] = useState(false);
  const [clientPlans, setClientPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  // Edit mode states
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [viewingPlan, setViewingPlan] = useState<any | null>(null);
  const [planKey, setPlanKey] = useState(0); // Force re-mount of DietPlanDashboard

  // Payment check states
  const [paymentCheck, setPaymentCheck] = useState<PaymentCheckResult | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);

  // Success dialog state
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdPlanInfo, setCreatedPlanInfo] = useState<{ days: number; remainingDays: number } | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  // Recalculate daysUsed based on actual meal plans
  const recalculateDaysUsed = async () => {
    if (!paymentCheck?.purchase?._id) return;

    setRecalculating(true);
    try {
      const res = await fetch('/api/client-purchases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseId: paymentCheck.purchase._id,
          action: 'recalculate'
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Days recalculated: ${data.oldDaysUsed} → ${data.newDaysUsed}`);
        checkPaymentStatus(); // Refresh to show new values
      } else {
        toast.error(data.error || 'Failed to recalculate');
      }
    } catch (error) {
      console.error('Error recalculating days:', error);
      toast.error('Failed to recalculate days used');
    } finally {
      setRecalculating(false);
    }
  };

  // Check client's payment status (also syncs with Razorpay)
  const checkPaymentStatus = async (showToast = false) => {
    setCheckingPayment(true);
    try {
      // The check API now automatically syncs pending payments with Razorpay
      const res = await fetch(`/api/client-purchases/check?clientId=${client._id}`);
      if (!res.ok) {
        console.error('Payment check failed with status:', res.status);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setPaymentCheck(data);
        if (showToast) {
          if (data.hasPaidPlan) {
            toast.success(`Payment verified! ${data.remainingDays} days remaining`);
          } else {
            toast.info('No active paid plan found. Payment may still be processing.');
          }
        }
      }
    } catch (error) {
      console.error('Error checking payment status:', error);
      if (showToast) {
        toast.error('Error checking payment status');
      }
    } finally {
      setCheckingPayment(false);
    }
  };

  // Check payment on mount
  useEffect(() => {
    checkPaymentStatus();
  }, [client._id]);

  // ============ DRAFT AUTO-SAVE TO DB ============
  const [draftPlanId, setDraftPlanId] = useState<string | null>(null); // Tracks the draft plan _id in DB
  const [draftSaveStatus, setDraftSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const latestMealDataRef = useRef<{ meals: any[]; mealTypes: { name: string; time: string }[] } | null>(null);
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const draftSaveInProgressRef = useRef(false);
  const draftSaveFailCountRef = useRef(0); // Track consecutive failures for backoff

  // Called by DietPlanDashboard on every meal data change
  const isEditModeRef = useRef(isEditMode);
  const editingPlanRef = useRef(editingPlan);
  isEditModeRef.current = isEditMode;
  editingPlanRef.current = editingPlan;

  const handleMealDataChange = useCallback((weekPlan: any[], mealTypes: { name: string; time: string }[]) => {
    latestMealDataRef.current = { meals: weekPlan, mealTypes };
    // Reset fail count when new data arrives (user is still working)
    draftSaveFailCountRef.current = 0;

    // Debounce: save 2 seconds after last change (only for new plans or draft edits)
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    if (step === 'meals' && (!isEditModeRef.current || editingPlanRef.current?.status === 'draft')) {
      autosaveTimerRef.current = setTimeout(() => {
        saveDraftRef.current?.();
      }, 2000);
    }
  }, [step]);

  // Use a ref for the latest save function to avoid stale closures in setInterval
  const saveDraftRef = useRef<() => Promise<void>>();

  // Save draft to DB
  const saveDraftToDB = useCallback(async () => {
    if (draftSaveInProgressRef.current) return;
    if (!latestMealDataRef.current) return;
    if (!planTitle.trim()) return;
    if (!startDate || !endDate) return;

    // Stop retrying after 3 consecutive failures
    if (draftSaveFailCountRef.current >= 3) return;

    draftSaveInProgressRef.current = true;
    setDraftSaveStatus('saving');

    try {
      const startDateObj = new Date(startDate);
      const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const mealsData = latestMealDataRef.current.meals;
      const mealTypesData = latestMealDataRef.current.mealTypes;

      const mealsWithDates = mealsData.map((day: any, index: number) => {
        const dayDate = addDays(startDateObj, index);
        const dateOfMonth = dayDate.getDate();
        const dayName = fullDayNames[dayDate.getDay()];
        const dateStr = format(dayDate, 'yyyy-MM-dd');
        return {
          ...day,
          date: dateStr,
          day: `${dateOfMonth} - Day ${index + 1} - ${dayName}`
        };
      });

      // Clean mealTypes to only include name and time (strip DB fields like _id)
      const cleanMealTypes = mealTypesData?.map(mt => ({
        name: String(mt.name || ''),
        time: String(mt.time || '12:00 PM')
      }));

      const payload: any = {
        name: planTitle,
        description: description || undefined,
        startDate,
        endDate,
        duration,
        meals: mealsWithDates,
        mealTypes: cleanMealTypes,
        customizations: {
          targetCalories: selectedTemplate?.targetCalories?.max || 2000,
          targetMacros: {
            protein: selectedTemplate?.targetMacros?.protein?.max || 150,
            carbs: selectedTemplate?.targetMacros?.carbs?.max || 250,
            fat: selectedTemplate?.targetMacros?.fat?.max || 65
          }
        },
        goals: { primaryGoal: primaryGoal || 'health-improvement' },
        status: 'draft'
      };

      if (draftPlanId) {
        // Update existing draft
        const res = await fetch(`/api/client-meal-plans/${draftPlanId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          setDraftSaveStatus('saved');
          draftSaveFailCountRef.current = 0;
        } else {
          const errData = await res.json().catch(() => ({}));
          console.error('Draft update failed:', res.status, errData);
          setDraftSaveStatus('error');
          draftSaveFailCountRef.current += 1;
        }
      } else {
        // Create new draft
        payload.clientId = client._id;
        if (selectedTemplate?._id) payload.templateId = selectedTemplate._id;
        if (paymentCheck?.purchase?._id) payload.purchaseId = paymentCheck.purchase._id;

        const res = await fetch('/api/client-meal-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.mealPlan?._id) {
            setDraftPlanId(data.mealPlan._id);
          }
          setDraftSaveStatus('saved');
          draftSaveFailCountRef.current = 0;
        } else {
          const errData = await res.json().catch(() => ({}));
          console.error('Draft create failed:', res.status, errData);
          setDraftSaveStatus('error');
          draftSaveFailCountRef.current += 1;
        }
      }
    } catch (error) {
      console.error('Draft auto-save failed:', error);
      setDraftSaveStatus('error');
      draftSaveFailCountRef.current += 1;
    } finally {
      draftSaveInProgressRef.current = false;
    }
  }, [planTitle, description, startDate, endDate, duration, primaryGoal, selectedTemplate, draftPlanId, client._id, paymentCheck]);

  // Keep the ref always pointing to the latest save function
  saveDraftRef.current = saveDraftToDB;

  // Cleanup autosave timer when leaving meals step
  useEffect(() => {
    if (step !== 'meals') {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    }
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [step]);
  // ============ END DRAFT AUTO-SAVE ============

  // Don't auto-restore drafts on mount - this was causing navigation issues
  // Drafts will be restored only when user explicitly clicks "Create New Plan"
  // The hasMountedRef is no longer needed for this purpose

  // Calculate end date when duration or start date changes
  useEffect(() => {
    if (startDate && duration > 0) {
      const start = new Date(startDate);
      const end = addDays(start, duration - 1);
      setEndDate(format(end, 'yyyy-MM-dd'));
    }
  }, [startDate, duration]);

  // Helper function to check if a plan is currently running (today is within date range)
  const isPlanRunning = (plan: any): boolean => {
    if (!plan || plan.status !== 'active') return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(plan.startDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(plan.endDate);
    endDate.setHours(0, 0, 0, 0);

    return today >= startDate && today <= endDate;
  };

  // Fetch client's existing meal plans
  useEffect(() => {
    fetchClientPlans();
  }, [client._id]);

  // Register reset callback for floating back button
  useEffect(() => {
    if (onRegisterReset) {
      onRegisterReset(() => {
        setStep('list');
        fetchClientPlans();
        checkPaymentStatus();
      });
    }
  }, [onRegisterReset]);

  // Subscribe to data change events for automatic refresh
  useDataRefresh(
    [
      DataEventTypes.MEAL_PLAN_UPDATED,
      DataEventTypes.MEAL_PLAN_CREATED,
      DataEventTypes.MEAL_PLAN_DELETED,
      DataEventTypes.MEAL_PLAN_FROZEN,
      DataEventTypes.MEAL_PLAN_UNFROZEN,
      DataEventTypes.MEAL_PLAN_EXTENDED,
      DataEventTypes.MEAL_PLAN_PAUSED,
      DataEventTypes.MEAL_PLAN_RESUMED,
      DataEventTypes.PURCHASE_UPDATED,
      DataEventTypes.PAYMENT_UPDATED,
    ],
    () => {
      fetchClientPlans(true); // Silent refresh when data changes
      checkPaymentStatus(); // Also refresh payment status
    },
    [client._id]
  );

  const fetchClientPlans = async (silent = false) => {
    try {
      if (!silent) setLoadingPlans(true);
      const res = await fetch(`/api/client-meal-plans?clientId=${client._id}`);
      if (!res.ok) {
        console.error('Failed to fetch client plans with status:', res.status);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setClientPlans(data.mealPlans || []);
      }
    } catch (error) {
      console.error('Error fetching client plans:', error);
    } finally {
      if (!silent) setLoadingPlans(false);
    }
  };

  // Fetch templates based on templateType with pagination and search
  const fetchTemplates = async (type: 'plan' | 'diet' = templateType, page: number = 1, search: string = '') => {
    try {
      setLoadingTemplates(true);
      // Plan templates use /api/meal-plan-templates?templateType=plan
      // Diet templates use /api/diet-templates
      const params = new URLSearchParams({
        page: page.toString(),
        limit: TEMPLATES_PER_PAGE.toString(),
        skip: ((page - 1) * TEMPLATES_PER_PAGE).toString(),
        ...(search && { search }),
        // Only filter by primaryGoal for diet templates, show ALL plan templates
        ...(type === 'diet' && primaryGoal && { primaryGoal })
      });

      const url = type === 'plan'
        ? `/api/meal-plan-templates?templateType=plan&${params.toString()}`
        : `/api/diet-templates?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.error('Failed to fetch templates with status:', res.status);
        return;
      }
      const data = await res.json();
      if (data.success) {
        let fetchedTemplates = data.templates || [];

        // Filter out templates that have dietary restrictions matching the client's restrictions
        // If client has "Non-Vegetarian" restriction, hide templates tagged with "Non-Vegetarian"
        const clientRestrictions = toCommaString(client.dietaryRestrictions)
          .split(',')
          .map(s => s.trim().toLowerCase())
          .filter(Boolean);

        if (type === 'diet' && clientRestrictions.length > 0) {
          fetchedTemplates = fetchedTemplates.filter((template: DietTemplate) => {
            const templateRestrictions = (template.dietaryRestrictions || [])
              .map(r => r.toLowerCase().trim());

            // Exclude template if ANY of its dietary restrictions match client's restrictions
            const hasMatchingRestriction = clientRestrictions.some(clientRestr =>
              templateRestrictions.includes(clientRestr)
            );

            return !hasMatchingRestriction;
          });
        }

        setTemplates(fetchedTemplates);
        setTotalTemplates(data.total || fetchedTemplates.length || 0);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Debounced search for templates
  useEffect(() => {
    if (showTemplateDialog) {
      const timer = setTimeout(() => {
        fetchTemplates(templateType, 1, templateSearch);
        setTemplatePage(1);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [templateSearch, primaryGoal]);

  // Load template data into form
  const loadTemplate = (template: DietTemplate) => {
    // For diet templates with meals, switch to mapping view inside the same dialog
    if (template.meals && template.meals.length > 0) {
      setPendingTemplate(template);
      // Initialize default mapping: sequentially map template days, skip rest
      const templateDaysCount = template.meals.length;
      const defaultMapping: Record<number, number> = {};
      for (let i = 0; i < duration; i++) {
        defaultMapping[i] = i < templateDaysCount ? i : -1;
      }
      setTemplateDayMapping(defaultMapping);
      // Dialog stays open — pendingTemplate switches the view to mapping
      return;
    }

    // For plan templates or templates without meals, load directly
    applyTemplateDirectly(template);
  };

  // Apply template directly without date mapping (for plan templates)
  const applyTemplateDirectly = (template: DietTemplate) => {
    // Only load title and description — keep user's duration, dates, meal types, and meals
    setPlanTitle(template.name);
    setDescription(template.description || '');
    setSelectedTemplate(template);

    if (template.mealTypes && template.mealTypes.length > 0) {
      setInitialMealTypes(template.mealTypes);
    }

    if (template.meals && template.meals.length > 0) {
      // In edit mode, merge template meals with existing meals instead of overwriting
      if (isEditMode && initialMeals.length > 0) {
        const templateMealsList = template.meals!;
        const mergedMeals = initialMeals.map((existingDay: any, i: number) => {
          const templateDay = templateMealsList[i];
          if (!templateDay || !templateDay.meals) return existingDay;

          // Deep clone the existing day's meals
          const mergedDayMeals = existingDay.meals ? { ...existingDay.meals } : {};

          // Only add meal types from template that don't already have food data
          Object.keys(templateDay.meals).forEach((mealType: string) => {
            const existingMeal = mergedDayMeals[mealType];
            const hasFoodData = existingMeal?.foodOptions?.some((opt: any) => opt.food?.trim());
            if (!hasFoodData) {
              // No existing data for this meal type — use template data
              mergedDayMeals[mealType] = deepCloneMealDay({ meals: { [mealType]: templateDay.meals[mealType] } })[mealType];
            }
          });

          return { ...existingDay, meals: mergedDayMeals };
        });
        setInitialMeals(mergedMeals);
      } else {
        setInitialMeals(template.meals);
      }
    }

    // Force DietPlanDashboard to re-mount with new meals
    setPlanKey(prev => prev + 1);

    setShowTemplateDialog(false);
    toast.success(`Template "${template.name}" loaded successfully`);
  };

  // Deep clone a meal day's data to avoid reference sharing between days
  const deepCloneMealDay = (sourceDay: any) => {
    const clonedMeals: Record<string, any> = {};
    if (sourceDay.meals && typeof sourceDay.meals === 'object') {
      Object.keys(sourceDay.meals).forEach(mealType => {
        const meal = sourceDay.meals[mealType];
        if (!meal) return;
        clonedMeals[mealType] = {
          ...meal,
          id: meal.id || `meal-${mealType.toLowerCase().replace(/\s+/g, '-')}`,
          name: meal.name || mealType,
          time: meal.time || '',
          foodOptions: (meal.foodOptions || []).map((opt: any) => ({
            ...opt,
            id: opt.id || `food-${Math.random().toString(36).substring(2, 9)}`,
            foods: opt.foods ? opt.foods.map((f: any) => ({ ...f })) : undefined,
          })),
        };
      });
    }
    return clonedMeals;
  };

  // Apply template with date→day mapping from the Date Selection modal
  const applyTemplateMappingToMeals = () => {
    if (!pendingTemplate || !pendingTemplate.meals) return;

    const template = pendingTemplate;
    const templateMeals = template.meals;

    // Build the mapped meals array based on user's day selection
    const mappedMeals: any[] = [];
    const baseDate = new Date(startDate);

    for (let i = 0; i < duration; i++) {
      const templateDayIndex = templateDayMapping[i];
      const dayDate = addDays(baseDate, i);
      const dateStr = format(dayDate, 'yyyy-MM-dd');

      // In edit mode, preserve existing day data as base
      const existingDay = isEditMode && initialMeals[i] ? initialMeals[i] : null;

      if (templateDayIndex === undefined || templateDayIndex === -1) {
        // Skip — keep existing day data if editing, otherwise push empty
        if (existingDay) {
          mappedMeals.push({ ...existingDay, date: dateStr });
        } else {
          mappedMeals.push({
            id: `day-${i}`,
            day: `Day ${i + 1}`,
            date: dateStr,
            meals: {},
            note: ''
          });
        }
      } else {
        // Use the template day's data — deep clone to avoid reference issues
        const sourceDay = templateMeals?.[templateDayIndex];
        if (sourceDay) {
          const clonedMeals = deepCloneMealDay(sourceDay);

          if (existingDay && existingDay.meals) {
            // Merge: template meals fill in empty slots, existing data takes priority
            const mergedMeals = { ...existingDay.meals };
            Object.keys(clonedMeals).forEach(mealType => {
              const existing = mergedMeals[mealType];
              const hasFoodData = existing?.foodOptions?.some((opt: any) => opt.food?.trim());
              if (!hasFoodData) {
                mergedMeals[mealType] = clonedMeals[mealType];
              }
            });
            mappedMeals.push({
              ...existingDay,
              date: dateStr,
              meals: mergedMeals,
              note: existingDay.note || sourceDay.note || '',
            });
          } else {
            mappedMeals.push({
              id: `day-${i}`,
              day: `Day ${i + 1}`,
              date: dateStr,
              meals: clonedMeals,
              note: sourceDay.note || '',
            });
          }
        } else {
          if (existingDay) {
            mappedMeals.push({ ...existingDay, date: dateStr });
          } else {
            mappedMeals.push({
              id: `day-${i}`,
              day: `Day ${i + 1}`,
              date: dateStr,
              meals: {},
              note: ''
            });
          }
        }
      }
    }

    // Set template reference — keep user's plan name and description
    setSelectedTemplate(template);

    if (template.mealTypes && template.mealTypes.length > 0) {
      setInitialMealTypes(template.mealTypes);
    }

    // Set the mapped meals — this triggers DietPlanDashboard to rebuild weekPlan
    setInitialMeals(mappedMeals);

    // Force DietPlanDashboard to re-mount with new meals
    setPlanKey(prev => prev + 1);

    // Close the dialog and reset mapping state
    setShowTemplateDialog(false);
    setPendingTemplate(null);
    setTemplateDayMapping({});

    toast.success(`Template "${template.name}" loaded with custom day mapping`);
  };

  // Fetch the latest meal plan's end date from already fetched clientPlans
  const getLatestMealPlanEndDate = (): string | null => {
    if (clientPlans && clientPlans.length > 0) {
      const sortedPlans = [...clientPlans].sort((a: any, b: any) =>
        new Date(b.endDate).getTime() - new Date(a.endDate).getTime()
      );
      return sortedPlans[0].endDate;
    }
    return null;
  };

  // Initialize start date based on latest plan's end date + 1, respecting expected dates
  const initializeStartDate = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const expectedStartDate = paymentCheck?.purchase?.expectedStartDate
      ? format(new Date(paymentCheck.purchase.expectedStartDate), 'yyyy-MM-dd')
      : null;
    const expectedEndDate = paymentCheck?.purchase?.expectedEndDate
      ? format(new Date(paymentCheck.purchase.expectedEndDate), 'yyyy-MM-dd')
      : null;

    // Get latest meal plan's end date
    const latestEndDate = getLatestMealPlanEndDate();

    let newStartDate = today;

    if (latestEndDate) {
      // Start from day after last plan ends
      newStartDate = format(addDays(new Date(latestEndDate), 1), 'yyyy-MM-dd');
    } else if (expectedStartDate) {
      // No existing plans - use expected start date if available
      newStartDate = expectedStartDate;
    }

    // Validate against expected dates if set
    if (expectedStartDate && expectedEndDate) {
      // If calculated start date is before expected start, use expected start
      if (newStartDate < expectedStartDate) {
        newStartDate = expectedStartDate;
      }
      // If calculated start date is after expected end, still allow but show warning later
      if (newStartDate > expectedEndDate) {
      }
    }

    setStartDate(newStartDate);
  };

  // Helper function to check for overlapping meal plans
  const checkDateOverlap = (newStart: string, newEnd: string, excludePlanId?: string) => {
    const newStartDate = new Date(newStart);
    const newEndDate = new Date(newEnd);

    for (const plan of clientPlans) {
      // Skip the plan being edited
      if (excludePlanId && plan._id === excludePlanId) continue;

      const planStart = new Date(plan.startDate);
      const planEnd = new Date(plan.endDate);

      // Check if date ranges overlap
      // Overlap occurs when: newStart <= planEnd AND newEnd >= planStart
      if (newStartDate <= planEnd && newEndDate >= planStart) {
        // Return the overlapping plan info with next available date
        const nextAvailableDate = addDays(planEnd, 1);
        return {
          hasOverlap: true,
          overlappingPlan: plan,
          nextAvailableDate: format(nextAvailableDate, 'yyyy-MM-dd'),
          nextAvailableDateFormatted: format(nextAvailableDate, 'dd MMM yyyy')
        };
      }
    }

    return { hasOverlap: false };
  };

  // Handle form submission - move to meals step
  const handleFormSubmit = () => {
    if (!planTitle.trim()) {
      toast.error('Please enter a plan title');
      return;
    }
    if (duration < 1) {
      toast.error('Duration must be at least 1 day');
      return;
    }
    // Check if duration exceeds remaining days in paid plan (only for new plans)
    if (!isEditMode && paymentCheck?.hasPaidPlan && duration > paymentCheck.remainingDays) {
      toast.error(`Duration cannot exceed ${paymentCheck.remainingDays} days (remaining in client's plan)`);
      return;
    }
    // Warn if no paid plan (but allow for editing existing plans)
    if (!isEditMode && !paymentCheck?.hasPaidPlan) {
      toast.error('Client needs to purchase a plan first');
      return;
    }

    // Validate start date is within expected range if set (only for new plans, not when editing)
    if (!isEditMode && paymentCheck?.purchase?.expectedStartDate && paymentCheck?.purchase?.expectedEndDate) {
      const expectedStart = new Date(paymentCheck.purchase.expectedStartDate);
      const expectedEnd = new Date(paymentCheck.purchase.expectedEndDate);
      const planStartDate = new Date(startDate);

      if (planStartDate < expectedStart) {
        toast.error(`Start date must be on or after expected start date (${format(expectedStart, 'dd MMM yyyy')})`);
        return;
      }
      if (planStartDate > expectedEnd) {
        toast.error(`Start date must be on or before expected end date (${format(expectedEnd, 'dd MMM yyyy')})`);
        return;
      }
      // Note: End date CAN be outside expected dates - no restriction
    }

    // Check for overlapping meal plans (exclude current plan if editing)
    const overlapResult = checkDateOverlap(startDate, endDate, isEditMode ? editingPlan?._id : undefined);
    if (overlapResult.hasOverlap) {
      toast.error(
        `Plan dates overlap with existing plan "${overlapResult.overlappingPlan?.name}". ` +
        `Choose a start date on or after ${overlapResult.nextAvailableDateFormatted}.`
      );
      return;
    }

    setStep('meals');
  };

  // Handle publishing the meal plan (makes it active and visible to client)
  const handlePublishPlan = async (mealsData: any[], mealTypesData?: { name: string; time: string }[]) => {
    try {
      setSaving(true);

      // Calculate proper dates for each day based on startDate
      const startDateObj = new Date(startDate);
      const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      const mealsWithDates = mealsData.map((day, index) => {
        const dayDate = addDays(startDateObj, index);
        const dateOfMonth = dayDate.getDate();
        const dayName = fullDayNames[dayDate.getDay()];
        const dateStr = format(dayDate, 'yyyy-MM-dd');

        return {
          ...day,
          date: dateStr,
          day: `${dateOfMonth} - Day ${index + 1} - ${dayName}`
        };
      });

      const finalMealTypes = mealTypesData && mealTypesData.length > 0 ? mealTypesData : initialMealTypes;

      let data: any;

      if (draftPlanId) {
        // Publish existing draft → update status to active
        const payload: any = {
          name: planTitle,
          description,
          startDate,
          endDate,
          duration,
          meals: mealsWithDates,
          mealTypes: finalMealTypes,
          customizations: {
            targetCalories: selectedTemplate?.targetCalories?.max || 2000,
            targetMacros: {
              protein: selectedTemplate?.targetMacros?.protein?.max || 150,
              carbs: selectedTemplate?.targetMacros?.carbs?.max || 250,
              fat: selectedTemplate?.targetMacros?.fat?.max || 65
            }
          },
          goals: { primaryGoal },
          status: 'active'
        };

        const res = await fetch(`/api/client-meal-plans/${draftPlanId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error('Failed to publish plan:', res.status, errorText);
          toast.error('Failed to publish diet plan. Server error.');
          return;
        }
        data = await res.json();
        if (data.success) {
          data.mealPlan = data.mealPlan || { _id: draftPlanId };
        }
      } else {
        // Create new plan directly as active
        const payload: any = {
          clientId: client._id,
          name: planTitle,
          description,
          startDate,
          endDate,
          duration,
          meals: mealsWithDates,
          mealTypes: finalMealTypes,
          customizations: {
            targetCalories: selectedTemplate?.targetCalories?.max || 2000,
            targetMacros: {
              protein: selectedTemplate?.targetMacros?.protein?.max || 150,
              carbs: selectedTemplate?.targetMacros?.carbs?.max || 250,
              fat: selectedTemplate?.targetMacros?.fat?.max || 65
            }
          },
          goals: { primaryGoal },
          status: 'active'
        };

        if (selectedTemplate?._id) payload.templateId = selectedTemplate._id;
        if (paymentCheck?.purchase?._id) payload.purchaseId = paymentCheck.purchase._id;

        const res = await fetch('/api/client-meal-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error('Failed to create plan:', res.status, errorText);
          toast.error('Failed to create diet plan. Server error.');
          return;
        }
        data = await res.json();
      }

      if (data.success) {
        // Show payment warning if plan was created without a linked payment
        if (data.paymentWarning) {
          toast.warning(data.paymentWarning, { duration: 8000 });
        }

        // Keep latest meal type timings in local state
        setInitialMealTypes(finalMealTypes);

        // Update client purchase - ADD days used (do not change expected dates)
        if (paymentCheck?.purchase?._id) {
          try {
            await fetch('/api/client-purchases', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                purchaseId: paymentCheck.purchase._id,
                mealPlanId: data.mealPlan?._id,
                mealPlanCreated: true,
                addDaysUsed: duration  // ADD to existing days used
              })
            });
          } catch (updateError) {
            console.error('Error updating purchase record:', updateError);
          }
        }

        // Update Payment record - mark mealPlanCreated as true
        if (paymentCheck?.payment?._id) {
          try {
            await fetch('/api/payments', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                paymentId: paymentCheck.payment._id,
                mealPlanId: data.mealPlan?._id,
                mealPlanCreated: true,
              })
            });
          } catch (updateError) {
            console.error('Error updating payment record:', updateError);
          }
        }

        // Calculate remaining days after this plan
        const remainingAfterPlan = Math.max(0, (paymentCheck?.remainingDays || 0) - duration);

        // Show success dialog
        setCreatedPlanInfo({
          days: duration,
          remainingDays: remainingAfterPlan
        });
        setShowSuccessDialog(true);

        // Emit event to trigger automatic refresh across all components
        emitDataChange(DataEventTypes.MEAL_PLAN_CREATED, { planId: data.mealPlan?._id });

        resetForm();
        fetchClientPlans();
        checkPaymentStatus(); // Refresh payment status
      } else {
        toast.error(data.error || 'Failed to publish diet plan');
      }
    } catch (error) {
      console.error('Error publishing plan:', error);
      toast.error('Failed to publish diet plan');
    } finally {
      setSaving(false);
    }
  };

  // Manual draft save (triggered by Save Draft button)
  const handleManualDraftSave = useCallback(async () => {
    if (!latestMealDataRef.current) {
      toast.info('No changes to save');
      return;
    }
    draftSaveFailCountRef.current = 0; // Reset backoff on manual save
    await saveDraftToDB();
    if (draftSaveStatus !== 'error') {
      toast.success('Draft saved successfully');
    }
  }, [saveDraftToDB, draftSaveStatus]);

  const resetForm = () => {
    setStep('list');
    setPlanTitle('');
    setDescription('');
    setDuration(7);
    setStartDate(format(new Date(), 'yyyy-MM-dd'));
    setPrimaryGoal('weight-loss');
    setSelectedTemplate(null);
    setInitialMeals([]);
    setInitialMealTypes(DEFAULT_MEAL_TYPES_LIST);
    setEditingPlan(null);
    setIsEditMode(false);
    setViewingPlan(null);
    setPlanKey(prev => prev + 1); // Reset key to force fresh component

    // Reset draft state
    setDraftPlanId(null);
    setDraftSaveStatus('idle');
    latestMealDataRef.current = null;
  };

  // Delete draft plan state
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Delete a draft plan
  const handleDeleteDraft = async (planId: string) => {
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/client-meal-plans/${planId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Draft deleted successfully');
        emitDataChange(DataEventTypes.MEAL_PLAN_DELETED, { planId });
        fetchClientPlans();
        // If we're viewing/editing this plan, go back to list
        if (editingPlan?._id === planId || viewingPlan?._id === planId) {
          resetForm();
        }
      } else {
        toast.error('Failed to delete draft');
      }
    } catch (error) {
      console.error('Error deleting draft:', error);
      toast.error('Failed to delete draft');
    } finally {
      setIsDeleting(false);
      setDeletingPlanId(null);
    }
  };

  // View plan details
  const handleViewPlan = (plan: any) => {

    // Log first day's meals for debugging
    if (plan.meals && plan.meals.length > 0) {
    }

    // Use stored duration if available, otherwise calculate from dates
    const planDuration = plan.duration || Math.ceil((new Date(plan.endDate).getTime() - new Date(plan.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const planMeals = plan.meals || [];
    const planMealTypes = plan.mealTypes || DEFAULT_MEAL_TYPES_LIST;

    // Clear any stale edit state before viewing
    setEditingPlan(null);
    setIsEditMode(false);

    setViewingPlan(plan);
    setPlanTitle(plan.name);
    setDescription(plan.description || '');
    setStartDate(format(new Date(plan.startDate), 'yyyy-MM-dd'));
    setEndDate(format(new Date(plan.endDate), 'yyyy-MM-dd'));
    setDuration(planDuration);
    setPrimaryGoal(plan.goals?.primaryGoal || 'health-improvement');
    setInitialMeals(planMeals);
    setInitialMealTypes(planMealTypes);
    setPlanKey(prev => prev + 1); // Force re-mount
    setStep('view');
  };

  // Edit plan
  const handleEditPlan = (plan: any) => {

    // Log first day's meals for debugging
    if (plan.meals && plan.meals.length > 0) {
    }

    // Use stored duration if available, otherwise calculate from dates
    const planDuration = plan.duration || Math.ceil((new Date(plan.endDate).getTime() - new Date(plan.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const planMeals = plan.meals || [];
    const planMealTypes = plan.mealTypes || DEFAULT_MEAL_TYPES_LIST;


    setEditingPlan(plan);
    setIsEditMode(true);
    setPlanTitle(plan.name);
    setDescription(plan.description || '');
    setStartDate(format(new Date(plan.startDate), 'yyyy-MM-dd'));
    setEndDate(format(new Date(plan.endDate), 'yyyy-MM-dd'));
    setDuration(planDuration);
    setPrimaryGoal(plan.goals?.primaryGoal || 'health-improvement');
    setInitialMeals(planMeals);
    setInitialMealTypes(planMealTypes);
    setPlanKey(prev => prev + 1); // Force re-mount
    // If editing a draft, set draftPlanId so autosave works
    if (plan.status === 'draft') {
      setDraftPlanId(plan._id);
    }
    setStep('meals');
  };

  // Update existing plan
  const handleUpdatePlan = async (mealsData: any[], mealTypesData?: { name: string; time: string }[]) => {
    if (!editingPlan?._id) return;

    try {
      setSaving(true);

      // Calculate proper dates for each day based on startDate
      const startDateObj = new Date(startDate);
      const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      const mealsWithDates = mealsData.map((day, index) => {
        const dayDate = addDays(startDateObj, index);
        const dateOfMonth = dayDate.getDate();
        const dayName = fullDayNames[dayDate.getDay()];
        const dateStr = format(dayDate, 'yyyy-MM-dd');

        return {
          ...day,
          date: dateStr,
          day: `${dateOfMonth} - Day ${index + 1} - ${dayName}`
        };
      });

      const finalMealTypes = mealTypesData && mealTypesData.length > 0 ? mealTypesData : initialMealTypes;

      const payload: any = {
        name: planTitle,
        description,
        startDate,
        endDate,
        duration,
        meals: mealsWithDates,
        mealTypes: finalMealTypes,
        customizations: {
          targetCalories: selectedTemplate?.targetCalories?.max || editingPlan.customizations?.targetCalories || 2000,
          targetMacros: {
            protein: selectedTemplate?.targetMacros?.protein?.max || editingPlan.customizations?.targetMacros?.protein || 150,
            carbs: selectedTemplate?.targetMacros?.carbs?.max || editingPlan.customizations?.targetMacros?.carbs || 250,
            fat: selectedTemplate?.targetMacros?.fat?.max || editingPlan.customizations?.targetMacros?.fat || 65
          }
        },
        goals: {
          primaryGoal
        }
      };

      const res = await fetch(`/api/client-meal-plans/${editingPlan._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Failed to update plan:', res.status, errorText);
        toast.error('Failed to update diet plan. Server error.');
        return;
      }
      const data = await res.json();

      if (data.success) {
        // Keep latest meal type timings in local state
        setInitialMealTypes(finalMealTypes);

        toast.success('Diet plan updated successfully!');
        // Emit event to trigger automatic refresh across all components
        emitDataChange(DataEventTypes.MEAL_PLAN_UPDATED, { planId: editingPlan._id });
        resetForm();
        fetchClientPlans();
      } else {
        toast.error(data.error || 'Failed to update diet plan');
      }
    } catch (error) {
      console.error('Error updating plan:', error);
      toast.error('Failed to update diet plan');
    } finally {
      setSaving(false);
    }
  };

  // Duplicate plan
  const handleDuplicatePlan = (plan: any) => {
    // Check if client has active payment
    if (!paymentCheck?.hasPaidPlan) {
      toast.error('Client needs to purchase a plan first before duplicating meal plans');
      return;
    }

    // Check if client has remaining days
    if (paymentCheck.remainingDays <= 0) {
      toast.error('All plan days have been used. Client needs to purchase a new plan.');
      return;
    }

    setPlanTitle(`${plan.name} (Copy)`);
    setDescription(plan.description || '');
    setStartDate(format(new Date(), 'yyyy-MM-dd'));
    // Use stored duration if available, otherwise calculate from dates
    const planDuration = plan.duration || Math.ceil((new Date(plan.endDate).getTime() - new Date(plan.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    setDuration(planDuration);
    setPrimaryGoal(plan.goals?.primaryGoal || 'health-improvement');
    setInitialMeals(plan.meals || []);
    setInitialMealTypes(plan.mealTypes || DEFAULT_MEAL_TYPES_LIST);
    setIsEditMode(false);
    setEditingPlan(null);
    setStep('form');
    toast.info('Plan duplicated. Make changes and save as new.');
  };

  // Helper function to parse date string to Date object (handles timezone)
  const parseDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  };

  // Extend plan with cascading date adjustments for ALL meal plans
  const handleExtendPlan = async (plan: any, newStartDate?: string, newEndDate?: string) => {
    if (!newStartDate || !newEndDate) {
      toast.error('Please select dates');
      return;
    }

    // Validate date range on frontend (using parseDate for consistent handling)
    if (parseDate(newStartDate) > parseDate(newEndDate)) {
      toast.error('Start date cannot be after end date');
      return;
    }

    try {
      // Validate date range on frontend (using parseDate for consistent handling)
      if (parseDate(newStartDate) > parseDate(newEndDate)) {
        toast.error('Start date cannot be after end date');
        return;
      }

      // Calculate original duration - ALWAYS PRESERVE THIS
      const originalDuration = Math.ceil(
        (new Date(plan.endDate).getTime() - new Date(plan.startDate).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;

      let finalStartDate = newStartDate;
      let finalEndDate: string;

      // Always calculate end date based on new start date and ORIGINAL duration
      // This ensures duration NEVER changes
      finalEndDate = format(addDays(parseDate(newStartDate), Math.max(0, originalDuration - 1)), 'yyyy-MM-dd');

      // Final validation - make sure start is not after end
      const finalStart = parseDate(finalStartDate);
      const finalEnd = parseDate(finalEndDate);
      if (finalStart > finalEnd) {
        toast.error('Invalid date range calculated. Start date cannot be after end date.');
        return;
      }

      // Update current plan
      const payload = {
        startDate: finalStartDate,
        endDate: finalEndDate
      };

      const res = await fetch(`/api/client-meal-plans/${plan._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Failed to extend plan:', res.status, errorText);
        toast.error('Failed to extend plan. Server error.');
        return;
      }
      const data = await res.json();

      if (data.success) {
        toast.success('Plan dates extended successfully!');

        // AUTO-ADJUST ALL MEAL PLANS IN THE CHAIN (BOTH BEFORE AND AFTER)
        try {
          const allPlansRes = await fetch(`/api/client-meal-plans?clientId=${client._id}`);
          if (!allPlansRes.ok) {
            console.error('Failed to fetch all plans:', allPlansRes.status);
            return;
          }
          const allPlansDataResponse = await allPlansRes.json();

          if (allPlansDataResponse.success && allPlansDataResponse.mealPlans) {
            // Sort all plans by start date
            const sortedPlans = allPlansDataResponse.mealPlans.sort((a: any, b: any) =>
              new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
            );

            const currentPlanIndex = sortedPlans.findIndex((p: any) => p._id === plan._id);

            if (currentPlanIndex !== -1) {
              // ADJUST ALL PLANS BEFORE THE CURRENT PLAN (BACKWARD CASCADE)
              for (let i = currentPlanIndex - 1; i >= 0; i--) {
                const planToAdjust = sortedPlans[i];
                const nextPlan = sortedPlans[i + 1];

                // Calculate this plan's original duration
                const planOriginalDuration = Math.ceil(
                  (new Date(planToAdjust.endDate).getTime() - new Date(planToAdjust.startDate).getTime()) / (1000 * 60 * 60 * 24)
                ) + 1;

                // This plan ends one day before the next plan starts
                const newEndDate_adjusted = format(addDays(new Date(nextPlan.startDate), -1), 'yyyy-MM-dd');

                // This plan's start = end - duration + 1
                const newStartDate_adjusted = format(addDays(new Date(newEndDate_adjusted), -(planOriginalDuration - 1)), 'yyyy-MM-dd');

                // Update this plan in the chain
                await fetch(`/api/client-meal-plans/${planToAdjust._id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    startDate: newStartDate_adjusted,
                    endDate: newEndDate_adjusted
                  })
                });

                // Update the reference for next iteration
                sortedPlans[i].startDate = newStartDate_adjusted;
                sortedPlans[i].endDate = newEndDate_adjusted;
              }

              // ADJUST ALL PLANS AFTER THE CURRENT PLAN (FORWARD CASCADE)
              for (let i = currentPlanIndex + 1; i < sortedPlans.length; i++) {
                const planToAdjust = sortedPlans[i];
                const prevPlan = sortedPlans[i - 1];

                // Calculate plan's original duration
                const planOriginalDuration = Math.ceil(
                  (new Date(planToAdjust.endDate).getTime() - new Date(planToAdjust.startDate).getTime()) / (1000 * 60 * 60 * 24)
                ) + 1;

                // New plan starts the day after previous plan ends
                const newStartDate_adjusted = format(addDays(new Date(prevPlan.endDate), 1), 'yyyy-MM-dd');

                // New end date = start + original duration
                const newEndDate_adjusted = format(addDays(new Date(newStartDate_adjusted), Math.max(0, planOriginalDuration - 1)), 'yyyy-MM-dd');

                // Update this plan in the chain
                await fetch(`/api/client-meal-plans/${planToAdjust._id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    startDate: newStartDate_adjusted,
                    endDate: newEndDate_adjusted
                  })
                });

                // Update the reference for next iteration
                sortedPlans[i].startDate = newStartDate_adjusted;
                sortedPlans[i].endDate = newEndDate_adjusted;
              }
            }
          }
        } catch (adjustError) {
          console.error('Error auto-adjusting meal plans:', adjustError);
        }

        // Emit event to trigger automatic refresh
        emitDataChange(DataEventTypes.MEAL_PLAN_EXTENDED, { planId: plan._id });
        fetchClientPlans();
      } else {
        toast.error(data.error || 'Failed to extend plan');
      }
    } catch (error) {
      console.error('Error extending plan:', error);
      toast.error('Failed to extend plan');
    }
  };

  // Pause/Hold plan
  const handlePausePlan = async (plan: any, pauseDays: number) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const planStartDate = parseDate(plan.startDate);

      // Check if plan has already started
      const hasStarted = planStartDate <= today;

      let endDateToUse = plan.endDate;

      // Only extend end date if plan has already started
      if (hasStarted) {
        const currentEndDate = new Date(plan.endDate);
        const newEndDate = addDays(currentEndDate, pauseDays);
        endDateToUse = format(newEndDate, 'yyyy-MM-dd');
      }

      const payload = {
        startDate: plan.startDate,
        endDate: endDateToUse,
        status: 'paused'
      };

      const res = await fetch(`/api/client-meal-plans/${plan._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Failed to pause plan:', res.status, errorText);
        toast.error('Failed to pause plan. Server error.');
        return;
      }
      const data = await res.json();

      if (data.success) {
        const message = hasStarted
          ? `Plan paused for ${pauseDays} days. End date extended to ${endDateToUse}`
          : `Plan paused. (Plan hasn't started yet, so end date not extended)`;
        toast.success(message);
        // Emit event to trigger automatic refresh
        emitDataChange(DataEventTypes.MEAL_PLAN_PAUSED, { planId: plan._id });
        fetchClientPlans();
      } else {
        toast.error(data.error || 'Failed to pause plan');
      }
    } catch (error) {
      console.error('Error pausing plan:', error);
      toast.error('Failed to pause plan');
    }
  };

  // Resume plan
  const handleResumePlan = async (plan: any) => {
    try {
      const payload = {
        startDate: plan.startDate,
        endDate: plan.endDate,
        status: 'active'
      };

      const res = await fetch(`/api/client-meal-plans/${plan._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Failed to resume plan:', res.status, errorText);
        toast.error('Failed to resume plan. Server error.');
        return;
      }
      const data = await res.json();

      if (data.success) {
        toast.success('Plan resumed successfully');
        // Emit event to trigger automatic refresh
        emitDataChange(DataEventTypes.MEAL_PLAN_RESUMED, { planId: plan._id });
        fetchClientPlans();
      } else {
        toast.error(data.error || 'Failed to resume plan');
      }
    } catch (error) {
      console.error('Error resuming plan:', error);
      toast.error('Failed to resume plan');
    }
  };

  // Pause Plan Dialog Component
  function PausePlanDialog({ plan, onPause, onResume, showAsText = false, showAsButton = false }: { plan: any; onPause: (plan: any, days: number) => void; onResume: (plan: any) => void; showAsText?: boolean; showAsButton?: boolean }) {
    const [pauseDays, setPauseDays] = useState(2);
    const [isLoading, setIsLoading] = useState(false);
    const [isPaused, setIsPaused] = useState(plan.status === 'paused');

    const handlePause = async () => {
      if (pauseDays < 1) {
        toast.error('Pause duration must be at least 1 day');
        return;
      }
      setIsLoading(true);
      await onPause(plan, pauseDays);
      setIsLoading(false);
      setIsPaused(true);
    };

    const handleResume = async () => {
      setIsLoading(true);
      await onResume(plan);
      setIsLoading(false);
      setIsPaused(false);
    };

    return (
      <Dialog>
        <DialogTrigger asChild>
          {showAsText ? (
            <span className="text-sm cursor-pointer">Hold</span>
          ) : showAsButton ? (
            <Button
              size="sm"
              variant="outline"
              title={isPaused ? 'Resume plan' : 'Hold plan'}
              className="flex items-center gap-1.5"
            >
              <Pause className="h-4 w-4" />
              <span className="text-xs">Hold</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              title={isPaused ? 'Resume plan' : 'Pause plan'}
              className={isPaused ? 'text-orange-600 hover:text-orange-700' : 'text-amber-600 hover:text-amber-700'}
            >
              {isPaused ? '▶️' : '⏸️'}
            </Button>
          )}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isPaused ? 'Resume Plan' : 'Pause Plan'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!isPaused ? (
              <>
                <div className="bg-amber-50 p-3 rounded border border-amber-200">
                  <p className="text-sm font-medium text-amber-900">
                    ⏸️ Pause your meal plan temporarily. The end date will be extended by the number of days you pause for.
                  </p>
                </div>

                <div>
                  <Label>Pause for how many days?</Label>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant={pauseDays === 1 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPauseDays(1)}
                    >
                      1 Day
                    </Button>
                    <Button
                      variant={pauseDays === 2 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPauseDays(2)}
                    >
                      2 Days
                    </Button>
                    <Button
                      variant={pauseDays === 3 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPauseDays(3)}
                    >
                      3 Days
                    </Button>
                    <Button
                      variant={pauseDays === 7 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPauseDays(7)}
                    >
                      1 Week
                    </Button>
                  </div>

                  <div className="mt-3">
                    <Label className="text-xs">Or enter custom days:</Label>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      value={pauseDays}
                      onChange={(e) => setPauseDays(Math.max(1, parseInt(e.target.value) || 1))}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded">
                  <p className="text-xs text-gray-600">
                    <strong>Current End Date:</strong> {format(new Date(plan.endDate), 'MMM dd, yyyy')}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    <strong>New End Date:</strong> {format(addDays(new Date(plan.endDate), pauseDays), 'MMM dd, yyyy')}
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-amber-600 hover:bg-amber-700"
                    onClick={handlePause}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Pausing...
                      </>
                    ) : (
                      '⏸️ Pause Plan'
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-50 p-3 rounded border border-green-200">
                  <p className="text-sm font-medium text-green-900">
                    ✓ Plan is currently paused. Click below to resume and continue with your meal plan.
                  </p>
                </div>

                <div className="bg-gray-50 p-3 rounded">
                  <p className="text-xs text-gray-600">
                    <strong>Current Status:</strong> <span className="text-amber-600 font-medium">Paused</span>
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    <strong>End Date:</strong> {format(new Date(plan.endDate), 'MMM dd, yyyy')}
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={handleResume}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Resuming...
                      </>
                    ) : (
                      '▶️ Resume Plan'
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Freeze Plan Dialog Component
  function FreezePlanDialog({ plan, onFreeze, showAsText = false, showAsButton = false }: { plan: any; onFreeze: () => void; showAsText?: boolean; showAsButton?: boolean }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [selectedUnfreezeDates, setSelectedUnfreezeDates] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'freeze' | 'unfreeze'>('freeze');
    const [freezeInfo, setFreezeInfo] = useState<{
      allowedFreezeDays: number;
      totalFreezeCount: number;
      remainingFreezeDays: number;
      freezedDays: { date: string; createdAt: string; addedDate?: string; planId?: string; planName?: string }[];
      durationDays: number;
      canFreeze: boolean;
      isSharedFreeze?: boolean;
      linkedPlanCount?: number;
      purchaseId?: string;
    } | null>(null);

    // Calculate plan duration
    const startDate = new Date(plan.startDate);
    const endDate = new Date(plan.endDate);
    const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Fetch freeze info when dialog opens
    const fetchFreezeInfo = async () => {
      setIsFetching(true);
      try {
        const res = await fetch(`/api/client-meal-plans/${plan._id}/freeze`);
        if (!res.ok) {
          console.error('Failed to fetch freeze info:', res.status);
          toast.error('Failed to load freeze information');
          return;
        }
        const data = await res.json();
        if (data.success) {
          setFreezeInfo(data.data);
        } else {
          toast.error(data.error || 'Failed to fetch freeze information');
        }
      } catch (error) {
        console.error('Error fetching freeze info:', error);
        toast.error('Failed to load freeze information');
      } finally {
        setIsFetching(false);
      }
    };

    // Handle dialog open
    const handleOpenChange = (open: boolean) => {
      setIsOpen(open);
      if (open) {
        setSelectedDates([]);
        setSelectedUnfreezeDates([]);
        setActiveTab('freeze');
        fetchFreezeInfo();
      }
    };

    // Check if a date is already frozen
    const isDateFrozen = (dateStr: string) => {
      if (!freezeInfo) return false;
      return freezeInfo.freezedDays.some(fd => {
        const frozenDate = format(new Date(fd.date), 'yyyy-MM-dd');
        return frozenDate === dateStr;
      });
    };

    // Check if a date is selectable
    const isDateSelectable = (dateStr: string) => {
      const date = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Can't select past dates
      if (date < today) return false;

      // Can't select dates outside plan range
      if (date < startDate || date > endDate) return false;

      // Can't select already frozen dates
      if (isDateFrozen(dateStr)) return false;

      return true;
    };

    // Toggle date selection
    const toggleDateSelection = (dateStr: string) => {
      if (!isDateSelectable(dateStr)) return;

      // Check if we've reached the limit
      if (!selectedDates.includes(dateStr)) {
        if (freezeInfo && selectedDates.length >= freezeInfo.remainingFreezeDays) {
          toast.error(`You can only freeze ${freezeInfo.remainingFreezeDays} more days`);
          return;
        }
      }

      setSelectedDates(prev =>
        prev.includes(dateStr)
          ? prev.filter(d => d !== dateStr)
          : [...prev, dateStr]
      );
    };

    // Handle freeze submission
    const handleFreeze = async () => {
      if (selectedDates.length === 0) {
        toast.error('Please select at least one date to freeze');
        return;
      }

      setIsLoading(true);
      try {
        const res = await fetch(`/api/client-meal-plans/${plan._id}/freeze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ freezeDates: selectedDates })
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error('Failed to freeze dates:', res.status, errorText);
          toast.error('Failed to freeze dates. Server error.');
          return;
        }
        const data = await res.json();

        if (data.success) {
          toast.success(data.message);
          setIsOpen(false);
          setSelectedDates([]);
          // Emit event to trigger automatic refresh across all components
          emitDataChange(DataEventTypes.MEAL_PLAN_FROZEN, { planId: plan._id });
          onFreeze(); // Also call callback for backward compatibility
        } else {
          toast.error(data.error || 'Failed to freeze dates');
        }
      } catch (error) {
        console.error('Error freezing dates:', error);
        toast.error('Failed to freeze dates');
      } finally {
        setIsLoading(false);
      }
    };

    // Handle unfreeze submission
    const handleUnfreeze = async () => {
      if (selectedUnfreezeDates.length === 0) {
        toast.error('Please select at least one date to unfreeze');
        return;
      }

      setIsLoading(true);
      try {
        const res = await fetch(`/api/client-meal-plans/${plan._id}/freeze`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unfreezeDates: selectedUnfreezeDates })
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error('Failed to unfreeze dates:', res.status, errorText);
          toast.error('Failed to unfreeze dates. Server error.');
          return;
        }
        const data = await res.json();

        if (data.success) {
          toast.success(data.message);
          setIsOpen(false);
          setSelectedUnfreezeDates([]);
          // Emit event to trigger automatic refresh across all components
          emitDataChange(DataEventTypes.MEAL_PLAN_UNFROZEN, { planId: plan._id });
          onFreeze(); // Also call callback for backward compatibility
        } else {
          toast.error(data.error || 'Failed to unfreeze dates');
        }
      } catch (error) {
        console.error('Error unfreezing dates:', error);
        toast.error('Failed to unfreeze dates');
      } finally {
        setIsLoading(false);
      }
    };

    // Toggle unfreeze date selection
    const toggleUnfreezeSelection = (dateStr: string) => {
      setSelectedUnfreezeDates(prev =>
        prev.includes(dateStr)
          ? prev.filter(d => d !== dateStr)
          : [...prev, dateStr]
      );
    };

    // Generate calendar days for current month range (startDate to endDate)
    const generateCalendarDays = () => {
      const days: { date: Date; dateStr: string; isCurrentMonth: boolean }[] = [];

      // Start from plan start date
      const current = new Date(startDate);
      current.setHours(0, 0, 0, 0);

      while (current <= endDate) {
        days.push({
          date: new Date(current),
          dateStr: format(current, 'yyyy-MM-dd'),
          isCurrentMonth: true
        });
        current.setDate(current.getDate() + 1);
      }

      return days;
    };

    const calendarDays = generateCalendarDays();

    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          {showAsText ? (
            <span className="text-sm cursor-pointer">Freeze</span>
          ) : showAsButton ? (
            <Button
              size="sm"
              variant="outline"
              title="Freeze specific dates"
              className="flex items-center gap-1.5"
            >
              <Snowflake className="h-4 w-4" />
              <span className="text-xs">Freeze</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              title="Freeze dates"
              className="text-blue-600 hover:text-blue-700"
            >
              ❄️
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Snowflake className="h-5 w-5 text-blue-500" />
              Freeze / Unfreeze Plan Dates
            </DialogTitle>
            <DialogDescription>
              Freeze dates to pause meals or unfreeze to restore them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {isFetching ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                <span className="ml-2 text-gray-600">Loading freeze information...</span>
              </div>
            ) : (
              <>
                {/* Tabs for Freeze / Unfreeze */}
                <div className="flex border-b">
                  <button
                    className={`flex-1 py-2 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'freeze'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    onClick={() => setActiveTab('freeze')}
                  >
                    ❄️ Freeze Dates
                  </button>
                  <button
                    className={`flex-1 py-2 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'unfreeze'
                      ? 'border-green-500 text-green-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    onClick={() => setActiveTab('unfreeze')}
                    disabled={!freezeInfo || freezeInfo.totalFreezeCount === 0}
                  >
                    🔓 Unfreeze Dates {freezeInfo && freezeInfo.totalFreezeCount > 0 && `(${freezeInfo.totalFreezeCount})`}
                  </button>
                </div>

                {/* Plan Duration (Read-only) */}
                <div className="bg-gray-50 p-3 rounded border">
                  <Label className="text-sm font-medium">Plan Duration</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      value={`${durationDays} days (${format(startDate, 'MMM dd')} - ${format(endDate, 'MMM dd, yyyy')})`}
                      disabled
                      className="bg-white"
                    />
                  </div>
                </div>

                {/* Freeze Allowance Info */}
                {freezeInfo && (
                  <div className="bg-blue-50 p-3 rounded border border-blue-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-blue-900">
                        <strong>Total Freeze Days:</strong> {freezeInfo.allowedFreezeDays} days
                        {(freezeInfo as any).isSharedFreeze && (
                          <span className="text-xs ml-1 text-blue-700">(shared across {(freezeInfo as any).linkedPlanCount || 'all'} phases)</span>
                        )}
                      </span>
                      <Badge variant={freezeInfo.remainingFreezeDays > 0 ? 'default' : 'destructive'}>
                        {freezeInfo.remainingFreezeDays} remaining
                      </Badge>
                    </div>
                    {freezeInfo.totalFreezeCount > 0 && (
                      <p className="text-xs text-blue-700 mt-1">
                        Total frozen: {freezeInfo.totalFreezeCount} days
                        {(freezeInfo as any).isSharedFreeze && ' (across all phases)'}
                      </p>
                    )}
                  </div>
                )}

                {/* FREEZE TAB CONTENT */}
                {activeTab === 'freeze' && (
                  <>
                    <div className="border rounded-lg p-3">
                      <Label className="text-sm font-medium mb-2 block">Select Dates to Freeze</Label>

                      {/* Day headers */}
                      <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                          <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                            {day}
                          </div>
                        ))}
                      </div>

                      {/* Calendar grid */}
                      <div className="grid grid-cols-7 gap-1">
                        {/* Add empty cells for alignment to start day of week */}
                        {Array.from({ length: calendarDays[0]?.date.getDay() || 0 }).map((_, i) => (
                          <div key={`empty-${i}`} className="aspect-square" />
                        ))}

                        {calendarDays.map(({ date, dateStr }) => {
                          const isFrozen = isDateFrozen(dateStr);
                          const isSelectable = isDateSelectable(dateStr);
                          const isSelected = selectedDates.includes(dateStr);
                          const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));

                          return (
                            <button
                              key={dateStr}
                              type="button"
                              onClick={() => toggleDateSelection(dateStr)}
                              disabled={!isSelectable}
                              className={`
                            aspect-square flex flex-col items-center justify-center text-sm rounded-lg relative transition-all
                            ${isSelected ? 'bg-blue-500 text-white font-bold ring-2 ring-blue-300' : ''}
                            ${isFrozen ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : ''}
                            ${isPast && !isFrozen ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : ''}
                            ${isSelectable && !isSelected ? 'hover:bg-blue-100 cursor-pointer border border-gray-200' : ''}
                            ${!isSelectable && !isFrozen && !isPast ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                            >
                              <span>{date.getDate()}</span>
                              {isFrozen && (
                                <X className="h-3 w-3 text-red-500 absolute top-0.5 right-0.5" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Legend */}
                      <div className="flex gap-4 mt-3 text-xs text-gray-600">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-blue-500 rounded" />
                          <span>Selected</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-gray-200 rounded relative">
                            <X className="h-2 w-2 text-red-500 absolute -top-0.5 -right-0.5" />
                          </div>
                          <span>Already Frozen</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-gray-100 rounded" />
                          <span>Past</span>
                        </div>
                      </div>
                    </div>

                    {/* Selected Dates Summary */}
                    {selectedDates.length > 0 && (
                      <div className="bg-blue-50 p-3 rounded border border-blue-200">
                        <p className="text-sm font-medium text-blue-900 mb-2">
                          Selected {selectedDates.length} date(s) to freeze:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {selectedDates.sort().map(dateStr => (
                            <Badge
                              key={dateStr}
                              variant="secondary"
                              className="cursor-pointer hover:bg-red-100"
                              onClick={() => toggleDateSelection(dateStr)}
                            >
                              {format(new Date(dateStr), 'MMM dd')}
                              <X className="h-3 w-3 ml-1" />
                            </Badge>
                          ))}
                        </div>

                        {/* Show the dates that will be added at the end */}
                        <div className="mt-3 pt-3 border-t border-blue-200">
                          <p className="text-sm font-medium text-green-800 mb-2">
                            Meals will be copied to these new dates (after plan end):
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {selectedDates.sort().map((_, index) => {
                              const newDate = addDays(endDate, index + 1);
                              return (
                                <Badge
                                  key={index}
                                  variant="outline"
                                  className="bg-green-50 text-green-800 border-green-300"
                                >
                                  {format(newDate, 'MMM dd, yyyy')}
                                </Badge>
                              );
                            })}
                          </div>
                          <p className="text-xs text-gray-600 mt-2">
                            <strong>Note:</strong> Original plan duration will NOT change. Meals from frozen dates will be copied to the dates shown above.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setIsOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                        onClick={handleFreeze}
                        disabled={isLoading || selectedDates.length === 0 || (freezeInfo !== null && !freezeInfo.canFreeze)}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Freezing...
                          </>
                        ) : (
                          <>
                            <Snowflake className="h-4 w-4 mr-2" />
                            Freeze {selectedDates.length > 0 ? `${selectedDates.length} Days` : 'Selected'}
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}

                {/* UNFREEZE TAB CONTENT */}
                {activeTab === 'unfreeze' && (
                  <>
                    {/* Filter frozen dates to only show those belonging to this plan */}
                    {(() => {
                      const currentPlanFrozenDates = freezeInfo?.freezedDays.filter(
                        fd => !fd.planId || fd.planId === plan._id
                      ) || [];
                      const hasCurrentPlanFrozenDates = currentPlanFrozenDates.length > 0;

                      return hasCurrentPlanFrozenDates ? (
                        <>
                          {/* List of Frozen Dates for this plan only */}
                          <div className="border rounded-lg p-3">
                            <Label className="text-sm font-medium mb-2 block">Select Frozen Dates to Unfreeze</Label>
                            <p className="text-xs text-gray-500 mb-3">
                              Select dates to unfreeze. The meals added at the end will be removed and original dates will be restored.
                              {freezeInfo?.isSharedFreeze && (
                                <span className="block mt-1 text-blue-600">
                                  Note: Only showing frozen dates from this phase. Other phases have their own frozen dates.
                                </span>
                              )}
                            </p>

                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {currentPlanFrozenDates.map((fd) => {
                                const dateStr = format(new Date(fd.date), 'yyyy-MM-dd');
                                const isSelected = selectedUnfreezeDates.includes(dateStr);
                                return (
                                  <div
                                    key={dateStr}
                                    onClick={() => toggleUnfreezeSelection(dateStr)}
                                    className={`
                                    flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all
                                    ${isSelected
                                        ? 'bg-green-50 border-green-500 ring-2 ring-green-200'
                                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                                      }
                                  `}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-green-500 border-green-500' : 'border-gray-300'
                                        }`}>
                                        {isSelected && <Check className="h-3 w-3 text-white" />}
                                      </div>
                                      <div>
                                        <p className="font-medium text-sm">
                                          {format(new Date(fd.date), 'EEEE, MMM dd, yyyy')}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          Frozen on: {format(new Date(fd.createdAt), 'MMM dd, yyyy HH:mm')}
                                        </p>
                                      </div>
                                    </div>
                                    <Snowflake className="h-4 w-4 text-blue-400" />
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Unfreeze Warning */}
                          {selectedUnfreezeDates.length > 0 && (
                            <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                              <p className="text-sm font-medium text-yellow-800 mb-2">
                                ⚠️ Unfreezing {selectedUnfreezeDates.length} date(s) will:
                              </p>
                              <ul className="text-xs text-yellow-700 list-disc list-inside space-y-1">
                                <li>Remove the frozen flag from selected dates</li>
                                <li>Remove the recovery meals added at the end of plan</li>
                                <li>Reduce end date by {selectedUnfreezeDates.length} day(s)</li>
                              </ul>
                            </div>
                          )}

                          {/* Unfreeze Action Buttons */}
                          <div className="flex gap-2 pt-2">
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => setIsOpen(false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              className="flex-1 bg-green-600 hover:bg-green-700"
                              onClick={handleUnfreeze}
                              disabled={isLoading || selectedUnfreezeDates.length === 0}
                            >
                              {isLoading ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Unfreezing...
                                </>
                              ) : (
                                <>
                                  🔓 Unfreeze {selectedUnfreezeDates.length > 0 ? `${selectedUnfreezeDates.length} Days` : 'Selected'}
                                </>
                              )}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <Snowflake className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                          <p className="text-sm">No frozen dates to unfreeze in this phase</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {freezeInfo?.isSharedFreeze && freezeInfo?.totalFreezeCount > 0
                              ? 'Frozen dates from other phases can only be unfrozen from their respective phase'
                              : 'Freeze some dates first to use this feature'
                            }
                          </p>
                        </div>
                      )
                    })()}
                  </>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  function ExtendPlanDialog({ plan, onExtend, showAsText = false, showAsButton = false }: { plan: any; onExtend: (plan: any, startDate: string, endDate: string) => void; showAsText?: boolean; showAsButton?: boolean }) {
    // Show "Coming Soon" toast when clicking extend button
    const handleComingSoon = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toast.info('Coming Soon! This feature is under development.');
    };

    return (
      <>
        {showAsText ? (
          <span className="text-sm cursor-pointer" onClick={handleComingSoon}>Extend</span>
        ) : showAsButton ? (
          <Button
            size="sm"
            variant="outline"
            title="Extend plan dates"
            className="flex items-center gap-1.5"
            onClick={handleComingSoon}
          >
            <Repeat2 className="h-4 w-4" />
            <span className="text-xs">Extend</span>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            title="Extend plan dates"
            className="text-blue-600 hover:text-blue-700"
            onClick={handleComingSoon}
          >
            📅
          </Button>
        )}
      </>
    );
  }

  const dietPlans = client?.dietPlans || [];

  // Step 3: View Plan (Read-only)
  if (step === 'view' && viewingPlan) {
    // Debug logging

    return (
      <div className="mt-6">
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetForm}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to List
                </Button>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{planTitle}</h2>
                    <Badge className={
                      viewingPlan.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : viewingPlan.status === 'completed'
                          ? 'bg-blue-100 text-blue-800'
                          : viewingPlan.status === 'draft'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-gray-100 text-gray-800'
                    }>
                      {viewingPlan.status || 'draft'}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500">
                    {format(new Date(startDate), 'MMM d, yyyy')} - {format(new Date(endDate), 'MMM d, yyyy')} ({duration} days)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleEditPlan(viewingPlan)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Plan
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleDuplicatePlan(viewingPlan)}
                  disabled={!paymentCheck?.hasPaidPlan || paymentCheck.remainingDays <= 0}
                  title={!paymentCheck?.hasPaidPlan || paymentCheck.remainingDays <= 0 ? 'Client needs active payment to duplicate plans' : 'Duplicate'}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </Button>
                {/* Delete button — only for draft plans */}
                {viewingPlan.status === 'draft' && (
                  <AlertDialog open={deletingPlanId === viewingPlan._id} onOpenChange={(open) => { if (!open) setDeletingPlanId(null); }}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeletingPlanId(viewingPlan._id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Draft?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the draft &quot;{viewingPlan.name}&quot;. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700"
                          onClick={() => handleDeleteDraft(viewingPlan._id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...</> : 'Delete'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {/* Plan Details Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-1">Duration</h4>
                <p className="text-lg font-semibold">{duration} Days</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-1">Primary Goal</h4>
                <p className="text-lg font-semibold capitalize">{primaryGoal.replace('-', ' ')}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-1">Target Calories</h4>
                <p className="text-lg font-semibold">{viewingPlan.customizations?.targetCalories || 2000} kcal/day</p>
              </div>
            </div>

            {/* Description */}
            {description && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Description</h4>
                <p className="text-gray-600 bg-gray-50 rounded-lg p-4">{description}</p>
              </div>
            )}

            {/* Macro Targets */}
            {viewingPlan.customizations?.targetMacros && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Target Macros</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-blue-600">{viewingPlan.customizations.targetMacros.protein}g</p>
                    <p className="text-sm text-gray-600">Protein</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{viewingPlan.customizations.targetMacros.carbs}g</p>
                    <p className="text-sm text-gray-600">Carbs</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-orange-600">{viewingPlan.customizations.targetMacros.fat}g</p>
                    <p className="text-sm text-gray-600">Fat</p>
                  </div>
                </div>
              </div>
            )}

            {/* Meal Types */}
            {initialMealTypes && initialMealTypes.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Meal Schedule</h4>
                <div className="flex flex-wrap gap-2">
                  {initialMealTypes.map((mealType, index) => (
                    <Badge key={index} variant="outline" className="py-2 px-3">
                      <span className="font-medium">{mealType.name}</span>
                      <span className="text-gray-500 ml-2">{mealType.time}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Meals Grid - Read Only View */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-4">
                Meal Plan ({duration} days) - {viewingPlan?.meals?.length || 0} days with meals
              </h4>
              <DietPlanDashboard
                key={`view-${viewingPlan._id}-${planKey}`}
                duration={duration}
                startDate={viewingPlan?.startDate ? format(new Date(viewingPlan.startDate), 'yyyy-MM-dd') : startDate}
                initialMeals={viewingPlan?.meals || []}
                initialMealTypes={viewingPlan?.mealTypes || initialMealTypes}
                clientId={client._id}
                clientName={`${client.firstName} ${client.lastName}`}
                readOnly={true}
                clientDietaryRestrictions={toCommaString(client.dietaryRestrictions)}
                clientMedicalConditions={toCommaString(client.medicalConditions)}
                clientAllergies={toCommaString(client.allergies)}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 2: Meals Editor
  if (step === 'meals') {
    return (
      <div className="mt-6">
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep('form')}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Details
                </Button>
                <div>
                  <h2 className="text-xl font-semibold">{planTitle}</h2>
                  <p className="text-sm text-gray-500">
                    {format(new Date(startDate), 'MMM d, yyyy')} - {format(new Date(endDate), 'MMM d, yyyy')} ({duration} days)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Load Template Button - Also available in edit mode */}
                <Dialog open={showTemplateDialog} onOpenChange={(open) => {
                  setShowTemplateDialog(open);
                  if (open) {
                    setTemplateSearch('');
                    setTemplatePage(1);
                    setTemplateType('plan');
                    setPendingTemplate(null);
                    setTemplateDayMapping({});
                    fetchTemplates('plan', 1, '');
                  } else {
                    setPendingTemplate(null);
                    setTemplateDayMapping({});
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <FileText className="h-4 w-4 mr-2" />
                      Load Templates
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
                    {/* View 1: Template List */}
                    {!pendingTemplate ? (
                      <>
                        <DialogHeader className="px-6 pt-6 pb-0">
                          <DialogTitle>Load {templateType === 'plan' ? 'Plan' : 'Diet'} Template</DialogTitle>
                        </DialogHeader>
                        <div className="px-6 pb-4 flex-1 flex flex-col min-h-0">
                          {/* Template Type Selector */}
                          <div className="flex gap-2 mb-3 mt-3">
                            <Button
                              variant={templateType === 'plan' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => {
                                setTemplateType('plan');
                                setTemplatePage(1);
                                fetchTemplates('plan', 1, templateSearch);
                              }}
                            >
                              Plan Templates
                            </Button>
                            <Button
                              variant={templateType === 'diet' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => {
                                setTemplateType('diet');
                                setTemplatePage(1);
                                fetchTemplates('diet', 1, templateSearch);
                              }}
                            >
                              Diet Templates
                            </Button>
                          </div>
                          {/* Search Input */}
                          <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                              placeholder="Search by name or category..."
                              value={templateSearch}
                              onChange={(e) => setTemplateSearch(e.target.value)}
                              className="pl-9"
                            />
                          </div>
                          {/* Total count */}
                          <p className="text-xs text-gray-500 mb-2">
                            {totalTemplates > 0 ? `Showing ${Math.min(TEMPLATES_PER_PAGE, templates.length)} of ${totalTemplates} templates` : ''}
                          </p>
                          {/* Templates List */}
                          <div className="flex-1 overflow-y-auto min-h-0">
                            {loadingTemplates ? (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                              </div>
                            ) : templates.length === 0 ? (
                              <div className="text-center py-8 text-gray-500">
                                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                <p>No templates found</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {templates.map((template) => (
                                  <div
                                    key={template._id}
                                    className="border rounded-lg p-3 cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-colors"
                                    onClick={() => loadTemplate(template)}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-gray-900 truncate">{template.name}</h4>
                                        {template.description && (
                                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{template.description}</p>
                                        )}
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                          {template.category && (
                                            <Badge className="text-xs capitalize bg-blue-100 text-blue-800">{template.category.replace(/-/g, ' ')}</Badge>
                                          )}
                                          {template.targetCalories && (
                                            <span className="text-xs text-gray-600">{template.targetCalories.min}-{template.targetCalories.max} kcal</span>
                                          )}
                                          {template.goals?.primaryGoal && (
                                            <Badge variant="secondary" className="text-xs capitalize">
                                              {template.goals.primaryGoal.replace(/-/g, ' ')}
                                            </Badge>
                                          )}
                                          {template.dietaryRestrictions && template.dietaryRestrictions.length > 0 && (
                                            <Badge variant="outline" className="text-xs">
                                              {template.dietaryRestrictions.slice(0, 2).join(', ')}
                                              {template.dietaryRestrictions.length > 2 && ` +${template.dietaryRestrictions.length - 2}`}
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                      <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Pagination */}
                          {totalTemplates > TEMPLATES_PER_PAGE && (
                            <div className="flex items-center justify-between pt-3 border-t mt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={templatePage === 1 || loadingTemplates}
                                onClick={() => {
                                  const newPage = templatePage - 1;
                                  setTemplatePage(newPage);
                                  fetchTemplates(templateType, newPage, templateSearch);
                                }}
                              >
                                <ArrowLeft className="h-4 w-4 mr-1" /> Previous
                              </Button>
                              <span className="text-sm text-gray-600">
                                Page {templatePage} of {Math.ceil(totalTemplates / TEMPLATES_PER_PAGE)}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={templatePage >= Math.ceil(totalTemplates / TEMPLATES_PER_PAGE) || loadingTemplates}
                                onClick={() => {
                                  const newPage = templatePage + 1;
                                  setTemplatePage(newPage);
                                  fetchTemplates(templateType, newPage, templateSearch);
                                }}
                              >
                                Next <ArrowRight className="h-4 w-4 ml-1" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      /* View 2: Day Mapping */
                      <>
                        <DialogHeader className="px-6 pt-6 pb-3">
                          <DialogTitle className="text-lg font-semibold">Map Template Days to Diet Plan</DialogTitle>
                          <DialogDescription className="sr-only">Select which template day to apply to each diet plan date</DialogDescription>
                          <div className="space-y-2 mt-2">
                            <p className="text-sm font-medium text-gray-700">
                              Template: <span className="text-blue-700">{pendingTemplate.name}</span>
                            </p>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                Template: {pendingTemplate.meals?.length || 0} Days
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                Diet Plan: {duration} Days
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500">
                              Select which template day&apos;s meals to copy to each date, or choose &quot;Skip&quot; to leave empty.
                            </p>
                          </div>
                        </DialogHeader>

                        {/* Column Headers */}
                        <div className="flex items-center justify-between px-6 py-2 bg-gray-50 border-y text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          <span className="flex-1">Diet Plan Date</span>
                          <span className="w-40 text-right">Template Day</span>
                        </div>

                        {/* Scrollable Day List */}
                        <div className="flex-1 overflow-y-auto min-h-0 px-6">
                          <div className="divide-y divide-gray-100">
                            {Array.from({ length: duration }, (_, i) => {
                              const dayDate = addDays(new Date(startDate), i);
                              const dateLabel = format(dayDate, 'dd MMM yyyy');
                              const dayName = format(dayDate, 'EEEE');
                              const selectedValue = templateDayMapping[i] ?? -1;

                              return (
                                <div key={i} className="flex items-center justify-between gap-4 py-3">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold shrink-0">
                                      {i + 1}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-gray-800">{dateLabel}</p>
                                      <p className="text-xs text-gray-500">{dayName}</p>
                                    </div>
                                  </div>
                                  <Select
                                    value={String(selectedValue)}
                                    onValueChange={(val) => {
                                      setTemplateDayMapping(prev => ({ ...prev, [i]: parseInt(val, 10) }));
                                    }}
                                  >
                                    <SelectTrigger className="w-40 h-9 text-sm">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="-1">
                                        <span className="text-gray-400">— Skip —</span>
                                      </SelectItem>
                                      {pendingTemplate?.meals?.map((_, tIdx) => (
                                        <SelectItem key={tIdx} value={String(tIdx)}>
                                          Day {tIdx + 1}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-gray-50">
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => {
                              const templateDaysCount = pendingTemplate?.meals?.length || 1;
                              const newMapping: Record<number, number> = {};
                              for (let i = 0; i < duration; i++) { newMapping[i] = i % templateDaysCount; }
                              setTemplateDayMapping(newMapping);
                            }}>
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Auto-fill
                            </Button>
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => {
                              const newMapping: Record<number, number> = {};
                              for (let i = 0; i < duration; i++) { newMapping[i] = -1; }
                              setTemplateDayMapping(newMapping);
                            }}>
                              Skip All
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => { setPendingTemplate(null); setTemplateDayMapping({}); }}>
                              <ArrowLeft className="h-4 w-4 mr-1" /> Back
                            </Button>
                            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={applyTemplateMappingToMeals}>
                              <Check className="h-4 w-4 mr-2" /> Apply Template
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </DialogContent>
                </Dialog>
                <Button variant="outline" onClick={() => setStep('form')}>
                  Edit Details
                </Button>
                {draftSaveStatus === 'saving' && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Saving...
                  </span>
                )}
                {draftSaveStatus === 'saved' && (
                  <span className="text-xs text-green-600">Saved</span>
                )}
                {draftSaveStatus === 'error' && (
                  <span className="text-xs text-red-600">Save failed</span>
                )}
                {/* Save button — always visible */}
                <Button
                  variant="outline"
                  onClick={() => {
                    if (isEditMode && editingPlan?.status !== 'draft') {
                      // Editing an active/published plan → update it
                      if (!latestMealDataRef.current) { toast.error('No meal data to save.'); return; }
                      const { meals, mealTypes } = latestMealDataRef.current;
                      handleUpdatePlan(meals, mealTypes);
                    } else {
                      // New plan or editing a draft → save as draft
                      handleManualDraftSave();
                    }
                  }}
                  disabled={saving || draftSaveStatus === 'saving'}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
                {/* Publish button — always visible */}
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    if (!latestMealDataRef.current) {
                      toast.error('No meal data to publish. Add meals first.');
                      return;
                    }
                    const { meals, mealTypes } = latestMealDataRef.current;
                    if (isEditMode && editingPlan?.status !== 'draft') {
                      // Editing an active/published plan → update it
                      handleUpdatePlan(meals, mealTypes);
                    } else {
                      // New plan or editing a draft → publish (make active)
                      handlePublishPlan(meals, mealTypes);
                    }
                  }}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Publish
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <DietPlanDashboard
              key={`edit-${editingPlan?._id || 'new'}-${planKey}`}
              duration={duration}
              startDate={isEditMode && editingPlan?.startDate ? format(new Date(editingPlan.startDate), 'yyyy-MM-dd') : startDate}
              initialMeals={isEditMode && editingPlan?.meals ? editingPlan.meals : initialMeals}
              initialMealTypes={isEditMode && editingPlan?.mealTypes ? editingPlan.mealTypes : initialMealTypes}
              clientId={client._id}
              clientName={`${client.firstName} ${client.lastName}`}
              clientDietaryRestrictions={toCommaString(client.dietaryRestrictions)}
              clientMedicalConditions={toCommaString(client.medicalConditions)}
              clientAllergies={toCommaString(client.allergies)}
              onMealDataChange={handleMealDataChange}
              draftSaveStatus={draftSaveStatus}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 1: Form to create plan
  if (step === 'form') {
    return (
      <div className="mt-6">
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetForm}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <h2 className="text-xl font-semibold">
                  {isEditMode ? 'Edit' : 'Create'} Diet Plan for {client.firstName} {client.lastName}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <Dialog open={showTemplateDialog} onOpenChange={(open) => {
                  setShowTemplateDialog(open);
                  if (open) {
                    setTemplateSearch('');
                    setTemplatePage(1);
                    setPendingTemplate(null);
                    setTemplateDayMapping({});
                    fetchTemplates(templateType, 1, '');
                  } else {
                    setPendingTemplate(null);
                    setTemplateDayMapping({});
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <FileText className="h-4 w-4 mr-2" />
                      Load Template
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
                    {/* View 1: Template List */}
                    {!pendingTemplate ? (
                      <>
                        <DialogHeader className="px-6 pt-6 pb-0">
                          <DialogTitle>Select {templateType === 'plan' ? 'Plan' : 'Diet'} Template</DialogTitle>
                        </DialogHeader>
                        <div className="px-6 pb-4 flex-1 flex flex-col min-h-0">
                          {/* Template Type Selector */}
                          <div className="flex gap-2 mb-3 mt-3">
                            <Button
                              variant={templateType === 'plan' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => {
                                setTemplateType('plan');
                                setTemplatePage(1);
                                fetchTemplates('plan', 1, templateSearch);
                              }}
                            >
                              Plan Templates
                            </Button>
                            <Button
                              variant={templateType === 'diet' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => {
                                setTemplateType('diet');
                                setTemplatePage(1);
                                fetchTemplates('diet', 1, templateSearch);
                              }}
                            >
                              Diet Templates
                            </Button>
                          </div>
                          {/* Search Input */}
                          <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                              placeholder="Search by name or category..."
                              value={templateSearch}
                              onChange={(e) => setTemplateSearch(e.target.value)}
                              className="pl-9"
                            />
                          </div>
                          {/* Total count */}
                          <p className="text-xs text-gray-500 mb-2">
                            {totalTemplates > 0 ? `Showing ${Math.min(TEMPLATES_PER_PAGE, templates.length)} of ${totalTemplates} templates` : ''}
                          </p>
                          {/* Templates List */}
                          <div className="flex-1 overflow-y-auto min-h-0">
                            {loadingTemplates ? (
                              <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                              </div>
                            ) : templates.length === 0 ? (
                              <div className="text-center py-12">
                                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                <p className="text-gray-600">No templates found</p>
                                <p className="text-sm text-gray-500">Create templates in the Meal Plan Templates section</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {templates.map((template) => (
                                  <div
                                    key={template._id}
                                    className="border rounded-lg p-3 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer transition-colors"
                                    onClick={() => loadTemplate(template)}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-gray-900 truncate">{template.name}</h4>
                                        {template.description && (
                                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{template.description}</p>
                                        )}
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                          {template.category && (
                                            <Badge className="text-xs capitalize bg-blue-100 text-blue-800">{template.category.replace(/-/g, ' ')}</Badge>
                                          )}
                                          {template.targetCalories && (
                                            <span className="text-xs text-gray-600">{template.targetCalories.min}-{template.targetCalories.max} kcal</span>
                                          )}
                                          {template.goals?.primaryGoal && (
                                            <Badge variant="secondary" className="text-xs capitalize">
                                              {template.goals.primaryGoal.replace(/-/g, ' ')}
                                            </Badge>
                                          )}
                                          {template.dietaryRestrictions && template.dietaryRestrictions.length > 0 && (
                                            <Badge variant="outline" className="text-xs">
                                              {template.dietaryRestrictions.slice(0, 2).join(', ')}
                                              {template.dietaryRestrictions.length > 2 && ` +${template.dietaryRestrictions.length - 2}`}
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                      <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Pagination */}
                          {totalTemplates > TEMPLATES_PER_PAGE && (
                            <div className="flex items-center justify-between pt-3 border-t mt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={templatePage === 1 || loadingTemplates}
                                onClick={() => {
                                  const newPage = templatePage - 1;
                                  setTemplatePage(newPage);
                                  fetchTemplates(templateType, newPage, templateSearch);
                                }}
                              >
                                <ArrowLeft className="h-4 w-4 mr-1" /> Previous
                              </Button>
                              <span className="text-sm text-gray-600">
                                Page {templatePage} of {Math.ceil(totalTemplates / TEMPLATES_PER_PAGE)}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={templatePage >= Math.ceil(totalTemplates / TEMPLATES_PER_PAGE) || loadingTemplates}
                                onClick={() => {
                                  const newPage = templatePage + 1;
                                  setTemplatePage(newPage);
                                  fetchTemplates(templateType, newPage, templateSearch);
                                }}
                              >
                                Next <ArrowRight className="h-4 w-4 ml-1" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      /* View 2: Day Mapping */
                      <>
                        <DialogHeader className="px-6 pt-6 pb-3">
                          <DialogTitle className="text-lg font-semibold">Map Template Days to Diet Plan</DialogTitle>
                          <DialogDescription className="sr-only">Select which template day to apply to each diet plan date</DialogDescription>
                          <div className="space-y-2 mt-2">
                            <p className="text-sm font-medium text-gray-700">
                              Template: <span className="text-blue-700">{pendingTemplate.name}</span>
                            </p>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                Template: {pendingTemplate.meals?.length || 0} Days
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                Diet Plan: {duration} Days
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500">
                              Select which template day&apos;s meals to copy to each date, or choose &quot;Skip&quot; to leave empty.
                            </p>
                          </div>
                        </DialogHeader>

                        {/* Column Headers */}
                        <div className="flex items-center justify-between px-6 py-2 bg-gray-50 border-y text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          <span className="flex-1">Diet Plan Date</span>
                          <span className="w-40 text-right">Template Day</span>
                        </div>

                        {/* Scrollable Day List */}
                        <div className="flex-1 overflow-y-auto min-h-0 px-6">
                          <div className="divide-y divide-gray-100">
                            {Array.from({ length: duration }, (_, i) => {
                              const dayDate = addDays(new Date(startDate), i);
                              const dateLabel = format(dayDate, 'dd MMM yyyy');
                              const dayName = format(dayDate, 'EEEE');
                              const selectedValue = templateDayMapping[i] ?? -1;

                              return (
                                <div key={i} className="flex items-center justify-between gap-4 py-3">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold shrink-0">
                                      {i + 1}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-gray-800">{dateLabel}</p>
                                      <p className="text-xs text-gray-500">{dayName}</p>
                                    </div>
                                  </div>
                                  <Select
                                    value={String(selectedValue)}
                                    onValueChange={(val) => {
                                      setTemplateDayMapping(prev => ({ ...prev, [i]: parseInt(val, 10) }));
                                    }}
                                  >
                                    <SelectTrigger className="w-40 h-9 text-sm">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="-1">
                                        <span className="text-gray-400">— Skip —</span>
                                      </SelectItem>
                                      {pendingTemplate?.meals?.map((_, tIdx) => (
                                        <SelectItem key={tIdx} value={String(tIdx)}>
                                          Day {tIdx + 1}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-gray-50">
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => {
                              const templateDaysCount = pendingTemplate?.meals?.length || 1;
                              const newMapping: Record<number, number> = {};
                              for (let i = 0; i < duration; i++) { newMapping[i] = i % templateDaysCount; }
                              setTemplateDayMapping(newMapping);
                            }}>
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Auto-fill
                            </Button>
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => {
                              const newMapping: Record<number, number> = {};
                              for (let i = 0; i < duration; i++) { newMapping[i] = -1; }
                              setTemplateDayMapping(newMapping);
                            }}>
                              Skip All
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => { setPendingTemplate(null); setTemplateDayMapping({}); }}>
                              <ArrowLeft className="h-4 w-4 mr-1" /> Back
                            </Button>
                            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={applyTemplateMappingToMeals}>
                              <Check className="h-4 w-4 mr-2" /> Apply Template
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {/* Selected Template Info */}
            {selectedTemplate && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-blue-800">Using Template: {selectedTemplate.name}</p>
                      <p className="text-xs text-blue-600">{selectedTemplate.duration} days • {selectedTemplate.category}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTemplate(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-6">
              {/* Plan Title */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Plan Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                  placeholder="e.g., Weight Loss Plan for January"
                  className="max-w-xl"
                />
              </div>

              {/* Description */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Description
                </Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter plan description and notes..."
                  className="max-w-xl resize-none"
                  rows={3}
                />
              </div>

              {/* Date Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl">
                <div>
                  <Label className="text-sm font-medium mb-2 block">
                    Start Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const newStartDate = e.target.value;
                      // Validate start date is within expected dates range (only for new plans, not when editing)
                      if (!isEditMode && paymentCheck?.purchase?.expectedStartDate && paymentCheck?.purchase?.expectedEndDate) {
                        const expectedStart = new Date(paymentCheck.purchase.expectedStartDate);
                        const expectedEnd = new Date(paymentCheck.purchase.expectedEndDate);
                        const selectedDate = new Date(newStartDate);

                        if (selectedDate < expectedStart) {
                          toast.error(`Start date cannot be before expected start date (${format(expectedStart, 'dd MMM yyyy')})`);
                          return;
                        }
                        if (selectedDate > expectedEnd) {
                          toast.error(`Start date cannot be after expected end date (${format(expectedEnd, 'dd MMM yyyy')})`);
                          return;
                        }
                      }
                      setStartDate(newStartDate);
                    }}
                    min={!isEditMode && paymentCheck?.purchase?.expectedStartDate ? format(new Date(paymentCheck.purchase.expectedStartDate), 'yyyy-MM-dd') : undefined}
                    max={!isEditMode && paymentCheck?.purchase?.expectedEndDate ? format(new Date(paymentCheck.purchase.expectedEndDate), 'yyyy-MM-dd') : undefined}
                  />
                  {!isEditMode && paymentCheck?.purchase?.expectedStartDate && paymentCheck?.purchase?.expectedEndDate && (
                    <p className="text-xs text-green-600 mt-1">
                      📅 Start date must be within: {format(new Date(paymentCheck.purchase.expectedStartDate), 'dd MMM')} - {format(new Date(paymentCheck.purchase.expectedEndDate), 'dd MMM yyyy')}
                    </p>
                  )}
                  {!isEditMode && !paymentCheck?.purchase?.expectedStartDate && paymentCheck?.hasPaidPlan && (
                    <p className="text-xs text-amber-600 mt-1">
                      ⚠️ No expected dates set. Set expected dates in Payment section first.
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">
                    Duration (Days) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={isEditMode ? 365 : (paymentCheck?.remainingDays || 365)}
                    value={duration}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      if (val < 1) {
                        setDuration(1);
                      } else if (!isEditMode && paymentCheck?.remainingDays && val > paymentCheck.remainingDays) {
                        toast.error(`Maximum duration allowed is ${paymentCheck.remainingDays} days based on client's purchased plan`);
                        setDuration(paymentCheck.remainingDays);
                      } else if (val > 365) {
                        setDuration(365);
                      } else {
                        setDuration(val);
                      }
                    }}
                  />
                  {!isEditMode && paymentCheck?.hasPaidPlan && (
                    <p className="text-xs text-amber-600 mt-1">
                      ⚠️ Client has {paymentCheck.remainingDays} days remaining in their plan
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">
                    End Date <span className="text-gray-400">(Auto-calculated)</span>
                  </Label>
                  <Input
                    type="date"
                    value={endDate}
                    disabled
                    className="bg-gray-50"
                  />
                </div>
              </div>

              {/* Primary Goal */}
              <div className="max-w-xl">
                <Label className="text-sm font-medium mb-2 block">
                  Primary Goal
                </Label>
                <Select value={primaryGoal} onValueChange={setPrimaryGoal}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select primary goal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weight-loss">Weight Loss</SelectItem>
                    <SelectItem value="weight-gain">Weight Gain</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="muscle-gain">Muscle Gain</SelectItem>
                    <SelectItem value="health-improvement">Health Improvement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-4 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={resetForm}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={handleFormSubmit}
                >
                  Continue to Add Meals
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // List View - Show existing plans
  return (
    <div className="mt-6 space-y-6">
      {/* Payment Status Alert */}
      {checkingPayment ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking payment status...
        </div>
      ) : paymentCheck && !paymentCheck.hasPaidPlan ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-amber-900">No Active Plan Purchased</h4>
                <p className="text-sm text-amber-700 mt-1">
                  This client hasn't purchased a service plan yet. Please create a payment link and complete the payment before creating a meal plan.
                </p>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-600 text-amber-700 hover:bg-amber-100"
                    onClick={() => {
                      // Navigate to payments section (scroll to it or switch tab)
                      const paymentsSection = document.querySelector('[data-section="payments"]');
                      if (paymentsSection) {
                        paymentsSection.scrollIntoView({ behavior: 'smooth' });
                      }
                      toast.info('Create a payment link for the client first');
                    }}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Go to Payments
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-600 text-amber-700 hover:bg-amber-100"
                    onClick={() => checkPaymentStatus(true)}
                    disabled={checkingPayment}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${checkingPayment ? 'animate-spin' : ''}`} />
                    {checkingPayment ? 'Syncing...' : 'Sync & Refresh'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : paymentCheck && paymentCheck.hasPaidPlan ? (
        paymentCheck.remainingDays > 0 ? (
          <Card className="border-green-300 bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-green-900">✅ Active Plan: {paymentCheck.purchase?.planName}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={recalculateDaysUsed}
                      disabled={recalculating}
                      className="text-xs text-gray-500 hover:text-green-700"
                      title="Recalculate days used from actual meal plans"
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${recalculating ? 'animate-spin' : ''}`} />
                      {recalculating ? 'Fixing...' : 'Fix Days'}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 text-sm">
                    <div className="bg-white rounded p-2 border border-green-200">
                      <p className="text-gray-600 text-xs">Total Duration</p>
                      <p className="font-bold text-green-700">{paymentCheck.totalPurchasedDays || paymentCheck.purchase?.durationDays} days</p>
                    </div>
                    <div className="bg-white rounded p-2 border border-green-200">
                      <p className="text-gray-600 text-xs">Days Used</p>
                      <p className="font-bold text-green-700">{paymentCheck.totalDaysUsed || 0} days</p>
                    </div>
                    <div className="bg-white rounded p-2 border border-green-200">
                      <p className="text-gray-600 text-xs">Remaining</p>
                      <p className="font-bold text-blue-600">{paymentCheck.remainingDays} days</p>
                    </div>
                    <div className="bg-white rounded p-2 border border-green-200">
                      <p className="text-gray-600 text-xs">Plan Category</p>
                      <p className="font-bold text-green-700">{paymentCheck.purchase?.planCategory || 'General'}</p>
                    </div>
                    <div className="bg-white rounded p-2 border border-green-200">
                      <p className="text-gray-600 text-xs">Meal Plan Status</p>
                      <p className={`font-bold ${paymentCheck.purchase?.mealPlanCreated ? 'text-green-700' : 'text-orange-600'}`}>
                        {paymentCheck.purchase?.mealPlanCreated ? '✅ Created' : '⏳ Not Created'}
                      </p>
                    </div>
                    {/* Expected Dates Display */}
                    {paymentCheck.purchase?.expectedStartDate && (
                      <div className="bg-white rounded p-2 border border-green-200">
                        <p className="text-gray-600 text-xs">Expected Start</p>
                        <p className="font-bold text-green-700">
                          {format(new Date(paymentCheck.purchase.expectedStartDate), 'MMM d, yyyy')}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 bg-green-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-green-500 h-full transition-all"
                      style={{ width: `${((paymentCheck.totalDaysUsed || 0) / (paymentCheck.totalPurchasedDays || 1)) * 100}%` }}
                    />
                  </div>

                  {/* Set Expected Dates Prompt - Show when mealPlanCreated is false and no expected dates */}
                  {!paymentCheck.purchase?.mealPlanCreated && !paymentCheck.purchase?.expectedStartDate && (
                    <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-orange-600" />
                        <p className="text-sm text-orange-700 font-medium">
                          Set Expected Start Date
                        </p>
                      </div>
                      <p className="text-xs text-orange-600 mt-1">
                        Client has paid. Please set the expected start date in the Payments section to schedule the meal plan.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-orange-700 border-orange-300 hover:bg-orange-100"
                        onClick={() => {
                          const paymentsSection = document.querySelector('[data-section="payments"]');
                          if (paymentsSection) {
                            paymentsSection.scrollIntoView({ behavior: 'smooth' });
                          }
                        }}
                      >
                        <Calendar className="h-4 w-4 mr-2" />
                        Go to Payments Section
                      </Button>
                    </div>
                  )}

                  {/* Show all pending purchases needing meal plans */}
                  {paymentCheck.allPurchasesNeedingMealPlan && paymentCheck.allPurchasesNeedingMealPlan.length > 0 && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <CreditCard className="h-4 w-4 text-blue-600" />
                        <p className="text-sm text-blue-700 font-medium">
                          {paymentCheck.allPurchasesNeedingMealPlan.length} Purchase{paymentCheck.allPurchasesNeedingMealPlan.length > 1 ? 's' : ''} with Remaining Days
                        </p>
                      </div>
                      <div className="space-y-2">
                        {paymentCheck.allPurchasesNeedingMealPlan.map((purchase, idx) => {
                          const isPartiallyUsed = (purchase.daysUsed || 0) > 0;
                          const isCurrentPurchase = purchase._id === paymentCheck.purchase?._id;

                          return (
                            <div
                              key={purchase._id}
                              className={`flex items-center justify-between text-xs p-2 rounded border ${isCurrentPurchase
                                ? 'bg-green-50 border-green-300'
                                : 'bg-white border-blue-100'
                                }`}
                            >
                              <div className="flex items-center gap-2">
                                {isCurrentPurchase && (
                                  <span className="text-green-600 text-[10px] font-bold">▶</span>
                                )}
                                <div>
                                  <span className={`font-medium ${isCurrentPurchase ? 'text-green-800' : 'text-blue-800'}`}>
                                    {purchase.planName}
                                  </span>
                                  <span className="text-gray-500 ml-2">
                                    ({purchase.remainingDays}/{purchase.durationDays} days remaining)
                                  </span>
                                  {isPartiallyUsed && (
                                    <span className="ml-2 text-orange-600 font-medium">
                                      • {purchase.daysUsed} days used
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {isCurrentPurchase ? (
                                  <Badge className="bg-green-100 text-green-700 text-xs">
                                    Current
                                  </Badge>
                                ) : (
                                  <Badge className="bg-gray-100 text-gray-600 text-xs">
                                    Waiting
                                  </Badge>
                                )}
                                {purchase.expectedStartDate && (
                                  <Badge className="bg-blue-100 text-blue-700 text-xs ml-1">
                                    {format(new Date(purchase.expectedStartDate), 'MMM d')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-gray-500 mt-2">
                        💡 Tip: Complete current purchase first before moving to the next one
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-green-600 mt-2">
                    {paymentCheck.purchase?.mealPlanCreated
                      ? '✓ Meal plan has been created. You can create additional plans with remaining days.'
                      : '✓ Ready to create meal plan. Click "Create New Plan" button below.'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-green-700 hover:bg-green-100"
                  onClick={() => checkPaymentStatus(true)}
                  disabled={checkingPayment}
                  title="Sync payment status with Razorpay"
                >
                  <RefreshCw className={`h-4 w-4 ${checkingPayment ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : clientPlans && clientPlans.length > 0 && clientPlans.some((plan: any) => isPlanRunning(plan)) ? (
          /* All days used - show this only if plans exist AND at least one is currently running */
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-amber-700 font-medium">
                      All {paymentCheck.totalPurchasedDays || paymentCheck.purchase?.durationDays} days used •
                      <Button
                        variant="link"
                        size="sm"
                        className="text-amber-700 underline p-0 h-auto"
                        onClick={() => {
                          const paymentsSection = document.querySelector('[data-section="payments"]');
                          if (paymentsSection) {
                            paymentsSection.scrollIntoView({ behavior: 'smooth' });
                          }
                          toast.info('Create a payment link for more days');
                        }}
                      >
                        Purchase new plan for more days
                      </Button>
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-amber-700 hover:bg-amber-100"
                  onClick={() => checkPaymentStatus(true)}
                  disabled={checkingPayment}
                  title="Sync payment status with Razorpay"
                >
                  <RefreshCw className={`h-4 w-4 ${checkingPayment ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null
      ) : null}

      {/* Current Diet Plans */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Diet Plans for {client.firstName} {client.lastName}</CardTitle>
            <div className="flex items-center gap-2">
              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await Promise.all([
                    fetchClientPlans(),
                    checkPaymentStatus(true)
                  ]);
                  toast.success('Refreshed successfully');
                }}
                disabled={checkingPayment || loadingPlans}
                title="Refresh plans and payment status"
              >
                <RefreshCw className={`h-4 w-4 ${checkingPayment || loadingPlans ? 'animate-spin' : ''}`} />
              </Button>
              {/* Create New Plan Button - Hidden in viewOnly mode (health counselor) */}
              {!viewOnly && (
                <Button
                  className={`${paymentCheck?.hasPaidPlan && paymentCheck.remainingDays > 0
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-gray-400 cursor-not-allowed'
                    }`}
                  onClick={async () => {
                    if (!paymentCheck?.hasPaidPlan) {
                      toast.error('Client needs to purchase a plan first before creating a meal plan');
                      return;
                    }
                    if (paymentCheck.remainingDays <= 0) {
                      toast.error('All plan days have been used. Client needs to purchase a new plan.');
                      return;
                    }
                    // Check if expected dates are set for the purchase
                    const purchase = paymentCheck.purchase;
                    if (!purchase?.expectedStartDate || !purchase?.expectedEndDate) {
                      toast.error('Please set the expected start and end dates in the Payments tab before creating a meal plan.');
                      return;
                    }
                    // Clear any stale state before creating new plan
                    setEditingPlan(null);
                    setIsEditMode(false);
                    setViewingPlan(null);
                    setPlanTitle('');
                    setDescription('');
                    setInitialMeals([]);
                    setInitialMealTypes(DEFAULT_MEAL_TYPES_LIST);
                    setSelectedTemplate(null);
                    setPlanKey(prev => prev + 1);

                    // Set duration based on remaining days
                    if (paymentCheck.remainingDays > 0) {
                      setDuration(Math.min(paymentCheck.remainingDays, 30)); // Max 30 days at a time
                    }
                    // Initialize start date based on latest plan
                    await initializeStartDate();
                    setStep('form');
                  }}
                  disabled={!paymentCheck?.hasPaidPlan || paymentCheck.remainingDays <= 0}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Plan
                </Button>
              )}
            </div>
          </div>
          {paymentCheck?.hasPaidPlan && paymentCheck.remainingDays > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              {paymentCheck.remainingDays} days available • You can split into multiple plans (e.g., 7+7 days)
            </p>
          )}
          {paymentCheck?.hasPaidPlan && paymentCheck.remainingDays <= 0 && (
            <p className="text-sm text-amber-600 mt-1">
              All {paymentCheck.totalPurchasedDays} days used • Purchase new plan for more days
            </p>
          )}
        </CardHeader>

        <CardContent>
          {loadingPlans ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : clientPlans.length > 0 ? (
            <div className="space-y-4">
              {clientPlans.map((plan: any) => (
                <div
                  key={plan._id}
                  className={`border rounded-lg p-4 transition-colors ${plan.status === 'active'
                    ? 'border-green-300 bg-green-50/50'
                    : plan.status === 'draft'
                      ? 'border-orange-300 bg-orange-50/50'
                      : 'border-gray-200 hover:border-blue-300'
                    }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {plan.name}
                        </h3>
                        <Badge
                          className={
                            plan.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : plan.status === 'completed'
                                ? 'bg-blue-100 text-blue-800'
                                : plan.status === 'paused'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : plan.status === 'draft'
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-gray-100 text-gray-800'
                          }
                        >
                          {plan.status}
                        </Badge>
                      </div>

                      {plan.templateId && (
                        <p className="text-sm text-gray-600 mb-2">
                          Template: {plan.templateId.name}
                        </p>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-gray-500">Start Date:</span>
                          <p className="font-medium">
                            {format(new Date(plan.startDate), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">End Date:</span>
                          <p className="font-medium">
                            {format(new Date(plan.endDate), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">Duration:</span>
                          <p className="font-medium">
                            {plan.duration} Days
                            {/* {Math.ceil((new Date(plan.endDate).getTime() - new Date(plan.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} Days */}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">Goal:</span>
                          <p className="font-medium capitalize">
                            {plan.goals?.primaryGoal?.replace('-', ' ') || 'Not specified'}
                          </p>
                        </div>
                      </div>

                      {/* Show freeze days info if any */}
                      {plan.totalFreezeCount > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                            <Snowflake className="h-3 w-3 mr-1" />
                            {plan.totalFreezeCount} day(s) frozen
                          </Badge>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 ml-4 items-center">
                      {/* Check if plan has ended (completed status OR end date passed) */}
                      {(() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const planEndDate = new Date(plan.endDate);
                        planEndDate.setHours(23, 59, 59, 999);
                        const isPlanEnded = plan.status === 'completed' || plan.status === 'cancelled' || planEndDate < today;

                        return (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              title="View"
                              onClick={() => handleViewPlan(plan)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>

                            {/* Only show Edit and More options if plan has NOT ended */}
                            {!isPlanEnded && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title="Edit"
                                  onClick={() => handleEditPlan(plan)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </>
                            )}

                            {/* Delete button — only for draft plans */}
                            {plan.status === 'draft' && (
                              <AlertDialog open={deletingPlanId === plan._id} onOpenChange={(open) => { if (!open) setDeletingPlanId(null); }}>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    title="Delete draft"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => setDeletingPlanId(plan._id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Draft?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete the draft &quot;{plan.name}&quot;. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-red-600 hover:bg-red-700"
                                      onClick={() => handleDeleteDraft(plan._id)}
                                      disabled={isDeleting}
                                    >
                                      {isDeleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...</> : 'Delete'}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </>
                        );
                      })()}

                      {/* Three Dot Dropdown Menu - Only show if plan has NOT ended */}
                      {(() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const planEndDate = new Date(plan.endDate);
                        planEndDate.setHours(23, 59, 59, 999);
                        const isPlanEnded = plan.status === 'completed' || plan.status === 'cancelled' || planEndDate < today;
                        if (isPlanEnded) return null;
                        return (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                title="More options"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="p-3 w-48">
                              <div className="flex flex-col gap-2">
                                <ExtendPlanDialog
                                  plan={plan}
                                  onExtend={handleExtendPlan}
                                  showAsText={false}
                                  showAsButton={true}
                                />

                                <PausePlanDialog
                                  plan={plan}
                                  onPause={handlePausePlan}
                                  onResume={handleResumePlan}
                                  showAsText={false}
                                  showAsButton={true}
                                />

                                <FreezePlanDialog
                                  plan={plan}
                                  onFreeze={fetchClientPlans}
                                  showAsText={false}
                                  showAsButton={true}
                                />

                                <Button
                                  size="sm"
                                  variant="outline"
                                  title={!paymentCheck?.hasPaidPlan || paymentCheck.remainingDays <= 0 ? 'Client needs active payment to duplicate plans' : 'Duplicate'}
                                  onClick={() => handleDuplicatePlan(plan)}
                                  disabled={!paymentCheck?.hasPaidPlan || paymentCheck.remainingDays <= 0}
                                  className="flex items-center gap-1.5"
                                >
                                  <Copy className="h-4 w-4" />
                                  <span className="text-xs">Duplicate</span>
                                </Button>
                              </div>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : dietPlans.length > 0 ? (
            /* Legacy diet plans from client data */
            <div className="space-y-4">
              {dietPlans.map((plan: DietPlan, index: number) => (
                <div
                  key={plan._id || index}
                  className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {plan.title}
                        </h3>
                        <Badge
                          className={
                            plan.status === "Active"
                              ? "bg-green-100 text-green-800"
                              : "bg-blue-100 text-blue-800"
                          }
                        >
                          {plan.status}
                        </Badge>
                      </div>

                      <p className="text-sm text-gray-600 mb-3">
                        {plan.calories} kcal/day • {plan.type} • {plan.notes}
                      </p>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-gray-500">Start Date:</span>
                          <p className="font-medium">{plan.startDate}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">End Date:</span>
                          <p className="font-medium">{plan.endDate}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Days:</span>
                          <p className="font-medium">{plan.days} Days</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Progress:</span>
                          <p className={
                            plan.status === "Active"
                              ? "font-medium text-green-600"
                              : "font-medium text-gray-600"
                          }>
                            {plan.progress}
                          </p>
                        </div>
                      </div>
                    </div>

                    {!viewOnly && (
                      <div className="flex gap-2 ml-4">
                        <Button size="sm" variant="outline">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* No diet plans */
            <div className="py-12 text-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium text-gray-900 mb-2">No diet plans created yet</p>
              <p className="text-sm text-gray-600 mb-6">
                {viewOnly
                  ? `No diet plans available for ${client.firstName} ${client.lastName}`
                  : `Create a personalized diet plan for ${client.firstName} ${client.lastName}`
                }
              </p>
              {!viewOnly && (
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => setStep('form')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Diet Plan
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Success Dialog - Plan Created */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <Check className="h-6 w-6 text-green-600" />
              Plan Created Successfully!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-10 w-10 text-green-600" />
              </div>
            </div>

            <div className="text-center">
              <p className="text-lg font-medium text-gray-900">
                {createdPlanInfo?.days} Day Meal Plan Created
              </p>
              <p className="text-sm text-gray-600 mt-1">
                for {client.firstName} {client.lastName}
              </p>
            </div>

            {createdPlanInfo && createdPlanInfo.remainingDays > 0 ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">{createdPlanInfo.remainingDays} days</span> remaining in the purchased plan
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  You can create more meal plans with the remaining days
                </p>
              </div>
            ) : createdPlanInfo && createdPlanInfo.remainingDays <= 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <CreditCard className="h-5 w-5 text-amber-600" />
                  <span className="font-medium text-amber-800">All Plan Days Used</span>
                </div>
                <p className="text-sm text-amber-700">
                  To create more meal plans, the client needs to purchase a new plan first.
                </p>
              </div>
            ) : null}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowSuccessDialog(false)}
              >
                Close
              </Button>
              {createdPlanInfo && createdPlanInfo.remainingDays <= 0 && (
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    setShowSuccessDialog(false);
                    // Navigate to payments section
                    const paymentsSection = document.querySelector('[data-section="payments"]');
                    if (paymentsSection) {
                      paymentsSection.scrollIntoView({ behavior: 'smooth' });
                    }
                    toast.info('Create a new payment link for the client');
                  }}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Go to Payments
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
