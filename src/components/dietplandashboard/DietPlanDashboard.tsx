import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
// Fixed imports to use existing UI component files
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MealGridTable } from './MealGridTable';
import { DietPlanExport } from './DietPlanExport';
import { Save, User, Download, RefreshCw, Trash2, CloudOff, CircleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import {
  MEAL_TYPES,
  MEAL_TYPE_KEYS,
  getMealLabel,
  sortMealsByType,
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
  onMealDataChange?: (weekPlan: DayPlan[], mealTypes: MealTypeConfig[]) => void; // Notify parent on every meal data change (for autosave)
  onDurationChange?: (duration: number) => void; // Notify parent when days count changes
  duration?: number; // number of days to show
  startDate?: string; // Start date in YYYY-MM-DD format
  initialMeals?: DayPlan[]; // Load existing meals
  initialMealTypes?: MealTypeConfig[]; // Load existing meal types
  clientId?: string; // Client ID for saving
  clientName?: string; // Client name for display
  readOnly?: boolean; // View mode - hide save buttons and disable editing
  draftSaveStatus?: 'idle' | 'saving' | 'retrying' | 'offline' | 'saved' | 'error';
  draftSaveMessage?: string;
  onRetryDraftSave?: () => void;
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
  recipeId?: string;
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
  note?: string;
  recipeId?: string;    // Mongo _id of the recipe if added from recipe database
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
  // Freeze-related fields
  isFrozen?: boolean;
  isFreezeRecovery?: boolean;
  originalFreezeDate?: string;
  originalFreezeDateLabel?: string;
};

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Default meal types from canonical config (IST times)
const defaultMealTypes: MealTypeConfig[] = MEAL_TYPE_KEYS.map(key => ({
  name: MEAL_TYPES[key].label,
  time: MEAL_TYPES[key].time12h
}));

// Time normalization - using 12-hour format directly
const normalizeTime = (value?: string): string => {
  if (!value || !value.trim()) return '';
  const trimmed = value.trim();

  const twelveHourMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHourMatch) {
    const hours = parseInt(twelveHourMatch[1], 10);
    const minutes = twelveHourMatch[2];
    const period = twelveHourMatch[3].toUpperCase();
    if (hours >= 1 && hours <= 12) {
      return `${String(hours).padStart(2, '0')}:${minutes} ${period}`;
    }
  }

  const twentyFourHourMatch = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (twentyFourHourMatch) {
    const h24 = parseInt(twentyFourHourMatch[1], 10);
    const minutes = twentyFourHourMatch[2];
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${minutes} ${period}`;
  }

  return trimmed;
};

const toCanonicalMealKeyOnly = (mealName: string): MealTypeKey | null => {
  const upperKey = mealName.toUpperCase().trim().replace(/[\s_-]+/g, '_');
  return MEAL_TYPE_KEYS.includes(upperKey as MealTypeKey)
    ? (upperKey as MealTypeKey)
    : null;
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
    const mealKey = toCanonicalMealKeyOnly(mealName);
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
        time: normalizeTime(current.time) || canonicalTime || '12:00 PM',
        foodOptions: current.foodOptions ? current.foodOptions.map(cloneOption) : []
      };
    }
  });

  return normalized;
};

export function DietPlanDashboard({ clientData, onBack, onSavePlan, onSave, onMealDataChange, onDurationChange, duration = 7, startDate, initialMeals, initialMealTypes, clientId, clientName, readOnly = false, draftSaveStatus, draftSaveMessage, onRetryDraftSave, clientDietaryRestrictions, clientMedicalConditions, clientAllergies, holdDays = [], totalHeldDays = 0 }: DietPlanDashboardProps) {
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

  // Helper to parse a date string (YYYY-MM-DD) to a Date object
  // Handles timezone correctly by creating a local date (not UTC)
  const parseLocalDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0); // Create local date at midnight
  };

  // Helper to add days to a date
  const addDaysToDate = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  const buildDays = (count: number): DayPlan[] => {
    const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    // Use the helper to parse the date string as a local date (not UTC)
    const baseDate = startDate ? parseLocalDate(startDate) : new Date();

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

  // Derive {date, day} for a row using the meal's actual stored date when present.
  // Falls back to the buildDays-computed date when the meal has no date (or no meal at this index).
  // This prevents visual misalignment when plan.startDate drifts from meals[0].date
  // (e.g. freeze recovery rows or phase-shifted plans), which previously caused freeze
  // flags to appear on the wrong rows.
  const deriveDayMeta = (meal: any, fallback: DayPlan, index: number): { date: string; day: string } => {
    const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const rawMealDate = meal?.date;
    if (rawMealDate) {
      const mealDateObj = typeof rawMealDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawMealDate)
        ? parseLocalDate(rawMealDate)
        : new Date(rawMealDate);
      if (!Number.isNaN(mealDateObj.getTime())) {
        const dateStr = formatDateStr(mealDateObj);
        const dayOfMonth = mealDateObj.getDate();
        const dayName = fullDayNames[mealDateObj.getDay()];
        const dayLabel = `${dayOfMonth} - Day ${index + 1} - ${dayName}`;
        return { date: dateStr, day: dayLabel };
      }
    }
    return { date: fallback.date, day: fallback.day };
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

      return newDays.map((d, i) => {
        const meta = deriveDayMeta(initialMeals[i], d, i);
        return {
          ...d,
          // Preserve hold-related and specific fields from initialMeals
          isHeld: initialMeals[i]?.isHeld,
          holdReason: initialMeals[i]?.holdReason,
          holdDate: initialMeals[i]?.holdDate,
          isCopiedFromHold: initialMeals[i]?.isCopiedFromHold,
          originalDayIndex: initialMeals[i]?.originalDayIndex,
          wasHeld: initialMeals[i]?.wasHeld,
          resumedDate: initialMeals[i]?.resumedDate,
          // Preserve freeze-related metadata from initialMeals
          isFrozen: initialMeals[i]?.isFrozen,
          isFreezeRecovery: initialMeals[i]?.isFreezeRecovery,
          originalFreezeDate: initialMeals[i]?.originalFreezeDate,
          originalFreezeDateLabel: initialMeals[i]?.originalFreezeDateLabel,
          // Use the meal's actual date when available so freeze/recovery flags align
          day: meta.day,
          date: meta.date,
          // Load meals and note from initialMeals
          meals: normalizeMealKeys(initialMeals[i]?.meals || {}),
          note: initialMeals[i]?.note || ''
        };
      });
    }

    return newDays;
  });

  // Rebuild when duration changes
  useEffect(() => {
    if (weekPlan.length !== duration) {
      const newDays = buildDays(duration);
      setWeekPlan(prev => {
        return newDays.map((d, i) => {
          const meta = deriveDayMeta(prev[i], d, i);
          return {
            ...d,
            // Preserve hold-related and specific fields from previous state
            isHeld: prev[i]?.isHeld,
            holdReason: prev[i]?.holdReason,
            holdDate: prev[i]?.holdDate,
            isCopiedFromHold: prev[i]?.isCopiedFromHold,
            originalDayIndex: prev[i]?.originalDayIndex,
            wasHeld: prev[i]?.wasHeld,
            resumedDate: prev[i]?.resumedDate,
            // Preserve freeze-related metadata from previous state
            isFrozen: prev[i]?.isFrozen,
            isFreezeRecovery: prev[i]?.isFreezeRecovery,
            originalFreezeDate: prev[i]?.originalFreezeDate,
            originalFreezeDateLabel: prev[i]?.originalFreezeDateLabel,
            // Use the previous row's actual date when available so freeze/recovery flags align
            day: meta.day,
            date: meta.date,
            // Preserve meals and note from previous state
            meals: prev[i]?.meals || {},
            note: prev[i]?.note || ''
          };
        });
      });
    }
  }, [duration]);

  // Rebuild when initialMeals changes (e.g., when viewing/editing a different plan)
  // Using JSON stringify for deep comparison since object reference may not change
  const initialMealsKey = JSON.stringify(initialMeals);
  useEffect(() => {
    const newDays = buildDays(duration);

    if (initialMeals && Array.isArray(initialMeals) && initialMeals.length > 0) {

      // Always set the weekPlan from initialMeals if provided
      // Use MAX of duration and initialMeals.length to ensure we show all days
      // (duration is what user wants, initialMeals.length may be less if old data, or more if hold days were added)
      const mealsLength = Math.max(duration, initialMeals.length);
      const adjustedDays = buildDays(mealsLength);

      setWeekPlan(adjustedDays.map((d, i) => {
        const meta = deriveDayMeta(initialMeals[i], d, i);
        return {
          ...d,
          // Preserve hold-related and specific fields from initialMeals
          isHeld: initialMeals[i]?.isHeld,
          holdReason: initialMeals[i]?.holdReason,
          holdDate: initialMeals[i]?.holdDate,
          isCopiedFromHold: initialMeals[i]?.isCopiedFromHold,
          originalDayIndex: initialMeals[i]?.originalDayIndex,
          wasHeld: initialMeals[i]?.wasHeld,
          resumedDate: initialMeals[i]?.resumedDate,
          // Preserve freeze-related metadata from initialMeals
          isFrozen: initialMeals[i]?.isFrozen,
          isFreezeRecovery: initialMeals[i]?.isFreezeRecovery,
          originalFreezeDate: initialMeals[i]?.originalFreezeDate,
          originalFreezeDateLabel: initialMeals[i]?.originalFreezeDateLabel,
          // Use the meal's actual date when available so freeze/recovery flags align
          day: meta.day,
          date: meta.date,
          // Load meals and note from initialMeals
          meals: normalizeMealKeys(initialMeals[i]?.meals || {}),
          note: initialMeals[i]?.note || ''
        };
      }));
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
        const key = toCanonicalMealKeyOnly(meal.name);
        const label = key ? MEAL_TYPES[key].label : meal.name;
        // IMPORTANT: Always prefer the user-saved time from DB (meal.time).
        // Only fall back to canonical default if no saved time exists.
        const time = normalizeTime(meal.time) || (key ? MEAL_TYPES[key].time12h : '12:00 PM');
        if (!seen.has(label)) {
          seen.add(label);
          normalized.push({ ...meal, name: label, time });
        }
      }
      // Preserve persisted order from DB so manual reordering in "Edit Meal Types"
      // is reflected exactly in both edit mode and read-only view mode.
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

  // ============ AUTO-SAVE FUNCTIONALITY (via parent callback) ============
  const [exportDialogOpen, setExportDialogOpen] = useState(false); // Export dialog state for MealGridTable
  const previousDataRef = useRef<string>('');
  const isInitializedRef = useRef(false);

  // Notify parent of meal data changes so it can handle DB draft saving
  useEffect(() => {
    if (readOnly) return;

    const currentDataStr = JSON.stringify({ weekPlan, mealTypeConfigs });

    // Skip if no changes (but still notify parent on first render with data)
    if (previousDataRef.current === currentDataStr && isInitializedRef.current) return;

    // On initial render, still notify parent if we have data (for draft save to pick up)
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      previousDataRef.current = currentDataStr;

      // CRITICAL FIX: Notify parent with initial data so draft save works
      // This ensures latestMealDataRef is populated even without user changes
      if (weekPlan.length > 0 && onMealDataChange) {
        console.log('[DietPlanDashboard] Initial data notification:', weekPlan.length, 'days');
        onMealDataChange(weekPlan, mealTypeConfigs);
      }
      return;
    }

    previousDataRef.current = currentDataStr;

    // Call onMealDataChange if provided (full callback with mealTypes)
    if (onMealDataChange) {
      onMealDataChange(weekPlan, mealTypeConfigs);
    }

    // Also call onSave if provided (simpler callback for diet template create page auto-save)
    if (onSave) {
      onSave(weekPlan);
    }
  }, [weekPlan, mealTypeConfigs, readOnly, onMealDataChange, onSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // no-op
    };
  }, []);
  // ============ END AUTO-SAVE FUNCTIONALITY ============

  const handleAddMealType = (newMealType: string, position?: number, time?: string) => {
    if (!newMealType) return;

    // Check if meal type already exists in config by checking the actual configs, not derived mealTypes
    const alreadyExists = mealTypeConfigs.some(m => m.name === newMealType);
    if (alreadyExists) return;

    const mealTime = normalizeTime(time) || '12:00 PM';
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

  const handleBulkUpdateMealTypes = (updatedConfigs: { name: string; time: string }[]) => {
    setMealTypeConfigs(updatedConfigs);
  };

  const handleSavePlan = () => {
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

            {/* Right side - Draft save status + Actions */}
            <div className="flex items-center space-x-3">
              {/* Draft auto-save status indicator */}
              {!readOnly && draftSaveStatus && (
                <>
                  {draftSaveStatus === 'saving' && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Saving...
                    </span>
                  )}
                  {draftSaveStatus === 'retrying' && (
                    <span className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1" title={draftSaveMessage}>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Retrying...
                    </span>
                  )}
                  {draftSaveStatus === 'offline' && (
                    <span className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1" title={draftSaveMessage}>
                      <CloudOff className="h-3 w-3" />
                      Saved on this device
                    </span>
                  )}
                  {draftSaveStatus === 'saved' && (
                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <Save className="h-3 w-3" />
                      Saved
                    </span>
                  )}
                  {draftSaveStatus === 'error' && (
                    <button
                      type="button"
                      onClick={onRetryDraftSave}
                      className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 hover:underline"
                      title={draftSaveMessage || 'Automatic retries were unsuccessful. Select to try again.'}
                    >
                      <CircleAlert className="h-3 w-3" />
                      Could not sync. Try again
                    </button>
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
          onBulkUpdateMealTypes={readOnly ? undefined : handleBulkUpdateMealTypes}
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
