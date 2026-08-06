'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from '@/contexts/ThemeContext';
import { useRealtime } from '@/hooks/useRealtime';
import {
  Clock,
  Check,
  ChevronRight,
  BookOpen,
  X,
  Tag,
  ArrowLeft,
  RefreshCw,
  Camera,
  Upload,
  ImageIcon,
  Loader2,
  CalendarDays
} from 'lucide-react';
import { format, addDays, startOfWeek, isToday, isSameDay } from 'date-fns';

import SpoonGifLoader from '@/components/ui/SpoonGifLoader';
import MealCompletionCelebration from '@/components/engagement/MealCompletionCelebration';
import { toast } from 'sonner';
import { MEAL_TYPES, type MealTypeKey } from '@/lib/mealConfig';
import { compressImage, validateImageFile } from '@/lib/imageCompression';
import { uploadFileReliably } from '@/lib/client-upload';

interface MealItem {
  id: string;
  name: string;
  portion: string;
  calories: number;
  notes?: string;
  alternatives?: { name: string; portion: string; calories: number }[];
  isAlternative?: boolean; // Flag for alternative food items
  recipe?: {
    ingredients: string[];
    instructions: string[];
    prepTime?: string;
    cookTime?: string;
    servings?: string | number;
    difficulty?: string;
    cuisine?: string;
    tips?: string[];
    nutrition?: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      sugar?: number;
      sodium?: number;
    };
    image?: string;
    equipment?: string[];
    storage?: {
      refrigerator?: string;
      freezer?: string;
      instructions?: string;
    };
    dietaryRestrictions?: string[];
    allergens?: string[];
  };
  recipeId?: string;
  tags?: string[];
  protein?: number;
  carbs?: number;
  fats?: number;
}

interface Meal {
  id: string;
  type: string; // Can be default types or custom meal types
  time: string;
  totalCalories: number;
  items: MealItem[];
  isCompleted: boolean;
  notes?: string;
}

interface DayPlan {
  date: Date;
  meals: Meal[];
  mealTypes?: Array<{ name: string; time: string }>; // Dietitian's custom meal types
  totalCalories: number;
  hasPlan: boolean;
  dailyNote?: string;
  isFrozen?: boolean;
  freezeInfo?: {
    date: string;
    addedDate?: string | null;
    reason: string;
    frozenAt: string;
  } | null;
  planDetails?: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
  };
}

interface PlanDateWindow {
  startDate: string;
  endDate: string;
}

interface RecipeModalData {
  item: MealItem;
  isOpen: boolean;
}

interface FullRecipeData {
  _id: string;
  name: string;
  description?: string;
  ingredients: { name: string; quantity: number; unit: string; remarks?: string }[];
  instructions: string[];
  prepTime?: number;
  cookTime?: number;
  servings?: string | number;
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar?: number;
    sodium?: number;
  };
  tags?: string[];
  dietaryRestrictions?: string[];
  medicalContraindications?: string[];
  image?: string;
  difficulty?: string;
  cuisine?: string;
  tips?: string[];
  equipment?: string[];
  storage?: {
    refrigerator?: string;
    freezer?: string;
    instructions?: string;
  };
  createdBy?: {
    firstName: string;
    lastName: string;
  };
}

interface CompletionModalData {
  meal: Meal | null;
  isOpen: boolean;
}

interface FoodItemSelectorModalData {
  meal: Meal | null;
  isOpen: boolean;
}

interface MealDeepLinkRequest {
  date: string;
  mealId: string;
  mealType: string;
}

// Default meal slots using canonical mealConfig - single source of truth for times
const MEAL_TYPE_TO_CAMELCASE: Record<MealTypeKey, string> = {
  'EARLY_MORNING': 'earlyMorning',
  'BREAKFAST': 'breakfast',
  'MID_MORNING': 'midMorning',
  'LUNCH': 'lunch',
  'MID_EVENING': 'midEvening',
  'EVENING': 'evening',
  'DINNER': 'dinner',
  'PAST_DINNER': 'pastDinner',
};

const DEFAULT_MEAL_SLOTS: { type: string; time: string; label: string }[] = (
  Object.keys(MEAL_TYPES) as MealTypeKey[]
).map((key) => ({
  type: MEAL_TYPE_TO_CAMELCASE[key],
  time: MEAL_TYPES[key].time12h,
  label: MEAL_TYPES[key].label,
}));

// Map for normalizing legacy/variant meal type names to canonical camelCase keys
const LEGACY_TYPE_MAP: Record<string, string> = {
  'morningsnack': 'midMorning',
  'morningSnack': 'midMorning',
  'morning_snack': 'midMorning',
  'afternoonsnack': 'midEvening',
  'afternoonSnack': 'midEvening',
  'afternoon_snack': 'midEvening',
  'eveningsnack': 'evening',
  'eveningSnack': 'evening',
  'evening_snack': 'evening',
  'postdinner': 'pastDinner',
  'postDinner': 'pastDinner',
  'post_dinner': 'pastDinner',
  'pastdinner': 'pastDinner',
  'bedtime': 'pastDinner',
  'snack': 'midEvening',
};

// Helper function to format notes with period as line break
function formatNotesWithLineBreaks(note: string): string[] {
  if (!note) return [];
  // Split by period and filter out empty strings
  return note.split('.').map(s => s.trim()).filter(s => s.length > 0);
}

// Format numbers to max 2 decimal places, removing trailing zeros
const formatNum = (val: number | string | undefined | null): string => {
  const num = Number(val);
  if (isNaN(num)) return '0';
  return parseFloat(num.toFixed(2)).toString();
};

export default function UserPlanPage() {
  const { data: session, status } = useSession();
  const { isDarkMode } = useTheme();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekDates, setWeekDates] = useState<Date[]>([]);
  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);
  const [planDateWindow, setPlanDateWindow] = useState<PlanDateWindow | null>(null);
  const [loading, setLoading] = useState(true);
  const [isChangingDate, setIsChangingDate] = useState(false); // For skeleton loader on date change
  const [completingMeal, setCompletingMeal] = useState<string | null>(null);
  const [recipeModal, setRecipeModal] = useState<RecipeModalData>({ item: {} as MealItem, isOpen: false });
  const [fullRecipeData, setFullRecipeData] = useState<FullRecipeData | null>(null);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [alternativesModal, setAlternativesModal] = useState<{ item: MealItem; isOpen: boolean }>({ item: {} as MealItem, isOpen: false });
  const [foodSelectorModal, setFoodSelectorModal] = useState<FoodItemSelectorModalData>({ meal: null, isOpen: false });
  const [refreshing, setRefreshing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState('');
  const dateScrollRef = useRef<HTMLDivElement>(null);

  // Cache for meal plans - key: date string, value: DayPlan
  const mealPlanCache = useRef<Map<string, DayPlan>>(new Map());

  // Completion modal state
  const [completionModal, setCompletionModal] = useState<CompletionModalData>({ meal: null, isOpen: false });
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionImage, setCompletionImage] = useState<File | null>(null);
  const [completionImagePreview, setCompletionImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deepLinkHandledRef = useRef(false);
  const [deepLinkRequest, setDeepLinkRequest] = useState<MealDeepLinkRequest | null>(null);
  const [celebration, setCelebration] = useState({ open: false, mealLabel: '' });
  const closeCelebration = useCallback(() => {
    setCelebration((current) => ({ ...current, open: false }));
  }, []);

  useEffect(() => {
    // Generate dates: today at START (index 0) + 30 future days + 15 previous days at end (for scrolling back)
    const today = new Date();
    const dates: Date[] = [];

    // Add today first (index 0) - will be at START
    dates.push(today);
    // Add 30 future days
    for (let i = 1; i <= 30; i++) {
      dates.push(addDays(today, i));
    }
    // Add 15 previous days at the end (user can scroll right to see them)
    for (let i = 1; i <= 15; i++) {
      dates.unshift(addDays(today, -i));
    }

    const params = new URLSearchParams(window.location.search);
    const deepLinkDate = params.get('date') || '';
    const isCameraDeepLink = params.get('action') === 'camera';
    const initialDate = isCameraDeepLink && /^\d{4}-\d{2}-\d{2}$/.test(deepLinkDate)
      ? new Date(`${deepLinkDate}T00:00:00`)
      : today;

    if (isCameraDeepLink) {
      setDeepLinkRequest({
        date: deepLinkDate || format(today, 'yyyy-MM-dd'),
        mealId: params.get('mealId') || '',
        mealType: params.get('mealType') || '',
      });
    }

    setWeekDates(dates);
    setSelectedDate(initialDate);
    setDatePickerValue(format(initialDate, 'yyyy-MM-dd'));
    fetchDayPlan(initialDate, true);

    // Pre-fetch next 3 days and previous 3 days for faster navigation
    setTimeout(() => {
      [-3, -2, -1, 1, 2, 3].forEach(offset => {
        const prefetchDate = addDays(initialDate, offset);
        prefetchDayPlan(prefetchDate);
      });
    }, 500);
  }, []);

  // Scroll to today's date when dates are loaded - today is at index 15
  useEffect(() => {
    if (weekDates.length > 0 && dateScrollRef.current) {
      setTimeout(() => {
        if (dateScrollRef.current) {
          // Find the index of today in weekDates
          const today = new Date();
          const todayIndex = weekDates.findIndex(date =>
            date.getFullYear() === today.getFullYear() &&
            date.getMonth() === today.getMonth() &&
            date.getDate() === today.getDate()
          );
          if (todayIndex !== -1) {
            const buttonWidth = 58; // Approximate width of each date button
            dateScrollRef.current.scrollLeft = todayIndex * buttonWidth;
          }
        }
      }, 50);
    }
  }, [weekDates, selectedDate]);

  useEffect(() => {
    fetchDayPlan(selectedDate, false);

    // Pre-fetch adjacent days when date changes
    setTimeout(() => {
      [-1, 1].forEach(offset => {
        prefetchDayPlan(addDays(selectedDate, offset));
      });
    }, 100);
  }, [selectedDate]);

  // Load current/upcoming meal plan date window for empty-state guidance.
  useEffect(() => {
    const fetchPlanDateWindow = async () => {
      try {
        const res = await fetch('/api/client/service-plans', { cache: 'no-store' });
        if (!res.ok) return;

        const data = await res.json();

        // Prefer explicit upcoming/ongoing meal-plan dates from purchase payload when available.
        const firstPurchaseWithMealPlan = Array.isArray(data?.activePurchases)
          ? data.activePurchases.find((purchase: any) =>
            purchase?.mealPlanCreated &&
            purchase?.ongoingMealPlanStartDate &&
            purchase?.ongoingMealPlanEndDate
          )
          : null;

        if (firstPurchaseWithMealPlan) {
          setPlanDateWindow({
            startDate: firstPurchaseWithMealPlan.ongoingMealPlanStartDate,
            endDate: firstPurchaseWithMealPlan.ongoingMealPlanEndDate,
          });
          return;
        }

        const firstPurchaseExpectedWindow = Array.isArray(data?.activePurchases)
          ? data.activePurchases.find((purchase: any) =>
            purchase?.expectedStartDate && purchase?.expectedEndDate
          )
          : null;

        if (firstPurchaseExpectedWindow) {
          setPlanDateWindow({
            startDate: firstPurchaseExpectedWindow.expectedStartDate,
            endDate: firstPurchaseExpectedWindow.expectedEndDate,
          });
          return;
        }

        const current = data?.currentMealPlan;
        if (current?.startDate && current?.endDate) {
          setPlanDateWindow({
            startDate: current.startDate,
            endDate: current.endDate,
          });
          return;
        }

        const firstActive = Array.isArray(data?.activePurchases) ? data.activePurchases[0] : null;
        if (firstActive?.startDate && firstActive?.endDate) {
          setPlanDateWindow({
            startDate: firstActive.startDate,
            endDate: firstActive.endDate,
          });
        }
      } catch {
        // Silent fail; empty state still renders without the helper line.
      }
    };

    fetchPlanDateWindow();
  }, []);

  // Auto-refresh on visibility change and focus (when user comes back to tab/window)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Clear cache to force fresh data
        const dateKey = format(selectedDate, 'yyyy-MM-dd');
        mealPlanCache.current.delete(dateKey);
        fetchDayPlan(selectedDate, false);
      }
    };

    const handleFocus = () => {
      // Clear cache to force fresh data
      const dateKey = format(selectedDate, 'yyyy-MM-dd');
      mealPlanCache.current.delete(dateKey);
      fetchDayPlan(selectedDate, false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [selectedDate]);

  // Real-time sync: Listen for meal plan updates from dietitian dashboard
  const handleRealtimeMessage = useCallback((event: any) => {
    if (event.type === 'meal_plan_updated' || event.type === 'meal_completion_updated') {
      // Clear cache and refetch current date to get updated data
      const dateKey = format(selectedDate, 'yyyy-MM-dd');
      mealPlanCache.current.delete(dateKey);
      fetchDayPlan(selectedDate, false);
    }
  }, [selectedDate]);

  useRealtime({ onMessage: handleRealtimeMessage });

  // Prevent body scroll when any modal is open
  useEffect(() => {
    if (recipeModal.isOpen || alternativesModal.isOpen || completionModal.isOpen || showDatePicker || foodSelectorModal.isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [recipeModal.isOpen, alternativesModal.isOpen, completionModal.isOpen, showDatePicker, foodSelectorModal.isOpen]);

  // Fetch full recipe details when recipe modal opens
  useEffect(() => {
    const fetchFullRecipe = async () => {
      if (!recipeModal.isOpen || !recipeModal.item.name) {
        setFullRecipeData(null);
        return;
      }

      // Skip fetch if the item already has recipe data from the API enrichment
      if (recipeModal.item.recipe?.ingredients && recipeModal.item.recipe.ingredients.length > 0) {
        setFullRecipeData(null);
        setLoadingRecipe(false);
        return;
      }

      setLoadingRecipe(true);
      try {
        let recipeData = null;

        // First try to fetch by recipeId if available
        if (recipeModal.item.recipeId) {
          const response = await fetch(`/api/recipes/${recipeModal.item.recipeId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.recipe) {
              recipeData = data.recipe;
            }
          }
        }

        // If no recipeId or fetch failed, search by food name (exact match only)
        if (!recipeData && recipeModal.item.name) {
          const searchName = encodeURIComponent(recipeModal.item.name.trim());
          const searchResponse = await fetch(`/api/recipes?search=${searchName}&limit=5`);
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.success && searchData.recipes && searchData.recipes.length > 0) {
              // Only use an exact name match — never fall back to a partial/fuzzy result
              const exactMatch = searchData.recipes.find(
                (r: any) => r.name.toLowerCase() === recipeModal.item.name.toLowerCase()
              );
              recipeData = exactMatch || null;
            }
          }
        }

        if (recipeData) {
          setFullRecipeData(recipeData);
        }
      } catch (error) {
        console.error('Error fetching recipe:', error);
      } finally {
        setLoadingRecipe(false);
      }
    };

    fetchFullRecipe();
  }, [recipeModal.isOpen, recipeModal.item.recipeId, recipeModal.item.name]);

  // Function to open recipe modal with item
  const openRecipeModal = (item: MealItem) => {
    setFullRecipeData(null);
    setRecipeModal({ item, isOpen: true });
  };

  // Function to close recipe modal
  const closeRecipeModal = () => {
    setRecipeModal({ item: {} as MealItem, isOpen: false });
    setFullRecipeData(null);
  };

  // Handle date picker selection
  const handleDatePickerSelect = () => {
    if (datePickerValue) {
      const selected = new Date(datePickerValue + 'T00:00:00');
      setSelectedDate(selected);
      setShowDatePicker(false);
    }
  };

  // Pre-fetch meal plan without updating UI (for caching)
  const prefetchDayPlan = async (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');

    // Skip if already in cache
    if (mealPlanCache.current.has(dateKey)) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout for prefetch

      const response = await fetch(`/api/client/meal-plan?date=${dateKey}`, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const plan: DayPlan = data.success && data.hasPlan
          ? {
            date: new Date(data.date),
            meals: data.meals || [],
            mealTypes: data.mealTypes || [],
            totalCalories: data.totalCalories || 0,
            hasPlan: true,
            planDetails: data.planDetails
          }
          : {
            date: date,
            meals: [],
            mealTypes: [],
            totalCalories: 0,
            hasPlan: false
          };
        mealPlanCache.current.set(dateKey, plan);
      }
    } catch (error) {
      // Silently fail for pre-fetch - these are background requests
      if (error instanceof Error && error.name !== 'AbortError') {
        console.debug(`Prefetch failed for ${dateKey}:`, error.message);
      }
    }
  };

  const fetchDayPlan = async (date: Date, isInitialLoad = false) => {
    const dateKey = format(date, 'yyyy-MM-dd');

    // Check cache first - instant load!
    if (mealPlanCache.current.has(dateKey)) {
      setDayPlan(mealPlanCache.current.get(dateKey)!);
      if (isInitialLoad) setLoading(false);
      return;
    }

    // Show skeleton for date changes, full loader for initial
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setIsChangingDate(true);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(`/api/client/meal-plan?date=${dateKey}`, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();

        const plan: DayPlan = data.success && data.hasPlan
          ? {
            date: new Date(data.date),
            meals: data.meals || [],
            mealTypes: data.mealTypes || [],
            totalCalories: data.totalCalories || 0,
            hasPlan: true,
            dailyNote: data.dailyNote || '',
            isFrozen: data.isFrozen || false,
            freezeInfo: data.freezeInfo || null,
            planDetails: data.planDetails
          }
          : {
            date: date,
            meals: [],
            mealTypes: [],
            totalCalories: 0,
            hasPlan: false,
            dailyNote: '',
            isFrozen: false,
            freezeInfo: null
          };

        // Cache the result
        mealPlanCache.current.set(dateKey, plan);
        setDayPlan(plan);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`API Error: ${response.status}`, errorData);

        const noplan: DayPlan = {
          date: date,
          meals: [],
          totalCalories: 0,
          hasPlan: false,
          dailyNote: ''
        };
        mealPlanCache.current.set(dateKey, noplan);
        setDayPlan(noplan);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      console.error('Error fetching meal plan:', error);

      // More detailed error logging
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch')) {
          console.error('Network error - failed to reach API server');
        } else {
          console.error('Fetch error:', error.message);
        }
      }

      setDayPlan({
        date: date,
        meals: [],
        totalCalories: 0,
        hasPlan: false,
        dailyNote: ''
      });
    } finally {
      setLoading(false);
      setIsChangingDate(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    // Clear cache for current date to force refresh
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    mealPlanCache.current.delete(dateKey);
    await fetchDayPlan(selectedDate, false);
    setRefreshing(false);
    toast.success('Meal plan refreshed');
  };

  // Open completion modal
  const openCompletionModal = (meal: Meal) => {
    setCompletionModal({ meal, isOpen: true });
    setCompletionNotes('');
    setCompletionImage(null);
    setCompletionImagePreview(null);
  };

  // Close completion modal
  const closeCompletionModal = () => {
    setCompletionModal({ meal: null, isOpen: false });
    setCompletionNotes('');
    setCompletionImage(null);
    setCompletionImagePreview(null);
    setIsProcessingImage(false);
  };

  // Optimistically update completion state for instant UI feedback
  const updateMealCompletionLocally = (mealId: string, isCompleted: boolean) => {
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    setDayPlan((prev) => {
      if (!prev) return prev;

      const updated: DayPlan = {
        ...prev,
        meals: prev.meals.map((meal) =>
          meal.id === mealId ? { ...meal, isCompleted } : meal
        ),
      };

      mealPlanCache.current.set(dateKey, updated);
      return updated;
    });
  };

  // Handle image selection
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file, 15);
    if (!validation.valid) {
      toast.error(validation.error || 'Invalid image file');
      return;
    }

    setIsProcessingImage(true);
    try {
      // Client-side compression to reduce upload payload and submission time
      const { blob } = await compressImage(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.78,
        format: 'image/jpeg',
      });

      const compressedFile = new File(
        [blob],
        file.name.replace(/\.[^.]+$/, '.jpg'),
        { type: 'image/jpeg' }
      );

      setCompletionImage(compressedFile);
      if (completionImagePreview?.startsWith('blob:')) URL.revokeObjectURL(completionImagePreview);
      setCompletionImagePreview(URL.createObjectURL(compressedFile));
    } catch (error) {
      // Fallback to original file if compression fails
      console.error('Image compression failed, using original file:', error);
      setCompletionImage(file);
      if (completionImagePreview?.startsWith('blob:')) URL.revokeObjectURL(completionImagePreview);
      setCompletionImagePreview(URL.createObjectURL(file));
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Submit meal completion with image
  const handleSubmitCompletion = async () => {
    if (!completionModal.meal) return;

    if (!completionImage) {
      toast.error('Please add a photo of your meal');
      return;
    }

    if (isProcessingImage) {
      toast.info('Please wait, processing image...');
      return;
    }

    const mealId = completionModal.meal.id;
    const mealType = completionModal.meal.type;
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const previousIsCompleted = dayPlan?.meals.find((m) => m.id === mealId)?.isCompleted ?? false;

    // Use flushSync to force immediate DOM update - ensures "Done" mark appears instantly
    flushSync(() => {
      setIsSubmitting(true);
      // Optimistic UI update for real-time feedback - update BEFORE modal closes for instant visibility
      updateMealCompletionLocally(mealId, true);
      closeCompletionModal();
    });

    try {
      const uploadedImage = await uploadFileReliably(completionImage, 'progress');

      const response = await fetch('/api/client/meal-plan/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealId,
          date: format(selectedDate, 'yyyy-MM-dd'),
          mealType,
          notes: completionNotes,
          imageUrl: uploadedImage.url,
          imagePathname: uploadedImage.pathname,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      if (response.ok) {
        // Clear cache so next navigation/refresh gets fresh data
        mealPlanCache.current.delete(dateKey);

        // Emit events to notify other components about the change
        window.dispatchEvent(new CustomEvent('meal-plan-updated', {
          detail: { mealId, date: dateKey }
        }));
        window.dispatchEvent(new CustomEvent('user-data-changed', {
          detail: { dataType: 'meal' }
        }));
        setCelebration({
          open: true,
          mealLabel: getMealLabel(mealType),
        });
        toast.success('Meal completed — fantastic work!');
      } else {
        const data = await response.json();
        // Revert optimistic update on failure
        updateMealCompletionLocally(mealId, previousIsCompleted);
        toast.error(data.error || 'Failed to mark meal as complete');
      }
    } catch (error) {
      // Revert optimistic update on failure
      updateMealCompletionLocally(mealId, previousIsCompleted);
      console.error('Error completing meal:', error);
      toast.error('Error completing meal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkComplete = async (mealId: string) => {
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const previousIsCompleted = dayPlan?.meals.find((m) => m.id === mealId)?.isCompleted ?? false;

    // Use flushSync to force immediate DOM update - ensures "Done" mark appears instantly
    flushSync(() => {
      setCompletingMeal(mealId);
      // Optimistic update for instant UX
      updateMealCompletionLocally(mealId, true);
    });

    // Show immediate toast confirmation
    toast.success('Meal marked as complete!');

    try {
      const response = await fetch('/api/client/meal-plan/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealId,
          date: format(selectedDate, 'yyyy-MM-dd'),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
      });
      if (response.ok) {
        // Clear cache so next navigation/refresh gets fresh data
        mealPlanCache.current.delete(dateKey);

        // Emit events to notify other components about the change
        window.dispatchEvent(new CustomEvent('meal-plan-updated', {
          detail: { mealId, date: dateKey }
        }));
        window.dispatchEvent(new CustomEvent('user-data-changed', {
          detail: { dataType: 'meal' }
        }));
      } else {
        updateMealCompletionLocally(mealId, previousIsCompleted);
        toast.error('Failed to mark meal as complete');
      }
    } catch (error) {
      updateMealCompletionLocally(mealId, previousIsCompleted);
      console.error('Error completing meal:', error);
      toast.error('Error completing meal');
    } finally {
      setCompletingMeal(null);
    }
  };

  const getMealIcon = (type: string) => {
    switch (type) {
      case 'earlyMorning': return '🌅';
      case 'breakfast': return '🍳';
      case 'midMorning': return '🍎';
      case 'lunch': return '☀️';
      case 'midEvening': return '🥜';
      case 'evening': return '🍵';
      case 'dinner': return '🌙';
      case 'pastDinner': return '🌛';
      // Legacy types for backward compatibility
      case 'morningSnack': return '🍎';
      case 'afternoonSnack': return '🥜';
      case 'eveningSnack': return '🍵';
      default: return '🍽️';
    }
  };

  const getMealLabel = (type: string) => {
    // Check default meal types first
    switch (type) {
      case 'earlyMorning': return 'Early Morning';
      case 'breakfast': return 'Breakfast';
      case 'midMorning': return 'Mid Morning';
      case 'lunch': return 'Lunch';
      case 'midEvening': return 'Mid Evening';
      case 'evening': return 'Evening';
      case 'dinner': return 'Dinner';
      case 'pastDinner': return 'Post Dinner';
      // Legacy types for backward compatibility
      case 'morningSnack': return 'Mid Morning';
      case 'afternoonSnack': return 'Mid Evening';
      case 'eveningSnack': return 'Evening';
      default:
        // For custom meal types, return the type as-is (it's already a display label)
        // Or format camelCase to Title Case
        if (type.includes(' ')) return type; // Already formatted
        // Convert camelCase to Title Case
        return type
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase())
          .trim();
    }
  };

  const getMealTime = (type: string) => {
    const slot = DEFAULT_MEAL_SLOTS.find(s => s.type === type);
    return slot?.time || '';
  };

  // Get all meal slots - respect dietitian's custom meal types if configured
  // This ensures users see ONLY the meal types the dietitian published
  const getAllMealSlots = (): Meal[] => {
    if (!dayPlan?.hasPlan) {
      return [];
    }

    const slots: Meal[] = [];
    const processedTypeKeys = new Set<string>();

    // Helper to normalize a meal type to canonical camelCase
    const normalizeMealTypeKey = (type: string): string => {
      // Check legacy map first
      if (LEGACY_TYPE_MAP[type]) return LEGACY_TYPE_MAP[type];
      // Check if it's already a known default type
      if (DEFAULT_MEAL_SLOTS.some(s => s.type === type)) return type;
      // Return as-is for custom types
      return type;
    };

    // Canonical comparison key used for dedupe + ordering (ignores case/spaces/underscores/hyphens)
    const toTypeCompareKey = (type: string): string =>
      normalizeMealTypeKey(type)
        .toLowerCase()
        .replace(/[\s_-]+/g, '');

    // First, add ALL meals from the API (including those with 0 items).
    // The API returns meals that the dietitian configured, so they should
    // all be shown — even empty ones get "No food allotted" display.
    if (dayPlan.meals && dayPlan.meals.length > 0) {
      dayPlan.meals.forEach(meal => {
        if (!meal.type) return;

        const normalizedType = normalizeMealTypeKey(meal.type);
        const compareKey = toTypeCompareKey(normalizedType);

        // Skip if we already have this type (prevents duplicates from legacy names)
        if (processedTypeKeys.has(compareKey)) return;

        const defaultSlot = DEFAULT_MEAL_SLOTS.find(s => s.type === normalizedType);
        slots.push({
          ...meal,
          type: normalizedType,
          time: meal.time || defaultSlot?.time || '12:00 PM'
        });
        processedTypeKeys.add(compareKey);
      });
    }

    // IMPORTANT: Only add default meal slots if the plan does NOT have custom mealTypes
    // If dietitian configured specific meal types, show ONLY those (even if empty)
    // This ensures the UI reflects exactly what the dietitian published
    const hasCustomMealTypes = dayPlan?.mealTypes && dayPlan.mealTypes.length > 0;

    if (hasCustomMealTypes && dayPlan.mealTypes) {
      // Dietitian configured custom meal types - add them for any missing types
      dayPlan.mealTypes.forEach((mealType: any) => {
        const rawName = mealType.name || '';
        const typeKey = toTypeCompareKey(rawName);

        // Skip if already processed from meals
        if (processedTypeKeys.has(typeKey)) return;

        slots.push({
          id: `empty-${typeKey}`,
          type: typeKey,
          time: mealType.time || '12:00 PM',
          totalCalories: 0,
          items: [],
          isCompleted: false
        });
        processedTypeKeys.add(typeKey);
      });
    } else {
      // No custom mealTypes configured - add default meal slots only for missing types
      DEFAULT_MEAL_SLOTS.forEach(slot => {
        const compareKey = toTypeCompareKey(slot.type);
        if (!processedTypeKeys.has(compareKey)) {
          slots.push({
            id: `empty-${slot.type}`,
            type: slot.type,
            time: slot.time,
            totalCalories: 0,
            items: [],
            isCompleted: false
          });
          processedTypeKeys.add(compareKey);
        }
      });
    }

    // IMPORTANT: If dietitian mealTypes exist, force the exact published sequence.
    // This is NOT time sorting; it is ordering by dietitian-defined mealTypes.
    if (hasCustomMealTypes && dayPlan.mealTypes) {
      const orderMap = new Map<string, number>();
      dayPlan.mealTypes.forEach((mealType: any, index: number) => {
        orderMap.set(toTypeCompareKey(mealType.name || ''), index);
      });

      slots.sort((a, b) => {
        const indexA = orderMap.get(toTypeCompareKey(a.type));
        const indexB = orderMap.get(toTypeCompareKey(b.type));
        const safeA = indexA ?? Number.MAX_SAFE_INTEGER;
        const safeB = indexB ?? Number.MAX_SAFE_INTEGER;
        return safeA - safeB;
      });
    }

    return slots;
  };

  const allMealSlots = getAllMealSlots();
  // Only count meals that have food assigned
  const mealsWithFood = allMealSlots.filter(m => m.items.length > 0);
  const completedMeals = mealsWithFood.filter(m => m.isCompleted).length;
  const totalMeals = mealsWithFood.length || 0;
  const isTodaySelected = isToday(selectedDate);

  // Calculate progress segments only for meals with food
  const progressSegments = mealsWithFood.map((meal, index) => {
    const isCompleted = meal.isCompleted;
    return { isCompleted, index };
  });

  useEffect(() => {
    if (!deepLinkRequest || deepLinkHandledRef.current || !dayPlan || isChangingDate) return;
    if (format(selectedDate, 'yyyy-MM-dd') !== deepLinkRequest.date) return;

    const compareKey = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, '');
    const meal = allMealSlots.find((entry) => entry.id === deepLinkRequest.mealId)
      || allMealSlots.find((entry) => compareKey(entry.type) === compareKey(deepLinkRequest.mealType));

    deepLinkHandledRef.current = true;
    setDeepLinkRequest(null);
    const params = new URLSearchParams(window.location.search);
    ['action', 'mealId', 'mealType', 'date'].forEach((key) => params.delete(key));
    const nextUrl = `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);

    if (!meal) {
      toast.error('This meal could not be found in your plan.');
      return;
    }
    if (meal.isCompleted) {
      toast.success(`${getMealLabel(meal.type)} is already completed.`);
      return;
    }
    if (meal.items.length === 0) {
      toast.info('No food has been assigned to this meal yet.');
      return;
    }

    openCompletionModal(meal);
  }, [allMealSlots, dayPlan, deepLinkRequest, isChangingDate, selectedDate]);

  if (status === 'loading' || loading) {
    return (
      <div
        className={`fixed inset-0 flex items-center justify-center z-50 ${isDarkMode ? 'bg-gray-950' : 'bg-white'
          }`}
      >
        <SpoonGifLoader size="lg" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-24 transition-colors duration-300 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>

      <MealCompletionCelebration
        open={celebration.open}
        mealLabel={celebration.mealLabel}
        onClose={closeCelebration}
      />

      {/* Header */}
      <div className={`px-4 py-4 border-b transition-colors duration-300 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
        <div className="flex items-center justify-between">
          <Link href="/user" className="p-2 -ml-2">
            <ArrowLeft className={`w-6 h-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-700'}`} />
          </Link>
          <div className="text-center">
            <h1 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-black'}`}>My Meal Plan</h1>
            <p className={`text-xs uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{format(selectedDate, 'EEEE, MMMM d')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDatePickerValue(format(selectedDate, 'yyyy-MM-dd'));
                setShowDatePicker(true);
              }}
              className="p-2"
              title="Open Calendar"
            >
              <CalendarDays className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-700'}`} />
            </button>
            <button
              onClick={handleRefresh}
              className="p-2"
              disabled={refreshing}
            >
              <RefreshCw className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-700'} ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <div className="w-8 h-8 rounded-full bg-[#ff9500] flex items-center justify-center text-white text-sm font-semibold">
              {session?.user?.name?.charAt(0) || 'U'}
            </div>
          </div>
        </div>
      </div>

      {/* Selected Date Display */}
      <div className="px-4 py-4 bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs tracking-wider opacity-90 uppercase">
              {isToday(selectedDate) ? 'Today' : 'Selected Date'}
            </p>
            <p className="text-2xl font-bold">{format(selectedDate, 'EEEE')}</p>
            <p className="text-sm opacity-90">{format(selectedDate, 'MMMM d, yyyy')}</p>
          </div>
          <div className="bg-white/20 rounded-2xl p-3 text-center min-w-17.5">
            <p className="text-xs font-medium opacity-90">{format(selectedDate, 'MMM')}</p>
            <p className="text-3xl font-bold">{format(selectedDate, 'd')}</p>
          </div>
        </div>
      </div>

      {/* Week Date Selector */}
      <div className={`px-4 py-3 border-b ${isDarkMode ? 'bg-gray-950 border-gray-800' : 'bg-white border-gray-100'}`}>
        <div
          ref={dateScrollRef}
          className="flex gap-2 overflow-x-auto hide-scrollbar scroll-smooth"
        >
          {weekDates.map((date) => {
            const isSelected = isSameDay(date, selectedDate);
            const today = isToday(date);

            return (
              <button
                key={date.toISOString()}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center py-2 px-4 rounded-2xl min-w-12.5 transition-all ${isSelected
                  ? 'bg-[#3AB1A0] text-white'
                  : isDarkMode
                    ? 'bg-transparent text-gray-300 hover:bg-white/10'
                    : 'bg-transparent text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <span className={`text-xs font-medium ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                  {format(date, 'EEE')}
                </span>
                <span
                  className={`text-lg font-bold ${isSelected ? 'text-white' : isDarkMode ? 'text-gray-200' : 'text-gray-700'
                    }`}
                >
                  {format(date, 'd')}
                </span>
                {today && !isSelected && (
                  <div className="w-1.5 h-1.5 rounded-full bg-[#E06A26] mt-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day Note from Dietitian - Below Calendar */}
      {dayPlan?.dailyNote && !isChangingDate && (
        <div className={`mx-4 mt-4 p-4 rounded-xl border ${isDarkMode ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-yellow-50 border-yellow-200'}`}>
          <div className="flex items-start gap-2">
            <span className="text-lg">📝</span>
            <div>
              <p className={`text-xs font-semibold mb-1 ${isDarkMode ? 'text-yellow-200' : 'text-yellow-700'}`}>Note from Dietitian</p>
              <div className={`text-sm space-y-1 ${isDarkMode ? 'text-yellow-100' : 'text-yellow-800'}`}>
                {formatNotesWithLineBreaks(dayPlan.dailyNote || '').map((line, idx) => (
                  <p key={idx}>• {line}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-6 space-y-4">
        {/* Skeleton Loader when changing dates */}
        {isChangingDate ? (
          <div className="space-y-4 animate-pulse">
            {/* Summary skeleton */}
            <div className={`p-5 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className={`h-3 w-20 rounded mb-2 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                  <div className={`h-8 w-24 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                </div>
                <div className="text-right">
                  <div className={`h-3 w-20 rounded mb-2 ml-auto ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                  <div className={`h-8 w-16 rounded ml-auto ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                </div>
              </div>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className={`h-2 flex-1 rounded-full ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                ))}
              </div>
            </div>

            {/* Meal cards skeleton */}
            {[1, 2, 3].map(i => (
              <div key={i} className={`p-5 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white'}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                    <div>
                      <div className={`h-5 w-24 rounded mb-1 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                      <div className={`h-3 w-16 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                    </div>
                  </div>
                  <div className={`h-6 w-16 rounded-full ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                </div>
                <div className="space-y-3">
                  {[1, 2].map(j => (
                    <div key={j} className={`p-4 rounded-xl ${isDarkMode ? 'bg-black/40' : 'bg-gray-50'}`}>
                      <div className="flex items-center justify-between">
                        <div className={`h-4 w-32 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                        <div className={`h-4 w-16 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : dayPlan?.isFrozen && dayPlan?.hasPlan ? (
          /* Frozen Day Message */
          <div
            className={`p-8 text-center shadow-sm rounded-2xl border-2 relative overflow-hidden ${isDarkMode ? 'bg-gray-900 border-blue-500/40 ring-1 ring-white/10' : 'bg-white border-blue-200'
              }`}
          >
            {/* <style>{`@keyframes snowFall { to { transform: translateY(350px) rotateZ(360deg); opacity: 0; } } .snowflake-anim { position: absolute; color: #b3d9ff; font-size: 1.5rem; pointer-events: none; animation: snowFall 5s linear infinite; }`}</style> */}
            {/* {[...Array(6)].map((_, i) => (<div key={i} className="snowflake-anim" style={{left: `${15 + i * 15}%`, top: `-10px`, animationDelay: `${i * 0.8}s`}}>❄️</div>))} */}
            <div className="relative z-10">
              <div className="w-24 h-24 mx-auto mb-4 bg-linear-to-br from-blue-100 to-cyan-100 rounded-full flex items-center justify-center animate-pulse">
                <span className="text-5xl">❄️</span>
              </div>
              <h3 className={`mb-2 text-xl font-bold ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>This Day is Frozen</h3>
            </div>
            <div className="relative z-10">
              <p className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </p>
              <p className={`mb-4 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                Your dietitian has frozen this day. No meals are scheduled.
              </p>
              {dayPlan?.freezeInfo?.reason && (
                <div
                  className={`rounded-xl p-4 mb-4 text-left border ${isDarkMode ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'
                    }`}
                >
                  <p className={`text-xs font-semibold uppercase mb-1 ${isDarkMode ? 'text-blue-200' : 'text-blue-700'}`}>Reason</p>
                  <p className={`text-sm ${isDarkMode ? 'text-blue-100' : 'text-blue-800'}`}>{dayPlan?.freezeInfo?.reason}</p>
                </div>
              )}
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    const nextDate = addDays(selectedDate, 1);
                    setSelectedDate(nextDate);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-linear-to-r from-[#3AB1A0] to-[#2D8A7C] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all shadow-lg"
                >
                  View Next Day
                  <ChevronRight className="w-4 h-4" />
                </button>
                <Link
                  href="/user/messages"
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${isDarkMode ? 'bg-blue-500/10 text-blue-200 hover:bg-blue-500/15' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                >
                  💬 Contact Dietitian
                </Link>
              </div>
            </div>
          </div>
        ) : !dayPlan?.hasPlan ? (
          /* No Plan Message - Show Buy Plan option */
          <div className={`p-8 text-center shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white'}`}>
            <div className="w-20 h-20 mx-auto mb-4 bg-linear-to-br from-[#E06A26]/20 to-[#DB9C6E]/20 rounded-full flex items-center justify-center">
              <span className="text-4xl">🍽️</span>
            </div>
            <h3 className={`mb-2 text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>No Meal Plan Available</h3>
            <p className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </p>
            <p className={`mb-6 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
              You don&apos;t have a meal plan for this date. Get a personalized diet plan from our expert dietitians!
            </p>
            {(() => {
              if (!planDateWindow?.startDate || !planDateWindow?.endDate) return null;

              const start = new Date(planDateWindow.startDate);
              const end = new Date(planDateWindow.endDate);
              if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

              const selectedDay = new Date(selectedDate);
              selectedDay.setHours(0, 0, 0, 0);
              const startDay = new Date(start);
              startDay.setHours(0, 0, 0, 0);

              // Show helper only for upcoming windows when the selected day is before plan start.
              if (selectedDay >= startDay) return null;

              return (
                <p className={`mb-4 text-sm font-medium ${isDarkMode ? 'text-[#8cdad0]' : 'text-[#1f8b7d]'}`}>
                  Your meal plan starts from {format(start, 'dd MMM yyyy')} to {format(end, 'dd MMM yyyy')}.
                </p>
              );
            })()}
            <div className="flex flex-col gap-3">
              <Link
                href="/user/services"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-linear-to-r from-[#E06A26] to-[#DB9C6E] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all shadow-lg"
              >
                🛒 Buy a Plan
                <ChevronRight className="w-4 h-4" />
              </Link>
              <Link
                href="/user/messages"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#3AB1A0]/10 text-[#3AB1A0] rounded-xl text-sm font-medium hover:bg-[#3AB1A0]/20 transition-colors"
              >
                💬 Contact Dietitian
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Daily Summary Card */}
            <div className={`p-5 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className={`text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Daily Target</p>
                  <p className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatNum(dayPlan?.totalCalories)}<span className={`ml-1 text-lg font-normal ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>kcal</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Completed</p>
                  <p className="text-3xl font-bold text-[#3AB1A0]">
                    {completedMeals}/{totalMeals}<span className="ml-1 text-lg font-normal text-gray-400">meals</span>
                  </p>
                </div>
              </div>

              {/* Progress Bar - Segmented */}
              <div className="flex gap-1">
                {progressSegments.map((segment, index) => (
                  <div
                    key={index}
                    className={`h-2 flex-1 rounded-full transition-all ${segment.isCompleted ? 'bg-[#3AB1A0]' : isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                      }`}
                  />
                ))}
              </div>
            </div>

            {/* Meals List - Show only meals with food items assigned */}
            {allMealSlots
              .filter(meal => meal.items.length > 0) // Hide empty meal slots
              .map((meal) => (
                <div
                  key={meal.id}
                  className={`p-5 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white'}`}
                >
                  {/* Meal Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center justify-center w-12 h-12 text-2xl rounded-2xl ${isDarkMode ? 'bg-black/40' : 'bg-gray-50'}`}>
                        {getMealIcon(meal.type)}
                      </div>
                      <div>
                        <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{getMealLabel(meal.type)}</h3>
                        <div className={`flex items-center gap-1 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <Clock className="w-3 h-3" />
                          <span>{meal.time}</span>
                        </div>
                      </div>
                    </div>
                    {meal.isCompleted ? (
                      <div className="flex items-center gap-1 text-[#3AB1A0]">
                        <Check className="w-4 h-4" />
                        <span className="text-sm font-medium">Done</span>
                      </div>
                    ) : (
                      <div className="bg-[#E06A26]/10 text-[#E06A26] px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
                        <span>⚡</span>
                        <span>{formatNum(meal.totalCalories)} kcal</span>
                      </div>
                    )}
                  </div>

                  {/* Meal Notes if any */}
                  {meal.notes && (
                    <div className={`mb-4 p-3 rounded-xl border ${isDarkMode ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-yellow-50 border-yellow-200'}`}>
                      <p className={`text-xs font-semibold mb-1 ${isDarkMode ? 'text-yellow-200' : 'text-yellow-700'}`}>📝 Notes from Dietitian</p>
                      <div className={`text-sm space-y-1 ${isDarkMode ? 'text-yellow-100' : 'text-yellow-800'}`}>
                        {formatNotesWithLineBreaks(meal.notes).map((line, idx) => (
                          <p key={idx}>• {line}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Meal Items - Stacked vertically, click to view recipe */}
                  {meal.items.length > 0 ? (
                    <div className="mb-4 space-y-2">
                      {/* Main Food Items - Stacked vertically (excluding alternatives) */}
                      {meal.items.filter(item => !item.isAlternative).map((item, itemIndex) => (
                        <button
                          key={item.id}
                          onClick={() => openRecipeModal(item)}
                          className={`w-full p-4 rounded-xl text-left transition-all active:scale-[0.98] ${isDarkMode
                            ? 'bg-black/40 hover:bg-[#3AB1A0]/10 active:bg-[#3AB1A0]/20'
                            : 'bg-gray-50 hover:bg-[#3AB1A0]/10 active:bg-[#3AB1A0]/20'
                            }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {/* Number indicator for multiple foods */}
                              <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${itemIndex === 0
                                ? 'bg-[#3AB1A0] text-white'
                                : 'bg-[#DB9C6E]/20 text-[#DB9C6E]'
                                }`}>
                                {itemIndex + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                                  {item.name}
                                </p>
                                <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {item.portion} • {formatNum(item.calories)} kcal
                                </p>
                                {/* Tags */}
                                {item.tags && item.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {item.tags.slice(0, 2).map((tag, i) => (
                                      <span
                                        key={i}
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#DB9C6E]/20 text-[#DB9C6E] rounded text-[10px]"
                                      >
                                        <Tag className="w-2 h-2" />
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-[#3AB1A0]" />
                              <ChevronRight className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                            </div>
                          </div>
                        </button>
                      ))}

                      {/* Alternatives Section - Show items marked as alternative AND nested alternatives */}
                      {(meal.items.some(item => item.isAlternative) || meal.items.some(item => item.alternatives && item.alternatives.length > 0)) && (
                        <div className={`mt-3 p-3 rounded-xl border-2 border-dashed ${isDarkMode ? 'border-orange-700/50 bg-orange-900/20' : 'border-orange-200 bg-orange-50/50'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-base">🔄</span>
                            <p className={`text-xs font-semibold uppercase tracking-wide ${isDarkMode ? 'text-orange-300' : 'text-orange-600'}`}>
                              Optional Alternatives
                            </p>
                          </div>
                          <div className="space-y-2">
                            {/* Items marked as alternative food */}
                            {meal.items.filter(item => item.isAlternative).map((item) => (
                              <button
                                key={item.id}
                                onClick={() => openRecipeModal(item)}
                                className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${isDarkMode ? 'bg-black/40 hover:bg-orange-900/30' : 'bg-white hover:bg-orange-50'}`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 text-[10px] font-bold text-orange-700 bg-orange-200 rounded">ALT</span>
                                  <div className="text-left">
                                    <p className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{item.name}</p>
                                    <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                      {item.portion}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-orange-600">{formatNum(item.calories)} kcal</p>
                                  <ChevronRight className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                                </div>
                              </button>
                            ))}
                            {/* Nested alternatives from main items */}
                            {meal.items.flatMap((item, itemIdx) =>
                              (item.alternatives || []).map((alt, altIdx) => (
                                <div
                                  key={`${itemIdx}-${altIdx}`}
                                  className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? 'bg-black/40' : 'bg-white'}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full bg-orange-400`} />
                                    <div>
                                      <p className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{alt.name}</p>
                                      <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                        Instead of: {item.name}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-orange-600">{formatNum(alt.calories)} kcal</p>
                                    <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{alt.portion}</p>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={`py-6 mb-4 text-center rounded-xl ${isDarkMode ? 'text-gray-400 bg-black/40' : 'text-gray-400 bg-gray-50'}`}>
                      <span className="block mb-2 text-2xl">🍽️</span>
                      <p className="text-sm">No food assigned for this meal</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {meal.isCompleted ? (
                      <button className="flex-1 min-w-30 py-2.5 px-4 bg-[#3AB1A0]/10 text-[#3AB1A0] rounded-xl text-sm font-semibold cursor-default">
                        ✓ Completed
                      </button>
                    ) : !isTodaySelected ? (
                      /* Disabled for past/future dates */
                      <button
                        disabled
                        className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold cursor-not-allowed flex items-center justify-center gap-2 ${isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-500'
                          }`}
                        title={selectedDate < new Date() ? 'Cannot mark past meals as complete' : 'Cannot mark future meals as complete'}
                      >
                        <Clock className="w-4 h-4" />
                        <span>{selectedDate < new Date() ? 'Past Date' : 'Future Date'}</span>
                      </button>
                    ) : meal.items.length === 0 ? (
                      /* Hide complete button when no food is allotted */
                      <div className={`flex-1 min-w-30 py-2.5 px-4 rounded-xl text-sm font-medium text-center ${isDarkMode ? 'bg-gray-900 text-gray-500 ring-1 ring-white/10' : 'bg-gray-100 text-gray-400'
                        }`}>
                        No food to mark as complete
                      </div>
                    ) : (
                      <button
                        onClick={() => openCompletionModal(meal)}
                        disabled={completingMeal === meal.id}
                        className="flex-1 min-w-30 py-2.5 px-4 bg-[#3AB1A0] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#2A9A8B] transition-colors disabled:opacity-50"
                      >
                        {completingMeal === meal.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Camera className="w-4 h-4" />
                            <span>Complete</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* View Recipe Button - Show next to Complete if items exist */}
                    {meal.items.length > 0 && (
                      <button
                        onClick={() => {
                          // Open food selector modal to show all items
                          setFoodSelectorModal({ meal, isOpen: true });
                        }}
                        className="flex-1 min-w-30 py-2.5 px-4 bg-[#DB9C6E]/10 text-[#DB9C6E] rounded-xl text-sm font-semibold hover:bg-[#DB9C6E]/20 transition-colors flex items-center justify-center gap-2"
                        title="View recipe details"
                      >
                        <BookOpen className="w-4 h-4" />
                        <span>All Recipes</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </>
        )}
      </div>

      {/* Nutritional Information Disclaimer & Citations */}
      {dayPlan && (
        <div className={`mx-1 mb-4 p-4 rounded-2xl ${isDarkMode ? 'bg-gray-900/50 ring-1 ring-white/5' : 'bg-gray-50'}`}>
          <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <span className="font-semibold">Disclaimer:</span> All meal plans, nutritional values, and dietary recommendations
            are prepared by certified dietitians and nutritionists at DTPS. Calorie counts and macronutrient values are estimates
            based on standard food composition databases including{' '}
            <a href="https://www.ifct2017.com/" target="_blank" rel="noopener noreferrer" className="text-[#3AB1A0] underline">
              Indian Food Composition Tables (IFCT 2017, NIN)
            </a>,{' '}
            <a href="https://fdc.nal.usda.gov/" target="_blank" rel="noopener noreferrer" className="text-[#3AB1A0] underline">
              USDA FoodData Central
            </a>, and{' '}
            <a href="https://www.who.int/publications/i/item/9241546123" target="_blank" rel="noopener noreferrer" className="text-[#3AB1A0] underline">
              WHO/FAO dietary guidelines
            </a>.
            Actual nutritional content may vary based on preparation methods and ingredient sourcing.
            This plan is personalized for you and should not replace professional medical advice.
            Please consult your healthcare provider before making significant dietary changes, especially
            if you have any medical conditions.
          </p>
        </div>
      )}

      {/* Recipe Modal */}
      {recipeModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeRecipeModal();
            }
          }}
        >
          <div className={`w-full max-w-lg mx-4 rounded-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col ${isDarkMode ? 'bg-gray-900 text-white ring-1 ring-white/10' : 'bg-white'}`}>
            {/* Modal Header - Sticky */}
            <div className="flex items-center justify-between p-5 bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B]">
              <div className="flex-1 pr-4">
                <h3 className="text-lg font-bold text-white">{recipeModal.item?.name}</h3>
                {fullRecipeData?.createdBy && (
                  <p className="text-xs text-white/70 mt-0.5">
                    By Dt. {fullRecipeData.createdBy?.firstName} {fullRecipeData.createdBy?.lastName}
                  </p>
                )}
              </div>
              <button
                onClick={closeRecipeModal}
                className="p-2 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="overflow-y-auto flex-1 overscroll-contain">
              {loadingRecipe ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-10 h-10 text-[#3AB1A0] animate-spin mb-3" />
                  <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Loading recipe details...</p>
                </div>
              ) : (
                <div className="p-5 space-y-5">
                  {/* Recipe Image */}
                  {(fullRecipeData?.image || recipeModal.item.recipe?.image) && (
                    <div className="rounded-xl overflow-hidden -mx-5 -mt-5">
                      <img
                        src={fullRecipeData?.image || recipeModal.item.recipe?.image}
                        alt={fullRecipeData?.name || recipeModal.item.name}
                        loading="lazy"
                        className="w-full h-52 object-cover"
                      />
                    </div>
                  )}

                  {/* Description */}
                  {fullRecipeData?.description && (
                    <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>{fullRecipeData?.description}</p>
                  )}

                  {/* Dietitian Note for this food item */}
                  {recipeModal.item?.notes?.trim() && (
                    <div className={`max-w-full p-4 rounded-xl border ${isDarkMode ? 'bg-[#3AB1A0]/15 border-[#3AB1A0]/30' : 'bg-[#3AB1A0]/10 border-[#3AB1A0]/25'}`}>
                      <p className={`text-xs font-semibold mb-1 ${isDarkMode ? 'text-[#7CE0D3]' : 'text-[#1F6F67]'}`}>📝 Note from Dietitian</p>
                      <div className={`max-w-full text-sm space-y-1 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                        {formatNotesWithLineBreaks(recipeModal.item.notes).map((line, idx) => (
                          <p key={idx} className="flex items-start gap-1.5">
                            <span className="shrink-0 text-black">•</span>
                            <span
                              className="min-w-0"
                              style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                            >
                              {line}
                            </span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Food Info */}
                  <div className="flex items-center justify-between p-4 bg-[#E06A26]/10 rounded-xl">
                    <div>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Portion</p>
                      <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{fullRecipeData?.servings || recipeModal.item.portion}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Calories</p>
                      <p className="font-bold text-[#E06A26]">{formatNum(fullRecipeData?.nutrition?.calories || recipeModal.item.calories)} kcal</p>
                    </div>
                  </div>

                  {/* Prep & Cook Time removed */}

                  {/* Nutrition Info */}
                  {(fullRecipeData?.nutrition || recipeModal.item.recipe?.nutrition) && (
                    <div>
                      <h4 className={`mb-3 text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>📊 Nutrition (per serving)</h4>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center p-2 bg-red-50 rounded-lg">
                          <p className="text-lg font-bold text-red-600">{formatNum((fullRecipeData?.nutrition || recipeModal.item.recipe?.nutrition)?.calories || 0)}</p>
                          <p className="text-xs text-gray-500">kcal</p>
                        </div>
                        <div className="text-center p-2 bg-blue-50 rounded-lg">
                          <p className="text-lg font-bold text-blue-600">{formatNum((fullRecipeData?.nutrition || recipeModal.item.recipe?.nutrition)?.protein || 0)}g</p>
                          <p className="text-xs text-gray-500">Protein</p>
                        </div>
                        <div className="text-center p-2 bg-yellow-50 rounded-lg">
                          <p className="text-lg font-bold text-yellow-600">{formatNum((fullRecipeData?.nutrition || recipeModal.item.recipe?.nutrition)?.carbs || 0)}g</p>
                          <p className="text-xs text-gray-500">Carbs</p>
                        </div>
                        <div className="text-center p-2 bg-orange-50 rounded-lg">
                          <p className="text-lg font-bold text-orange-600">{formatNum((fullRecipeData?.nutrition || recipeModal.item.recipe?.nutrition)?.fat || 0)}g</p>
                          <p className="text-xs text-gray-500">Fat</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Dietary Restrictions */}
                  {((fullRecipeData?.dietaryRestrictions && fullRecipeData.dietaryRestrictions.length > 0) ||
                    (recipeModal.item?.recipe?.dietaryRestrictions && recipeModal.item.recipe.dietaryRestrictions.length > 0)) && (
                      <div>
                        <h4 className={`mb-2 text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>🥗 Dietary Info</h4>
                        <div className="flex flex-wrap gap-2">
                          {(fullRecipeData?.dietaryRestrictions || recipeModal.item.recipe?.dietaryRestrictions)?.map((restriction, i) => (
                            <span key={i} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">{restriction}</span>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Medical Contraindications */}
                  {fullRecipeData?.medicalContraindications && fullRecipeData.medicalContraindications.length > 0 && (
                    <div className="p-3 bg-red-50 rounded-xl">
                      <p className="text-xs font-bold text-red-800 mb-2">⚠️ Not recommended for:</p>
                      <div className="flex flex-wrap gap-1">
                        {fullRecipeData.medicalContraindications.map((condition, i) => (
                          <span key={i} className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">{condition}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ingredients */}
                  {((fullRecipeData?.ingredients && fullRecipeData.ingredients.length > 0) ||
                    (recipeModal.item.recipe?.ingredients && recipeModal.item.recipe.ingredients.length > 0)) && (
                      <div>
                        <h4 className={`mb-3 text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>🥗 Ingredients</h4>
                        <ul className="space-y-2">
                          {fullRecipeData?.ingredients ? (
                            fullRecipeData.ingredients.map((ing, i) => (
                              <li key={i} className="flex items-start gap-3 p-3 bg-[#3AB1A0]/5 rounded-lg">
                                <div className="w-2 h-2 rounded-full bg-[#3AB1A0] mt-1.5 shrink-0" />
                                <div className="flex-1">
                                  <span className={`font-medium text-sm ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{ing.name}</span>
                                  <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}> - {ing.quantity} {ing.unit}</span>
                                  {ing.remarks && <span className={`text-xs ml-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>({ing.remarks})</span>}
                                </div>
                              </li>
                            ))
                          ) : (
                            recipeModal.item.recipe?.ingredients?.map((ing, i) => (
                              <li key={i} className="flex items-start gap-3 p-3 bg-[#3AB1A0]/5 rounded-lg">
                                <div className="w-2 h-2 rounded-full bg-[#3AB1A0] mt-1.5 shrink-0" />
                                <span className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{ing}</span>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    )}

                  {/* Instructions */}
                  {((fullRecipeData?.instructions && fullRecipeData.instructions.length > 0) ||
                    (recipeModal.item.recipe?.instructions && recipeModal.item.recipe.instructions.length > 0)) && (
                      <div>
                        <h4 className={`mb-3 text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>👨‍🍳 Instructions</h4>
                        <ol className="space-y-3">
                          {(fullRecipeData?.instructions || recipeModal.item.recipe?.instructions)?.map((step, i) => (
                            <li key={i} className="flex gap-3">
                              <span className="shrink-0 w-7 h-7 rounded-full bg-[#E06A26] text-white flex items-center justify-center text-xs font-bold">
                                {i + 1}
                              </span>
                              <span className={`text-sm pt-0.5 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                  {/* Tips */}
                  {((fullRecipeData?.tips && fullRecipeData.tips.length > 0) ||
                    (recipeModal.item.recipe?.tips && recipeModal.item.recipe.tips.length > 0)) && (
                      <div className="p-4 bg-blue-50 rounded-xl">
                        <h4 className="mb-2 text-sm font-bold text-blue-900">💡 Pro Tips</h4>
                        <ul className="space-y-1">
                          {(fullRecipeData?.tips || recipeModal.item.recipe?.tips)?.map((tip, i) => (
                            <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                              <span>•</span>
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {/* Equipment */}
                  {((fullRecipeData?.equipment && fullRecipeData.equipment.length > 0) ||
                    (recipeModal.item.recipe?.equipment && recipeModal.item.recipe.equipment.length > 0)) && (
                      <div>
                        <h4 className={`mb-2 text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>🔧 Equipment Needed</h4>
                        <div className="flex flex-wrap gap-2">
                          {(fullRecipeData?.equipment || recipeModal.item.recipe?.equipment)?.map((eq, i) => (
                            <span key={i} className={`px-3 py-1 rounded-full text-xs ${isDarkMode ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>{eq}</span>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Storage Info */}
                  {((fullRecipeData?.storage && (fullRecipeData.storage.refrigerator || fullRecipeData.storage.freezer)) ||
                    (recipeModal.item.recipe?.storage && (recipeModal.item.recipe.storage.refrigerator || recipeModal.item.recipe.storage.freezer))) && (
                      <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-black/40' : 'bg-gray-50'}`}>
                        <h4 className={`mb-2 text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>🧊 Storage</h4>
                        <div className={`space-y-1 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                          {(fullRecipeData?.storage || recipeModal.item.recipe?.storage)?.refrigerator && (
                            <p>🥶 Refrigerator: {(fullRecipeData?.storage || recipeModal.item.recipe?.storage)?.refrigerator}</p>
                          )}
                          {(fullRecipeData?.storage || recipeModal.item.recipe?.storage)?.freezer && (
                            <p>❄️ Freezer: {(fullRecipeData?.storage || recipeModal.item.recipe?.storage)?.freezer}</p>
                          )}
                          {(fullRecipeData?.storage || recipeModal.item.recipe?.storage)?.instructions && (
                            <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{(fullRecipeData?.storage || recipeModal.item.recipe?.storage)?.instructions}</p>
                          )}
                        </div>
                      </div>
                    )}

                  {/* Alternatives */}
                  {recipeModal.item.alternatives && recipeModal.item.alternatives.length > 0 && (
                    <div className="p-4 bg-[#3AB1A0]/10 rounded-xl">
                      <h4 className={`mb-2 text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>🔄 Alternative Options</h4>
                      <div className="space-y-2">
                        {recipeModal.item.alternatives.map((alt, i) => (
                          <div key={i} className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white'}`}>
                            <div>
                              <p className={`font-medium text-sm ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{alt.name}</p>
                              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{alt.portion}</p>
                            </div>
                            <span className="text-sm font-semibold text-[#3AB1A0]">{formatNum(alt.calories)} kcal</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No Recipe Data Message */}
                  {!fullRecipeData && !recipeModal.item.recipe && !loadingRecipe && (
                    <div className={`py-8 text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                      <BookOpen className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                      <p className="text-sm">No recipe details available for this food item</p>
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>The dietitian will add recipe soon</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer - Close Button */}
            <div className={`p-4 border-t ${isDarkMode ? 'bg-gray-950 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
              <button
                onClick={closeRecipeModal}
                className="w-full py-3 bg-[#3AB1A0] text-white rounded-xl font-bold hover:bg-[#2A9A8B] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alternatives Modal */}
      {alternativesModal.isOpen && alternativesModal.item.alternatives && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className={`w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[80vh] overflow-hidden ${isDarkMode ? 'bg-gray-900 text-white ring-1 ring-white/10' : 'bg-white'}`}>
            <div className={`sticky top-0 flex items-center justify-between p-4 border-b ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
              <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Alternative Foods</h3>
              <button
                onClick={() => setAlternativesModal({ item: {} as MealItem, isOpen: false })}
                className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
              >
                <X className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <p className={`mb-4 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                Instead of <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>{alternativesModal.item?.name}</span>, you can have:
              </p>
              <div className="space-y-3">
                {alternativesModal.item?.alternatives?.map((alt, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-[#DB9C6E]/10 rounded-xl">
                    <div>
                      <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{alt.name}</p>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>{alt.portion}</p>
                    </div>
                    <span className="text-sm font-semibold text-[#E06A26]">{formatNum(alt.calories)} kcal</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Food Item Selector Modal - Shows all food items in a meal with recipes */}
      {foodSelectorModal.isOpen && foodSelectorModal.meal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setFoodSelectorModal({ meal: null, isOpen: false });
            }
          }}
        >
          <div className={`w-full max-w-lg rounded-3xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col ${isDarkMode ? 'bg-gray-900 text-white ring-1 ring-white/10' : 'bg-white'}`}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 bg-linear-to-r from-[#DB9C6E] to-[#E06A26]">
              <div>
                <h3 className="text-lg font-bold text-white">{foodSelectorModal.meal ? getMealLabel(foodSelectorModal.meal.type) : ''}</h3>
                <p className="text-sm text-white/80">Select a food to view recipe</p>
              </div>
              <button
                onClick={() => setFoodSelectorModal({ meal: null, isOpen: false })}
                className="p-2 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Food Items List */}
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {/* Meal Notes */}
              {foodSelectorModal.meal?.notes && (
                <div className={`p-4 rounded-xl mb-4 border ${isDarkMode ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-yellow-50 border-yellow-200'}`}>
                  <p className={`text-xs font-semibold mb-1 ${isDarkMode ? 'text-yellow-200' : 'text-yellow-700'}`}>📝 Notes from Dietitian</p>
                  <p className={`text-sm ${isDarkMode ? 'text-yellow-100' : 'text-yellow-800'}`}>{foodSelectorModal.meal?.notes}</p>
                </div>
              )}

              <p className={`text-sm mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Tap on a food item to view its recipe:</p>

              {foodSelectorModal.meal?.items.map((item, index) => (
                <div key={item.id || index} className="space-y-2">
                  {/* Main Food Item */}
                  <button
                    onClick={() => {
                      openRecipeModal(item);
                      setFoodSelectorModal({ meal: null, isOpen: false });
                    }}
                    className={`w-full p-4 rounded-xl text-left transition-colors border hover:border-[#3AB1A0]/30 ${isDarkMode
                      ? 'bg-black/40 border-gray-800 hover:bg-[#3AB1A0]/10'
                      : 'bg-gray-50 border-gray-100 hover:bg-[#3AB1A0]/10'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#3AB1A0]/20 flex items-center justify-center">
                          <BookOpen className="w-5 h-5 text-[#3AB1A0]" />
                        </div>
                        <div>
                          <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{item.name}</p>
                          <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.portion}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-[#E06A26]">{formatNum(item.calories)} kcal</p>
                        {(item.protein || item.carbs || item.fats) && (
                          <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>
                            P:{formatNum(item.protein || 0)}g C:{formatNum(item.carbs || 0)}g F:{formatNum(item.fats || 0)}g
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Tags */}
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.tags.map((tag, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-[#DB9C6E]/20 text-[#DB9C6E] rounded-full text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Recipe indicator */}
                    <div className="mt-2 flex items-center gap-1 text-xs text-[#3AB1A0]">
                      <ChevronRight className="w-3 h-3" />
                      <span>{item.recipe ? 'View full recipe' : 'View details'}</span>
                    </div>
                  </button>

                  {/* Alternatives for this item */}
                  {item.alternatives && item.alternatives.length > 0 && (
                    <div className="ml-6 p-3 bg-[#3AB1A0]/5 rounded-xl border-l-2 border-[#3AB1A0]">
                      <p className="text-xs font-semibold text-[#3AB1A0] mb-2">🔄 Alternatives:</p>
                      <div className="space-y-2">
                        {item.alternatives.map((alt, altIndex) => (
                          <div
                            key={altIndex}
                            className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white'}`}
                          >
                            <div>
                              <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>{alt.name}</p>
                              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>{alt.portion}</p>
                            </div>
                            <span className="text-sm font-semibold text-[#E06A26]">{formatNum(alt.calories)} kcal</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className={`p-4 border-t ${isDarkMode ? 'bg-gray-950 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
              <button
                onClick={() => setFoodSelectorModal({ meal: null, isOpen: false })}
                className="w-full py-3 bg-[#3AB1A0] text-white rounded-xl font-bold hover:bg-[#2A9A8B] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meal Completion Modal */}
      {completionModal.isOpen && completionModal.meal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className={`w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-hidden ${isDarkMode ? 'bg-gray-900 text-white ring-1 ring-white/10' : 'bg-white'}`}>
            <div className={`sticky top-0 flex items-center justify-between p-4 border-b ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
              <div>
                <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Complete Meal</h3>
                <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                  {completionModal.meal ? getMealLabel(completionModal.meal.type) : ''} • {completionModal.meal?.time}
                </p>
              </div>
              <button
                onClick={closeCompletionModal}
                className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
              >
                <X className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[70vh] space-y-5">
              {/* Meal Type - Auto fetched */}
              <div className="bg-linear-to-r from-[#3AB1A0]/10 to-[#E06A26]/10 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center w-12 h-12 text-2xl shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white'}`}>
                    {completionModal.meal ? getMealIcon(completionModal.meal.type) : ''}
                  </div>
                  <div>
                    <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Meal Type</p>
                    <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{completionModal.meal ? getMealLabel(completionModal.meal.type) : ''}</p>
                  </div>
                </div>
                {completionModal.meal?.items && completionModal.meal?.items.length > 0 && (
                  <div className="pt-3 mt-3 border-t border-gray-200/50">
                    <p className={`mb-2 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Planned foods:</p>
                    <div className="flex flex-wrap gap-2">
                      {completionModal.meal?.items.map((item, i) => (
                        <span key={i} className={`px-2 py-1 text-xs rounded-full shadow-sm ${isDarkMode ? 'text-gray-200 bg-gray-900 ring-1 ring-white/10' : 'text-gray-700 bg-white'}`}>
                          {item.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Notes - Optional */}
              <div>
                <label className={`block mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  Notes <span className="text-gray-400">(Optional)</span>
                </label>
                <textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="Any notes about this meal? (e.g., substitutions made, how you felt)"
                  className={`w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3AB1A0] focus:border-transparent resize-none ${isDarkMode
                    ? 'border border-gray-800 bg-gray-950 text-white placeholder:text-gray-500'
                    : 'border border-gray-200'
                    }`}
                  rows={3}
                  maxLength={300}
                />
                <p className={`mt-1 text-xs text-right ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{completionNotes.length}/300</p>
              </div>

              {/* Image Upload - Required */}
              <div>
                <label className={`block mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  Meal Photo <span className="text-red-500">*</span>
                </label>
                <p className={`mb-3 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                  Please upload a photo of your meal as proof of completion
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                  capture="environment"
                />

                {isProcessingImage && (
                  <div className={`mb-3 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                    Optimizing image for faster upload...
                  </div>
                )}

                {completionImagePreview ? (
                  <div className="relative">
                    <div className={`relative w-full h-48 overflow-hidden rounded-xl ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                      <Image
                        src={completionImagePreview as string}
                        alt="Meal preview"
                        fill
                        className="object-cover"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setCompletionImage(null);
                        setCompletionImagePreview(null);
                        setIsProcessingImage(false);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      }}
                      className="absolute p-2 text-white transition-colors bg-red-500 rounded-full top-2 right-2 hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className={`absolute bottom-2 right-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${isDarkMode ? 'bg-black/60 text-white hover:bg-black/70' : 'bg-white/90 text-gray-700 hover:bg-white'
                        }`}
                    >
                      <Camera className="w-4 h-4" />
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full h-48 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 hover:border-[#3AB1A0] hover:bg-[#3AB1A0]/5 transition-all ${isDarkMode ? 'border-gray-700' : 'border-gray-300'
                      }`}
                  >
                    <div className="w-16 h-16 rounded-full bg-[#3AB1A0]/10 flex items-center justify-center">
                      <Camera className="w-8 h-8 text-[#3AB1A0]" />
                    </div>
                    <div className="text-center">
                      <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>Take or upload a photo</p>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Tap to add meal photo</p>
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <div className={`p-4 border-t ${isDarkMode ? 'bg-gray-950 border-gray-800' : 'bg-white border-gray-100'}`}>
              <button
                onClick={handleSubmitCompletion}
                disabled={isSubmitting || isProcessingImage || !completionImage}
                className="w-full py-3 bg-[#3AB1A0] text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-[#2A9A8B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span>Submitting...</span>
                ) : isProcessingImage ? (
                  <span>Preparing image...</span>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    <span>Submit Completion</span>
                  </>
                )}
              </button>
              {!completionImage && (
                <p className="mt-2 text-xs text-center text-red-500">
                  * Photo is required to complete meal
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Date Picker Modal */}
      {showDatePicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowDatePicker(false)}
        >
          <div
            className={`w-full max-w-sm mx-4 rounded-3xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-gray-900 text-white ring-1 ring-white/10' : 'bg-white'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B]">
              <h3 className="text-lg font-bold text-white">📅 Select Date</h3>
              <button
                onClick={() => setShowDatePicker(false)}
                className="p-2 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Date Input */}
            <div className="p-6 space-y-4">
              <p className={`text-sm text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Choose a date to view your meal plan
              </p>
              <input
                type="date"
                value={datePickerValue}
                onChange={(e) => setDatePickerValue(e.target.value)}
                className={`w-full px-4 py-3 border-2 rounded-xl text-center text-lg font-medium focus:outline-none focus:border-[#3AB1A0] transition-colors ${isDarkMode ? 'border-gray-800 bg-gray-950 text-white' : 'border-gray-200 text-gray-700'
                  }`}
              />
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowDatePicker(false)}
                  className={`flex-1 py-3 border-2 rounded-xl font-semibold transition-colors ${isDarkMode ? 'border-gray-700 text-gray-200 hover:bg-white/10' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDatePickerSelect}
                  className="flex-1 py-3 bg-[#3AB1A0] text-white rounded-xl font-semibold hover:bg-[#2A9A8B] transition-colors"
                >
                  View Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
