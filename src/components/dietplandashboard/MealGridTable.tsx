import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Plus, X, Minus, Copy, ChevronLeft, ChevronRight, Check, Maximize2, Minimize2, Trash2, Download, Eye, GripVertical } from 'lucide-react';
import { DayPlan, Meal, FoodOption, FoodItem as MealFoodItem } from './DietPlanDashboard';
import { DEFAULT_MEAL_TYPES_LIST, MEAL_TYPES, MEAL_TYPE_KEYS, normalizeMealType } from '@/lib/mealConfig';
import { FoodDatabasePanel } from './FoodSheet';
// Define FoodDatabaseItem shape to type foods parameter from FoodDatabasePanel selection
type FoodDatabaseItem = {
  id: string;
  date: string;
  time: string;
  menu: string;
  amount: string;
  cals: number;
  carbs: number;
  protein: number;
  fats: number;
  selected: boolean;
  recipeId?: string;   // Mongo _id
  recipeUuid?: string; // Legacy UUID
};
import { DatePicker } from './DatePicker';
import { useState, useRef, useEffect, useCallback } from 'react';
import React from 'react';
import { createPortal } from 'react-dom';

type MealTypeConfigLocal = {
  name: string;
  time: string;
};

type BulkMealTypeEdit = {
  previousName: string;
  name: string;
  time: string;
};

type MealGridTableProps = {
  weekPlan: DayPlan[];
  mealTypes: string[];
  mealTypeConfigs?: MealTypeConfigLocal[]; // Full config with times from parent
  onUpdate?: (weekPlan: DayPlan[]) => void;
  onAddMealType?: (mealType: string, position?: number, time?: string) => void;
  onRemoveMealType?: (mealType: string) => void;
  onRemoveDay?: (dayIndex: number) => void;
  onUpdateMealTimes?: (timesMap: { [mealType: string]: string }) => void; // Callback to sync meal times to parent
  onBulkUpdateMealTypes?: (mealTypeConfigs: MealTypeConfigLocal[]) => void;
  onExport?: () => void; // Callback to trigger export dialog
  readOnly?: boolean;
  clientDietaryRestrictions?: string;
  clientMedicalConditions?: string;
  clientAllergies?: string;
  clientName?: string; // Client name for display
  holdDays?: { originalDate: Date; holdStartDate: Date; holdDays: number; reason?: string }[];
  totalHeldDays?: number;
};

// Build mealTimeSuggestions from canonical config
const mealTimeSuggestions: { [key: string]: string } = Object.fromEntries(
  DEFAULT_MEAL_TYPES_LIST.map(m => [m.name, m.time])
);

const normalizeTo12Hour = (value?: string): string => {
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


/**
 * Convert a stored 12h time string ("09:00 AM") to HTML time-input value ("09:00" 24h).
 * Returns empty string if the input cannot be parsed.
 */
const to24HourForInput = (time: string): string => {
  if (!time) return '';
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2];
    const period = match[3].toUpperCase();
    if (period === 'AM') { if (h === 12) h = 0; }
    else { if (h !== 12) h += 12; }
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  // Already 24h? pass through
  if (time.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/)) return time.trim();
  return '';
};





const DAYS_PER_PAGE = 14;

const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const getSearchRank = (candidate: string, query: string): number => {
  const candidateNorm = normalizeSearchText(candidate);
  const queryNorm = normalizeSearchText(query);
  if (!candidateNorm || !queryNorm) return 99;
  if (candidateNorm === queryNorm) return 0;
  if (candidateNorm.startsWith(queryNorm)) return 1;
  if (candidateNorm.includes(queryNorm)) return 2;
  return 99;
};



// ============ DEEP CLONE HELPERS ============
// Deep-clone a FoodItem
function cloneFoodItem(f: MealFoodItem): MealFoodItem {
  return { ...f };
}

// Deep-clone a FoodOption (including its foods array)
function cloneFoodOption(opt: FoodOption): FoodOption {
  return {
    ...opt,
    foods: opt.foods ? opt.foods.map(cloneFoodItem) : undefined,
  };
}

// Deep-clone a Meal
function cloneMeal(meal: Meal): Meal {
  return {
    ...meal,
    foodOptions: meal.foodOptions.map(cloneFoodOption),
  };
}

// Deep-clone a DayPlan (including all meals)
function cloneDay(day: DayPlan): DayPlan {
  const clonedMeals: { [key: string]: Meal } = {};
  for (const key of Object.keys(day.meals)) {
    clonedMeals[key] = cloneMeal(day.meals[key]);
  }
  return { ...day, meals: clonedMeals };
}

// Deep-clone the entire weekPlan array
function cloneWeekPlan(plan: DayPlan[]): DayPlan[] {
  return plan.map(cloneDay);
}

function hasMeaningfulMealData(meal?: Meal): boolean {
  if (!meal) return false;
  if (meal.time?.trim()) return true;
  if (!Array.isArray(meal.foodOptions) || meal.foodOptions.length === 0) return false;
  return meal.foodOptions.some(opt => {
    if ((opt.food || '').trim()) return true;
    if (Array.isArray(opt.foods)) {
      return opt.foods.some(f => (f?.food || '').trim());
    }
    return false;
  });
}

// Helper to format a number to at most 2 decimal places (strips trailing zeros)
function formatNum(val: number): string {
  if (Number.isNaN(val) || !Number.isFinite(val)) return '0';
  // Round to 2 decimal places, then remove trailing zeros
  return parseFloat(val.toFixed(2)).toString();
}

// Helper function to calculate daily macro totals
function calculateDayMacros(day: DayPlan): { cal: number; carbs: number; fats: number; protein: number } {
  const totals = { cal: 0, carbs: 0, fats: 0, protein: 0 };

  Object.values(day.meals).forEach(meal => {
    if (meal && meal.foodOptions) {
      // Only count MAIN food options (isAlternative is false or undefined)
      // Exclude any options marked as alternatives
      const mainFoods = meal.foodOptions.filter(opt => !opt.isAlternative);
      mainFoods.forEach(opt => {
        totals.cal += parseFloat(opt.cal) || 0;
        totals.carbs += parseFloat(opt.carbs) || 0;
        totals.fats += parseFloat(opt.fats) || 0;
        totals.protein += parseFloat(opt.protein) || 0;
      });
    }
  });

  return totals;
}

// Helper function to format notes with period as line break
function formatNotesDisplay(note: string): string[] {
  if (!note) return [];
  // Split by period and filter out empty strings
  return note.split('.').map(s => s.trim()).filter(s => s.length > 0);
}

export function MealGridTable({ weekPlan, mealTypes, mealTypeConfigs = [], onUpdate, onAddMealType, onRemoveMealType, onRemoveDay, onUpdateMealTimes, onBulkUpdateMealTypes, onExport, readOnly = false, clientDietaryRestrictions = '', clientMedicalConditions = '', clientAllergies = '', clientName = '', holdDays = [], totalHeldDays = 0 }: MealGridTableProps) {

  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copySource, setCopySource] = useState<{ dayIndex: number; mealType: string } | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedMeals, setSelectedMeals] = useState<string[]>([]);
  const [copyFoodDialogOpen, setCopyFoodDialogOpen] = useState(false);
  const [copyFoodSource, setCopyFoodSource] = useState<{ dayIndex: number; mealType: string; optionIndex: number; foodIndex: number } | null>(null);
  const [selectedDaysForFoodCopy, setSelectedDaysForFoodCopy] = useState<number[]>([]);
  const [selectedMealsForFoodCopy, setSelectedMealsForFoodCopy] = useState<string[]>([]);
  const [copyOptionDialogOpen, setCopyOptionDialogOpen] = useState(false);
  const [copyOptionSource, setCopyOptionSource] = useState<{ dayIndex: number; mealType: string; optionIndex: number; option: FoodOption } | null>(null);
  const [selectedDaysForOptionCopy, setSelectedDaysForOptionCopy] = useState<number[]>([]);
  const [selectedMealsForOptionCopy, setSelectedMealsForOptionCopy] = useState<string[]>([]);
  const [customMealTimes, setCustomMealTimes] = useState<{ [key: string]: string }>(mealTimeSuggestions);
  const [currentPage, setCurrentPage] = useState(0);
  const [addMealTypeDialogOpen, setAddMealTypeDialogOpen] = useState(false);
  const [newMealTypeName, setNewMealTypeName] = useState('');
  const [newMealTime, setNewMealTime] = useState('');
  // Removed per-day selection for new meal type
  const [activeFoodDetail, setActiveFoodDetail] = useState<{ dayIndex: number; mealType: string; optionIndex: number } | null>(null);
  const [foodDatabaseOpen, setFoodDatabaseOpen] = useState(false);
  const [currentFoodContext, setCurrentFoodContext] = useState<{ dayIndex: number; mealType: string; optionIndex: number } | null>(null);
  // Find & Replace feature state
  const [findReplaceDialogOpen, setFindReplaceDialogOpen] = useState(false);
  const [findFoodTarget, setFindFoodTarget] = useState<string>('');
  const [replaceFoodValue, setReplaceFoodValue] = useState<string>('');
  const [selectedDaysForReplace, setSelectedDaysForReplace] = useState<number[]>([]);
  const [selectedMealTypesForReplace, setSelectedMealTypesForReplace] = useState<string[]>([]);
  const [manualFindFoodName, setManualFindFoodName] = useState<string>('');
  // Drag & Drop state
  const [dragOverTarget, setDragOverTarget] = useState<{ dayIndex: number; mealType: string } | null>(null);
  const [dragSource, setDragSource] = useState<{ dayIndex: number; mealType: string; optionIndex: number } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  // Notes dialog state
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesDialogDayIndex, setNotesDialogDayIndex] = useState<number | null>(null);
  const [notesDialogValue, setNotesDialogValue] = useState('');
  const [mealNoteDialogOpen, setMealNoteDialogOpen] = useState(false);
  const [mealNoteDialogValue, setMealNoteDialogValue] = useState('');
  const [mealNoteContext, setMealNoteContext] = useState<{
    dayIndex: number;
    mealType: string;
    optionIndex: number;
  } | null>(null);
  // Recipe search state for Find & Replace
  const [findRecipeResults, setFindRecipeResults] = useState<{ _id: string; name: string; nutrition?: { calories: number; protein: number; carbs: number; fat: number }; servings?: string | number }[]>([]);
  const [replaceRecipeResults, setReplaceRecipeResults] = useState<{ _id: string; name: string; nutrition?: { calories: number; protein: number; carbs: number; fat: number }; servings?: string | number }[]>([]);
  const [findRecipesLoading, setFindRecipesLoading] = useState(false);
  const [replaceRecipesLoading, setReplaceRecipesLoading] = useState(false);
  const [findRecipePage, setFindRecipePage] = useState(1);
  const [replaceRecipePage, setReplaceRecipePage] = useState(1);
  const [findHasMoreRecipes, setFindHasMoreRecipes] = useState(false);
  const [replaceHasMoreRecipes, setReplaceHasMoreRecipes] = useState(false);
  const [findRecipeSearch, setFindRecipeSearch] = useState('');
  const [findRecipeId, setFindRecipeId] = useState('');
  const [replaceRecipeSearch, setReplaceRecipeSearch] = useState('');
  const [replaceRecipeId, setReplaceRecipeId] = useState('');
  const [replaceRecipeNutrition, setReplaceRecipeNutrition] = useState<{ cal: string; protein: string; carbs: string; fats: string; unit: string } | null>(null);
  const [replaceAction, setReplaceAction] = useState<'replace' | 'delete'>('replace');
  // Search filter for dropdowns
  const [findSearchFilter, setFindSearchFilter] = useState('');
  const [replaceSearchFilter, setReplaceSearchFilter] = useState('');
  const [showFindDropdown, setShowFindDropdown] = useState(false);
  const [showReplaceDropdown, setShowReplaceDropdown] = useState(false);
  // Food name autocomplete/suggestions state
  const [foodSuggestions, setFoodSuggestions] = useState<{ _id: string; name: string; nutrition?: { calories: number; protein: number; carbs: number; fat: number }; servings?: string | number }[]>([]);
  const [foodSuggestionsLoading, setFoodSuggestionsLoading] = useState(false);
  const [foodSuggestionsLoadingMore, setFoodSuggestionsLoadingMore] = useState(false);
  const [showFoodSuggestionsFor, setShowFoodSuggestionsFor] = useState<string | null>(null); // key like "day-meal-opt-food"
  const [activeFoodSuggestionFilter, setActiveFoodSuggestionFilter] = useState('');
  const [foodSuggestionPage, setFoodSuggestionPage] = useState(1);
  const [foodSuggestionHasMore, setFoodSuggestionHasMore] = useState(false);
  const [foodSuggestionTotal, setFoodSuggestionTotal] = useState(0);
  const [foodSuggestionPos, setFoodSuggestionPos] = useState<{ top: number; left: number; width: number } | null>(null);
  // Bulk meal-type editor state
  const [bulkTimeEditorOpen, setBulkTimeEditorOpen] = useState(false);
  const [mealTypeEditsForBulk, setMealTypeEditsForBulk] = useState<BulkMealTypeEdit[]>([]);
  const [bulkDragSourceIndex, setBulkDragSourceIndex] = useState<number | null>(null);
  const [bulkDragOverIndex, setBulkDragOverIndex] = useState<number | null>(null);
  // Remove meal type confirmation state
  const [removeMealTypeDialogOpen, setRemoveMealTypeDialogOpen] = useState(false);
  const [mealTypeToRemove, setMealTypeToRemove] = useState<string | null>(null);

  const totalPages = Math.ceil(weekPlan.length / DAYS_PER_PAGE);
  const startIndex = currentPage * DAYS_PER_PAGE;
  const endIndex = Math.min(startIndex + DAYS_PER_PAGE, weekPlan.length);
  const paginatedDays = weekPlan.slice(startIndex, endIndex);

  // Sync customMealTimes from parent's mealTypeConfigs so times persist across re-renders
  useEffect(() => {
    if (mealTypeConfigs && mealTypeConfigs.length > 0) {
      const timesFromConfigs: { [key: string]: string } = {};
      mealTypeConfigs.forEach(config => {
        if (config.name && config.time) {
          timesFromConfigs[config.name] = config.time;
        }
      });
      if (Object.keys(timesFromConfigs).length > 0) {
        setCustomMealTimes(prev => {
          // Merge: parent config times take precedence on init, but keep any extra local entries
          const merged = { ...prev, ...timesFromConfigs };
          // Only update state if something actually changed
          if (JSON.stringify(merged) !== JSON.stringify(prev)) {
            return merged;
          }
          return prev;
        });
      }
    }
  }, [mealTypeConfigs]);

  // Self-heal legacy/canonical meal keys (e.g. BREAKFAST) into display labels (e.g. Breakfast)
  // so all grid operations read/write the same key and meals don't appear to vanish.
  useEffect(() => {
    if (readOnly || !onUpdate || !Array.isArray(weekPlan) || weekPlan.length === 0) return;

    const toCanonicalKeyOnly = (rawKey: string): (typeof MEAL_TYPE_KEYS)[number] | null => {
      const upperKey = rawKey.toUpperCase().trim().replace(/[\s_-]+/g, '_');
      return MEAL_TYPE_KEYS.includes(upperKey as (typeof MEAL_TYPE_KEYS)[number])
        ? (upperKey as (typeof MEAL_TYPE_KEYS)[number])
        : null;
    };

    const needsNormalization = weekPlan.some(day =>
      Object.keys(day.meals || {}).some(rawKey => {
        const canonicalKey = toCanonicalKeyOnly(rawKey);
        if (!canonicalKey || !MEAL_TYPES[canonicalKey]) return false;
        return rawKey !== MEAL_TYPES[canonicalKey].label;
      })
    );

    if (!needsNormalization) return;

    const normalizedWeekPlan = cloneWeekPlan(weekPlan).map(day => {
      const nextMeals: Record<string, Meal> = {};

      Object.entries(day.meals || {}).forEach(([rawKey, meal]) => {
        const canonicalKey = toCanonicalKeyOnly(rawKey);
        const normalizedKey = canonicalKey && MEAL_TYPES[canonicalKey]
          ? MEAL_TYPES[canonicalKey].label
          : rawKey;

        const existing = nextMeals[normalizedKey];
        if (!existing) {
          nextMeals[normalizedKey] = { ...meal, name: normalizedKey };
          return;
        }

        // If duplicate keys collapse to same normalized label, keep richer meal payload.
        const keepIncoming =
          hasMeaningfulMealData(meal) && !hasMeaningfulMealData(existing);

        if (keepIncoming) {
          nextMeals[normalizedKey] = { ...meal, name: normalizedKey };
        }
      });

      return { ...day, meals: nextMeals };
    });

    onUpdate(normalizedWeekPlan);
  }, [weekPlan, readOnly, onUpdate]);

  const clientDietaryArr = clientDietaryRestrictions.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const clientMedicalArr = clientMedicalConditions.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const clientAllergyArr = clientAllergies.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const fetchRecipeSuggestions = async (searchTerm: string, page: number, signal: AbortSignal) => {
    const effectiveSearch = searchTerm.trim();
    if (!effectiveSearch) return { results: [], hasNext: false };

    const params = new URLSearchParams();
    params.append('view', 'food-database');
    params.append('limit', '50');
    params.append('page', String(page));
    params.append('includeTotal', 'false');
    params.append('sortBy', 'relevance');
    params.append('search', effectiveSearch);
    params.append('searchMode', 'typing');

    if (clientDietaryArr.length > 0) {
      params.append('excludeDietaryRestrictions', clientDietaryArr.join(','));
    }
    if (clientAllergyArr.length > 0) {
      params.append('excludeAllergens', clientAllergyArr.join(','));
    }
    if (clientMedicalArr.length > 0) {
      params.append('excludeMedicalConditions', clientMedicalArr.join(','));
    }

    const response = await fetch(`/api/recipes?${params.toString()}`, { signal });
    if (!response.ok) {
      throw new Error('Failed to fetch recipes');
    }

    const data = await response.json();
    const mapped = (data.recipes || []).map((r: any) => ({
      _id: r._id,
      name: r.name,
      nutrition: r.flatNutrition || r.nutrition || {
        calories: r.calories || 0,
        protein: r.protein || 0,
        carbs: r.carbs || 0,
        fat: r.fat || 0
      },
      servings: r.servings
    }));

    // Keep exact name matches first, then prefix/contains (API already ranks this, this is a safety pass).
    const results = mapped.sort((a: any, b: any) => {
      const rankDiff = getSearchRank(a.name || '', effectiveSearch) - getSearchRank(b.name || '', effectiveSearch);
      if (rankDiff !== 0) return rankDiff;
      return (a.name || '').localeCompare(b.name || '');
    });

    return {
      results,
      hasNext: Boolean(data?.pagination?.hasNext)
    };
  };

  useEffect(() => {
    if (!findReplaceDialogOpen || !showFindDropdown) return;

    const term = findSearchFilter.trim();
    if (!term) {
      setFindRecipeResults([]);
      setFindRecipesLoading(false);
      setFindRecipePage(1);
      setFindHasMoreRecipes(false);
      return;
    }

    const controller = new AbortController();
    setFindRecipesLoading(true);
    const timer = setTimeout(() => {
      fetchRecipeSuggestions(term, 1, controller.signal)
        .then(({ results, hasNext }) => {
          setFindRecipeResults(results);
          setFindRecipePage(1);
          setFindHasMoreRecipes(hasNext);
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') {
            console.error('Failed to fetch find suggestions:', err);
          }
        })
        .finally(() => setFindRecipesLoading(false));
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [findReplaceDialogOpen, showFindDropdown, findSearchFilter, clientDietaryRestrictions, clientMedicalConditions, clientAllergies]);

  useEffect(() => {
    if (!findReplaceDialogOpen || !showReplaceDropdown) return;

    const term = replaceSearchFilter.trim();
    if (!term) {
      setReplaceRecipeResults([]);
      setReplaceRecipesLoading(false);
      setReplaceRecipePage(1);
      setReplaceHasMoreRecipes(false);
      return;
    }

    const controller = new AbortController();
    setReplaceRecipesLoading(true);
    const timer = setTimeout(() => {
      fetchRecipeSuggestions(term, 1, controller.signal)
        .then(({ results, hasNext }) => {
          setReplaceRecipeResults(results);
          setReplaceRecipePage(1);
          setReplaceHasMoreRecipes(hasNext);
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') {
            console.error('Failed to fetch replace suggestions:', err);
          }
        })
        .finally(() => setReplaceRecipesLoading(false));
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [findReplaceDialogOpen, showReplaceDropdown, replaceSearchFilter, clientDietaryRestrictions, clientMedicalConditions, clientAllergies]);

  const handleFindDropdownScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (findRecipesLoading || !findHasMoreRecipes) return;
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight > 40) return;

    const nextPage = findRecipePage + 1;
    const controller = new AbortController();
    setFindRecipesLoading(true);

    fetchRecipeSuggestions(findSearchFilter, nextPage, controller.signal)
      .then(({ results, hasNext }) => {
        setFindRecipeResults(prev => {
          const existing = new Set(prev.map(item => item._id));
          const merged = [...prev, ...results.filter((item: any) => !existing.has(item._id))];
          return merged;
        });
        setFindRecipePage(nextPage);
        setFindHasMoreRecipes(hasNext);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.error('Failed to fetch more find suggestions:', err);
        }
      })
      .finally(() => setFindRecipesLoading(false));
  };

  const handleReplaceDropdownScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (replaceRecipesLoading || !replaceHasMoreRecipes) return;
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight > 40) return;

    const nextPage = replaceRecipePage + 1;
    const controller = new AbortController();
    setReplaceRecipesLoading(true);

    fetchRecipeSuggestions(replaceSearchFilter, nextPage, controller.signal)
      .then(({ results, hasNext }) => {
        setReplaceRecipeResults(prev => {
          const existing = new Set(prev.map(item => item._id));
          const merged = [...prev, ...results.filter((item: any) => !existing.has(item._id))];
          return merged;
        });
        setReplaceRecipePage(nextPage);
        setReplaceHasMoreRecipes(hasNext);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.error('Failed to fetch more replace suggestions:', err);
        }
      })
      .finally(() => setReplaceRecipesLoading(false));
  };

  // Capture input element rect for portal positioning of suggestions dropdown
  const captureInputRect = useCallback((el: HTMLInputElement | null) => {
    if (!el) { setFoodSuggestionPos(null); return; }
    const rect = el.getBoundingClientRect();
    setFoodSuggestionPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  // Debounced food name autocomplete — fetches recipe suggestions while typing a food name
  useEffect(() => {
    const term = activeFoodSuggestionFilter.trim();
    if (!term || !showFoodSuggestionsFor) {
      setFoodSuggestions([]);
      setFoodSuggestionsLoading(false);
      setFoodSuggestionTotal(0);
      setFoodSuggestionHasMore(false);
      setFoodSuggestionPage(1);
      return;
    }

    const controller = new AbortController();
    setFoodSuggestionsLoading(true);
    setFoodSuggestionPage(1);
    const timer = setTimeout(() => {
      fetchRecipeSuggestions(term, 1, controller.signal)
        .then(({ results, hasNext }) => {
          // Cap initial results to 6 for faster load / less server strain
          const initialBatch = results.slice(0, 6);
          setFoodSuggestions(initialBatch);
          setFoodSuggestionTotal(results.length);
          setFoodSuggestionHasMore(results.length > 6);
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') {
            console.error('Failed to fetch food suggestions:', err);
          }
        })
        .finally(() => setFoodSuggestionsLoading(false));
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeFoodSuggestionFilter, showFoodSuggestionsFor]);

  const loadMoreFoodSuggestions = async () => {
    const term = activeFoodSuggestionFilter.trim();
    if (!term || foodSuggestionsLoadingMore) return;

    const nextPage = foodSuggestionPage + 1;
    setFoodSuggestionsLoadingMore(true);
    try {
      const { results, hasNext } = await fetchRecipeSuggestions(term, nextPage, new AbortController().signal);
      setFoodSuggestions(prev => [...prev, ...results]);
      setFoodSuggestionPage(nextPage);
      setFoodSuggestionTotal(prev => prev + results.length);
      setFoodSuggestionHasMore(hasNext);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to load more food suggestions:', err);
      }
    } finally {
      setFoodSuggestionsLoadingMore(false);
    }
  };

  const createNewMeal = (mealType: string): Meal => ({
    id: Math.random().toString(36).substr(2, 9),
    time: normalizeTo12Hour(customMealTimes[mealType]) || normalizeTo12Hour(mealTimeSuggestions[mealType]) || '12:00 PM',
    name: mealType,
    showAlternatives: true,
    foodOptions: [
      {
        id: Math.random().toString(36).substr(2, 9),
        label: '',
        food: '',
        unit: '',
        cal: '',
        carbs: '',
        fats: '',
        protein: ''
      }
    ]
  });

  const getMealForDay = (dayIndex: number, mealType: string): Meal | null => {
    const day = weekPlan[dayIndex];
    if (!day) return null;
    return findMealInDay(day, mealType) || null;
  };

  // Helper function to check if a day is frozen (cannot be edited)
  const isDayFrozen = (dayIndex: number): boolean => {
    const day = weekPlan[dayIndex];
    return day && (day as any).isFrozen === true;
  };

  const openRecipeInNewTab = (recipeIdentifier?: string) => {
    if (!recipeIdentifier) return;
    // Backend recipe detail endpoint supports both Mongo _id and legacy uuid.
    window.open(`/recipes/${encodeURIComponent(recipeIdentifier)}`, '_blank', 'noopener,noreferrer');
  };

  /**
   * Resolve the actual key used in day.meals for a given mealType display name.
   * Handles mismatches between stored keys (e.g. "BREAKFAST", "breakfast") and
   * display labels (e.g. "Breakfast").
   */
  const resolveActualMealKey = (day: DayPlan, mealType: string): string => {
    // 1. Exact match
    if (day.meals[mealType] !== undefined) return mealType;
    // 2. Try canonical UPPER_SNAKE key (e.g. "Early Morning" → "EARLY_MORNING")
    const upperKey = mealType.toUpperCase().trim().replace(/[\s_-]+/g, '_');
    if (day.meals[upperKey] !== undefined) return upperKey;
    // 3. Canonical display label via MEAL_TYPES (e.g. "EARLY_MORNING" → "Early Morning")
    if (MEAL_TYPE_KEYS.includes(upperKey as (typeof MEAL_TYPE_KEYS)[number])) {
      const label = MEAL_TYPES[upperKey as (typeof MEAL_TYPE_KEYS)[number]].label;
      if (day.meals[label] !== undefined) return label;
    }
    // 4. normalizeMealType alias lookup (e.g. "NIGHT" → "DINNER" → "Dinner")
    const normalized = normalizeMealType(mealType);
    if (normalized) {
      const canonicalKey = normalized as string;
      if (day.meals[canonicalKey] !== undefined) return canonicalKey;
      const canonicalLabel = MEAL_TYPES[normalized].label;
      if (day.meals[canonicalLabel] !== undefined) return canonicalLabel;
    }
    // 5. Fallback: return as-is (addMealToCell will create a new entry)
    return mealType;
  };

  const addMealToCell = (dayIndex: number, mealType: string) => {
    if (readOnly || !onUpdate || isDayFrozen(dayIndex)) return;
    const newWeekPlan = cloneWeekPlan(weekPlan);
    const actualKey = resolveActualMealKey(newWeekPlan[dayIndex], mealType);
    const existingMeal = newWeekPlan[dayIndex].meals[actualKey];
    if (!existingMeal) {
      // Create brand new meal with initial option
      newWeekPlan[dayIndex].meals[mealType] = createNewMeal(mealType);
      onUpdate(newWeekPlan);
    } else if (existingMeal.foodOptions.length === 0) {
      // Re-initialize empty meal with first option
      existingMeal.foodOptions.push({
        id: Math.random().toString(36).substr(2, 9),
        label: '',
        food: '',
        unit: '',
        cal: '',
        carbs: '',
        fats: '',
        protein: ''
      });
      onUpdate(newWeekPlan);
    }
  };

  const updateMealTime = (dayIndex: number, mealType: string, time: string) => {
    if (readOnly || !onUpdate || isDayFrozen(dayIndex)) return;
    const newWeekPlan = cloneWeekPlan(weekPlan);
    const normalizedTime = normalizeTo12Hour(time);
    const actualKey = resolveActualMealKey(newWeekPlan[dayIndex], mealType);
    if (newWeekPlan[dayIndex].meals[actualKey]) {
      newWeekPlan[dayIndex].meals[actualKey].time = normalizedTime;
      onUpdate(newWeekPlan);

      // Keep the header meal-type timing in sync with manual cell edits
      setCustomMealTimes(prev => ({
        ...prev,
        [mealType]: normalizedTime
      }));

      // Persist updated meal-type timing in parent configs (used on save/reopen)
      if (onUpdateMealTimes) {
        onUpdateMealTimes({ [mealType]: normalizedTime });
      }
    }
  };

  const toggleAlternatives = (dayIndex: number, mealType: string) => {
    if (readOnly || !onUpdate || isDayFrozen(dayIndex)) return;
    const newWeekPlan = cloneWeekPlan(weekPlan);
    const actualKey = resolveActualMealKey(newWeekPlan[dayIndex], mealType);
    if (newWeekPlan[dayIndex].meals[actualKey]) {
      newWeekPlan[dayIndex].meals[actualKey].showAlternatives =
        !newWeekPlan[dayIndex].meals[actualKey].showAlternatives;
      onUpdate(newWeekPlan);
    }
  };

  const addFoodOption = (dayIndex: number, mealType: string, isAlternative: boolean = false) => {
    if (readOnly || !onUpdate || isDayFrozen(dayIndex)) return;
    const newWeekPlan = cloneWeekPlan(weekPlan);
    const actualKey = resolveActualMealKey(newWeekPlan[dayIndex], mealType);
    const meal = newWeekPlan[dayIndex].meals[actualKey];
    if (meal) {
      meal.foodOptions.push({
        id: Math.random().toString(36).substr(2, 9),
        label: isAlternative ? 'Alternative' : '',
        food: '',
        unit: '',
        cal: '',
        carbs: '',
        fats: '',
        protein: '',
        isAlternative: isAlternative
      });
      // Show alternatives if adding an alternative
      if (isAlternative) {
        meal.showAlternatives = true;
      }
      onUpdate(newWeekPlan);
    }
  };

  const removeFoodOption = (dayIndex: number, mealType: string, optionIndex: number) => {
    if (readOnly || !onUpdate || isDayFrozen(dayIndex)) return;
    const newWeekPlan = cloneWeekPlan(weekPlan);
    const actualKey = resolveActualMealKey(newWeekPlan[dayIndex], mealType);
    const meal = newWeekPlan[dayIndex].meals[actualKey];
    if (meal) {
      meal.foodOptions.splice(optionIndex, 1);
      onUpdate(newWeekPlan);
    }
  };

  const updateFoodOption = (
    dayIndex: number,
    mealType: string,
    optionIndex: number,
    field: keyof Omit<FoodOption, 'foods'>,
    value: string
  ) => {
    if (readOnly || !onUpdate || isDayFrozen(dayIndex)) return;
    const newWeekPlan = cloneWeekPlan(weekPlan);
    const actualKey = resolveActualMealKey(newWeekPlan[dayIndex], mealType);
    const meal = newWeekPlan[dayIndex].meals[actualKey];
    if (meal && meal.foodOptions[optionIndex]) {
      const option = meal.foodOptions[optionIndex];
      const previousFood = (option.food || '').trim();
      (option as Record<string, unknown>)[field] = value;

      // If food name is manually changed, clear linked recipe id + stale nutrition
      // so duplicated templates do not keep previous macros for a new food.
      if (field === 'food') {
        const nextFood = value.trim();
        if (nextFood !== previousFood) {
          option.recipeId = undefined;
          option.recipeUuid = undefined;
          option.cal = '';
          option.carbs = '';
          option.fats = '';
          option.protein = '';
          option.unit = '';
        }
      }
      onUpdate(newWeekPlan);
    }
  };

  const updateDayInfo = (dayIndex: number, field: 'date' | 'note', value: string) => {
    if (readOnly || !onUpdate || isDayFrozen(dayIndex)) return;
    const newWeekPlan = cloneWeekPlan(weekPlan);
    newWeekPlan[dayIndex][field] = value;
    onUpdate(newWeekPlan);
  };

  const openMealNoteDialog = (dayIndex: number, mealType: string, optionIndex: number, existingNote?: string) => {
    if (readOnly || isDayFrozen(dayIndex)) return;
    setMealNoteContext({ dayIndex, mealType, optionIndex });
    setMealNoteDialogValue(existingNote || '');
    setMealNoteDialogOpen(true);
  };

  const saveMealNote = () => {
    if (!mealNoteContext || readOnly || !onUpdate || isDayFrozen(mealNoteContext.dayIndex)) {
      setMealNoteDialogOpen(false);
      return;
    }

    const { dayIndex, mealType, optionIndex } = mealNoteContext;
    const newWeekPlan = cloneWeekPlan(weekPlan);
    const actualKey = resolveActualMealKey(newWeekPlan[dayIndex], mealType);
    const meal = newWeekPlan[dayIndex]?.meals?.[actualKey];

    if (meal?.foodOptions?.[optionIndex]) {
      meal.foodOptions[optionIndex].note = mealNoteDialogValue.trim();
      onUpdate(newWeekPlan);
    }

    setMealNoteDialogOpen(false);
  };

  const openCopyDialog = (dayIndex: number, mealType: string) => {
    setCopySource({ dayIndex, mealType });
    setSelectedDays([]);
    setSelectedMeals([]);
    setCopyDialogOpen(true);
  };

  const handleCopyMeal = () => {
    if (!copySource || selectedDays.length === 0 || selectedMeals.length === 0) return;
    if (readOnly || !onUpdate) return;

    const sourceMeal = weekPlan[copySource.dayIndex].meals[copySource.mealType];
    if (!sourceMeal) return;

    const newWeekPlan = cloneWeekPlan(weekPlan);

    // Copy to all selected day and meal combinations (skip frozen days)
    selectedDays.filter(idx => !isDayFrozen(idx)).forEach(targetDayIndex => {
      selectedMeals.forEach(targetMealType => {
        const existingTargetMeal = newWeekPlan[targetDayIndex].meals[targetMealType];

        // Deep copy the meal with fully new IDs
        newWeekPlan[targetDayIndex].meals[targetMealType] = {
          ...cloneMeal(sourceMeal),
          id: Math.random().toString(36).substr(2, 9),
          time: normalizeTo12Hour(existingTargetMeal?.time) || normalizeTo12Hour(customMealTimes[targetMealType]) || normalizeTo12Hour(mealTimeSuggestions[targetMealType]) || '12:00 PM',
          name: targetMealType,
          foodOptions: sourceMeal.foodOptions.map(option => ({
            ...cloneFoodOption(option),
            id: Math.random().toString(36).substr(2, 9),
            foods: option.foods ? option.foods.map(f => ({ ...cloneFoodItem(f), id: Math.random().toString(36).substr(2, 9) })) : undefined,
          }))
        };
      });
    });

    onUpdate(newWeekPlan);
    setCopyDialogOpen(false);
  };

  const handleCopyFood = () => {
    if (!copyFoodSource || selectedDaysForFoodCopy.length === 0 || selectedMealsForFoodCopy.length === 0) return;
    if (readOnly || !onUpdate) return;

    const sourceMeal = weekPlan[copyFoodSource.dayIndex].meals[copyFoodSource.mealType];
    if (!sourceMeal || !sourceMeal.foodOptions[copyFoodSource.optionIndex]) return;

    const sourceOption = sourceMeal.foodOptions[copyFoodSource.optionIndex];
    const sourceFoodItem = sourceOption.foods?.[copyFoodSource.foodIndex];
    if (!sourceFoodItem) return;

    const newWeekPlan = cloneWeekPlan(weekPlan);
    const isAlternative = sourceOption.isAlternative || false;

    // Copy to all selected day and meal combinations (skip frozen days)
    selectedDaysForFoodCopy.filter(idx => !isDayFrozen(idx)).forEach(targetDayIndex => {
      selectedMealsForFoodCopy.forEach(targetMealType => {
        let targetMeal = newWeekPlan[targetDayIndex].meals[targetMealType];

        // Create meal if it doesn't exist
        if (!targetMeal) {
          targetMeal = {
            ...createNewMeal(targetMealType),
            foodOptions: []
          };
          newWeekPlan[targetDayIndex].meals[targetMealType] = targetMeal;
        }

        let targetOption;

        if (isAlternative) {
          // For alternative food: Find existing alternative option or create new one
          const existingAltIndex = targetMeal.foodOptions.findIndex(opt => opt.isAlternative === true);

          if (existingAltIndex >= 0) {
            targetOption = targetMeal.foodOptions[existingAltIndex];
          } else {
            // Create new alternative option
            targetOption = {
              id: Math.random().toString(36).substr(2, 9),
              label: 'Alternative',
              food: '',
              unit: '',
              cal: '',
              carbs: '',
              fats: '',
              protein: '',
              isAlternative: true,
              foods: []
            };
            targetMeal.foodOptions.push(targetOption);
          }
          // Show alternatives when adding alternative food
          targetMeal.showAlternatives = true;
        } else {
          // For normal food: Find existing normal option (first non-alternative) or create new one
          const existingNormalIndex = targetMeal.foodOptions.findIndex(opt => !opt.isAlternative);

          if (existingNormalIndex >= 0) {
            targetOption = targetMeal.foodOptions[existingNormalIndex];
          } else {
            // Create new normal option at the beginning
            targetOption = {
              id: Math.random().toString(36).substr(2, 9),
              label: '',
              food: '',
              unit: '',
              cal: '',
              carbs: '',
              fats: '',
              protein: '',
              isAlternative: false,
              foods: []
            };
            // Insert at beginning (before alternatives)
            targetMeal.foodOptions.unshift(targetOption);
          }
        }

        if (!targetOption.foods) {
          targetOption.foods = [];
        }

        // Add the copied food with new ID
        targetOption.foods.push({
          ...sourceFoodItem,
          id: Math.random().toString(36).substr(2, 9)
        });

        // Update the option's combined values
        targetOption.food = targetOption.foods.map(f => f.food).join(' + ');
        targetOption.unit = targetOption.foods.length > 1 ? 'Multiple' : targetOption.foods[0]?.unit || '';
        targetOption.cal = formatNum(targetOption.foods.reduce((sum, f) => sum + (parseFloat(f.cal) || 0), 0));
        targetOption.carbs = formatNum(targetOption.foods.reduce((sum, f) => sum + (parseFloat(f.carbs) || 0), 0));
        targetOption.fats = formatNum(targetOption.foods.reduce((sum, f) => sum + (parseFloat(f.fats) || 0), 0));
        targetOption.protein = formatNum(targetOption.foods.reduce((sum, f) => sum + (parseFloat(f.protein) || 0), 0));
      });
    });

    onUpdate(newWeekPlan);
    setCopyFoodDialogOpen(false);
  };

  // Copy entire food option (card) with all its foods
  const handleCopyOption = () => {
    if (!copyOptionSource || selectedDaysForOptionCopy.length === 0 || selectedMealsForOptionCopy.length === 0) return;
    if (readOnly || !onUpdate) return;

    const sourceMeal = weekPlan[copyOptionSource.dayIndex].meals[copyOptionSource.mealType];
    if (!sourceMeal || !sourceMeal.foodOptions[copyOptionSource.optionIndex]) return;

    const sourceOption = sourceMeal.foodOptions[copyOptionSource.optionIndex];
    const isAlternative = sourceOption.isAlternative || false;

    const newWeekPlan = cloneWeekPlan(weekPlan);

    // Copy to all selected day and meal combinations (skip frozen days)
    selectedDaysForOptionCopy.filter(idx => !isDayFrozen(idx)).forEach(targetDayIndex => {
      selectedMealsForOptionCopy.forEach(targetMealType => {
        let targetMeal = newWeekPlan[targetDayIndex].meals[targetMealType];

        // Create meal if it doesn't exist
        if (!targetMeal) {
          targetMeal = {
            ...createNewMeal(targetMealType),
            foodOptions: []
          };
          newWeekPlan[targetDayIndex].meals[targetMealType] = targetMeal;
        }

        // Deep copy the entire option with new IDs
        const copiedOption: FoodOption = {
          ...sourceOption,
          id: Math.random().toString(36).substr(2, 9),
          isAlternative: isAlternative, // Preserve alternative status
          foods: sourceOption.foods ? sourceOption.foods.map(f => ({
            ...f,
            id: Math.random().toString(36).substr(2, 9)
          })) : undefined
        };

        // Add to appropriate position based on alternative status
        if (isAlternative) {
          // Find existing alternative options and add after them
          const lastAltIndex = targetMeal.foodOptions.map((opt, idx) => opt.isAlternative ? idx : -1).filter(i => i >= 0).pop();
          if (lastAltIndex !== undefined) {
            targetMeal.foodOptions.splice(lastAltIndex + 1, 0, copiedOption);
          } else {
            // No existing alternatives, add at the end
            targetMeal.foodOptions.push(copiedOption);
          }
          targetMeal.showAlternatives = true;
        } else {
          // For normal food options, add at the beginning (before alternatives)
          const firstAltIndex = targetMeal.foodOptions.findIndex(opt => opt.isAlternative);
          if (firstAltIndex >= 0) {
            targetMeal.foodOptions.splice(firstAltIndex, 0, copiedOption);
          } else {
            targetMeal.foodOptions.push(copiedOption);
          }
        }
      });
    });

    onUpdate(newWeekPlan);
    setCopyOptionDialogOpen(false);
  };

  const toggleDaySelectionForOptionCopy = (dayIndex: number) => {
    setSelectedDaysForOptionCopy(prev =>
      prev.includes(dayIndex)
        ? prev.filter(d => d !== dayIndex)
        : [...prev, dayIndex]
    );
  };

  const toggleMealSelectionForOptionCopy = (mealType: string) => {
    setSelectedMealsForOptionCopy(prev =>
      prev.includes(mealType)
        ? prev.filter(m => m !== mealType)
        : [...prev, mealType]
    );
  };

  const toggleDaySelectionForFoodCopy = (dayIndex: number) => {
    setSelectedDaysForFoodCopy(prev =>
      prev.includes(dayIndex)
        ? prev.filter(d => d !== dayIndex)
        : [...prev, dayIndex]
    );
  };

  const toggleMealSelectionForFoodCopy = (mealType: string) => {
    setSelectedMealsForFoodCopy(prev =>
      prev.includes(mealType)
        ? prev.filter(m => m !== mealType)
        : [...prev, mealType]
    );
  };

  const toggleDaySelection = (dayIndex: number) => {
    setSelectedDays(prev =>
      prev.includes(dayIndex)
        ? prev.filter(d => d !== dayIndex)
        : [...prev, dayIndex]
    );
  };

  const toggleMealSelection = (mealType: string) => {
    setSelectedMeals(prev =>
      prev.includes(mealType)
        ? prev.filter(m => m !== mealType)
        : [...prev, mealType]
    );
  };

  const selectAllDays = () => {
    if (selectedDays.length === weekPlan.length) {
      setSelectedDays([]);
    } else {
      setSelectedDays(weekPlan.map((_, index) => index));
    }
  };

  const selectAllMeals = () => {
    if (selectedMeals.length === displayMealTypes.length) {
      setSelectedMeals([]);
    } else {
      setSelectedMeals([...displayMealTypes]);
    }
  };

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };



  const updateMealTypeTime = (mealType: string, time: string) => {
    setCustomMealTimes(prev => ({
      ...prev,
      [mealType]: time
    }));

    // Propagate to parent so mealTypeConfigs gets updated and saved
    if (onUpdateMealTimes) {
      onUpdateMealTimes({ ...customMealTimes, [mealType]: time });
    }

    // Also update the time in all weekPlan days for this meal type
    if (onUpdate) {
      const newWeekPlan = cloneWeekPlan(weekPlan);
      newWeekPlan.forEach(day => {
        const actualKey = resolveActualMealKey(day, mealType);
        if (day.meals[actualKey]) {
          day.meals[actualKey].time = time;
        }
      });
      onUpdate(newWeekPlan);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleAddMealType = () => {
    if (readOnly || !onUpdate || !onAddMealType) return;
    const name = newMealTypeName.trim();
    if (!name) return;
    const time = normalizeTo12Hour(newMealTime) || '12:00 PM';

    // Create meal in all days if missing (skip frozen days)
    const newWeekPlan = cloneWeekPlan(weekPlan);
    newWeekPlan.forEach((day, idx) => {
      // Skip frozen days
      if (isDayFrozen(idx)) return;
      if (!day.meals[name]) {
        day.meals[name] = {
          id: Math.random().toString(36).substr(2, 9),
          time,
          name,
          showAlternatives: true,
          foodOptions: [
            {
              id: Math.random().toString(36).substr(2, 9),
              label: '',
              food: '',
              unit: '',
              cal: '',
              carbs: '',
              fats: '',
              protein: ''
            }
          ]
        };
      }
    });
    onUpdate(newWeekPlan);

    // Store custom time and keep meal type order stable
    setCustomMealTimes(prev => ({ ...prev, [name]: time }));
    const position = mealTypes.length;
    onAddMealType(name, position, time);

    setAddMealTypeDialogOpen(false);
    setNewMealTypeName('');
    setNewMealTime('');
  };

  const openFoodDetailPanel = (dayIndex: number, mealType: string, optionIndex: number) => {
    setActiveFoodDetail({ dayIndex, mealType, optionIndex });
  };

  const closeFoodDetailPanel = () => {
    setActiveFoodDetail(null);
  };

  const selectedFoodDetail = activeFoodDetail
    ? weekPlan[activeFoodDetail.dayIndex]?.meals[activeFoodDetail.mealType]?.foodOptions[activeFoodDetail.optionIndex]
    : null;
  const selectedMeal = activeFoodDetail
    ? weekPlan[activeFoodDetail.dayIndex]?.meals[activeFoodDetail.mealType]
    : null;
  const selectedDay = activeFoodDetail ? weekPlan[activeFoodDetail.dayIndex] : null;

  // Build time map - customMealTimes (synced from parent mealTypeConfigs) takes priority
  const getMealTypeTime = (mealType: string): string => {
    // 1. Check customMealTimes first (reflects latest user edits & parent mealTypeConfigs)
    if (customMealTimes[mealType]) {
      return normalizeTo12Hour(customMealTimes[mealType]) || customMealTimes[mealType];
    }
    // 2. Check weekPlan meal data (from DB)
    for (const day of weekPlan) {
      if (day.meals[mealType]?.time) {
        return normalizeTo12Hour(day.meals[mealType].time) || day.meals[mealType].time;
      }
    }
    // 3. Fall back to default suggestions
    return normalizeTo12Hour(mealTimeSuggestions[mealType]) || '12:00 PM';
  };

  // Convert 12h time string (e.g. "01:00 PM") to minutes since midnight for sorting
  const getTimeNumericValue = (timeStr: string): number => {
    if (!timeStr) return 720; // noon fallback
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const mins = parseInt(match[2], 10);
      const period = match[3].toUpperCase();
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      return hours * 60 + mins;
    }
    // Try 24h format
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    return 720;
  };

  // Get canonical sort order for a meal type name (returns sortOrder or 99 for custom)
  const getCanonicalSortOrder = (mealName: string): number => {
    const key = normalizeMealType(mealName);
    if (key && MEAL_TYPES[key]) return MEAL_TYPES[key].sortOrder;
    return 99; // custom meal types go last
  };

  // Helper: resolve a meal type string to its canonical display label
  // e.g. "EARLY_MORNING" → "Early Morning", "Early Morning" → "Early Morning"
  const toDisplayLabel = (mt: string): string => {
    // Only convert exact canonical key forms (e.g. EARLY_MORNING → Early Morning)
    // Do NOT apply alias mappings (e.g. NIGHT → DINNER) — user-defined names like "Night" must stay as-is
    const upperKey = mt.toUpperCase().trim().replace(/[\s_-]+/g, '_');
    if (MEAL_TYPE_KEYS.includes(upperKey as (typeof MEAL_TYPE_KEYS)[number])) {
      return MEAL_TYPES[upperKey as (typeof MEAL_TYPE_KEYS)[number]].label;
    }
    return mt; // keep as-is for truly custom types
  };

  // Helper: find meal data in a day's meals, trying both label and key forms
  const findMealInDay = (day: DayPlan, mealType: string): Meal | undefined => {
    // Try exact match first
    if (day.meals[mealType]) return day.meals[mealType];
    // Try canonical key form (e.g. "Early Morning" → "EARLY_MORNING")
    const key = normalizeMealType(mealType);
    if (key && day.meals[key]) return day.meals[key];
    // Try label form (e.g. "EARLY_MORNING" → "Early Morning")
    const label = toDisplayLabel(mealType);
    if (label !== mealType && day.meals[label]) return day.meals[label];
    return undefined;
  };

  // Get all unique meal types (default + custom) without reordering
  // Includes all mealTypes from parent (via mealTypeConfigs) AND any custom meals in weekPlan
  const displayMealTypes = (() => {
    const orderedMealTypes: string[] = [];
    const seenMealTypes = new Set<string>();

    // Add all meal types from parent's mealTypeConfigs (via mealTypes prop)
    // These are the tracked meal types that should always display
    mealTypes.forEach(mt => {
      const label = toDisplayLabel(mt);
      if (!seenMealTypes.has(label)) {
        seenMealTypes.add(label);
        orderedMealTypes.push(label);
      }
    });

    // Add any additional meal types from weekPlan that aren't in parent's config
    // (for safety - in case meals exist that weren't properly added to config)
    weekPlan.forEach(day => {
      Object.keys(day.meals).forEach(mt => {
        const label = toDisplayLabel(mt);
        if (!seenMealTypes.has(label)) {
          const meal = day.meals[mt];
          // Include any persisted meal row to avoid hiding saved meal types.
          // This prevents "missing meal type" issues when food text is empty but
          // foods are stored in nested arrays or IDs are absent in legacy payloads.
          if (meal && typeof meal === 'object') {
            seenMealTypes.add(label);
            orderedMealTypes.push(label);
          }
        }
      });
    });

    return orderedMealTypes;
  })();

  // Collect unique food names across plan for find options.
  // Defensive parsing avoids runtime crashes when imported legacy rows have missing food fields.
  const availableFoods: string[] = Array.from(new Set(
    weekPlan.flatMap(day =>
      Object.values(day.meals || {}).flatMap(meal => {
        if (!meal?.foodOptions?.length) return [];

        return meal.foodOptions.flatMap(opt => {
          const primaryFood = typeof opt?.food === 'string' ? opt.food.trim() : '';
          const stackedFoods = Array.isArray(opt?.foods)
            ? opt.foods
              .map(item => (typeof item?.food === 'string' ? item.food.trim() : ''))
              .filter(Boolean)
            : [];

          return [primaryFood, ...stackedFoods].filter(Boolean);
        });
      })
    )
  ));

  const matchedPlanFoodsForFind = findSearchFilter
    ? availableFoods
      .filter(f => getSearchRank(f, findSearchFilter) < 99)
      .sort((a, b) => {
        const rankDiff = getSearchRank(a, findSearchFilter) - getSearchRank(b, findSearchFilter);
        if (rankDiff !== 0) return rankDiff;
        return a.localeCompare(b);
      })
      .slice(0, 5)
    : [];

  const exactPlanFoodsForFind = matchedPlanFoodsForFind.filter(f => getSearchRank(f, findSearchFilter) === 0);
  const similarPlanFoodsForFind = matchedPlanFoodsForFind.filter(f => getSearchRank(f, findSearchFilter) > 0);

  const exactRecipeResultsForFind = findSearchFilter
    ? findRecipeResults.filter(r => getSearchRank(r.name || '', findSearchFilter) === 0)
    : [];
  const similarRecipeResultsForFind = findSearchFilter
    ? findRecipeResults.filter(r => getSearchRank(r.name || '', findSearchFilter) > 0)
    : [];

  const exactRecipeResultsForReplace = replaceSearchFilter
    ? replaceRecipeResults.filter(r => getSearchRank(r.name || '', replaceSearchFilter) === 0)
    : [];
  const similarRecipeResultsForReplace = replaceSearchFilter
    ? replaceRecipeResults.filter(r => getSearchRank(r.name || '', replaceSearchFilter) > 0)
    : [];

  const toggleReplaceDay = (dayIndex: number) => {
    setSelectedDaysForReplace(prev => prev.includes(dayIndex) ? prev.filter(d => d !== dayIndex) : [...prev, dayIndex]);
  };

  const toggleReplaceMealType = (mealType: string) => {
    setSelectedMealTypesForReplace(prev => prev.includes(mealType) ? prev.filter(m => m !== mealType) : [...prev, mealType]);
  };

  const handleFindReplace = () => {
    if (readOnly || !onUpdate) return;
    const findValue = (findFoodTarget || manualFindFoodName || findRecipeSearch).trim();
    const selectedReplacementRecipe = replaceRecipeId
      ? replaceRecipeResults.find(r => r._id === replaceRecipeId)
      : null;
    const replaceValue = (replaceFoodValue || replaceRecipeSearch || selectedReplacementRecipe?.name || '').trim();

    if (!findValue || selectedDaysForReplace.length === 0 || selectedMealTypesForReplace.length === 0) return;

    // For replace action, require a replace value
    if (replaceAction === 'replace' && !replaceValue) return;

    const normalizeForMatch = (value?: string): string => {
      return (value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const findLower = normalizeForMatch(findValue);
    const selectedMealTypeSet = new Set(selectedMealTypesForReplace.map(mt => toDisplayLabel(mt)));

    const resolvedReplaceNutrition = replaceRecipeNutrition || (selectedReplacementRecipe
      ? {
        cal: String(selectedReplacementRecipe.nutrition?.calories ?? 0),
        protein: String(selectedReplacementRecipe.nutrition?.protein ?? 0),
        carbs: String(selectedReplacementRecipe.nutrition?.carbs ?? 0),
        fats: String((selectedReplacementRecipe.nutrition as any)?.fat ?? (selectedReplacementRecipe.nutrition as any)?.fats ?? 0),
        unit: typeof selectedReplacementRecipe.servings === 'number'
          ? `${selectedReplacementRecipe.servings} serving`
          : (selectedReplacementRecipe.servings || '1 serving')
      }
      : null);

    const matchesText = (candidate?: string): boolean => {
      const value = normalizeForMatch(candidate);
      if (!value || !findLower) return false;
      if (value === findLower || value.includes(findLower) || findLower.includes(value)) {
        return true;
      }
      const findTokens = findLower.split(' ').filter(Boolean);
      return findTokens.length > 0 && findTokens.every(token => value.includes(token));
    };

    const isFoodItemMatch = (foodItem: MealFoodItem): boolean => {
      if (matchesText(foodItem.food)) return true;
      if (findRecipeId && (foodItem.recipeId === findRecipeId || foodItem.recipeUuid === findRecipeId)) return true;
      return false;
    };

    // Matching helper: checks food name (case-insensitive) OR recipeUuid
    const isOptionMatch = (opt: FoodOption): boolean => {
      // Match primary/combined option text
      if (matchesText(opt.food)) return true;
      // If a recipe was selected from DB, also match by recipeUuid
      if (findRecipeId && (opt.recipeId === findRecipeId || opt.recipeUuid === findRecipeId)) return true;

      // Also check stacked foods array
      if (opt.foods && opt.foods.length > 0) {
        return opt.foods.some(isFoodItemMatch);
      }
      return false;
    };

    const buildReplacedFoodItem = (): MealFoodItem => {
      return {
        id: Math.random().toString(36).substr(2, 9),
        food: replaceValue,
        unit: resolvedReplaceNutrition?.unit || '',
        cal: resolvedReplaceNutrition?.cal || '0',
        carbs: resolvedReplaceNutrition?.carbs || '0',
        fats: resolvedReplaceNutrition?.fats || '0',
        protein: resolvedReplaceNutrition?.protein || '0',
        recipeId: replaceRecipeId || undefined,
        recipeUuid: replaceRecipeId || undefined
      };
    };

    const recalculateOptionFromFoods = (option: FoodOption): FoodOption => {
      const foods = option.foods || [];
      if (foods.length === 0) {
        return {
          ...option,
          food: '',
          unit: '',
          cal: '',
          carbs: '',
          fats: '',
          protein: '',
          recipeId: undefined,
          recipeUuid: undefined,
          foods: undefined
        };
      }

      const totals = foods.reduce((acc, item) => {
        acc.cal += parseFloat(item.cal) || 0;
        acc.carbs += parseFloat(item.carbs) || 0;
        acc.fats += parseFloat(item.fats) || 0;
        acc.protein += parseFloat(item.protein) || 0;
        return acc;
      }, { cal: 0, carbs: 0, fats: 0, protein: 0 });

      return {
        ...option,
        food: foods.map(item => item.food).filter(Boolean).join(' + '),
        unit: foods.length > 1 ? 'Multiple' : (foods[0]?.unit || ''),
        cal: formatNum(totals.cal),
        carbs: formatNum(totals.carbs),
        fats: formatNum(totals.fats),
        protein: formatNum(totals.protein),
        recipeId: foods.length === 1 ? foods[0]?.recipeId : undefined,
        recipeUuid: foods.length === 1 ? foods[0]?.recipeUuid : undefined,
        foods
      };
    };

    const newWeekPlan = cloneWeekPlan(weekPlan);
    newWeekPlan.forEach((day, idx) => {
      // Skip frozen days
      if (isDayFrozen(idx)) return;
      if (!selectedDaysForReplace.includes(idx)) return;
      Object.keys(day.meals).forEach(mt => {
        const displayMealType = toDisplayLabel(mt);
        if (!selectedMealTypeSet.has(displayMealType) && !selectedMealTypeSet.has(mt)) return;
        const meal = day.meals[mt];

        if (replaceAction === 'delete') {
          // Delete matching foods/options. For stacked foods, delete only matched rows and recalculate.
          meal.foodOptions = meal.foodOptions
            .map(opt => {
              if (opt.foods && opt.foods.length > 0) {
                const remainingFoods = opt.foods.filter(item => !isFoodItemMatch(item));
                if (remainingFoods.length === opt.foods.length) {
                  // No item-level matches; if option-level matched legacy data, drop whole option.
                  if (isOptionMatch(opt)) return null;
                  return opt;
                }
                return recalculateOptionFromFoods({ ...opt, foods: remainingFoods });
              }
              return isOptionMatch(opt) ? null : opt;
            })
            .filter((opt): opt is FoodOption => Boolean(opt));
          // Clear labels for remaining options
          meal.foodOptions.forEach((opt) => {
            opt.label = '';
          });
        } else {
          // Replace matching food options with name and nutrition.
          // For stacked foods, replace only matched rows, then recalculate totals.
          meal.foodOptions = meal.foodOptions.map(opt => {
            if (opt.foods && opt.foods.length > 0) {
              let replacedAny = false;
              const nextFoods = opt.foods.map(item => {
                if (!isFoodItemMatch(item)) return item;
                replacedAny = true;
                return buildReplacedFoodItem();
              });

              if (replacedAny) {
                return recalculateOptionFromFoods({ ...opt, foods: nextFoods });
              }

              // Legacy fallback: if option-level match but no per-item match, replace whole option.
              if (isOptionMatch(opt)) {
                if (resolvedReplaceNutrition) {
                  return recalculateOptionFromFoods({ ...opt, foods: [buildReplacedFoodItem()] });
                }
                return {
                  ...opt,
                  food: replaceValue,
                  cal: '0',
                  protein: '0',
                  carbs: '0',
                  fats: '0',
                  unit: '',
                  recipeId: undefined,
                  recipeUuid: undefined,
                  foods: undefined
                };
              }

              return opt;
            }

            if (!isOptionMatch(opt)) return opt;

            if (resolvedReplaceNutrition) {
              return {
                ...opt,
                food: replaceValue,
                recipeId: replaceRecipeId || undefined,
                recipeUuid: replaceRecipeId || undefined,
                cal: resolvedReplaceNutrition.cal,
                protein: resolvedReplaceNutrition.protein,
                carbs: resolvedReplaceNutrition.carbs,
                fats: resolvedReplaceNutrition.fats,
                unit: resolvedReplaceNutrition.unit,
                foods: [buildReplacedFoodItem()]
              };
            }

            // If replacing by plain text only, clear stale nutrition values.
            return {
              ...opt,
              food: replaceValue,
              cal: '0',
              protein: '0',
              carbs: '0',
              fats: '0',
              unit: '',
              recipeId: undefined,
              recipeUuid: undefined,
              foods: undefined
            };
          });
        }
      });
    });
    onUpdate(newWeekPlan);
    resetFindReplaceDialog();
  };

  const resetFindReplaceDialog = () => {
    setFindReplaceDialogOpen(false);
    setFindFoodTarget('');
    setReplaceFoodValue('');
    setSelectedDaysForReplace([]);
    setSelectedMealTypesForReplace([]);
    setManualFindFoodName('');
    setFindRecipeSearch('');
    setFindRecipeId('');
    setReplaceRecipeSearch('');
    setReplaceRecipeId('');
    setReplaceRecipeNutrition(null);
    setReplaceAction('replace');
    setFindSearchFilter('');
    setReplaceSearchFilter('');
    setFindRecipeResults([]);
    setReplaceRecipeResults([]);
    setFindRecipesLoading(false);
    setReplaceRecipesLoading(false);
    setFindRecipePage(1);
    setReplaceRecipePage(1);
    setFindHasMoreRecipes(false);
    setReplaceHasMoreRecipes(false);
    setShowFindDropdown(false);
    setShowReplaceDropdown(false);
  };

  // Bulk meal-type editor functions
  const openBulkTimeEditor = () => {
    const bulkEdits: BulkMealTypeEdit[] = [];
    // Include all display meal types (default + custom from weekPlan)
    const allTypes = new Set([...mealTypes, ...displayMealTypes]);
    allTypes.forEach(mealType => {
      const config = mealTypeConfigs.find(item => item.name === mealType);
      bulkEdits.push({
        previousName: mealType,
        name: config?.name || mealType,
        time: normalizeTo12Hour(config?.time) || normalizeTo12Hour(customMealTimes[mealType]) || normalizeTo12Hour(getMealTypeTime(mealType)) || normalizeTo12Hour(mealTimeSuggestions[mealType]) || '12:00 PM'
      });
    });
    setMealTypeEditsForBulk(bulkEdits);
    setBulkTimeEditorOpen(true);
  };

  const handleBulkTimeUpdate = () => {
    if (!onUpdate) return;

    const sanitizedEdits = mealTypeEditsForBulk.map(edit => ({
      previousName: edit.previousName,
      name: edit.name.trim() || edit.previousName,
      time: normalizeTo12Hour(edit.time.trim()) || normalizeTo12Hour(customMealTimes[edit.previousName]) || normalizeTo12Hour(mealTimeSuggestions[edit.previousName]) || '12:00 PM'
    }));

    const nextConfigs: MealTypeConfigLocal[] = [];
    const seenNames = new Set<string>();
    sanitizedEdits.forEach(edit => {
      if (!seenNames.has(edit.name)) {
        seenNames.add(edit.name);
        nextConfigs.push({ name: edit.name, time: edit.time });
      }
    });

    const renameMap = new Map(sanitizedEdits.map(edit => [edit.previousName, edit]));

    // Update all days with renamed meal keys and new meal times
    const newWeekPlan = cloneWeekPlan(weekPlan);
    newWeekPlan.forEach(day => {
      const renamedMeals: { [key: string]: Meal } = {};
      Object.entries(day.meals).forEach(([mealType, meal]) => {
        const edit = renameMap.get(mealType);
        const nextName = edit?.name || mealType;
        const nextTime = normalizeTo12Hour(edit?.time) || normalizeTo12Hour(meal.time) || normalizeTo12Hour(customMealTimes[mealType]) || normalizeTo12Hour(mealTimeSuggestions[mealType]) || '12:00 PM';
        renamedMeals[nextName] = {
          ...meal,
          name: nextName,
          time: nextTime
        };
      });
      day.meals = renamedMeals;

      nextConfigs.forEach(config => {
        if (day.meals[config.name]) {
          // Update time on existing meal entry
          if (!day.meals[config.name].time) {
            day.meals[config.name].time = config.time;
          }
        } else {
          // NEW meal type — add empty entry so column appears in the grid
          day.meals[config.name] = {
            id: Math.random().toString(36).substr(2, 9),
            time: config.time,
            name: config.name,
            showAlternatives: true,
            foodOptions: [
              {
                id: Math.random().toString(36).substr(2, 9),
                label: '',
                food: '',
                unit: '',
                cal: '',
                carbs: '',
                fats: '',
                protein: ''
              }
            ]
          };
        }
      });
    });

    // Update customMealTimes for local display
    setCustomMealTimes(Object.fromEntries(nextConfigs.map(config => [config.name, config.time])));

    // Propagate times to parent (for mealTypeConfigs / localStorage / save)
    if (onUpdateMealTimes) {
      onUpdateMealTimes(Object.fromEntries(nextConfigs.map(config => [config.name, config.time])));
    }

    if (onBulkUpdateMealTypes) {
      onBulkUpdateMealTypes(nextConfigs);
    }

    // Trigger update
    onUpdate(newWeekPlan);
    setBulkTimeEditorOpen(false);
  };

  const applyDefaultMealTimes = () => {
    const defaults = Object.fromEntries(
      DEFAULT_MEAL_TYPES_LIST.map(m => [m.name, normalizeTo12Hour(m.time) || m.time])
    );
    setMealTypeEditsForBulk(prev => prev.map(edit => ({
      ...edit,
      time: defaults[edit.previousName] || defaults[edit.name] || edit.time
    })));
  };

  const reorderBulkMealTypeEdits = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setMealTypeEditsForBulk(prev => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const handleBulkMealTypeDragStart = (e: React.DragEvent<HTMLButtonElement>, index: number) => {
    setBulkDragSourceIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleBulkMealTypeDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setBulkDragOverIndex(index);
  };

  const handleBulkMealTypeDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    const dataIndex = Number(e.dataTransfer.getData('text/plain'));
    const fromIndex = Number.isNaN(dataIndex) ? bulkDragSourceIndex : dataIndex;
    if (fromIndex !== null) {
      reorderBulkMealTypeEdits(fromIndex, dropIndex);
    }
    setBulkDragSourceIndex(null);
    setBulkDragOverIndex(null);
  };

  const handleBulkMealTypeDragEnd = () => {
    setBulkDragSourceIndex(null);
    setBulkDragOverIndex(null);
  };

  // Helper to clear labels on options
  const relabelOptions = (meal: Meal) => {
    meal.foodOptions.forEach((opt, idx) => {
      opt.label = '';
    });
  };

  // Determine insertion index within target meal based on cursor Y position
  const getInsertionIndex = (e: React.DragEvent<HTMLTableCellElement>, targetMeal: Meal): number => {
    const cell = e.currentTarget as HTMLTableCellElement;
    const boxes = Array.from(cell.querySelectorAll<HTMLDivElement>('.food-box'));
    if (boxes.length === 0) return 0;
    const y = e.clientY;
    for (let i = 0; i < boxes.length; i++) {
      const rect = boxes[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (y < mid) return i; // insert before this box
    }
    return boxes.length; // append at end
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, dayIndex: number, mealType: string, optionIndex: number, foodFilled: boolean) => {
    if (!foodFilled || isDayFrozen(dayIndex)) {
      e.preventDefault();
      return;
    }
    setDragSource({ dayIndex, mealType, optionIndex });
    e.dataTransfer.setData('text/plain', JSON.stringify({ dayIndex, mealType, optionIndex }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLTableCellElement>, dayIndex: number, mealType: string) => {
    // Allow drop only if drag source exists and target day is not frozen
    if (dragSource && !isDayFrozen(dayIndex)) {
      e.preventDefault();
      setDragOverTarget({ dayIndex, mealType });
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLTableCellElement>, dayIndex: number, mealType: string) => {
    if (dragOverTarget && dragOverTarget.dayIndex === dayIndex && dragOverTarget.mealType === mealType) {
      setDragOverTarget(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLTableCellElement>, targetDayIndex: number, targetMealType: string) => {
    e.preventDefault();
    const source = dragSource;
    setDragOverTarget(null);
    setDragSource(null);
    if (!source) return;
    if (readOnly || !onUpdate || isDayFrozen(targetDayIndex)) return;

    const newWeekPlan = cloneWeekPlan(weekPlan);
    const sourceMeal = newWeekPlan[source.dayIndex].meals[source.mealType];
    if (!sourceMeal) return;
    const movedOption = sourceMeal.foodOptions[source.optionIndex];
    if (!movedOption) return;

    // Ensure target meal exists
    let targetMeal = newWeekPlan[targetDayIndex].meals[targetMealType];
    if (!targetMeal) {
      newWeekPlan[targetDayIndex].meals[targetMealType] = createNewMeal(targetMealType);
      targetMeal = newWeekPlan[targetDayIndex].meals[targetMealType];
    }

    const sameCell = source.dayIndex === targetDayIndex && source.mealType === targetMealType;

    if (sameCell) {
      // Reorder within same meal (move option)
      const extracted = sourceMeal.foodOptions.splice(source.optionIndex, 1)[0];
      // Compute insertion index after removal
      let insertionIndex = getInsertionIndex(e, targetMeal);
      if (source.optionIndex < insertionIndex) insertionIndex -= 1;
      targetMeal.foodOptions.splice(insertionIndex, 0, extracted);
      relabelOptions(targetMeal);
    } else {
      // Copy (duplicate) to target meal without removing from source
      // Compute insertion index relative to target meal
      let insertionIndex = getInsertionIndex(e, targetMeal);
      const duplicate = {
        ...cloneFoodOption(movedOption),
        id: Math.random().toString(36).substr(2, 9),
        foods: movedOption.foods ? movedOption.foods.map(f => ({ ...cloneFoodItem(f), id: Math.random().toString(36).substr(2, 9) })) : undefined,
      };
      // If target has a single blank option, replace
      if (
        targetMeal.foodOptions.length === 1 &&
        !targetMeal.foodOptions[0].food &&
        targetMeal.foodOptions[0].unit === '' &&
        targetMeal.foodOptions[0].cal === ''
      ) {
        targetMeal.foodOptions[0] = duplicate;
      } else {
        targetMeal.foodOptions.splice(insertionIndex, 0, duplicate);
      }
      relabelOptions(targetMeal);
      // Relabel source (unchanged positions) for consistency
      relabelOptions(sourceMeal);
    }

    onUpdate(newWeekPlan);
  };

  return (
    <div className={`space-y-1 ${isFullScreen ? 'fixed inset-0 z-50 bg-white p-4 overflow-auto' : ''}`}>
      {/* Pagination Controls - Moved to top */}
      <div className="flex justify-between items-center gap-3 py-2">
        <div>
          {!readOnly && (
            <>
              <Button
                variant="outline"
                onClick={() => setAddMealTypeDialogOpen(true)}
                style={{ backgroundColor: '#00A63E', color: 'white', borderColor: '#00A63E' }}
                className="h-10 px-4 hover:opacity-90 font-medium shadow-md"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Meal Type
              </Button>
              <Button
                variant="outline"
                onClick={openBulkTimeEditor}
                className="h-10 px-4 ml-2 border-gray-300 bg-white hover:bg-slate-100 font-medium shadow-md"
              >
                ⏰ Edit Meal Times
              </Button>
              <Button
                variant="outline"
                onClick={() => setFindReplaceDialogOpen(true)}
                className="h-10 px-4 ml-2 border-gray-300 bg-white hover:bg-slate-100 font-medium shadow-md"
              >
                Find & Replace
              </Button>
            </>
          )}
          {readOnly && (
            <span className="text-sm text-gray-500 font-medium px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
              📋 View Mode - Read Only
            </span>
          )}
        </div>
        <div className='flex items-center gap-4'  >
          <div className="bg-white shadow-md rounded-full px-4 py-2 border border-gray-300">
            <span className="text-xs font-semibold text-slate-700">
              Page {currentPage + 1} of {totalPages}
              <span className="text-slate-500 ml-2">
                (Days {startIndex + 1}-{endIndex})
              </span>
            </span>
          </div>
          <div className='flex gap-1'>
            <Button
              variant="outline"
              size="sm"
              onClick={goToPreviousPage}
              disabled={currentPage === 0}
              className="h-9 w-9 p-0 rounded-full bg-white shadow-md border-gray-300 hover:bg-slate-100 disabled:opacity-50"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToNextPage}
              disabled={currentPage >= totalPages - 1}
              className="h-9 w-9 p-0 rounded-full bg-white shadow-md border-gray-300 hover:bg-slate-100 disabled:opacity-50"
              title="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={scrollLeft}
              className="h-9 w-9 p-0 rounded-full bg-white shadow-md border-gray-300 hover:bg-slate-100"
              title="Scroll left"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={scrollRight}
              className="h-9 w-9 p-0 rounded-full bg-white shadow-md border-gray-300 hover:bg-slate-100"
              title="Scroll right"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            {/* Full Screen Toggle Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className={`h-9 w-9 p-0 rounded-full shadow-md border-gray-300 hover:bg-slate-100 ${isFullScreen ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-white'}`}
              title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            {/* Download/Export Button */}
            {onExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={onExport}
                className="h-9 w-9 p-0 rounded-full shadow-md border-gray-300 hover:bg-emerald-100 hover:border-emerald-500 hover:text-emerald-700 bg-white"
                title="Download Diet Plan"
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="relative border border-gray-300 rounded-lg bg-white overflow-hidden shadow">
        <div
          ref={scrollContainerRef}
          className={`w-full overflow-auto ${isFullScreen ? 'h-[calc(100vh-120px)]' : 'h-[calc(100vh-250px)]'}`}
          style={{ scrollbarWidth: 'thin' }}
        >
          <table className="w-full border-collapse relative">
            <thead className="sticky top-0 bg-white shadow-sm" style={{ zIndex: 10 }}>
              <tr>
                <th className="border-r border-b-2 border-gray-300 p-6 bg-slate-100 w-48 min-w-48">
                  <div className="text-slate-800 font-semibold tracking-wide uppercase text-sm">Day</div>
                </th>
                {displayMealTypes.map((mealType, index) => (
                  <React.Fragment key={mealType}>
                    <th className="border-r border-b-2 border-gray-300 p-5 bg-slate-50 min-w-70">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-slate-800 font-semibold tracking-wide uppercase text-xs">{mealType}</div>
                          <div className="text-slate-500 font-normal text-[10px] mt-0.5">{getMealTypeTime(mealType)}</div>
                        </div>
                        {!readOnly && onRemoveMealType && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMealTypeToRemove(mealType);
                              setRemoveMealTypeDialogOpen(true);
                            }}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-100"
                            title={`Delete entire "${mealType}" row from all days`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </th>
                  </React.Fragment>
                ))}
                {/* Add Meal Type Column at the end */}
                <th className="border-l border-b-2 border-gray-300 p-5 bg-slate-50 min-w-70">
                  <div className="space-y-2.5">
                    <div className="text-slate-800 font-semibold tracking-wide uppercase text-xs flex items-center justify-center gap-2">
                      <Plus className="w-3.5 h-3.5" />
                      Add Meal Type
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setAddMealTypeDialogOpen(true)}
                      className="w-full h-9 text-xs bg-white border-2 border-dashed border-slate-400 hover:border-slate-600 hover:bg-slate-50
                     text-slate-700 hover:text-slate-900 font-medium"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add New Meal Type
                    </Button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedDays.map((day, paginatedIndex) => {
                const actualDayIndex = startIndex + paginatedIndex;
                // Use same green color for all rows
                const rowColor = '#BCEBCB';
                // Get all meal types for this day (standard ones + any custom ones)
                const dayMealTypes = [...displayMealTypes];
                // Only include custom meals that have food in them
                const customMeals = Object.keys(day.meals).filter(mt => {
                  const label = toDisplayLabel(mt);
                  if (!mealTypes.includes(label) && !displayMealTypes.includes(label)) {
                    // Check if this custom meal has any food
                    const meal = day.meals[mt];
                    return meal?.foodOptions?.some(opt => opt.food?.trim());
                  }
                  return false;
                }).map(mt => toDisplayLabel(mt));
                const allMealTypesForDay = [...dayMealTypes, ...customMeals.filter(cm => !dayMealTypes.includes(cm))];

                // Format day label to show date + day number + day name
                const formatDayLabel = () => {
                  if (day.date) {
                    const dateObj = new Date(day.date);
                    const dayOfMonth = dateObj.getDate();
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const dayName = dayNames[dateObj.getDay()];
                    const dayNum = actualDayIndex + 1;
                    return `${dayOfMonth} - Day ${dayNum} - ${dayName}`;
                  }
                  return day.day;
                };

                // Check if this is a freeze recovery day (copied meal at the end)
                const isFreezeRecovery = (day as any).isFreezeRecovery === true;
                const originalFreezeDateLabel = (day as any).originalFreezeDateLabel;

                // Check if this day is a frozen day (original day that was frozen - should be blurred)
                const isFrozenDay = (day as any).isFrozen === true;

                return (
                  <tr key={`${day.id}-${actualDayIndex}`} className={`hover:opacity-90 transition-opacity ${isFrozenDay ? 'opacity-40 blur-[1px]' : ''}`}>
                    <td className="border-r border-b border-gray-300 p-5 align-top" style={{ backgroundColor: rowColor }}>
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="text-slate-900 font-semibold text-base">{formatDayLabel()}</div>
                          {!readOnly && onRemoveDay && weekPlan.length > 1 && !isFrozenDay && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onRemoveDay(actualDayIndex)}
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              title={`Delete Day ${actualDayIndex + 1}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        {isFreezeRecovery && originalFreezeDateLabel && (
                          <div className="text-xs text-gray-500 italic">
                            (Freeze Recovery from {originalFreezeDateLabel})
                          </div>
                        )}
                        {isFrozenDay && (
                          <div className="text-xs text-red-500 font-medium">
                            ❄️ Frozen Day
                          </div>
                        )}
                        <DatePicker
                          value={day.date}
                          onChange={(date) => updateDayInfo(actualDayIndex, 'date', date)}
                          disabled={isFrozenDay}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs bg-white border-gray-300 hover:border-slate-500 justify-start font-normal text-left"
                          onClick={() => {
                            if (isFrozenDay) return;
                            setNotesDialogDayIndex(actualDayIndex);
                            setNotesDialogValue(day.note || '');
                            setNotesDialogOpen(true);
                          }}
                        >
                          {day.note ? (
                            <span className="truncate">{day.note.substring(0, 20)}{day.note.length > 20 ? '...' : ''}</span>
                          ) : (
                            <span className="text-gray-400">Add notes...</span>
                          )}
                        </Button>
                        {/* Daily Macro Totals */}
                        {(() => {
                          const macros = calculateDayMacros(day);
                          const hasAnyMacros = macros.cal > 0 || macros.carbs > 0 || macros.protein > 0 || macros.fats > 0;
                          if (!hasAnyMacros) return null;
                          return (
                            <div className="mt-2 p-2 bg-emerald-50 rounded border border-emerald-200">
                              <div className="text-[10px] font-semibold text-emerald-700 mb-1 uppercase tracking-wide">Daily Totals</div>
                              <div className="grid grid-cols-2 gap-1 text-[10px]">
                                <div className="text-emerald-900"><span className="font-medium">Cal:</span> {formatNum(macros.cal)}</div>
                                <div className="text-emerald-900"><span className="font-medium">Carbs:</span> {formatNum(macros.carbs)}g</div>
                                <div className="text-emerald-900"><span className="font-medium">Protein:</span> {formatNum(macros.protein)}g</div>
                                <div className="text-emerald-900"><span className="font-medium">Fats:</span> {formatNum(macros.fats)}g</div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    {allMealTypesForDay.map((mealType, index) => {
                      const meal = getMealForDay(actualDayIndex, mealType);
                      // Resolve the actual key stored in weekPlan.meals (may differ in casing/format)
                      const resolvedMealKey = resolveActualMealKey(day, mealType);
                      const isCustomMeal = !mealTypes.includes(mealType);
                      return (
                        <React.Fragment key={`${day.id}-${mealType}`}>
                          <td
                            className={`border-r border-b border-gray-300 p-4 align-top relative ${dragOverTarget && dragOverTarget.dayIndex === actualDayIndex && dragOverTarget.mealType === mealType ? 'ring-2 ring-green-500 ring-offset-1' : ''}`}
                            style={{ backgroundColor: rowColor }}
                            onDragOver={(e) => handleDragOver(e, actualDayIndex, mealType)}
                            onDragLeave={(e) => handleDragLeave(e, actualDayIndex, mealType)}
                            onDrop={(e) => handleDrop(e, actualDayIndex, mealType)}
                          >
                            {meal && meal.foodOptions.length > 0 ? (
                              <div className="space-y-3">
                                {/* Show meal name for custom meals */}
                                {isCustomMeal && (
                                  <div className="text-xs font-semibold text-slate-800 bg-white px-2 py-1 rounded border border-slate-300 mb-1">
                                    {mealType}
                                  </div>
                                )}
                                {/* Time Input and Action Buttons */}
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="text"
                                    value={normalizeTo12Hour(meal.time)}
                                    onChange={(e) => updateMealTime(actualDayIndex, mealType, e.target.value)}
                                    placeholder="e.g., 8:00 AM"
                                    className="h-9 text-xs flex-1 bg-white border-gray-300 focus:border-slate-500 focus:ring-slate-500 font-mono"
                                    disabled={isFrozenDay}
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => addFoodOption(actualDayIndex, mealType, false)}
                                    className="h-9 px-2.5 bg-green-600 text-white border-green-600 hover:bg-green-700 disabled:opacity-50"
                                    title="Add normal food option"
                                    disabled={isFrozenDay}
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => addFoodOption(actualDayIndex, mealType, true)}
                                    className="h-9 px-3 bg-orange-500 text-white border-orange-500 hover:bg-orange-600 font-medium disabled:opacity-50"
                                    title="Add alternative food option"
                                    disabled={isFrozenDay}
                                  >
                                    <span className="text-xs">🔄 Alt</span>
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      if (isFrozenDay) return;
                                      openCopyDialog(actualDayIndex, mealType);
                                    }}
                                    style={{ backgroundColor: '#00A63E', color: 'white', borderColor: '#00A63E' }}
                                    className="h-9 px-2.5 hover:opacity-90 disabled:opacity-50"
                                    title="Copy meal to another day"
                                    disabled={isFrozenDay}
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </Button>
                                </div>

                                {/* Food Options */}
                                {meal.foodOptions.map((option, optionIndex) => (
                                  <div
                                    key={`${actualDayIndex}-${mealType}-${option.id || 'option'}-${optionIndex}`}
                                    className={`food-box border rounded-md p-3.5 space-y-2.5 ${option.food ? 'cursor-move' : ''} ${option.isAlternative ? 'border-orange-300 bg-orange-50/50' : 'border-gray-300 bg-slate-50/50'}`}
                                    draggable={!!option.food}
                                    onDragStart={(e) => handleDragStart(e, actualDayIndex, mealType, optionIndex, !!option.food)}
                                    style={{ display: !meal.showAlternatives && optionIndex > 0 ? 'none' : 'block' }}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        {option.isAlternative ? (
                                          <span className="px-2 py-0.5 text-xs font-semibold text-orange-700 bg-orange-200 rounded">
                                            🔄 Alternative
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 text-xs font-medium text-gray-600 bg-gray-200 rounded">
                                            Main Food
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex space-x-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => openRecipeInNewTab(option.recipeUuid)}
                                          className={`h-7 w-7 p-0 disabled:opacity-50 ${option.isAlternative ? 'text-orange-600 hover:text-orange-700 hover:bg-orange-50' : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'}`}
                                          title={option.recipeUuid ? 'View recipe in new tab' : 'No linked recipe'}
                                          disabled={isFrozenDay || !option.recipeUuid}
                                        >
                                          <Eye className="w-4 h-4" />
                                        </Button>
                                        {/* Copy entire option button */}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            if (isFrozenDay) return;
                                            setCopyOptionSource({
                                              dayIndex: actualDayIndex,
                                              mealType,
                                              optionIndex,
                                              option
                                            });
                                            setSelectedDaysForOptionCopy([]);
                                            setSelectedMealsForOptionCopy([]);
                                            setCopyOptionDialogOpen(true);
                                          }}
                                          className={`h-7 w-7 p-0 disabled:opacity-50 ${option.isAlternative ? 'text-orange-600 hover:text-orange-700 hover:bg-orange-50' : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'}`}
                                          title={`Copy this ${option.isAlternative ? 'alternative' : 'main'} food option to other days/meals`}
                                          disabled={isFrozenDay}
                                        >
                                          <Copy className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setCurrentFoodContext({ dayIndex: actualDayIndex, mealType, optionIndex });
                                            setFoodDatabaseOpen(true);
                                          }}
                                          className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 disabled:opacity-50"
                                          title="Add more foods to this option"
                                          disabled={isFrozenDay}
                                        >
                                          <Plus className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => removeFoodOption(actualDayIndex, mealType, optionIndex)}
                                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50"
                                          title="Remove this food option"
                                          disabled={isFrozenDay}
                                        >
                                          <X className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </div>

                                    {/* Multiple Foods Display */}
                                    {option.foods && option.foods.length > 0 ? (
                                      <div className="space-y-3">
                                        {option.foods.map((foodItem, foodIndex) => (
                                          <div key={`${actualDayIndex}-${mealType}-${option.id || optionIndex}-food-${foodItem.id || 'item'}-${foodIndex}`} className={`bg-white border rounded-lg p-3 space-y-2 shadow-sm ${option.isAlternative ? 'border-orange-300 bg-orange-50' : 'border-gray-300'}`}>
                                            {/* Food Name Row with Badge */}
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="flex-1 space-y-1">
                                                <div className="flex items-center gap-2 relative flex-1">
                                                  <Input
                                                    value={foodItem.food}
                                                    onChange={(e) => {
                                                      if (readOnly || !onUpdate || isFrozenDay) return;
                                                      const nextFoodName = e.target.value;
                                                      const suggestionKey = `${actualDayIndex}-${mealType}-${optionIndex}-${foodIndex}`;
                                                      setActiveFoodSuggestionFilter(nextFoodName);
                                                      setShowFoodSuggestionsFor(suggestionKey);
                                                      captureInputRect(e.target as HTMLInputElement);

                                                      const newWeekPlan = cloneWeekPlan(weekPlan);
                                                      const meal = newWeekPlan[actualDayIndex].meals[mealType];
                                                      if (meal?.foodOptions[optionIndex]?.foods?.[foodIndex]) {
                                                        const foodRow = meal.foodOptions[optionIndex].foods![foodIndex];
                                                        const prevFoodName = (foodRow.food || '').trim();
                                                        foodRow.food = nextFoodName;

                                                        if (nextFoodName.trim() !== prevFoodName) {
                                                          foodRow.recipeId = undefined;
                                                          foodRow.recipeUuid = undefined;
                                                          foodRow.cal = '';
                                                          foodRow.carbs = '';
                                                          foodRow.fats = '';
                                                          foodRow.protein = '';
                                                          foodRow.unit = '';
                                                        }

                                                        const allFoods = meal.foodOptions[optionIndex].foods!;
                                                        meal.foodOptions[optionIndex].food = allFoods.map(f => f.food).join(' + ');
                                                        meal.foodOptions[optionIndex].cal = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.cal) || 0), 0));
                                                        meal.foodOptions[optionIndex].carbs = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.carbs) || 0), 0));
                                                        meal.foodOptions[optionIndex].fats = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.fats) || 0), 0));
                                                        meal.foodOptions[optionIndex].protein = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.protein) || 0), 0));
                                                        meal.foodOptions[optionIndex].unit = allFoods.length > 1 ? 'Multiple' : allFoods[0]?.unit || '';
                                                        onUpdate(newWeekPlan);
                                                      }
                                                    }}
                                                    onFocus={(e) => {
                                                      const suggestionKey = `${actualDayIndex}-${mealType}-${optionIndex}-${foodIndex}`;
                                                      if (e.target.value.trim()) {
                                                        setActiveFoodSuggestionFilter(e.target.value);
                                                        setShowFoodSuggestionsFor(suggestionKey);
                                                        captureInputRect(e.target as HTMLInputElement);
                                                      }
                                                    }}
                                                    onBlur={() => {
                                                      // Delay to allow click on suggestion
                                                      setTimeout(() => setShowFoodSuggestionsFor(null), 200);
                                                    }}
                                                    placeholder="Food item"
                                                    className="h-9 text-sm bg-white border-gray-300 focus:border-slate-500 focus:ring-slate-500 font-medium flex-1"
                                                    disabled={isFrozenDay}
                                                    autoComplete="off"
                                                  />
                                                  {/* Food suggestion dropdown — rendered via portal to avoid clipping */}
                                                  {showFoodSuggestionsFor === `${actualDayIndex}-${mealType}-${optionIndex}-${foodIndex}` && activeFoodSuggestionFilter.trim() && foodSuggestionPos && createPortal(
                                                    <div
                                                      className="fixed z-[9999] w-72 bg-white border border-gray-300 rounded-md shadow-lg max-h-56 overflow-y-auto"
                                                      style={{ top: foodSuggestionPos.top, left: foodSuggestionPos.left, minWidth: Math.max(foodSuggestionPos.width, 288) }}
                                                    >
                                                      {/* Header with count */}
                                                      <div className="px-3 py-1.5 bg-gray-50 border-b text-[10px] text-gray-500 font-medium sticky top-0 flex items-center justify-between">
                                                        <span>Recipes matching "{activeFoodSuggestionFilter}"</span>
                                                        {!foodSuggestionsLoading && (
                                                          <span>{foodSuggestions.length} shown{foodSuggestionTotal > foodSuggestions.length ? ` of ${foodSuggestionTotal}+` : ''}</span>
                                                        )}
                                                      </div>
                                                      {foodSuggestionsLoading && (
                                                        <div className="px-3 py-2 text-xs text-gray-500 text-center">Searching recipes...</div>
                                                      )}
                                                      {!foodSuggestionsLoading && foodSuggestions.length === 0 && (
                                                        <div className="px-3 py-2 text-xs text-gray-500 text-center">No matching recipes found</div>
                                                      )}
                                                      {foodSuggestions.map((r) => (
                                                        <div
                                                          key={`suggest-${r._id}`}
                                                          className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100 flex items-center justify-between"
                                                          onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            const newWeekPlan = cloneWeekPlan(weekPlan);
                                                            const meal = newWeekPlan[actualDayIndex].meals[mealType];
                                                            const foodRow = meal?.foodOptions[optionIndex]?.foods?.[foodIndex];
                                                            if (foodRow) {
                                                              foodRow.food = r.name;
                                                              foodRow.recipeId = r._id;
                                                              foodRow.recipeUuid = (r as any).uuid;
                                                              const servingMultiplier = r.servings ? (1 / (parseFloat(String(r.servings)) || 1)) : 1;
                                                              const nut = r.nutrition || {};
                                                              foodRow.cal = formatNum(Math.round((nut.calories || 0) * servingMultiplier));
                                                              foodRow.carbs = formatNum(Math.round((nut.carbs || 0) * servingMultiplier));
                                                              foodRow.fats = formatNum(Math.round((nut.fat || 0) * servingMultiplier));
                                                              foodRow.protein = formatNum(Math.round((nut.protein || 0) * servingMultiplier));
                                                              foodRow.unit = r.servings ? `${r.servings} serving` : '';

                                                              const allFoods = meal.foodOptions[optionIndex].foods!;
                                                              meal.foodOptions[optionIndex].food = allFoods.map(f => f.food).join(' + ');
                                                              meal.foodOptions[optionIndex].cal = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.cal) || 0), 0));
                                                              meal.foodOptions[optionIndex].carbs = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.carbs) || 0), 0));
                                                              meal.foodOptions[optionIndex].fats = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.fats) || 0), 0));
                                                              meal.foodOptions[optionIndex].protein = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.protein) || 0), 0));
                                                              meal.foodOptions[optionIndex].unit = allFoods.length > 1 ? 'Multiple' : allFoods[0]?.unit || '';
                                                              onUpdate(newWeekPlan);
                                                            }
                                                            setShowFoodSuggestionsFor(null);
                                                            setActiveFoodSuggestionFilter('');
                                                            setFoodSuggestionPos(null);
                                                          }}
                                                        >
                                                          <span>🍽️ {r.name}</span>
                                                          <span className="text-[10px] text-gray-400">
                                                            {r.nutrition?.calories != null ? `${Math.round(r.nutrition.calories)} cal` : ''}
                                                          </span>
                                                        </div>
                                                      ))}
                                                      {/* Load more button */}
                                                      {foodSuggestionHasMore && (
                                                        <button
                                                          type="button"
                                                          onMouseDown={(e) => { e.preventDefault(); loadMoreFoodSuggestions(); }}
                                                          className="w-full px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 text-center border-t border-gray-100 transition-colors"
                                                          disabled={foodSuggestionsLoadingMore}
                                                        >
                                                          {foodSuggestionsLoadingMore ? 'Loading...' : 'Load more results'}
                                                        </button>
                                                      )}
                                                    </div>,
                                                    document.body
                                                  )}
                                                  {option.isAlternative && (
                                                    <span className="px-2.5 py-1 text-xs font-semibold text-orange-700 bg-orange-100 rounded-full whitespace-nowrap">
                                                      Alternative
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                              <div className="flex gap-1">
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => openRecipeInNewTab(foodItem.recipeUuid)}
                                                  className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                                  title={foodItem.recipeUuid ? 'View recipe in new tab' : 'No linked recipe'}
                                                  disabled={isFrozenDay || !foodItem.recipeUuid}
                                                >
                                                  <Eye className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => {
                                                    if (isFrozenDay) return;
                                                    setSelectedDaysForFoodCopy([]);
                                                    setSelectedMealsForFoodCopy([]);
                                                    setCopyFoodSource({ dayIndex: actualDayIndex, mealType, optionIndex, foodIndex });
                                                    setCopyFoodDialogOpen(true);
                                                  }}
                                                  className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                                  title="Copy this food to other meals"
                                                  disabled={isFrozenDay}
                                                >
                                                  <Copy className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => {
                                                    if (readOnly || !onUpdate || isFrozenDay) return;
                                                    const newWeekPlan = cloneWeekPlan(weekPlan);
                                                    const meal = newWeekPlan[actualDayIndex].meals[mealType];
                                                    if (meal?.foodOptions[optionIndex]?.foods) {
                                                      meal.foodOptions[optionIndex].foods!.splice(foodIndex, 1);
                                                      const allFoods = meal.foodOptions[optionIndex].foods!;
                                                      if (allFoods.length === 0) {
                                                        // Clear all fields if no foods left
                                                        meal.foodOptions[optionIndex].food = '';
                                                        meal.foodOptions[optionIndex].unit = '';
                                                        meal.foodOptions[optionIndex].cal = '';
                                                        meal.foodOptions[optionIndex].carbs = '';
                                                        meal.foodOptions[optionIndex].fats = '';
                                                        meal.foodOptions[optionIndex].protein = '';
                                                        meal.foodOptions[optionIndex].foods = undefined;
                                                      } else {
                                                        // Recalculate totals
                                                        meal.foodOptions[optionIndex].food = allFoods.map(f => f.food).join(' + ');
                                                        meal.foodOptions[optionIndex].unit = allFoods.length > 1 ? 'Multiple' : allFoods[0]?.unit || '';
                                                        meal.foodOptions[optionIndex].cal = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.cal) || 0), 0));
                                                        meal.foodOptions[optionIndex].carbs = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.carbs) || 0), 0));
                                                        meal.foodOptions[optionIndex].fats = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.fats) || 0), 0));
                                                        meal.foodOptions[optionIndex].protein = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.protein) || 0), 0));
                                                      }
                                                      onUpdate(newWeekPlan);
                                                    }
                                                  }}
                                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-50"
                                                  title="Remove this food"
                                                  disabled={isFrozenDay}
                                                >
                                                  <Minus className="w-4 h-4" />
                                                </Button>
                                              </div>
                                            </div>

                                            {/* Unit and Calories Row */}
                                            <div className="grid grid-cols-2 gap-2">
                                              <Input
                                                value={foodItem.unit}
                                                onChange={(e) => {
                                                  if (readOnly || !onUpdate || isFrozenDay) return;
                                                  const newWeekPlan = cloneWeekPlan(weekPlan);
                                                  const meal = newWeekPlan[actualDayIndex].meals[mealType];
                                                  if (meal?.foodOptions[optionIndex]?.foods?.[foodIndex]) {
                                                    meal.foodOptions[optionIndex].foods![foodIndex].unit = e.target.value;
                                                    onUpdate(newWeekPlan);
                                                  }
                                                }}
                                                placeholder="Unit (e.g., 100g)"
                                                className="h-9 text-xs bg-gray-50 border-gray-300"
                                                disabled={isFrozenDay}
                                              />
                                              <Input
                                                value={foodItem.cal}
                                                onChange={(e) => {
                                                  if (readOnly || !onUpdate || isFrozenDay) return;
                                                  const newWeekPlan = cloneWeekPlan(weekPlan);
                                                  const meal = newWeekPlan[actualDayIndex].meals[mealType];
                                                  if (meal?.foodOptions[optionIndex]?.foods?.[foodIndex]) {
                                                    meal.foodOptions[optionIndex].foods![foodIndex].cal = e.target.value;
                                                    const allFoods = meal.foodOptions[optionIndex].foods!;
                                                    meal.foodOptions[optionIndex].cal = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.cal) || 0), 0));
                                                    onUpdate(newWeekPlan);
                                                  }
                                                }}
                                                placeholder="Calories"
                                                type="number"
                                                className="h-9 text-xs bg-gray-50 border-gray-300 font-mono"
                                                disabled={isFrozenDay}
                                              />
                                            </div>

                                            {/* Carbs and Fats Row */}
                                            <div className="grid grid-cols-2 gap-2">
                                              <Input
                                                value={foodItem.carbs}
                                                onChange={(e) => {
                                                  if (readOnly || !onUpdate || isFrozenDay) return;
                                                  const newWeekPlan = cloneWeekPlan(weekPlan);
                                                  const meal = newWeekPlan[actualDayIndex].meals[mealType];
                                                  if (meal?.foodOptions[optionIndex]?.foods?.[foodIndex]) {
                                                    meal.foodOptions[optionIndex].foods![foodIndex].carbs = e.target.value;
                                                    const allFoods = meal.foodOptions[optionIndex].foods!;
                                                    meal.foodOptions[optionIndex].carbs = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.carbs) || 0), 0));
                                                    onUpdate(newWeekPlan);
                                                  }
                                                }}
                                                placeholder="Carbs (g)"
                                                type="number"
                                                className="h-9 text-xs bg-gray-50 border-gray-300 font-mono"
                                                disabled={isFrozenDay}
                                              />
                                              <Input
                                                value={foodItem.fats}
                                                onChange={(e) => {
                                                  if (readOnly || !onUpdate || isFrozenDay) return;
                                                  const newWeekPlan = cloneWeekPlan(weekPlan);
                                                  const meal = newWeekPlan[actualDayIndex].meals[mealType];
                                                  if (meal?.foodOptions[optionIndex]?.foods?.[foodIndex]) {
                                                    meal.foodOptions[optionIndex].foods![foodIndex].fats = e.target.value;
                                                    const allFoods = meal.foodOptions[optionIndex].foods!;
                                                    meal.foodOptions[optionIndex].fats = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.fats) || 0), 0));
                                                    onUpdate(newWeekPlan);
                                                  }
                                                }}
                                                placeholder="Fats (g)"
                                                type="number"
                                                className="h-9 text-xs bg-gray-50 border-gray-300 font-mono"
                                                disabled={isFrozenDay}
                                              />
                                            </div>

                                            {/* Protein Row */}
                                            <div className="grid grid-cols-1 gap-2">
                                              <Input
                                                value={foodItem.protein}
                                                onChange={(e) => {
                                                  if (readOnly || !onUpdate || isFrozenDay) return;
                                                  const newWeekPlan = cloneWeekPlan(weekPlan);
                                                  const meal = newWeekPlan[actualDayIndex].meals[mealType];
                                                  if (meal?.foodOptions[optionIndex]?.foods?.[foodIndex]) {
                                                    meal.foodOptions[optionIndex].foods![foodIndex].protein = e.target.value;
                                                    const allFoods = meal.foodOptions[optionIndex].foods!;
                                                    meal.foodOptions[optionIndex].protein = formatNum(allFoods.reduce((sum, f) => sum + (parseFloat(f.protein) || 0), 0));
                                                    onUpdate(newWeekPlan);
                                                  }
                                                }}
                                                placeholder="Protein (g)"
                                                type="number"
                                                className="h-9 text-xs bg-gray-50 border-gray-300 font-mono"
                                                disabled={isFrozenDay}
                                              />
                                            </div>

                                            <div className="space-y-2 w-full sm:w-65">
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8 w-full px-2.5 text-xs bg-white border-gray-300 hover:border-slate-500 justify-start font-normal text-left rounded-md"
                                                onClick={() => openMealNoteDialog(actualDayIndex, mealType, optionIndex, option.note)}
                                                disabled={isFrozenDay}
                                              >
                                                {option.note ? 'Edit meal note' : 'Add meal note'}
                                              </Button>
                                              {option.note && (
                                                <div className="w-full h-9 rounded-md border border-gray-300 bg-gray-50 px-2.5 text-xs text-slate-700 flex items-center overflow-hidden">
                                                  <span className="block w-full truncate">
                                                    {option.note.replace(/\s+/g, ' ').trim()}
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      /* Single Food Display (backward compatible) */
                                      <>
                                        <div className='flex gap-1 items-center justify-between relative'>
                                          <Input
                                            value={option.food}
                                            onChange={(e) => {
                                              const nextFoodName = e.target.value;
                                              const suggestionKey = `${actualDayIndex}-${mealType}-${optionIndex}-single`;
                                              setActiveFoodSuggestionFilter(nextFoodName);
                                              setShowFoodSuggestionsFor(suggestionKey);
                                              captureInputRect(e.target as HTMLInputElement);
                                              updateFoodOption(actualDayIndex, mealType, optionIndex, 'food', nextFoodName);
                                            }}
                                            onFocus={(e) => {
                                              const suggestionKey = `${actualDayIndex}-${mealType}-${optionIndex}-single`;
                                              if (e.target.value.trim()) {
                                                setActiveFoodSuggestionFilter(e.target.value);
                                                setShowFoodSuggestionsFor(suggestionKey);
                                                captureInputRect(e.target as HTMLInputElement);
                                              }
                                            }}
                                            onBlur={() => {
                                              setTimeout(() => setShowFoodSuggestionsFor(null), 200);
                                            }}
                                            placeholder="Food item"
                                            className="h-9 text-xs bg-white border-gray-300 focus:border-slate-500 focus:ring-slate-500 font-medium flex-1"
                                            autoComplete="off"
                                          />
                                          {/* Food suggestion dropdown for single food — rendered via portal to avoid clipping */}
                                          {showFoodSuggestionsFor === `${actualDayIndex}-${mealType}-${optionIndex}-single` && activeFoodSuggestionFilter.trim() && foodSuggestionPos && createPortal(
                                            <div
                                              className="fixed z-[9999] w-72 bg-white border border-gray-300 rounded-md shadow-lg max-h-56 overflow-y-auto"
                                              style={{ top: foodSuggestionPos.top, left: foodSuggestionPos.left, minWidth: Math.max(foodSuggestionPos.width, 288) }}
                                            >
                                              {/* Header with count */}
                                              <div className="px-3 py-1.5 bg-gray-50 border-b text-[10px] text-gray-500 font-medium sticky top-0 flex items-center justify-between">
                                                <span>Recipes matching "{activeFoodSuggestionFilter}"</span>
                                                {!foodSuggestionsLoading && (
                                                  <span>{foodSuggestions.length} shown{foodSuggestionTotal > foodSuggestions.length ? ` of ${foodSuggestionTotal}+` : ''}</span>
                                                )}
                                              </div>
                                              {foodSuggestionsLoading && (
                                                <div className="px-3 py-2 text-xs text-gray-500 text-center">Searching recipes...</div>
                                              )}
                                              {!foodSuggestionsLoading && foodSuggestions.length === 0 && (
                                                <div className="px-3 py-2 text-xs text-gray-500 text-center">No matching recipes found</div>
                                              )}
                                              {foodSuggestions.map((r) => (
                                                <div
                                                  key={`suggest-single-${r._id}`}
                                                  className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100 flex items-center justify-between"
                                                  onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    if (readOnly || !onUpdate || isDayFrozen(actualDayIndex)) return;
                                                    const newWeekPlan = cloneWeekPlan(weekPlan);
                                                    const actualKey = resolveActualMealKey(newWeekPlan[actualDayIndex], mealType);
                                                    const opt = newWeekPlan[actualDayIndex].meals[actualKey]?.foodOptions[optionIndex];
                                                    if (opt) {
                                                      opt.food = r.name;
                                                      opt.recipeId = r._id;
                                                      opt.recipeUuid = (r as any).uuid;
                                                      const servingMultiplier = r.servings ? (1 / (parseFloat(String(r.servings)) || 1)) : 1;
                                                      const nut = r.nutrition || {};
                                                      opt.cal = formatNum(Math.round((nut.calories || 0) * servingMultiplier));
                                                      opt.carbs = formatNum(Math.round((nut.carbs || 0) * servingMultiplier));
                                                      opt.fats = formatNum(Math.round((nut.fat || 0) * servingMultiplier));
                                                      opt.protein = formatNum(Math.round((nut.protein || 0) * servingMultiplier));
                                                      opt.unit = r.servings ? `${r.servings} serving` : '';
                                                      onUpdate(newWeekPlan);
                                                    }
                                                    setShowFoodSuggestionsFor(null);
                                                    setActiveFoodSuggestionFilter('');
                                                    setFoodSuggestionPos(null);
                                                  }}
                                                >
                                                  <span>🍽️ {r.name}</span>
                                                  <span className="text-[10px] text-gray-400">
                                                    {r.nutrition?.calories != null ? `${Math.round(r.nutrition.calories)} cal` : ''}
                                                  </span>
                                                </div>
                                              ))}
                                              {/* Load more button */}
                                              {foodSuggestionHasMore && (
                                                <button
                                                  type="button"
                                                  onMouseDown={(e) => { e.preventDefault(); loadMoreFoodSuggestions(); }}
                                                  className="w-full px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 text-center border-t border-gray-100 transition-colors"
                                                  disabled={foodSuggestionsLoadingMore}
                                                >
                                                  {foodSuggestionsLoadingMore ? 'Loading...' : 'Load more results'}
                                                </button>
                                              )}
                                            </div>,
                                            document.body
                                          )}
                                        </div>


                                        <div className="grid grid-cols-2 gap-2">
                                          <Input
                                            value={option.unit}
                                            onChange={(e) => updateFoodOption(actualDayIndex, mealType, optionIndex, 'unit', e.target.value)}
                                            placeholder="Unit (e.g., 100g)"
                                            className="h-9 text-xs bg-white border-gray-300 focus:border-slate-500 focus:ring-slate-500"
                                          />
                                          <Input
                                            value={option.cal}
                                            onChange={(e) => updateFoodOption(actualDayIndex, mealType, optionIndex, 'cal', e.target.value)}
                                            placeholder="Calories"
                                            type="number"
                                            className="h-9 text-xs bg-white border-gray-300 focus:border-slate-500 focus:ring-slate-500 font-mono"
                                          />
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                          <Input
                                            value={option.carbs}
                                            onChange={(e) => updateFoodOption(actualDayIndex, mealType, optionIndex, 'carbs', e.target.value)}
                                            placeholder="Carbs (g)"
                                            type="number"
                                            className="h-9 text-xs bg-white border-gray-300 focus:border-slate-500 focus:ring-slate-500 font-mono"
                                          />
                                          <Input
                                            value={option.fats}
                                            onChange={(e) => updateFoodOption(actualDayIndex, mealType, optionIndex, 'fats', e.target.value)}
                                            placeholder="Fats (g)"
                                            type="number"
                                            className="h-9 text-xs bg-white border-gray-300 focus:border-slate-500 focus:ring-slate-500 font-mono"
                                          />
                                        </div>

                                        <div className="grid grid-cols-1 gap-2">
                                          <Input
                                            value={option.protein}
                                            onChange={(e) => updateFoodOption(actualDayIndex, mealType, optionIndex, 'protein', e.target.value)}
                                            placeholder="Protein (g)"
                                            type="number"
                                            className="h-9 text-xs bg-white border-gray-300 focus:border-slate-500 focus:ring-slate-500 font-mono"
                                          />
                                        </div>
                                        <div className="space-y-2 w-full sm:w-65">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 w-full px-2.5 text-xs bg-white border-gray-300 hover:border-slate-500 justify-start font-normal text-left rounded-md"
                                            onClick={() => openMealNoteDialog(actualDayIndex, mealType, optionIndex, option.note)}
                                            disabled={isFrozenDay}
                                          >
                                            {option.note ? 'Edit meal note' : 'Add meal note'}
                                          </Button>
                                          {option.note && (
                                            <div className="w-full h-9 rounded-md border border-gray-300 bg-gray-50 px-2.5 text-xs text-slate-700 flex items-center overflow-hidden">
                                              <span className="block w-full truncate">
                                                {option.note.replace(/\s+/g, ' ').trim()}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-2.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => addMealToCell(actualDayIndex, mealType)}
                                  className="w-full h-20 border-2 border-dashed border-gray-400 hover:border-slate-600 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all font-medium"
                                >
                                  <Plus className="w-4 h-4 mr-2" />
                                  Add {mealType}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    // Ensure base option exists
                                    addMealToCell(actualDayIndex, mealType);
                                    // Add second alternative if only one currently
                                    setTimeout(() => {
                                      const mealObj = weekPlan[actualDayIndex].meals[mealType];
                                      if (mealObj && mealObj.foodOptions.length === 1) {
                                        addFoodOption(actualDayIndex, mealType);
                                      } else if (mealObj && mealObj.foodOptions.length === 0) {
                                        // Safety: if still zero, add two
                                        addFoodOption(actualDayIndex, mealType);
                                        addFoodOption(actualDayIndex, mealType);
                                      }
                                    }, 0);
                                  }}
                                  style={{ backgroundColor: '#C2E66E', borderColor: '#00A63E' }}
                                  className="w-full h-12 border-2 border-dashed hover:opacity-90 text-slate-900 font-medium"
                                >
                                  <Copy className="w-4 h-4 mr-2" />
                                  Add with Alternatives
                                </Button>
                              </div>
                            )}
                          </td>
                        </React.Fragment>
                      );
                    })}

                  </tr>
                );
              })}
              {/* Add Day Row */}
              <tr className="bg-slate-100/50">
                <td className="border-r border-b border-gray-300 p-5 align-top">

                </td>
                {displayMealTypes.map((mealType, index) => (
                  <React.Fragment key={`add-${mealType}`}>
                    <td className="border-r border-b border-gray-300 bg-slate-100/30"></td>
                  </React.Fragment>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bottom Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 py-4 bg-white border-t border-gray-200">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPreviousPage}
              disabled={currentPage === 0}
              className="h-9 px-4 border-gray-300 hover:bg-slate-100 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>

            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => (
                <Button
                  key={i}
                  variant={currentPage === i ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(i)}
                  className={`h-9 w-9 p-0 ${currentPage === i
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'border-gray-300 hover:bg-slate-100'
                    }`}
                >
                  {i + 1}
                </Button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={goToNextPage}
              disabled={currentPage >= totalPages - 1}
              className="h-9 px-4 border-gray-300 hover:bg-slate-100 disabled:opacity-50"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>

            <span className="text-sm text-slate-600 ml-4">
              Days {startIndex + 1}-{endIndex} of {weekPlan.length}
            </span>
          </div>
        )}

        {/* Copy Meal Dialog */}
        <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
          <DialogContent className="sm:max-w-2xl border-gray-300 shadow-xl max-h-[85vh] flex flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle className="text-slate-900 font-semibold">Copy Meal Plan</DialogTitle>
              <DialogDescription className="text-slate-600">
                Select the days and meal types where you want to copy this meal.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-4 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-900 font-semibold text-sm">Target Days</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllDays}
                    className="h-8 text-xs border-gray-300 hover:bg-slate-50 font-medium"
                  >
                    {selectedDays.length === weekPlan.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 border-2 border-gray-300 rounded-md bg-slate-50">
                  {weekPlan.map((day, index) => (
                    <div key={`${day.id}-${index}`} className="flex items-center space-x-2.5">
                      <Checkbox
                        id={`day-${index}`}
                        checked={selectedDays.includes(index)}
                        onCheckedChange={() => toggleDaySelection(index)}
                        className="border-gray-400"
                      />
                      <label
                        htmlFor={`day-${index}`}
                        className="text-sm cursor-pointer text-slate-700 font-medium"
                      >
                        {day.day}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-900 font-semibold text-sm">Target Meal Types</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllMeals}
                    className="h-8 text-xs border-gray-300 hover:bg-slate-50 font-medium"
                  >
                    {selectedMeals.length === displayMealTypes.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 border-2 border-gray-300 rounded-md bg-slate-50">
                  {displayMealTypes.map((mealType) => (
                    <div key={mealType} className="flex items-center space-x-2.5">
                      <Checkbox
                        id={`meal-${mealType}`}
                        checked={selectedMeals.includes(mealType)}
                        onCheckedChange={() => toggleMealSelection(mealType)}
                        className="border-gray-400"
                      />
                      <label
                        htmlFor={`meal-${mealType}`}
                        className="text-sm cursor-pointer text-slate-700 font-medium"
                      >
                        {mealType}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {selectedDays.length > 0 && selectedMeals.length > 0 && (
                <div className="p-4 bg-slate-100 border-2 border-slate-300 rounded-md">
                  <p className="text-sm text-slate-900 font-medium">
                    This meal will be copied to <span className="font-bold">{selectedDays.length} day(s)</span> × <span className="font-bold">{selectedMeals.length} meal type(s)</span> = <span className="font-bold">{selectedDays.length * selectedMeals.length} total meal(s)</span>
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="shrink-0">
              <Button variant="outline" onClick={() => setCopyDialogOpen(false)} className="border-gray-300 hover:bg-slate-50 font-medium">
                Cancel
              </Button>
              <Button
                onClick={handleCopyMeal}
                disabled={selectedDays.length === 0 || selectedMeals.length === 0}
                style={{ backgroundColor: '#00A63E', color: 'white' }}
                className="hover:opacity-90 shadow font-medium"
              >
                Copy to {selectedDays.length * selectedMeals.length} Meal{selectedDays.length * selectedMeals.length !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Copy Food Dialog */}
        <Dialog open={copyFoodDialogOpen} onOpenChange={setCopyFoodDialogOpen}>
          <DialogContent className="sm:max-w-2xl border-gray-300 shadow-xl max-h-[85vh] flex flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle className="text-slate-900 font-semibold flex items-center gap-2">
                <Copy className="w-5 h-5" />
                Copy Food Item
                {copyFoodSource && weekPlan[copyFoodSource.dayIndex]?.meals[copyFoodSource.mealType]?.foodOptions[copyFoodSource.optionIndex]?.isAlternative && (
                  <span className="px-2 py-0.5 text-xs font-semibold text-orange-700 bg-orange-200 rounded">Alternative</span>
                )}
              </DialogTitle>
              <DialogDescription className="text-slate-600">
                {copyFoodSource && (
                  <>
                    Copying: <strong>{weekPlan[copyFoodSource.dayIndex]?.meals[copyFoodSource.mealType]?.foodOptions[copyFoodSource.optionIndex]?.foods?.[copyFoodSource.foodIndex]?.food || 'Food item'}</strong>
                    {weekPlan[copyFoodSource.dayIndex]?.meals[copyFoodSource.mealType]?.foodOptions[copyFoodSource.optionIndex]?.isAlternative && (
                      <span className="ml-2 text-orange-600 text-xs">(Will be copied as alternative)</span>
                    )}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-4 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-900 font-semibold text-sm">Target Days</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedDaysForFoodCopy(selectedDaysForFoodCopy.length === weekPlan.length ? [] : weekPlan.map((_, i) => i))}
                    className="h-8 text-xs border-gray-300 hover:bg-slate-50 font-medium"
                  >
                    {selectedDaysForFoodCopy.length === weekPlan.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 border-2 border-gray-300 rounded-md bg-slate-50">
                  {weekPlan.map((day, index) => (
                    <div key={`${day.id}-${index}`} className="flex items-center space-x-2.5">
                      <Checkbox
                        id={`food-copy-day-${index}`}
                        checked={selectedDaysForFoodCopy.includes(index)}
                        onCheckedChange={() => toggleDaySelectionForFoodCopy(index)}
                        className="border-gray-400"
                      />
                      <label
                        htmlFor={`food-copy-day-${index}`}
                        className="text-sm cursor-pointer text-slate-700 font-medium"
                      >
                        {day.day}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-900 font-semibold text-sm">Target Meal Types</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedMealsForFoodCopy(selectedMealsForFoodCopy.length === displayMealTypes.length ? [] : [...displayMealTypes])}
                    className="h-8 text-xs border-gray-300 hover:bg-slate-50 font-medium"
                  >
                    {selectedMealsForFoodCopy.length === displayMealTypes.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 border-2 border-gray-300 rounded-md bg-slate-50">
                  {displayMealTypes.map((mealType) => (
                    <div key={mealType} className="flex items-center space-x-2.5">
                      <Checkbox
                        id={`food-copy-meal-${mealType}`}
                        checked={selectedMealsForFoodCopy.includes(mealType)}
                        onCheckedChange={() => toggleMealSelectionForFoodCopy(mealType)}
                        className="border-gray-400"
                      />
                      <label
                        htmlFor={`food-copy-meal-${mealType}`}
                        className="text-sm cursor-pointer text-slate-700 font-medium"
                      >
                        {mealType}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {selectedDaysForFoodCopy.length > 0 && selectedMealsForFoodCopy.length > 0 && (
                <div className={`p-4 border-2 rounded-md ${copyFoodSource && weekPlan[copyFoodSource.dayIndex]?.meals[copyFoodSource.mealType]?.foodOptions[copyFoodSource.optionIndex]?.isAlternative ? 'bg-orange-50 border-orange-300' : 'bg-slate-100 border-slate-300'}`}>
                  <p className="text-sm text-slate-900 font-medium">
                    This food will be copied to <span className="font-bold">{selectedDaysForFoodCopy.length} day(s)</span> × <span className="font-bold">{selectedMealsForFoodCopy.length} meal type(s)</span> = <span className="font-bold">{selectedDaysForFoodCopy.length * selectedMealsForFoodCopy.length} total location(s)</span>
                    {copyFoodSource && weekPlan[copyFoodSource.dayIndex]?.meals[copyFoodSource.mealType]?.foodOptions[copyFoodSource.optionIndex]?.isAlternative && (
                      <span className="block mt-1 text-orange-700 text-xs">🔄 Will be added as alternative food in each location</span>
                    )}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="shrink-0">
              <Button variant="outline" onClick={() => setCopyFoodDialogOpen(false)} className="border-gray-300 hover:bg-slate-50 font-medium">
                Cancel
              </Button>
              <Button
                onClick={handleCopyFood}
                disabled={selectedDaysForFoodCopy.length === 0 || selectedMealsForFoodCopy.length === 0}
                className={`shadow font-medium ${copyFoodSource && weekPlan[copyFoodSource.dayIndex]?.meals[copyFoodSource.mealType]?.foodOptions[copyFoodSource.optionIndex]?.isAlternative ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'} text-white`}
              >
                Copy to {selectedDaysForFoodCopy.length * selectedMealsForFoodCopy.length} Location{selectedDaysForFoodCopy.length * selectedMealsForFoodCopy.length !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Copy Food Option Dialog */}
        <Dialog open={copyOptionDialogOpen} onOpenChange={setCopyOptionDialogOpen}>
          <DialogContent className={`sm:max-w-2xl shadow-xl max-h-[85vh] flex flex-col ${copyOptionSource?.option?.isAlternative ? 'border-orange-300' : 'border-gray-300'}`}>
            <DialogHeader className="shrink-0">
              <DialogTitle className="text-slate-900 font-semibold flex items-center gap-2">
                <Copy className="w-5 h-5" />
                Copy Food Option Card
                {copyOptionSource?.option?.isAlternative ? (
                  <span className="px-2 py-0.5 text-xs font-semibold text-orange-700 bg-orange-200 rounded">🔄 Alternative</span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium text-gray-600 bg-gray-200 rounded">Main Food</span>
                )}
              </DialogTitle>
              <DialogDescription className="text-slate-600">
                {copyOptionSource && (
                  <>
                    Copying entire food option card with <strong>{copyOptionSource.option?.foods?.length || 0} food item(s)</strong>
                    {copyOptionSource.option?.isAlternative ? (
                      <span className="ml-2 text-orange-600 text-xs">(Will be copied as alternative option)</span>
                    ) : (
                      <span className="ml-2 text-green-600 text-xs">(Will be copied as main food option)</span>
                    )}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            {/* Show foods in this option */}
            {copyOptionSource?.option?.foods && copyOptionSource.option.foods.length > 0 && (
              <div className={`p-3 border-2 rounded-md ${copyOptionSource.option.isAlternative ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'}`}>
                <p className="text-xs font-semibold text-slate-700 mb-2">Foods in this option:</p>
                <div className="flex flex-wrap gap-2">
                  {copyOptionSource.option.foods.map((food: { food?: string; quantity?: string }, idx: number) => (
                    <span key={idx} className={`px-2 py-1 text-xs rounded ${copyOptionSource.option?.isAlternative ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-700'}`}>
                      {food.food} {food.quantity && `(${food.quantity})`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-5 py-4 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-900 font-semibold text-sm">Target Days</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedDaysForOptionCopy(selectedDaysForOptionCopy.length === weekPlan.length ? [] : weekPlan.map((_, i) => i))}
                    className="h-8 text-xs border-gray-300 hover:bg-slate-50 font-medium"
                  >
                    {selectedDaysForOptionCopy.length === weekPlan.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 border-2 border-gray-300 rounded-md bg-slate-50">
                  {weekPlan.map((day, index) => (
                    <div key={`${day.id}-${index}`} className="flex items-center space-x-2.5">
                      <Checkbox
                        id={`option-copy-day-${index}`}
                        checked={selectedDaysForOptionCopy.includes(index)}
                        onCheckedChange={() => toggleDaySelectionForOptionCopy(index)}
                        className="border-gray-400"
                      />
                      <label
                        htmlFor={`option-copy-day-${index}`}
                        className="text-sm cursor-pointer text-slate-700 font-medium"
                      >
                        {day.day}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-900 font-semibold text-sm">Target Meal Types</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedMealsForOptionCopy(selectedMealsForOptionCopy.length === displayMealTypes.length ? [] : [...displayMealTypes])}
                    className="h-8 text-xs border-gray-300 hover:bg-slate-50 font-medium"
                  >
                    {selectedMealsForOptionCopy.length === displayMealTypes.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 border-2 border-gray-300 rounded-md bg-slate-50">
                  {displayMealTypes.map((mealType) => (
                    <div key={mealType} className="flex items-center space-x-2.5">
                      <Checkbox
                        id={`option-copy-meal-${mealType}`}
                        checked={selectedMealsForOptionCopy.includes(mealType)}
                        onCheckedChange={() => toggleMealSelectionForOptionCopy(mealType)}
                        className="border-gray-400"
                      />
                      <label
                        htmlFor={`option-copy-meal-${mealType}`}
                        className="text-sm cursor-pointer text-slate-700 font-medium"
                      >
                        {mealType}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {selectedDaysForOptionCopy.length > 0 && selectedMealsForOptionCopy.length > 0 && (
                <div className={`p-4 border-2 rounded-md ${copyOptionSource?.option?.isAlternative ? 'bg-orange-50 border-orange-300' : 'bg-slate-100 border-slate-300'}`}>
                  <p className="text-sm text-slate-900 font-medium">
                    This food option card will be copied to <span className="font-bold">{selectedDaysForOptionCopy.length} day(s)</span> × <span className="font-bold">{selectedMealsForOptionCopy.length} meal type(s)</span> = <span className="font-bold">{selectedDaysForOptionCopy.length * selectedMealsForOptionCopy.length} total location(s)</span>
                  </p>
                  <p className={`mt-1 text-xs ${copyOptionSource?.option?.isAlternative ? 'text-orange-700' : 'text-green-700'}`}>
                    {copyOptionSource?.option?.isAlternative
                      ? '🔄 Will be added as alternative food option in each location'
                      : '✓ Will be added as main food option in each location'}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="shrink-0">
              <Button variant="outline" onClick={() => setCopyOptionDialogOpen(false)} className="border-gray-300 hover:bg-slate-50 font-medium">
                Cancel
              </Button>
              <Button
                onClick={handleCopyOption}
                disabled={selectedDaysForOptionCopy.length === 0 || selectedMealsForOptionCopy.length === 0}
                className={`shadow font-medium ${copyOptionSource?.option?.isAlternative ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'} text-white`}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy to {selectedDaysForOptionCopy.length * selectedMealsForOptionCopy.length} Location{selectedDaysForOptionCopy.length * selectedMealsForOptionCopy.length !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Meal Type Dialog */}
        <Dialog open={addMealTypeDialogOpen} onOpenChange={setAddMealTypeDialogOpen}>
          <DialogContent className="sm:max-w-2xl border-gray-300 shadow-xl" style={{ zIndex: 200 }}>
            <DialogHeader>
              <DialogTitle className="text-slate-900 font-semibold">Add New Meal</DialogTitle>
              <DialogDescription className="text-slate-600">
                Enter the meal name and time. This meal will be added to all days and ordered by time in the header.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-4">
              <div className="space-y-3">
                <Label className="text-slate-900 font-semibold text-sm">Meal Name</Label>
                <Input
                  value={newMealTypeName}
                  onChange={(e) => setNewMealTypeName(e.target.value)}
                  placeholder="e.g., Pre-Workout Snack"
                  className="h-9 text-xs bg-white border-gray-300 focus:border-slate-500 focus:ring-slate-500 font-medium"
                />
              </div>
              <div className="space-y-3">
                <Label className="text-slate-900 font-semibold text-sm">Meal Time</Label>
                <Input
                  type="time"
                  value={to24HourForInput(newMealTime)}
                  onChange={(e) => {
                    const val12h = e.target.value ? normalizeTo12Hour(e.target.value) || e.target.value : '';
                    setNewMealTime(val12h);
                  }}
                  className="h-9 text-xs bg-white border-gray-300 focus:border-slate-500 focus:ring-slate-500 font-medium"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAddMealTypeDialogOpen(false); setNewMealTypeName(''); setNewMealTime(''); }} className="border-gray-300 hover:bg-slate-50 font-medium">
                Cancel
              </Button>
              <Button
                onClick={handleAddMealType}
                disabled={!newMealTypeName.trim()}
                style={{ backgroundColor: '#00A63E', color: 'white' }}
                className="hover:opacity-90 shadow font-medium"
              >
                Add Meal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Time Editor Dialog */}
        <Dialog open={bulkTimeEditorOpen} onOpenChange={setBulkTimeEditorOpen}>
          <DialogContent className="sm:max-w-md border-gray-300 shadow-xl max-h-[85vh] p-0 flex flex-col overflow-hidden" style={{ zIndex: 200 }}>
            <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100">
              <DialogTitle className="text-slate-900 font-semibold">Edit Meal Types</DialogTitle>
              <DialogDescription className="text-slate-600">
                Drag to reorder meal types, and update names and times across all days at once. Click "Apply Defaults" to use standard times.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 px-6 py-4 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-3">
                {mealTypeEditsForBulk.map((mealTypeEdit, index) => (
                  <div
                    key={mealTypeEdit.previousName}
                    onDragOver={(e) => handleBulkMealTypeDragOver(e, index)}
                    onDrop={(e) => handleBulkMealTypeDrop(e, index)}
                    className={`grid grid-cols-[28px_minmax(0,1fr)_140px] gap-3 items-center rounded-md ${bulkDragOverIndex === index ? 'bg-slate-100' : ''
                      }`}
                  >
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => handleBulkMealTypeDragStart(e, index)}
                      onDragEnd={handleBulkMealTypeDragEnd}
                      className="h-8 w-7 flex items-center justify-center text-slate-500 hover:text-slate-700 cursor-grab active:cursor-grabbing"
                      title="Drag to reorder"
                      aria-label={`Drag to reorder ${mealTypeEdit.name || mealTypeEdit.previousName}`}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <div className="space-y-1">
                      <Label className="text-slate-700 font-medium text-sm">
                        Meal Type Name
                      </Label>
                      <Input
                        type="text"
                        value={mealTypeEdit.name}
                        onChange={(e) => setMealTypeEditsForBulk(prev => prev.map((item, itemIndex) => (
                          itemIndex === index ? { ...item, name: e.target.value } : item
                        )))}
                        placeholder="Meal type name"
                        className="h-8 text-xs bg-white border-gray-300 focus:border-slate-500 focus:ring-slate-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-slate-700 font-medium text-sm">
                        Time
                      </Label>
                      <Input
                        type="time"
                        value={to24HourForInput(mealTypeEdit.time)}
                        onChange={(e) => {
                          const val12h = e.target.value ? normalizeTo12Hour(e.target.value) || e.target.value : '';
                          setMealTypeEditsForBulk(prev => prev.map((item, itemIndex) => (
                            itemIndex === index ? { ...item, time: val12h } : item
                          )));
                        }}
                        className="h-8 text-xs bg-white border-gray-300 focus:border-slate-500 focus:ring-slate-500"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Apply Defaults Button */}
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                <Button
                  variant="outline"
                  onClick={applyDefaultMealTimes}
                  className="w-full h-9 text-xs border-blue-300 bg-white hover:bg-blue-50 text-blue-700 font-medium"
                >
                  📋 Apply Default Times
                </Button>
                <p className="text-xs text-blue-600 mt-2 text-center">
                  {DEFAULT_MEAL_TYPES_LIST.map(m => `${m.name}: ${m.time}`).join(', ')}
                </p>
              </div>
            </div>
            <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-white">
              <Button variant="outline" onClick={() => setBulkTimeEditorOpen(false)} className="border-gray-300 hover:bg-slate-50 font-medium">
                Cancel
              </Button>
              <Button
                onClick={handleBulkTimeUpdate}
                style={{ backgroundColor: '#00A63E', color: 'white' }}
                className="hover:opacity-90 shadow font-medium"
              >
                Update Meal Types
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Find & Replace Dialog */}
        <Dialog open={findReplaceDialogOpen} onOpenChange={(open) => { if (!open) resetFindReplaceDialog(); else setFindReplaceDialogOpen(true); }}>
          <DialogContent className="sm:max-w-2xl border-gray-300 shadow-xl max-h-[90vh] overflow-y-auto" style={{ zIndex: 210 }}>
            <DialogHeader>
              <DialogTitle className="text-slate-900 font-semibold">Find & Replace/Delete Foods</DialogTitle>
              <DialogDescription className="text-slate-600">
                Find a food by name or recipe and replace or delete it across selected days and meal types.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Find Section */}
              <div className="space-y-3 p-3 border rounded-lg bg-slate-50">
                <Label className="text-slate-900 font-semibold text-sm">🔍 Find Food / Recipe</Label>

                {/* Searchable input with dropdown */}
                <div className="relative">
                  <Input
                    value={findSearchFilter}
                    onChange={e => {
                      setFindSearchFilter(e.target.value);
                      setShowFindDropdown(true);
                      // Clear selected value when typing
                      if (findFoodTarget || findRecipeSearch) {
                        setFindFoodTarget('');
                        setFindRecipeSearch('');
                        setFindRecipeId('');
                      }
                    }}
                    onFocus={() => setShowFindDropdown(true)}
                    placeholder="Search recipe or food name..."
                    className="h-10 text-sm bg-white border-gray-300"
                  />

                  {/* Dropdown with filtered results */}
                  {showFindDropdown && findSearchFilter && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto" onScroll={handleFindDropdownScroll}>
                      {/* Existing foods in plan */}
                      {exactPlanFoodsForFind.length > 0 && (
                        <div className="p-2 bg-gray-50 border-b">
                          <span className="text-[10px] font-semibold text-gray-500 uppercase">Foods in Current Plan - Exact Matches</span>
                        </div>
                      )}
                      {exactPlanFoodsForFind.map(f => (
                        <div
                          key={`find-food-${f}`}
                          className="px-3 py-2 hover:bg-emerald-50 cursor-pointer text-sm border-b border-gray-100"
                          onClick={() => {
                            setFindFoodTarget(f);
                            setFindSearchFilter(f);
                            setFindRecipeSearch('');
                            setFindRecipeId('');
                            setManualFindFoodName('');
                            setShowFindDropdown(false);
                          }}
                        >
                          <span className="text-emerald-700">📋</span> {f}
                        </div>
                      ))
                      }

                      {similarPlanFoodsForFind.length > 0 && (
                        <div className="p-2 bg-gray-50 border-b">
                          <span className="text-[10px] font-semibold text-gray-500 uppercase">Foods in Current Plan - Similar Matches</span>
                        </div>
                      )}
                      {similarPlanFoodsForFind.map(f => (
                        <div
                          key={`find-food-similar-${f}`}
                          className="px-3 py-2 hover:bg-emerald-50 cursor-pointer text-sm border-b border-gray-100"
                          onClick={() => {
                            setFindFoodTarget(f);
                            setFindSearchFilter(f);
                            setFindRecipeSearch('');
                            setFindRecipeId('');
                            setManualFindFoodName('');
                            setShowFindDropdown(false);
                          }}
                        >
                          <span className="text-emerald-700">📋</span> {f}
                        </div>
                      ))}

                      {/* Recipes from database */}
                      {exactRecipeResultsForFind.length > 0 && (
                        <div className="p-2 bg-gray-50 border-b">
                          <span className="text-[10px] font-semibold text-gray-500 uppercase">Recipes Database - Exact Matches</span>
                        </div>
                      )}
                      {exactRecipeResultsForFind.map(r => (
                        <div
                          key={`find-recipe-${r._id}`}
                          className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100"
                          onClick={() => {
                            setFindRecipeSearch(r.name);
                            setFindRecipeId(r._id);
                            setFindSearchFilter(r.name);
                            setFindFoodTarget('');
                            setManualFindFoodName('');
                            setShowFindDropdown(false);
                          }}
                        >
                          <span className="text-blue-600">🍽️</span> {r.name}
                        </div>
                      ))
                      }

                      {similarRecipeResultsForFind.length > 0 && (
                        <div className="p-2 bg-gray-50 border-b">
                          <span className="text-[10px] font-semibold text-gray-500 uppercase">Recipes Database - Similar Matches</span>
                        </div>
                      )}
                      {similarRecipeResultsForFind.map(r => (
                        <div
                          key={`find-recipe-similar-${r._id}`}
                          className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100"
                          onClick={() => {
                            setFindRecipeSearch(r.name);
                            setFindRecipeId(r._id);
                            setFindSearchFilter(r.name);
                            setFindFoodTarget('');
                            setManualFindFoodName('');
                            setShowFindDropdown(false);
                          }}
                        >
                          <span className="text-blue-600">🍽️</span> {r.name}
                        </div>
                      ))}

                      {findRecipesLoading && (
                        <div className="px-3 py-3 text-sm text-gray-500 text-center border-b border-gray-100">
                          Searching recipes...
                        </div>
                      )}

                      {!findRecipesLoading && findHasMoreRecipes && (
                        <div className="px-3 py-2 text-[11px] text-gray-500 text-center border-b border-gray-100">
                          Scroll to load more results
                        </div>
                      )}

                      {/* No results */}
                      {!findRecipesLoading && matchedPlanFoodsForFind.length === 0 && findRecipeResults.length === 0 && (
                        <div className="px-3 py-3 text-sm text-gray-500 text-center">
                          No matching foods or recipes found
                        </div>
                      )}

                      {/* Use as manual entry option */}
                      <div
                        className="px-3 py-2 hover:bg-yellow-50 cursor-pointer text-sm bg-yellow-25 border-t"
                        onClick={() => {
                          setManualFindFoodName(findSearchFilter);
                          setFindFoodTarget('');
                          setFindRecipeSearch('');
                          setFindRecipeId('');
                          setShowFindDropdown(false);
                        }}
                      >
                        <span className="text-yellow-600">✏️</span> Use "{findSearchFilter}" as search term
                      </div>
                    </div>
                  )}
                </div>

                {/* Show selected find value */}
                {(findFoodTarget || findRecipeSearch || manualFindFoodName) && (
                  <div className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200 flex items-center justify-between">
                    <span><strong>Finding:</strong> {findFoodTarget || findRecipeSearch || manualFindFoodName}</span>
                    <button
                      onClick={() => {
                        setFindFoodTarget('');
                        setFindRecipeSearch('');
                        setFindRecipeId('');
                        setManualFindFoodName('');
                        setFindSearchFilter('');
                      }}
                      className="text-red-500 hover:text-red-700 ml-2"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Action Selection */}
              <div className="space-y-2">
                <Label className="text-slate-900 font-semibold text-sm">Action</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="replaceAction"
                      checked={replaceAction === 'replace'}
                      onChange={() => setReplaceAction('replace')}
                      className="w-4 h-4 text-emerald-600"
                    />
                    <span className="text-sm font-medium">Replace with another food</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="replaceAction"
                      checked={replaceAction === 'delete'}
                      onChange={() => setReplaceAction('delete')}
                      className="w-4 h-4 text-red-600"
                    />
                    <span className="text-sm font-medium text-red-600">Delete found items</span>
                  </label>
                </div>
              </div>

              {/* Replace Section - Only show if action is replace */}
              {replaceAction === 'replace' && (
                <div className="space-y-3 p-3 border rounded-lg bg-blue-50">
                  <Label className="text-slate-900 font-semibold text-sm">🔄 Replace With</Label>

                  {/* Searchable input with dropdown */}
                  <div className="relative">
                    <Input
                      value={replaceSearchFilter}
                      onChange={e => {
                        setReplaceSearchFilter(e.target.value);
                        setShowReplaceDropdown(true);
                        // Clear selected value when typing
                        if (replaceRecipeSearch || replaceFoodValue) {
                          setReplaceRecipeSearch('');
                          setReplaceRecipeId('');
                          setReplaceFoodValue('');
                          setReplaceRecipeNutrition(null);
                        }
                      }}
                      onFocus={() => setShowReplaceDropdown(true)}
                      placeholder="Search recipe to replace with..."
                      className="h-10 text-sm bg-white border-gray-300"
                    />

                    {/* Dropdown with filtered results */}
                    {showReplaceDropdown && replaceSearchFilter && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto" onScroll={handleReplaceDropdownScroll}>
                        {/* Recipes from database */}
                        {exactRecipeResultsForReplace.length > 0 && (
                          <div className="p-2 bg-gray-50 border-b">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase">Recipes Database - Exact Matches</span>
                          </div>
                        )}
                        {exactRecipeResultsForReplace.map(r => (
                          <div
                            key={`replace-recipe-${r._id}`}
                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100"
                            onClick={() => {
                              setReplaceRecipeSearch(r.name);
                              setReplaceRecipeId(r._id);
                              setReplaceSearchFilter(r.name);
                              setReplaceFoodValue('');
                              // Store nutrition data from selected recipe
                              if (r.nutrition) {
                                const servingsStr = typeof r.servings === 'number' ? `${r.servings} serving` : (r.servings || '1 serving');
                                setReplaceRecipeNutrition({
                                  cal: String(r.nutrition.calories || 0),
                                  protein: String(r.nutrition.protein || 0),
                                  carbs: String(r.nutrition.carbs || 0),
                                  fats: String(r.nutrition.fat || 0),
                                  unit: servingsStr
                                });
                              } else {
                                setReplaceRecipeNutrition(null);
                              }
                              setShowReplaceDropdown(false);
                            }}
                          >
                            <span className="text-blue-600">🍽️</span> {r.name}
                            {r.nutrition && (
                              <span className="text-[10px] text-gray-400 ml-2">
                                ({r.nutrition.calories} cal)
                              </span>
                            )}
                          </div>
                        ))
                        }

                        {similarRecipeResultsForReplace.length > 0 && (
                          <div className="p-2 bg-gray-50 border-b">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase">Recipes Database - Similar Matches</span>
                          </div>
                        )}
                        {similarRecipeResultsForReplace.map(r => (
                          <div
                            key={`replace-recipe-similar-${r._id}`}
                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100"
                            onClick={() => {
                              setReplaceRecipeSearch(r.name);
                              setReplaceRecipeId(r._id);
                              setReplaceSearchFilter(r.name);
                              setReplaceFoodValue('');
                              if (r.nutrition) {
                                const servingsStr = typeof r.servings === 'number' ? `${r.servings} serving` : (r.servings || '1 serving');
                                setReplaceRecipeNutrition({
                                  cal: String(r.nutrition.calories || 0),
                                  protein: String(r.nutrition.protein || 0),
                                  carbs: String(r.nutrition.carbs || 0),
                                  fats: String(r.nutrition.fat || 0),
                                  unit: servingsStr
                                });
                              } else {
                                setReplaceRecipeNutrition(null);
                              }
                              setShowReplaceDropdown(false);
                            }}
                          >
                            <span className="text-blue-600">🍽️</span> {r.name}
                            {r.nutrition && (
                              <span className="text-[10px] text-gray-400 ml-2">
                                ({r.nutrition.calories} cal)
                              </span>
                            )}
                          </div>
                        ))}

                        {replaceRecipesLoading && (
                          <div className="px-3 py-3 text-sm text-gray-500 text-center border-b border-gray-100">
                            Searching recipes...
                          </div>
                        )}

                        {!replaceRecipesLoading && replaceHasMoreRecipes && (
                          <div className="px-3 py-2 text-[11px] text-gray-500 text-center border-b border-gray-100">
                            Scroll to load more results
                          </div>
                        )}

                        {/* No results */}
                        {!replaceRecipesLoading && replaceRecipeResults.length === 0 && (
                          <div className="px-3 py-3 text-sm text-gray-500 text-center">
                            No matching recipes found
                          </div>
                        )}

                        {/* Use as manual entry option */}
                        <div
                          className="px-3 py-2 hover:bg-yellow-50 cursor-pointer text-sm bg-yellow-25 border-t"
                          onClick={() => {
                            setReplaceFoodValue(replaceSearchFilter);
                            setReplaceRecipeSearch('');
                            setReplaceRecipeId('');
                            setReplaceRecipeNutrition(null);
                            setShowReplaceDropdown(false);
                          }}
                        >
                          <span className="text-yellow-600">✏️</span> Use "{replaceSearchFilter}" as replacement
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Show selected replace value */}
                  {(replaceRecipeSearch || replaceFoodValue) && (
                    <div className="text-xs text-blue-700 bg-blue-100 p-2 rounded border border-blue-200 flex items-center justify-between">
                      <span>
                        <strong>Replacing with:</strong> {replaceRecipeSearch || replaceFoodValue}
                        {replaceRecipeNutrition && (
                          <span className="text-[10px] text-blue-500 ml-2">
                            ({replaceRecipeNutrition.cal} cal, P:{replaceRecipeNutrition.protein}g, C:{replaceRecipeNutrition.carbs}g, F:{replaceRecipeNutrition.fats}g)
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => {
                          setReplaceRecipeSearch('');
                          setReplaceRecipeId('');
                          setReplaceFoodValue('');
                          setReplaceSearchFilter('');
                          setReplaceRecipeNutrition(null);
                        }}
                        className="text-red-500 hover:text-red-700 ml-2"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Delete Warning */}
              {replaceAction === 'delete' && (
                <div className="p-3 border border-red-300 rounded-lg bg-red-50">
                  <p className="text-sm text-red-700 font-medium">⚠️ Delete Mode</p>
                  <p className="text-xs text-red-600">Found items will be permanently removed from the selected days and meal types.</p>
                </div>
              )}

              {/* Meal Types Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-900 font-semibold text-sm">Meal Types</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedMealTypesForReplace(selectedMealTypesForReplace.length === displayMealTypes.length ? [] : [...displayMealTypes])}
                    className="h-6 text-xs"
                  >
                    {selectedMealTypesForReplace.length === displayMealTypes.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2 p-3 border rounded-md bg-slate-50">
                  {displayMealTypes.map(mt => (
                    <div key={`fr-mt-${mt}`} className="flex items-center space-x-2">
                      <Checkbox
                        id={`fr-mt-${mt}`}
                        checked={selectedMealTypesForReplace.includes(mt)}
                        onCheckedChange={() => toggleReplaceMealType(mt)}
                      />
                      <Label htmlFor={`fr-mt-${mt}`} className="text-xs font-medium cursor-pointer">{mt}</Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Days Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-900 font-semibold text-sm">Select Days</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDaysForReplace(selectedDaysForReplace.length === weekPlan.length ? [] : weekPlan.map((_, i) => i))}
                    className="h-6 text-xs"
                  >
                    {selectedDaysForReplace.length === weekPlan.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2 p-3 border rounded-md bg-slate-50 max-h-40 overflow-y-auto">
                  {weekPlan.map((day, idx) => (
                    <div key={`${day.id}-${idx}`} className="flex items-center space-x-2">
                      <Checkbox
                        id={`fr-day-${idx}`}
                        checked={selectedDaysForReplace.includes(idx)}
                        onCheckedChange={() => toggleReplaceDay(idx)}
                      />
                      <Label htmlFor={`fr-day-${idx}`} className="text-xs font-medium cursor-pointer">{day.day}</Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              {selectedDaysForReplace.length > 0 && selectedMealTypesForReplace.length > 0 && (findFoodTarget || findRecipeSearch || manualFindFoodName) && (
                <div className="p-3 bg-slate-100 border rounded-md">
                  <p className="text-sm text-slate-800">
                    Will {replaceAction === 'delete' ? <span className="text-red-600 font-semibold">DELETE</span> : <span className="text-emerald-600 font-semibold">REPLACE</span>}{' '}
                    "<strong>{findFoodTarget || findRecipeSearch || manualFindFoodName}</strong>"
                    {replaceAction === 'replace' && (replaceRecipeSearch || replaceFoodValue) && (
                      <> with "<strong>{replaceRecipeSearch || replaceFoodValue}</strong>"</>
                    )}
                    {' '}in <strong>{selectedDaysForReplace.length}</strong> day(s) × <strong>{selectedMealTypesForReplace.length}</strong> meal type(s)
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={resetFindReplaceDialog} className="border-gray-300 hover:bg-slate-50 font-medium">
                Cancel
              </Button>
              <Button
                onClick={handleFindReplace}
                disabled={
                  !(findFoodTarget || manualFindFoodName.trim() || findRecipeSearch) ||
                  (replaceAction === 'replace' && !(replaceFoodValue.trim() || replaceRecipeSearch)) ||
                  selectedDaysForReplace.length === 0 ||
                  selectedMealTypesForReplace.length === 0
                }
                style={{ backgroundColor: replaceAction === 'delete' ? '#dc2626' : '#00A63E', color: 'white' }}
                className="hover:opacity-90 shadow font-medium"
              >
                {replaceAction === 'delete' ? '🗑️ Delete' : '🔄 Replace'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Food Database Panel */}
        <FoodDatabasePanel
          isOpen={foodDatabaseOpen}
          onClose={() => setFoodDatabaseOpen(false)}
          clientDietaryRestrictions={clientDietaryRestrictions}
          clientMedicalConditions={clientMedicalConditions}
          clientAllergies={clientAllergies}
          onSelectFood={(foods: FoodDatabaseItem[]) => {
            if (currentFoodContext && foods.length > 0) {
              const { dayIndex, mealType, optionIndex } = currentFoodContext;

              // Skip if day is frozen
              if (readOnly || !onUpdate || isDayFrozen(dayIndex)) return;

              const newWeekPlan = cloneWeekPlan(weekPlan);
              const meal = newWeekPlan[dayIndex].meals[mealType];

              if (meal) {
                // Check if the current option at optionIndex is empty/blank
                const currentOption = meal.foodOptions[optionIndex];
                const isCurrentOptionEmpty = currentOption &&
                  !currentOption.food?.trim() &&
                  !currentOption.cal?.trim() &&
                  !currentOption.unit?.trim();

                // Preserve the isAlternative flag from the current option
                const preserveIsAlternative = currentOption?.isAlternative || false;

                // Build new FoodOption entries for each selected food
                const newFoodOptions: FoodOption[] = foods.map((food) => ({
                  id: Math.random().toString(36).substr(2, 9),
                  label: '',
                  food: food.menu,
                  unit: food.amount,
                  cal: formatNum(food.cals),
                  carbs: formatNum(food.carbs),
                  fats: formatNum(food.fats),
                  protein: formatNum(food.protein),
                  recipeId: food.recipeId || undefined,
                  recipeUuid: food.recipeUuid || food.recipeId,
                  isAlternative: preserveIsAlternative // Preserve alternative status
                }));

                if (isCurrentOptionEmpty) {
                  // Replace the blank option with the first selected food,
                  // then insert the rest after it
                  meal.foodOptions.splice(optionIndex, 1, ...newFoodOptions);
                } else {
                  // Insert all new foods after the current option
                  meal.foodOptions.splice(optionIndex + 1, 0, ...newFoodOptions);
                }

                onUpdate(newWeekPlan);
              }
            }
          }}
        />

        {/* Notes Dialog */}
        <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
          <DialogContent className="w-[95vw] max-w-2xl sm:max-w-xl rounded-lg overflow-hidden">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl font-semibold">Day Notes</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Add notes for this day. Press Enter to create a new line.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <Textarea
                value={notesDialogValue}
                onChange={(e) => setNotesDialogValue(e.target.value)}
                placeholder="Enter your notes here... (diet notes, health observations, etc.)"
                className="min-h-48 sm:min-h-56 w-full max-w-full resize-y text-sm sm:text-base leading-relaxed whitespace-pre-wrap wrap-anywhere"
                autoFocus
              />
              <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm text-muted-foreground bg-slate-50 dark:bg-slate-900 p-3 rounded-md">
                <span className="text-blue-500">ℹ️</span>
                <span className="wrap-break-word">You can resize the text area by dragging the bottom corner. Your notes will be saved with this day's plan.</span>
              </div>
            </div>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setNotesDialogOpen(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (notesDialogDayIndex !== null) {
                    updateDayInfo(notesDialogDayIndex, 'note', notesDialogValue);
                  }
                  setNotesDialogOpen(false);
                }}
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
              >
                Save Notes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Meal Note Dialog */}
        <Dialog open={mealNoteDialogOpen} onOpenChange={setMealNoteDialogOpen}>
          <DialogContent className="w-[95vw] max-w-md rounded-lg overflow-hidden">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl font-semibold">Meal Note</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Add note for this meal option. Press Enter to create a new line.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <Textarea
                value={mealNoteDialogValue}
                onChange={(e) => setMealNoteDialogValue(e.target.value)}
                placeholder="Enter meal note..."
                className="min-h-24 sm:min-h-28 max-h-44 w-full max-w-full resize-y px-2.5 py-2 text-xs sm:text-sm leading-snug whitespace-pre-wrap wrap-anywhere overflow-y-auto"
                autoFocus
              />
            </div>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setMealNoteDialogOpen(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={saveMealNote}
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
              >
                Save Note
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove Meal Type Confirmation Dialog */}
        <Dialog open={removeMealTypeDialogOpen} onOpenChange={setRemoveMealTypeDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="w-5 h-5" />
                Delete Meal Type
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the entire <strong>{mealTypeToRemove}</strong> row?
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">
                  <strong>⚠️ Warning:</strong> This will remove <strong>{mealTypeToRemove}</strong> from <strong>ALL days</strong> in this diet plan. This action cannot be undone.
                </p>
              </div>
            </div>
            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setRemoveMealTypeDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (mealTypeToRemove && onRemoveMealType) {
                    onRemoveMealType(mealTypeToRemove);
                    setRemoveMealTypeDialogOpen(false);
                    setMealTypeToRemove(null);
                  }
                }}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Row
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}