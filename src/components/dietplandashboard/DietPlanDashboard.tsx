import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
// Fixed imports to use existing UI component files
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MealGridTable } from './MealGridTable';
import { DietPlanExport } from './DietPlanExport';
import { Save, User, Download, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import {
  MEAL_TYPES,
  MEAL_TYPE_KEYS,
  getMealLabel,
  sortMealsByType,
  normalizeMealType,
  type MealTypeKey
} from '@/lib/mealConfig';

// ClientInfoPanel component (inline)
function InfoCard({ label, value, variant = 'default' }: { label: string; value: string; variant?: 'default' | 'dark' | 'bordered' }) {
  const styles: Record<string, string> = {
    default: 'bg-slate-50 border border-slate-200 hover:border-slate-300',
    dark: 'bg-linear-to-br from-slate-900 to-slate-800 border border-slate-700 text-white shadow',
    bordered: 'bg-white border-2 border-slate-300 hover:border-slate-400',
  };
  return (
    <div className={`rounded-xl p-2.5 transition-colors ${styles[variant]}`}>
      <p className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">{label}</p>
      <p className={`font-semibold text-sm ${variant === 'dark' ? 'text-white' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

type ClientData = {
  name: string;
  age: number;
  goal: string;
  planType: string;
  dietaryRestrictions?: string; // comma-separated
  medicalConditions?: string;   // comma-separated
  allergies?: string;           // comma-separated
};

export type MealTypeConfig = {
  name: string;
  time: string;
};

type DietPlanDashboardProps = {
  clientData?: ClientData;
  onBack?: () => void;
  onSavePlan?: (weekPlan: DayPlan[], mealTypes: MealTypeConfig[]) => void; // trigger parent save with meal data and meal types
  onSave?: (weekPlan: DayPlan[]) => void; // Simple save callback for PlanningSection
  onDurationChange?: (duration: number) => void; // Notify parent when days count changes
  duration?: number; // number of days to show
  startDate?: string; // Start date in YYYY-MM-DD format
  initialMeals?: DayPlan[]; // Load existing meals
  initialMealTypes?: MealTypeConfig[]; // Load existing meal types
  clientId?: string; // Client ID for saving
  clientName?: string; // Client name for display
  readOnly?: boolean; // View mode - hide save buttons and disable editing
  clientDietaryRestrictions?: string; // comma-separated dietary restrictions
  clientMedicalConditions?: string;   // comma-separated medical conditions
  clientAllergies?: string;           // comma-separated allergies
  holdDays?: { originalDate: Date; holdStartDate: Date; holdDays: number; reason?: string }[];
  totalHeldDays?: number;
};

export type FoodItem = {
  id: string;
  food: string;
  unit: string;
  cal: string;
  carbs: string;
  fats: string;
  protein: string;
  recipeUuid?: string;
};

export type FoodOption = {
  id: string;
  label: string;
  food: string;         // Primary food (for backwards compatibility)
  unit: string;
  cal: string;
  carbs: string;
  fats: string;
  protein: string;
  recipeUuid?: string;  // UUID of the recipe if added from recipe database
  foods?: FoodItem[];   // Multiple foods array for stacking foods in same meal slot
  isAlternative?: boolean; // Mark as alternative food
};

export type Meal = {
  id: string;
  time: string;
  name: string;
  foodOptions: FoodOption[];
  showAlternatives?: boolean;
};

export type DayPlan = {
  id: string;
  day: string;
  date: string;
  meals: { [mealType: string]: Meal };
  note: string;
  // Hold-related fields
  isHeld?: boolean;
  holdReason?: string;
  holdDate?: string;
  isCopiedFromHold?: boolean;
  originalDayIndex?: number;
  wasHeld?: boolean;
  resumedDate?: string;
};

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Default meal types from canonical config (IST times)
const defaultMealTypes: MealTypeConfig[] = MEAL_TYPE_KEYS.map(key => ({
  name: MEAL_TYPES[key].label,
  time: MEAL_TYPES[key].time12h
}));

// Time normalization - using 12-hour format directly
const normalizeTime = (value?: string): string => {
  if (!value) return '12:00 PM';
  return value.trim();
};

// Normalize meal keys in a day's meals object
// Converts keys like "EARLY_MORNING" to "Early Morning" and deduplicates
// Also deep-clones food options to prevent reference sharing with initialMeals
const normalizeMealKeys = (meals: Record<string, Meal>): Record<string, Meal> => {
  const normalized: Record<string, Meal> = {};

  // Helper to deep clone a food option
  const cloneOption = (opt: FoodOption): FoodOption => ({
    ...opt,
    foods: opt.foods ? opt.foods.map(f => ({ ...f })) : undefined,
  });

  Object.keys(meals).forEach(mealName => {
    const current = meals[mealName];
    if (!current) return;
    const mealKey = normalizeMealType(mealName);
    const displayName = mealKey ? MEAL_TYPES[mealKey].label : mealName;
    const canonicalTime = mealKey ? MEAL_TYPES[mealKey].time12h : undefined;
    if (normalized[displayName]) {
      // Merge food options if same meal type appears under different key names
      normalized[displayName].foodOptions = [
        ...normalized[displayName].foodOptions,
        ...current.foodOptions.map(cloneOption)
      ];
    } else {
      normalized[displayName] = {
        ...current,
        name: displayName,
        // Prefer user-saved time over canonical default
        time: current.time || canonicalTime || '12:00 PM',
        foodOptions: current.foodOptions ? current.foodOptions.map(cloneOption) : []
      };
    }
  });
  return normalized;
};

export function DietPlanDashboard({ clientData, onBack, onSavePlan, onSave, onDurationChange, duration = 7, startDate, initialMeals, initialMealTypes, clientId, clientName, readOnly = false, clientDietaryRestrictions, clientMedicalConditions, clientAllergies, holdDays = [], totalHeldDays = 0 }: DietPlanDashboardProps) {
  // Get session for role-based export visibility
  const { data: session } = useSession();
  const userRole = session?.user?.role as string | undefined;
  // Allow export for admin, health_counselor, and dietitian
  const canExport = userRole === 'admin' || userRole === 'health_counselor' || userRole === 'dietitian';

  // Combine props with clientData for restrictions
  const dietaryRestrictions = clientDietaryRestrictions || clientData?.dietaryRestrictions || '';
  const medicalConditions = clientMedicalConditions || clientData?.medicalConditions || '';
  const allergies = clientAllergies || clientData?.allergies || '';

  const [mealTypeConfigs, setMealTypeConfigs] = useState<MealTypeConfig[]>(initialMealTypes || defaultMealTypes);
  const mealTypes = mealTypeConfigs.map(m => m.name);

  // Helper to format date as YYYY-MM-DD
  const formatDateStr = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper to add days to a date
  const addDaysToDate = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  const buildDays = (count: number): DayPlan[] => {
    const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const baseDate = startDate ? new Date(startDate) : new Date();

    return Array.from({ length: count }).map((_, index) => {
      const dayDate = addDaysToDate(baseDate, index);
      const dayOfMonth = dayDate.getDate();
      const dayName = fullDayNames[dayDate.getDay()];
      const dateStr = formatDateStr(dayDate);

      return {
        id: `day-${index}`,
        day: `${dayOfMonth} - Day ${index + 1} - ${dayName}`,
        date: dateStr,
        meals: {},
        note: ''
      };
    });
  };

  // Initialize weekPlan with the correct duration and initialMeals
  const [weekPlan, setWeekPlan] = useState<DayPlan[]>(() => {

    // Always start with correct number of days based on duration
    const newDays = buildDays(duration);

    // If we have initialMeals, merge it into the days
    if (initialMeals && Array.isArray(initialMeals) && initialMeals.length > 0) {
      // Log sample data
      if (initialMeals[0]) {
      }

      return newDays.map((d, i) => ({
        ...d,
        ...(initialMeals[i] || {}), // Preserve all fields from initialMeals including isHeld, isCopiedFromHold
        meals: normalizeMealKeys(initialMeals[i]?.meals || {}),
        note: initialMeals[i]?.note || ''
      }));
    }

    return newDays;
  });

  // Rebuild when duration changes
  useEffect(() => {
    if (weekPlan.length !== duration) {
      const newDays = buildDays(duration);
      setWeekPlan(prev => {
        return newDays.map((d, i) => ({
          ...d,
          ...(prev[i] || {}), // Preserve all fields including isHeld, isCopiedFromHold
          meals: prev[i]?.meals || {},
          note: prev[i]?.note || ''
        }));
      });
    }
  }, [duration]);

  // Rebuild when initialMeals changes (e.g., when viewing/editing a different plan)
  // Using JSON stringify for deep comparison since object reference may not change
  const initialMealsKey = JSON.stringify(initialMeals);
  useEffect(() => {

    const newDays = buildDays(duration);

    if (initialMeals && Array.isArray(initialMeals) && initialMeals.length > 0) {
      // Log what we're loading
      initialMeals.forEach((day, i) => {
        const mealCount = day?.meals ? Object.keys(day.meals).length : 0;
        const isHeld = (day as any)?.isHeld || false;
      });

      // Always set the weekPlan from initialMeals if provided
      // Use MAX of duration and initialMeals.length to ensure we show all days
      // (duration is what user wants, initialMeals.length may be less if old data, or more if hold days were added)
      const mealsLength = Math.max(duration, initialMeals.length);
      const adjustedDays = buildDays(mealsLength);

      setWeekPlan(adjustedDays.map((d, i) => ({
        ...d,
        ...(initialMeals[i] || {}), // Preserve all fields including isHeld, isCopiedFromHold
        meals: normalizeMealKeys(initialMeals[i]?.meals || {}),
        note: initialMeals[i]?.note || ''
      })));
    }
    // Note: Don't reset to empty days here - let the draft restore handle empty state
    // This prevents overwriting draft data that may have been restored
  }, [initialMealsKey, duration]);

  // Update mealTypeConfigs when initialMealTypes changes
  // Normalize names from DB (which may be canonical KEYS like "EARLY_MORNING") to display labels
  useEffect(() => {
    if (initialMealTypes && initialMealTypes.length > 0) {
      const seen = new Set<string>();
      const normalized: MealTypeConfig[] = [];
      for (const meal of initialMealTypes) {
        const key = normalizeMealType(meal.name);
        const label = key ? MEAL_TYPES[key].label : meal.name;
        // IMPORTANT: Always prefer the user-saved time from DB (meal.time).
        // Only fall back to canonical default if no saved time exists.
        const time = normalizeTime(meal.time) || (key ? MEAL_TYPES[key].time12h : '12:00 PM');
        if (!seen.has(label)) {
          seen.add(label);
          normalized.push({ ...meal, name: label, time });
        }
      }
      setMealTypeConfigs(normalized);
    }
  }, [initialMealTypes]);

  // Sync parent duration when days count changes (e.g., Add Day)
  useEffect(() => {
    if (!onDurationChange) return;
    if (weekPlan.length && weekPlan.length !== duration) {
      onDurationChange(weekPlan.length);
    }
  }, [weekPlan.length, duration, onDurationChange]);

  // ============ AUTO-SAVE FUNCTIONALITY ============
  // Draft key for this specific diet plan
  const draftKey = useMemo(() => {
    const identifier = clientId || 'new';
    return `dietPlan_draft_${identifier}_${duration}`;
  }, [clientId, duration]);

  // Auto-save state
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false); // Export dialog state for MealGridTable
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousDataRef = useRef<string>('');
  const isInitializedRef = useRef(false);

  const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
  const DEBOUNCE_MS = 2000; // 2 seconds

  // Memoized data for auto-save comparison
  const draftData = useMemo(() => ({
    weekPlan,
    mealTypeConfigs,
    lastSaved: Date.now(),
    expiresAt: Date.now() + DRAFT_EXPIRY_MS,
  }), [weekPlan, mealTypeConfigs]);

  // Save to localStorage (no server calls - zero DB load)
  const saveToStorage = useCallback(() => {
    if (typeof window === 'undefined' || readOnly) return;

    try {
      localStorage.setItem(draftKey, JSON.stringify(draftData));
      setHasDraft(true);
      setLastSaved(new Date());
      setIsSaving(false);
    } catch (error) {
      console.error('Failed to save diet plan draft:', error);
      setIsSaving(false);
    }
  }, [draftKey, draftData, readOnly]);

  // Debounced auto-save effect (2 second delay)
  useEffect(() => {
    if (readOnly || !session?.user?.id) return;

    const currentDataStr = JSON.stringify({ weekPlan, mealTypeConfigs });

    // Skip if no changes
    if (previousDataRef.current === currentDataStr) return;

    // Skip initial state
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      previousDataRef.current = currentDataStr;
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setIsSaving(true);

    // Debounced save - only saves after 2 seconds of no changes
    saveTimeoutRef.current = setTimeout(() => {
      saveToStorage();
      previousDataRef.current = currentDataStr;
    }, DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [weekPlan, mealTypeConfigs, readOnly, session?.user?.id, saveToStorage]);

  // Restore draft on mount
  useEffect(() => {
    if (draftRestored || readOnly || !session?.user?.id) return;
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(draftKey);
      if (!stored) {
        setDraftRestored(true);
        return;
      }

      const draft = JSON.parse(stored);

      // Check if expired
      if (draft.expiresAt && Date.now() > draft.expiresAt) {
        localStorage.removeItem(draftKey);
        setDraftRestored(true);
        return;
      }

      // Only restore draft if initialMeals is empty/absent (new plan or template create)
      // When initialMeals has data (editing existing plan/template), DB data takes priority
      const hasInitialMeals = initialMeals && Array.isArray(initialMeals) && initialMeals.length > 0 &&
        initialMeals.some((day: any) => day?.meals && Object.keys(day.meals).length > 0);

      if (!hasInitialMeals && draft.weekPlan && draft.weekPlan.length > 0) {
        const hasData = draft.weekPlan.some((day: DayPlan) =>
          Object.keys(day.meals).length > 0 || day.note
        );

        if (hasData) {
          // If initialMealTypes is provided, use that order; otherwise use draft's meal types
          const baseMealTypes = initialMealTypes && initialMealTypes.length > 0
            ? initialMealTypes
            : (draft.mealTypeConfigs || defaultMealTypes);

          const normalizedMealTypes = baseMealTypes.map((meal: MealTypeConfig) => {
            const key = normalizeMealType(meal.name);
            return {
              ...meal,
              name: key ? MEAL_TYPES[key].label : meal.name,
              // Prefer user-saved time over canonical default
              time: normalizeTime(meal.time) || (key ? MEAL_TYPES[key].time12h : '12:00 PM')
            };
          });
          // Deduplicate by name
          const seen = new Set<string>();
          const dedupedMealTypes = normalizedMealTypes.filter((m: MealTypeConfig) => {
            if (seen.has(m.name)) return false;
            seen.add(m.name);
            return true;
          });

          const mealTimeMap = new Map(dedupedMealTypes.map((meal: MealTypeConfig) => [meal.name, meal.time]));

          // Collect all custom meal types from weekPlan that aren't in dedupedMealTypes
          const customMealsFromWeekPlan: MealTypeConfig[] = [];
          draft.weekPlan.forEach((day: DayPlan) => {
            Object.entries(day.meals).forEach(([mealName, meal]) => {
              if (!meal) return;
              const mealKey = normalizeMealType(mealName);
              const displayName = mealKey ? MEAL_TYPES[mealKey].label : mealName;
              // If this meal type is not in dedupedMealTypes, it's a custom meal
              if (!mealTimeMap.has(displayName) && !customMealsFromWeekPlan.some(m => m.name === displayName)) {
                customMealsFromWeekPlan.push({
                  name: displayName,
                  time: normalizeTime(meal.time) || '12:00 PM'
                });
              }
            });
          });

          // Merge custom meals into dedupedMealTypes
          const allMealTypes = [...dedupedMealTypes, ...customMealsFromWeekPlan];

          const normalizedWeekPlan = draft.weekPlan.map((day: DayPlan) => {
            const meals: Record<string, Meal> = {};
            Object.keys(day.meals).forEach((mealName) => {
              const current = day.meals[mealName];
              if (!current) return;
              // Normalize the meal key to display label (e.g. "EARLY_MORNING" → "Early Morning")
              const mealKey = normalizeMealType(mealName);
              const displayName = mealKey ? MEAL_TYPES[mealKey].label : mealName;
              const normalizedTimeVal = normalizeTime(current.time);
              const fallbackTime = mealTimeMap.get(displayName) || '12:00 PM';
              const resolvedTime = (normalizedTimeVal || fallbackTime) as string;
              // If this display name already exists (duplicate), merge food options
              if (meals[displayName]) {
                meals[displayName].foodOptions = [
                  ...meals[displayName].foodOptions,
                  ...current.foodOptions
                ];
              } else {
                meals[displayName] = {
                  ...current,
                  name: displayName,
                  time: resolvedTime
                };
              }
            });
            return { ...day, meals };
          });

          setWeekPlan(normalizedWeekPlan);
          setMealTypeConfigs(allMealTypes);
          setHasDraft(true);
          setLastSaved(draft.lastSaved ? new Date(draft.lastSaved) : null);

          toast.success('Draft restored', {
            description: 'Your previous diet plan work has been restored. Draft expires in 24 hours.',
            duration: 4000
          });
        }
      }

      setDraftRestored(true);
    } catch (error) {
      console.error('Failed to restore diet plan draft:', error);
      setDraftRestored(true);
    }
  }, [draftKey, draftRestored, readOnly, session?.user?.id, initialMealTypes]);

  // Clear draft function
  const handleClearDraft = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(draftKey);
      setHasDraft(false);
      setLastSaved(null);
      previousDataRef.current = '';
      isInitializedRef.current = false;

      // Reset to initial state
      const newDays = buildDays(duration);
      if (initialMeals && initialMeals.length > 0) {
        setWeekPlan(newDays.map((d, i) => ({
          ...d,
          ...(initialMeals[i] || {}),
          meals: initialMeals[i]?.meals || {},
          note: initialMeals[i]?.note || ''
        })));
      } else {
        setWeekPlan(newDays);
      }
      setMealTypeConfigs(initialMealTypes || defaultMealTypes);

      toast.success('Draft cleared', { description: 'Starting fresh.' });
    } catch (error) {
      console.error('Failed to clear diet plan draft:', error);
    }
  }, [draftKey, duration, initialMeals, initialMealTypes]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);
  // ============ END AUTO-SAVE FUNCTIONALITY ============

  const handleAddMealType = (newMealType: string, position?: number, time?: string) => {
    if (!newMealType) return;

    // Check if meal type already exists in config by checking the actual configs, not derived mealTypes
    const alreadyExists = mealTypeConfigs.some(m => m.name === newMealType);
    if (alreadyExists) return;

    const mealTime = time || '12:00 PM';
    const newConfig: MealTypeConfig = { name: newMealType, time: mealTime };

    if (position !== undefined && position >= 0 && position <= mealTypeConfigs.length) {
      // Insert at specific position
      setMealTypeConfigs(prev => {
        const updated = [...prev];
        updated.splice(position, 0, newConfig);
        return updated;
      });
    } else {
      // Add at the end
      setMealTypeConfigs(prev => [...prev, newConfig]);
    }
  };

  // Handle meal time updates from MealGridTable's bulk time editor
  const handleUpdateMealTimes = (timesMap: { [mealType: string]: string }) => {
    setMealTypeConfigs(prev => {
      const updated = prev.map(config => {
        if (timesMap[config.name]) {
          return { ...config, time: timesMap[config.name] };
        }
        return config;
      });
      // Add any new custom meal types from the times map that aren't in configs yet
      Object.entries(timesMap).forEach(([name, time]) => {
        if (!updated.find(c => c.name === name)) {
          updated.push({ name, time });
        }
      });
      return updated;
    });
  };

  const handleSavePlan = () => {
    // Clear draft after save (draft will be deleted from localStorage)
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(draftKey);
        setHasDraft(false);
        setLastSaved(null);
        previousDataRef.current = '';
      } catch {/* ignore */ }
    }

    if (onSave) {
      // New simple callback for PlanningSection
      onSave(weekPlan);
    } else if (onSavePlan) {
      onSavePlan(weekPlan, mealTypeConfigs);
    } else {
      toast.success('Diet plan saved successfully!');
    }
  };

  const handleUpdateMealType = (index: number, field: 'name' | 'time', value: string) => {
    setMealTypeConfigs(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleRemoveMealType = (mealTypeName: string) => {
    // Remove from mealTypeConfigs
    setMealTypeConfigs(prev => prev.filter(config => config.name !== mealTypeName));

    // Also remove from weekPlan meals — use functional updater for safety
    setWeekPlan(prev => prev.map(day => {
      const newMeals: { [key: string]: Meal } = {};
      Object.keys(day.meals).forEach(key => {
        if (key !== mealTypeName) {
          newMeals[key] = { ...day.meals[key], foodOptions: day.meals[key].foodOptions.map(opt => ({ ...opt, foods: opt.foods ? opt.foods.map(f => ({ ...f })) : undefined })) };
        }
      });
      return { ...day, meals: newMeals };
    }));
  };

  const handleRemoveDay = (dayIndex: number) => {
    // Remove the day at the given index
    setWeekPlan(prev => {
      if (prev.length <= 1) return prev; // Keep at least 1 day
      const updated = prev.filter((_, i) => i !== dayIndex);
      // Re-number days if needed
      return updated.map((day, i) => ({
        ...day,
        day: `Day ${i + 1}`
      }));
    });
    toast.success(`Day ${dayIndex + 1} deleted`);
  };

  const handleExport = () => {
    toast.success('Diet plan exported successfully!');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b-2 border-gray-200 dark:border-slate-700 shadow-sm">
        <div className="max-w-450 mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-5">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
                {clientName ? `Diet Plan for ${clientName}` : 'Diet Plan Manager'}
              </h1>
              {clientId && (
                <span className="text-sm text-slate-500 dark:text-slate-400">({duration} days)</span>
              )}
              {readOnly && (
                <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-1 rounded font-medium">View Only</span>
              )}
            </div>

            {/* Right side - Auto-save indicator + Actions */}
            <div className="flex items-center space-x-3">
              {/* Auto-save indicator */}
              {!readOnly && (
                <>
                  {isSaving && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Saving...
                    </span>
                  )}
                  {!isSaving && lastSaved && (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      Saved {lastSaved.toLocaleTimeString()}
                    </span>
                  )}
                  {hasDraft && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearDraft}
                      className="border-gray-300 dark:border-gray-600"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Clear Draft
                    </Button>
                  )}
                </>
              )}

              {/* Action buttons */}
              {!readOnly && (
                <>
                  {canExport && (
                    <DietPlanExport
                      weekPlan={weekPlan}
                      mealTypes={mealTypes}
                      clientName={clientName}
                      clientInfo={{
                        dietaryRestrictions,
                        medicalConditions,
                        allergies
                      }}
                      duration={duration}
                      startDate={startDate}
                      dietitianName={session?.user?.firstName && session?.user?.lastName ? `${session.user.firstName} ${session.user.lastName}` : session?.user?.name || undefined}
                    />
                  )}
                  <Button onClick={handleSavePlan} className="bg-green-600 hover:bg-green-700 shadow font-medium">
                    <Save className="w-4 h-4 mr-2" />
                    Save Plan
                  </Button>
                </>
              )}
              {readOnly && canExport && (
                <DietPlanExport
                  weekPlan={weekPlan}
                  mealTypes={mealTypes}
                  clientName={clientName}
                  clientInfo={{
                    dietaryRestrictions,
                    medicalConditions,
                    allergies
                  }}
                  duration={duration}
                  startDate={startDate}
                  dietitianName={session?.user?.firstName && session?.user?.lastName ? `${session.user.firstName} ${session.user.lastName}` : session?.user?.name || undefined}
                />
              )}
            </div>
          </div>
        </div>
      </div>


      <div className="max-w-600 z-mx-auto px-2 sm:px-4 lg:px-6 py-10">
        <MealGridTable
          weekPlan={weekPlan}
          mealTypes={mealTypes}
          mealTypeConfigs={mealTypeConfigs}
          onUpdate={readOnly ? undefined : setWeekPlan}
          onAddMealType={readOnly ? undefined : handleAddMealType}
          onRemoveMealType={readOnly ? undefined : handleRemoveMealType}
          onRemoveDay={readOnly ? undefined : handleRemoveDay}
          onUpdateMealTimes={readOnly ? undefined : handleUpdateMealTimes}
          onExport={canExport ? () => setExportDialogOpen(true) : undefined}
          readOnly={readOnly}
          clientName={clientName}
          clientDietaryRestrictions={dietaryRestrictions}
          clientMedicalConditions={medicalConditions}
          clientAllergies={allergies}
          holdDays={holdDays}
          totalHeldDays={totalHeldDays}
        />
        {/* Export dialog triggered from MealGridTable */}
        {canExport && (
          <DietPlanExport
            weekPlan={weekPlan}
            mealTypes={mealTypes}
            clientName={clientName}
            clientInfo={{
              dietaryRestrictions,
              medicalConditions,
              allergies
            }}
            duration={duration}
            startDate={startDate}
            dietitianName={session?.user?.firstName && session?.user?.lastName ? `${session.user.firstName} ${session.user.lastName}` : session?.user?.name || undefined}
            externalOpen={exportDialogOpen}
            onExternalOpenChange={setExportDialogOpen}
          />
        )}
      </div>
    </div>
  );
}