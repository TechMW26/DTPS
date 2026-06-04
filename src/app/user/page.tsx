'use client';

import { useEffect, useState, useRef, useCallback, Suspense, lazy } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';
import { useDataRefresh, DataEventTypes } from '@/lib/events/useDataRefresh';
import {
  Droplet,
  Moon,
  Activity,
  Utensils,
  Bed,
  User,
  ChevronRight,
  ChevronLeft,
  Flame,
  Footprints,
  BookOpen,
  Clock,
  UserCheck,
  Loader2,
  Calendar,
  Phone,
  Mail
} from 'lucide-react';
import SpoonGifLoader, { FullPageLoader } from '@/components/ui/SpoonGifLoader';
import SmoothComponent from '@/components/animations/SmoothComponent';
import StaggerList from '@/components/animations/StaggerList';

// Lazy load heavy components for better performance
const ServicePlansSwiper = lazy(() => import('@/components/client/ServicePlansSwiper'));
const TransformationSwiper = lazy(() => import('@/components/client/TransformationSwiper'));

// Utility function to dispatch data change events (meal plan, purchases, payments)
export function triggerDataRefresh(dataType: 'meal-plan' | 'client-purchases' | 'payment' | 'dietitian-assigned' | 'all') {
  window.dispatchEvent(new CustomEvent('user-data-changed', { detail: { dataType } }));
}

// Custom hook to listen for data changes and refresh UI
function useDataChangeListener(onDataChange: (dataType?: string) => void) {
  useEffect(() => {
    const handleDataChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { dataType } = customEvent.detail || {};
      console.log('Data change detected:', dataType);
      onDataChange(dataType);
    };

    window.addEventListener('user-data-changed', handleDataChange);
    return () => {
      window.removeEventListener('user-data-changed', handleDataChange);
    };
  }, [onDataChange]);
}

interface DashboardData {
  caloriesLeft: number;
  caloriesGoal: number;
  protein: number;
  proteinGoal: number;
  carbs: number;
  carbsGoal: number;
  fat: number;
  fatGoal: number;
  water: { current: number; goal: number };
  sleep: { hours: number; minutes: number; quality: number };
  activity: { minutes: number; active: boolean };
  meals: { eaten: number; total: number; calories: number };
  steps: { current: number; goal: number };
}

interface UserProfile {
  bmi: string;
  bmiCategory: string;
  weightKg: string;
  heightCm: string;
  generalGoal: string;
}

interface PurchaseInfo {
  _id: string;
  planName: string;
  planCategory: string;
  durationDays: number;
  durationLabel: string;
  startDate: string;
  endDate: string;
  expectedStartDate?: string | null;
  expectedEndDate?: string | null;
  status: string;
  hasDietitian: boolean;
  mealPlanCreated: boolean;
  hasOngoingMealPlan?: boolean;
  ongoingMealPlanStartDate?: string | null;
  ongoingMealPlanEndDate?: string | null;
  ongoingMealPlanDuration?: number | null;
  mealPlanName?: string | null;
  mealPlanGoal?: string | null;
  dietitian: {
    id: string;
    name: string;
    email: string;
    phone: string;
    avatar?: string;
  } | null;
}

interface CurrentMealPlanInfo {
  name?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  duration?: number | null;
  goal?: string | null;
}

interface BlogItem {
  _id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  readTime: number;
  featuredImage: string;
  thumbnailImage?: string;
}

export default function UserHomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDarkMode } = useTheme();
  const unmountedRef = useRef(false);
  const [activeCard, setActiveCard] = useState(0);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [hasActivePlan, setHasActivePlan] = useState<boolean | null>(null);
  const [hasAnyPurchase, setHasAnyPurchase] = useState(false);
  const [hasPendingDietitianAssignment, setHasPendingDietitianAssignment] = useState(false);
  const [activePurchases, setActivePurchases] = useState<PurchaseInfo[]>([]);
  const [currentMealPlan, setCurrentMealPlan] = useState<CurrentMealPlanInfo | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [userAvatar, setUserAvatar] = useState<string>('');
  const [paymentVerifying, setPaymentVerifying] = useState(false);
  const [blogs, setBlogs] = useState<BlogItem[]>([]);
  const [blogsLoading, setBlogsLoading] = useState(false);
  const [blogsError, setBlogsError] = useState<string>('');
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const redirectingRef = useRef(false);
  const [data, setData] = useState<DashboardData>({
    caloriesLeft: 0,
    caloriesGoal: 2000,
    protein: 0,
    proteinGoal: 120,
    carbs: 0,
    carbsGoal: 250,
    fat: 0,
    fatGoal: 65,
    water: { current: 0, goal: 2500 },
    sleep: { hours: 0, minutes: 0, quality: 0 },
    activity: { minutes: 0, active: false },
    meals: { eaten: 0, total: 4, calories: 0 },
    steps: { current: 0, goal: 10000 },
  });

  // Track mount state
  useEffect(() => {
    setMounted(true);
    return () => {
      setMounted(false);
      unmountedRef.current = true;
    };
  }, []);

  const fetchWithTimeout = useCallback(async (input: RequestInfo | URL, init?: RequestInit, timeoutMs: number = 8000) => {
    const doFetch = () => fetch(input, init);

    // Some Android WebViews have partial/buggy AbortController+fetch(signal) support.
    // In that case, fall back to a non-aborting timeout strategy.
    if (typeof AbortController === 'undefined') {
      return await Promise.race([
        doFetch(),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
        ),
      ]);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(input, { ...(init || {}), signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      // Retry without `signal` for WebViews that error on it.
      return await doFetch();
    }
  }, []);

  // Redirect unauthenticated users (do this in an effect to avoid navigation flooding)
  useEffect(() => {
    if (!mounted) return;
    if (status !== 'unauthenticated') return;
    if (redirectingRef.current) return;

    redirectingRef.current = true;
    setCheckingOnboarding(false);
    router.replace('/client-auth/signin');
  }, [mounted, status, router]);

  // Function to fetch real-time health data (water, sleep, activity, steps, calories)
  // Uses aggregated dashboard-summary API to reduce round-trips (1 call instead of 4+)
  const fetchHealthData = useCallback(async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      // Fetch aggregated health data + meal plan + food log in parallel (3 calls instead of 6)
      const [summaryRes, mealPlanRes, foodLogRes] = await Promise.all([
        fetch(`/api/client/dashboard-summary?date=${today}`, { cache: 'no-store' }),
        fetch(`/api/client/meal-plan?date=${today}`, { cache: 'no-store' }),
        fetch(`/api/food-logs?date=${today}`, { cache: 'no-store' })
      ]);

      const newData = { ...data };

      // Process aggregated health summary (hydration, sleep, activity, steps, profile)
      if (summaryRes.ok) {
        const summary = await summaryRes.json();

        // Hydration
        newData.water = {
          current: (summary.hydration?.totalToday / 1000) || 0,
          goal: (summary.hydration?.goal / 1000) || 2.5
        };

        // Sleep
        const totalHours = summary.sleep?.totalToday || 0;
        const hours = Math.floor(totalHours);
        const minutes = Math.round((totalHours - hours) * 60);
        const quality = summary.sleep?.goal > 0 ? Math.round((totalHours / summary.sleep.goal) * 100) : 0;
        newData.sleep = { hours, minutes, quality: Math.min(quality, 100) };

        // Activity
        newData.activity = {
          minutes: Math.round(summary.activity?.totalToday || 0),
          active: (summary.activity?.totalToday || 0) > 0
        };

        // Steps
        newData.steps = {
          current: summary.steps?.totalToday || 0,
          goal: summary.steps?.goal || 10000
        };

        // Update profile if available from summary
        if (summary.profile && !unmountedRef.current) {
          setUserProfile(prev => prev || {
            bmi: summary.profile.bmi || '',
            bmiCategory: summary.profile.bmiCategory || '',
            weightKg: summary.profile.weightKg || '',
            heightCm: summary.profile.heightCm || '',
            generalGoal: summary.profile.generalGoal || ''
          });

          // Update userName and userAvatar from API response
          if (summary.profile.firstName) {
            setUserName(summary.profile.firstName);
          }
          if (summary.profile.avatar) {
            setUserAvatar(summary.profile.avatar);
          }
        }
      }

      // Calculate calories from meal plan and food log
      let caloriesGoal = 2000; // Default goal
      let proteinGoal = 120; // Default protein goal in grams
      let carbsGoal = 250; // Default carbs goal in grams
      let fatGoal = 65; // Default fat goal in grams
      let caloriesConsumed = 0;
      let proteinConsumed = 0;
      let carbsConsumed = 0;
      let fatConsumed = 0;
      let mealsEaten = 0;
      let totalMeals = 4;

      if (mealPlanRes.ok) {
        const mealPlanData = await mealPlanRes.json();
        if (mealPlanData.hasPlan) {
          totalMeals = mealPlanData.meals?.length || 4;

          // Calculate total goals from all meals in the plan (sum of all food items)
          let totalProteinFromMeals = 0;
          let totalCarbsFromMeals = 0;
          let totalFatFromMeals = 0;
          let totalCaloriesFromMeals = 0;

          if (mealPlanData.meals && Array.isArray(mealPlanData.meals)) {
            mealPlanData.meals.forEach((meal: any) => {
              // Sum up from items/foods in each meal
              const items = meal.items || meal.foods || meal.foodOptions || [];
              if (Array.isArray(items) && items.length > 0) {
                // Only count MAIN foods (exclude alternatives)
                const mainItems = items.filter((item: any) => !item?.isAlternative);
                mainItems.forEach((item: any) => {
                  totalCaloriesFromMeals += parseFloat(item.calories) || parseFloat(item.cal) || 0;
                  totalProteinFromMeals += parseFloat(item.protein) || 0;
                  totalCarbsFromMeals += parseFloat(item.carbs) || 0;
                  totalFatFromMeals += parseFloat(item.fats) || parseFloat(item.fat) || 0;
                });
              } else if (meal.totalCalories) {
                // Only use meal level totals if no items exist
                totalCaloriesFromMeals += parseFloat(meal.totalCalories) || 0;
                totalProteinFromMeals += parseFloat(meal.protein) || 0;
                totalCarbsFromMeals += parseFloat(meal.carbs) || 0;
                totalFatFromMeals += parseFloat(meal.fat) || 0;
              }
            });
          }

          // Use API's totalCalories first, then calculated, then customizations
          caloriesGoal = mealPlanData.totalCalories || totalCaloriesFromMeals || mealPlanData.planDetails?.customizations?.targetCalories || 2000;
          proteinGoal = totalProteinFromMeals || mealPlanData.planDetails?.customizations?.proteinGoal || 120;
          carbsGoal = totalCarbsFromMeals || mealPlanData.planDetails?.customizations?.carbsGoal || 250;
          fatGoal = totalFatFromMeals || mealPlanData.planDetails?.customizations?.fatGoal || 65;

          // Count completed meals
          mealsEaten = (mealPlanData.meals || []).filter((meal: any) => meal.isCompleted).length;

          // Calculate calories and macros from completed meals
          const completedMeals = (mealPlanData.meals || []).filter((meal: any) => meal.isCompleted);
          completedMeals.forEach((meal: any) => {
            const items = meal.items || meal.foods || meal.foodOptions || [];
            if (Array.isArray(items) && items.length > 0) {
              // Only count MAIN foods (exclude alternatives)
              const mainItems = items.filter((item: any) => !item?.isAlternative);
              mainItems.forEach((item: any) => {
                caloriesConsumed += parseFloat(item.calories) || parseFloat(item.cal) || 0;
                proteinConsumed += parseFloat(item.protein) || 0;
                carbsConsumed += parseFloat(item.carbs) || 0;
                fatConsumed += parseFloat(item.fats) || parseFloat(item.fat) || 0;
              });
            } else if (meal.totalCalories) {
              // Fallback to meal level totals only if no items
              caloriesConsumed += parseFloat(meal.totalCalories) || 0;
              proteinConsumed += parseFloat(meal.protein) || 0;
              carbsConsumed += parseFloat(meal.carbs) || 0;
              fatConsumed += parseFloat(meal.fat) || 0;
            }
          });
        }
      }

      // Also add calories from food log entries (manual food logging)
      if (foodLogRes.ok) {
        const foodLogData = await foodLogRes.json();
        const totals = foodLogData?.dailyTotals || {};
        caloriesConsumed += totals.calories || 0;
        proteinConsumed += totals.protein || 0;
        carbsConsumed += totals.carbs || 0;
        fatConsumed += totals.fat || 0;
      }

      // Round all values for display
      newData.caloriesGoal = Math.round(caloriesGoal);
      newData.caloriesLeft = Math.max(0, Math.round(caloriesGoal - caloriesConsumed));
      newData.protein = Math.round(proteinConsumed);
      newData.proteinGoal = Math.round(proteinGoal);
      newData.carbs = Math.round(carbsConsumed);
      newData.carbsGoal = Math.round(carbsGoal);
      newData.fat = Math.round(fatConsumed);
      newData.fatGoal = Math.round(fatGoal);
      newData.meals = { eaten: mealsEaten, total: totalMeals, calories: Math.round(caloriesConsumed) };

      setData(prev => ({ ...prev, ...newData }));
    } catch (error) {
      console.error('Error fetching health data:', error);
    }
  }, []);

  // Function to refresh all data (called when meal plan, purchases, or payments change)
  const refreshAllData = useCallback(async () => {
    console.log('Refreshing all user data...');
    try {
      // Fetch service plans + health data (which includes profile)
      const planRes = await fetch('/api/client/service-plans', { cache: 'no-store' });

      // Also fetch health data (includes profile via dashboard-summary)
      fetchHealthData();

      if (planRes.ok) {
        const planData = await planRes.json();
        setHasActivePlan(planData.hasActivePlan || false);
        setHasAnyPurchase(planData.hasAnyPurchase || false);
        setHasPendingDietitianAssignment(planData.hasPendingDietitianAssignment || false);
        setActivePurchases(planData.activePurchases || []);
        setCurrentMealPlan(planData.currentMealPlan || null);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  }, [fetchHealthData]);

  // Listen for data changes and refresh
  useDataChangeListener(refreshAllData);

  // Listen for form data changes (basic info, lifestyle, medical, recall) and refresh
  useDataRefresh(
    [
      DataEventTypes.BASIC_INFO_UPDATED,
      DataEventTypes.LIFESTYLE_INFO_UPDATED,
      DataEventTypes.MEDICAL_INFO_UPDATED,
      DataEventTypes.DIETARY_RECALL_UPDATED,
      DataEventTypes.FORM_DATA_UPDATED
    ],
    () => {
      console.log('Form data changed, refreshing user data...');
      fetchHealthData();
    },
    []
  );

  // Helper to load service plans (used by onboarding check fast path)
  const loadServicePlans = async () => {
    try {
      const planRes = await fetchWithTimeout('/api/client/service-plans', undefined, 4000);
      if (planRes.ok) {
        const planData = await planRes.json();
        setHasActivePlan(planData.hasActivePlan || false);
        setHasAnyPurchase(planData.hasAnyPurchase || false);
        setHasPendingDietitianAssignment(planData.hasPendingDietitianAssignment || false);
        setActivePurchases(planData.activePurchases || []);
        setCurrentMealPlan(planData.currentMealPlan || null);
      }

      // Fetch health data (which includes profile from dashboard-summary)
      fetchHealthData();
    } catch (error) {
      console.error('Error loading service plans:', error);
    }
  };

  // Refresh health cards when the user returns to the dashboard (e.g. after
  // adding water/sleep/steps/activity on a tracker page) or refocuses the tab/app.
  useEffect(() => {
    if (status !== 'authenticated') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchHealthData();
      }
    };
    const handleFocus = () => fetchHealthData();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handleFocus);
    };
  }, [status, fetchHealthData]);

  // Handle payment callback verification
  useEffect(() => {
    const verifyPaymentCallback = async () => {
      const paymentSuccess = searchParams.get('payment_success');
      const paymentLinkId = searchParams.get('razorpay_payment_link_id');
      const razorpayPaymentId = searchParams.get('razorpay_payment_id');
      const paymentStatus = searchParams.get('razorpay_payment_link_status');
      const signature = searchParams.get('razorpay_signature');

      // If payment callback parameters exist, verify the payment
      if (paymentLinkId && paymentStatus === 'paid') {
        setPaymentVerifying(true);
        try {
          // Try the client service-plans verify first (for purchases made via ServicePlansSwiper)
          const response = await fetch('/api/client/service-plans/verify-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpayPaymentLinkId: paymentLinkId,
              razorpayPaymentId: razorpayPaymentId,
              signature
            })
          });

          const data = await response.json();

          if (data.success) {
            toast.success('Payment successful! Your plan is now active.');
            setHasAnyPurchase(true);
            // Refresh all data to show updated status
            refreshAllData();
            // Clear the URL parameters
            router.replace('/user');
          } else {
            toast.error(data.error || 'Payment verification failed');
          }
        } catch (error) {
          console.error('Payment verification error:', error);
          toast.error('Failed to verify payment. Please contact support.');
        } finally {
          setPaymentVerifying(false);
        }
      } else if (paymentSuccess === 'true' && !paymentLinkId) {
        // Direct payment success without link ID - just show success
        toast.success('Payment successful!');
        router.replace('/user');
      }
    };

    verifyPaymentCallback();
  }, [searchParams, router]);

  // Check onboarding status on mount
  useEffect(() => {
    // Skip if not authenticated
    if (status !== 'authenticated') {
      if (status === 'unauthenticated') {
        setCheckingOnboarding(false);
      }
      return;
    }

    // FAST PATH: Check session first for onboarding status (from JWT)
    // This avoids an API call in most cases and prevents redirect loops
    // Also check if user is a new user (just registered)
    if (session?.user?.onboardingCompleted === false || session?.user?.isNewUser === true) {
      setCheckingOnboarding(false);
      router.replace('/user/onboarding');
      return;
    }

    // If session says onboarding is complete, trust it and continue
    if (session?.user?.onboardingCompleted === true) {
      setCheckingOnboarding(false);
      // Continue to load the page - no API check needed
      loadServicePlans();
      return;
    }

    // Fallback: If session doesn't have onboardingCompleted (legacy users), check API
    const checkOnboarding = async () => {
      // Hard stop: never block the UI forever on slow networks/proxy issues
      // Reduced to 2 seconds for faster UX
      const hardStop = setTimeout(() => {
        if (!unmountedRef.current) {
          setCheckingOnboarding(false);
          // If still no answer, check API response or allow page to load
        }
      }, 2000);

      try {
        // Check onboarding and active plan in parallel
        const [onboardingRes, planRes] = await Promise.all([
          fetchWithTimeout('/api/client/onboarding', undefined, 2000),
          fetchWithTimeout('/api/client/service-plans', undefined, 2000)
        ]);

        clearTimeout(hardStop);

        if (onboardingRes.ok) {
          const data = await onboardingRes.json();
          if (!data.onboardingCompleted) {
            setCheckingOnboarding(false);
            router.replace('/user/onboarding');
            return;
          }
        }

        if (planRes.ok) {
          const planData = await planRes.json();
          setHasActivePlan(planData.hasActivePlan || false);
          setHasAnyPurchase(planData.hasAnyPurchase || false);
          setHasPendingDietitianAssignment(planData.hasPendingDietitianAssignment || false);
          setActivePurchases(planData.activePurchases || []);
        } else {
          // If API fails, assume no active plan so user can see available plans
          setHasActivePlan(false);
        }

        // IMPORTANT: don't block the whole /user page on other API calls
        setCheckingOnboarding(false);

        // Fetch user profile data (BMI, weight, height, etc.)
        (async () => {
          try {
            const profileRes = await fetchWithTimeout('/api/client/profile', undefined, 4000);
            if (profileRes.ok && !unmountedRef.current) {
              const profileData = await profileRes.json();
              setUserProfile({
                bmi: profileData.bmi || '',
                bmiCategory: profileData.bmiCategory || '',
                weightKg: profileData.weightKg || '',
                heightCm: profileData.heightCm || '',
                generalGoal: profileData.generalGoal || ''
              });
            }
          } catch (profileError) {
            console.error('Error fetching profile:', profileError);
          }
        })();

        // Fetch real-time health data (water, sleep, activity, steps)
        fetchHealthData();

        // Note: Blogs are fetched in a separate useEffect to ensure they load
        // even when the fast path (onboardingCompleted === true) is taken
      } catch (error) {
        console.error('Error checking onboarding:', error);
        // If there's an error, assume no active plan so user can see available plans
        setHasActivePlan(false);
        setCheckingOnboarding(false);
      }
      clearTimeout(hardStop);
    };

    checkOnboarding();
  }, [status, router, fetchHealthData, fetchWithTimeout]);

  // Fetch blogs independently - this should run as soon as the user is authenticated
  // Blogs don't depend on onboarding status
  useEffect(() => {
    if (status !== 'authenticated') return;

    const fetchBlogs = async () => {
      try {
        if (!unmountedRef.current) {
          setBlogsLoading(true);
          setBlogsError('');
        }
        const blogsRes = await fetchWithTimeout('/api/client/blogs?limit=5', undefined, 4000);
        if (!blogsRes.ok) {
          throw new Error(`Failed to fetch blogs (${blogsRes.status})`);
        }

        const contentType = blogsRes.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Blogs response was not JSON');
        }

        const blogsData = await blogsRes.json();
        console.log('Blogs API response:', blogsData); // Debug log

        // Handle both response formats: { blogs: [...] } and direct array
        const blogsList = Array.isArray(blogsData) ? blogsData : (blogsData.blogs || []);

        if (!unmountedRef.current) {
          setBlogs(blogsList);
          console.log('Blogs set:', blogsList); // Debug log
        }
      } catch (blogsError) {
        console.error('Error fetching blogs:', blogsError);
        if (!unmountedRef.current) {
          setBlogsError('Unable to load blogs right now.');
        }
      } finally {
        if (!unmountedRef.current) {
          setBlogsLoading(false);
        }
      }
    };

    fetchBlogs();
  }, [status, fetchWithTimeout]);

  // Handle scroll to update active card indicator
  const handleCardsScroll = () => {
    if (cardsContainerRef.current) {
      const container = cardsContainerRef.current;
      const scrollLeft = container.scrollLeft;
      const cardWidth = container.offsetWidth;
      const newActiveCard = Math.round(scrollLeft / cardWidth);
      setActiveCard(newActiveCard);
    }
  };

  const today = new Date();
  const dayName = format(today, 'EEEE').toUpperCase();
  const dateStr = format(today, 'MMM d').toUpperCase();

  const caloriesConsumed = data.caloriesGoal - data.caloriesLeft;
  const caloriesPercent = (caloriesConsumed / data.caloriesGoal) * 100;
  const waterPercent = (data.water.current / data.water.goal) * 100;
  const mealsPercent = (data.meals.eaten / data.meals.total) * 100;

  // Use state userName (from API) with fallback to session, then 'Alex'
  const displayName = userName || session?.user?.firstName || 'Alex';
  const displayAvatar = userAvatar || session?.user?.avatar;

  // Show loading while mounting, session is loading, checking onboarding, or verifying payment
  if (!mounted || status === 'loading' || checkingOnboarding || paymentVerifying) {
    return (
      <FullPageLoader
        size="lg"
        isDarkMode={isDarkMode}
        text={paymentVerifying ? 'Verifying your payment...' : undefined}
      />
    );
  }

  // Redirect to login if not authenticated
  if (status === 'unauthenticated') {
    return <FullPageLoader size="lg" isDarkMode={isDarkMode} />;
  }

  return (
    <div className={isDarkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900'}>
      {/* Header */}
      <SmoothComponent animation="fade-in">
        <div className={`px-4 pt-6 pb-4 ${isDarkMode ? 'bg-gray-950' : 'bg-white'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xs font-medium tracking-wider ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {dayName}, {dateStr}
              </p>
              <h1 className={`mt-1 text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Hi, {displayName}
              </h1>
            </div>
            <Link href="/user/profile">
              <div className="h-12 w-12 rounded-full bg-[#E06A26]/10 flex items-center justify-center overflow-hidden border-2 border-[#E06A26]/30 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                {displayAvatar ? (
                  <img
                    src={displayAvatar}
                    alt="Profile"
                    loading="lazy"
                    className="w-full h-full rounded-full "
                  />
                ) : (
                  <User className="h-6 w-6 text-[#E06A26]" />
                )}
              </div>
            </Link>
          </div>
        </div>
      </SmoothComponent>

      {/* Main Content */}
      <div className="px-4 py-4 space-y-4">
        {/* Calories Card */}
        <div
          className={`rounded-3xl p-5 shadow-sm border ${isDarkMode
            ? 'bg-gray-900/60 border-gray-800'
            : 'bg-linear-to-br from-[#3AB1A0]/10 to-[#3AB1A0]/20 border-[#3AB1A0]/10'
            }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Calories Left
              </p>
              <div className="flex items-baseline mt-1">
                <span className={`text-5xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  {data.caloriesLeft}
                </span>
                <span className={`ml-1 text-lg ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>kcal</span>
              </div>
              <div
                className={`flex items-center px-3 py-1 mt-2 rounded-full w-fit ${isDarkMode ? 'bg-gray-950/40' : 'bg-white/60'
                  }`}
              >
                <span className="text-[#3AB1A0] text-sm">🏁 Goal: {data.caloriesGoal.toLocaleString()}</span>
              </div>
            </div>

            {/* Circular Progress */}
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  stroke={isDarkMode ? '#374151' : '#e5e7eb'}
                  strokeWidth="8"
                  fill="none"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  stroke="url(#gradient)"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${caloriesPercent * 2.51} 251`}
                />
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3AB1A0" />
                    <stop offset="100%" stopColor="#2d9a8a" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-14 w-14 rounded-full bg-[#3AB1A0]/20 flex items-center justify-center">
                  <Flame className="h-7 w-7 text-[#3AB1A0]" />
                </div>
              </div>
            </div>
          </div>

          {/* Macros */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div>
              <div className="flex items-center justify-between">
                <p className={`text-xs font-medium tracking-wider uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Protein
                </p>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>/{data.proteinGoal}g</p>
              </div>
              <p className={`mt-1 text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{data.protein}g</p>
              <div className={`h-1.5 rounded-full mt-2 overflow-hidden ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <div
                  className="h-full bg-[#3AB1A0] rounded-full transition-all duration-300"
                  style={{ width: `${Math.min((data.protein / data.proteinGoal) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className={`text-xs font-medium tracking-wider uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Carbs
                </p>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>/{data.carbsGoal}g</p>
              </div>
              <p className={`mt-1 text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{data.carbs}g</p>
              <div className={`h-1.5 rounded-full mt-2 overflow-hidden ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <div
                  className="h-full bg-[#E06A26] rounded-full transition-all duration-300"
                  style={{ width: `${Math.min((data.carbs / data.carbsGoal) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className={`text-xs font-medium tracking-wider uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Fat
                </p>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>/{data.fatGoal}g</p>
              </div>
              <p className={`mt-1 text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{data.fat}g</p>
              <div className={`h-1.5 rounded-full mt-2 overflow-hidden ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <div
                  className="h-full bg-[#DB9C6E] rounded-full transition-all duration-300"
                  style={{ width: `${Math.min((data.fat / data.fatGoal) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>


        {/* Service Plans Swiper - Only shown when user has no purchases at all */}
        {!hasAnyPurchase && (
          <div className="pt-6 pb-4">
            <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><SpoonGifLoader size="md" /></div>}>
              <ServicePlansSwiper />
            </Suspense>
          </div>
        )}

        {/* Purchase Status Cards - Show only the first/current active purchase */}
        {activePurchases.length > 0 && (() => {
          // Get the current active purchase (first one or most recent)
          const currentPurchase = activePurchases[0];
          const hasOngoingMealPlanDates = Boolean(
            currentPurchase.hasOngoingMealPlan &&
            currentPurchase.ongoingMealPlanStartDate &&
            currentPurchase.ongoingMealPlanEndDate
          );

          const showMealPlanCreatedState = Boolean(currentPurchase.mealPlanCreated) && hasOngoingMealPlanDates;

          const displayPlanName = hasOngoingMealPlanDates
            ? (currentPurchase.mealPlanName || currentMealPlan?.name || currentPurchase.planName)
            : currentPurchase.planName;

          const displayStartDate = hasOngoingMealPlanDates
            ? currentPurchase.ongoingMealPlanStartDate
            : (currentPurchase.expectedStartDate || null);

          const displayEndDate = hasOngoingMealPlanDates
            ? currentPurchase.ongoingMealPlanEndDate
            : (currentPurchase.expectedEndDate || null);

          const displayDuration = hasOngoingMealPlanDates
            ? (currentPurchase.ongoingMealPlanDuration || currentMealPlan?.duration || currentPurchase.durationDays)
            : currentPurchase.durationDays;

          return (
            <div key={currentPurchase._id}>
              {showMealPlanCreatedState ? (
                /* STATE 3: Meal Plan Created - Full Details with actions */
                <div
                  className={
                    isDarkMode
                      ? 'rounded-3xl bg-gray-900/60 p-6 shadow-sm border border-gray-800'
                      : 'rounded-3xl bg-linear-to-br from-[#3AB1A0]/10 to-[#61a035]/10 p-6 shadow-sm border border-[#3AB1A0]/20'
                  }
                >
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 rounded-full bg-[#3AB1A0]/20 flex items-center justify-center overflow-hidden border-2 border-[#3AB1A0]/30">
                      {currentPurchase.dietitian?.avatar ? (
                        <img
                          src={currentPurchase.dietitian.avatar}
                          alt={currentPurchase.dietitian.name}
                          loading="lazy"
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <UserCheck className="h-8 w-8 text-[#3AB1A0]" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                          {currentPurchase.hasDietitian ? 'Your Dietitian' : 'Your Plan'}
                        </h3>
                        <span className="px-2 py-0.5 bg-[#3AB1A0] text-white text-xs font-semibold rounded-full">
                          Active ✓
                        </span>
                      </div>
                      {currentPurchase.hasDietitian && (
                        <>
                          <p className="text-base font-semibold text-[#3AB1A0] mt-1">
                            {currentPurchase.dietitian?.name || 'Dietitian'}
                          </p>
                          {/* {currentPurchase.dietitian?.email && (
                          <div className={`flex items-center gap-1 mt-1 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            <Mail className="w-3 h-3" />
                            <span>{currentPurchase.dietitian.email}</span>
                          </div>
                        )}
                        {currentPurchase.dietitian?.phone && (
                          <div className={`flex items-center gap-1 text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            <Phone className="w-3 h-3" />
                            <span>{currentPurchase.dietitian.phone}</span>
                          </div>
                        )} */}
                        </>
                      )}
                      {!currentPurchase.hasDietitian && (
                        <p className="text-base font-semibold text-[#3AB1A0] mt-1">
                          {currentPurchase.planName}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Plan Info - Full Details */}
                  <div className="mt-4 pt-4 border-t border-[#3AB1A0]/10">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Active Plan</span>
                      <span className="px-3 py-1 bg-[#61a035]/15 text-[#61a035] text-xs font-semibold rounded-full">
                        🟢 Active
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-950/40' : 'bg-white/60'}`}>
                        <p className={`text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Plan</p>
                        <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                          {displayPlanName}
                        </p>
                      </div>
                      <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-950/40' : 'bg-white/60'}`}>
                        <p className={`text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Duration</p>
                        <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{displayDuration} Days</p>
                      </div>
                      {/* Show meal plan dates (from actual meal plan, not payment) */}
                      {displayStartDate && (
                        <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-950/40' : 'bg-white/60'}`}>
                          <p className={`text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Start Date</p>
                          <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                            {format(new Date(displayStartDate), 'dd MMM yyyy')}
                          </p>
                        </div>
                      )}
                      {displayEndDate && (
                        <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-950/40' : 'bg-white/60'}`}>
                          <p className={`text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>End Date</p>
                          <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                            {format(new Date(displayEndDate), 'dd MMM yyyy')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions - View Meal Plan, Message & Book Appointment */}
                  <div className="mt-4 pt-4 border-t border-[#3AB1A0]/10 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Link
                        href="/user/plan"
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#3AB1A0] text-white rounded-xl text-sm font-semibold hover:bg-[#2A9A8B] transition-colors"
                      >
                        <Utensils className="w-4 h-4" />
                        <span>View Meal Plan</span>
                      </Link>
                      <Link
                        href="/user/messages"
                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-colors border border-[#3AB1A0] text-[#3AB1A0] ${isDarkMode ? 'bg-gray-950/40 hover:bg-gray-900/60' : 'bg-white hover:bg-[#3AB1A0]/10'
                          }`}
                      >
                        <Mail className="w-4 h-4" />
                        <span>Message</span>
                      </Link>
                    </div>
                    {currentPurchase.hasDietitian && (
                      <Link
                        href="/user/appointments/book"
                        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[#E06A26] text-white rounded-xl text-sm font-semibold hover:bg-[#d55f1f] transition-colors"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>Book Appointment</span>
                      </Link>
                    )}
                  </div>
                </div>
              ) : currentPurchase.hasDietitian ? (
                /* STATE 2: Dietitian Assigned but Meal Plan NOT Created Yet */
                <div
                  className={
                    isDarkMode
                      ? 'rounded-3xl bg-gray-900/60 p-6 shadow-sm border border-gray-800'
                      : 'rounded-3xl bg-linear-to-br from-[#3AB1A0]/10 to-[#61a035]/10 p-6 shadow-sm border border-[#3AB1A0]/20'
                  }
                >
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 rounded-full bg-[#3AB1A0]/20 flex items-center justify-center overflow-hidden border-2 border-[#3AB1A0]/30">
                      {currentPurchase.dietitian?.avatar ? (
                        <img
                          src={currentPurchase.dietitian.avatar}
                          alt={currentPurchase.dietitian.name}
                          loading="lazy"
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <UserCheck className="h-8 w-8 text-[#3AB1A0]" />
                      )}

                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Your Dietitian</h3>
                        <span className="px-2 py-0.5 bg-[#3AB1A0] text-white text-xs font-semibold rounded-full">
                          Assigned ✓
                        </span>
                      </div>
                      <p className="text-base font-semibold text-[#3AB1A0] mt-1">
                        {currentPurchase.dietitian?.name || 'Dietitian'}
                      </p>
                      {/* {currentPurchase.dietitian?.email && (
                      <div className={`flex items-center gap-1 mt-1 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <Mail className="w-3 h-3" />
                        <span>{currentPurchase.dietitian.email}</span>
                      </div>
                    )}
                    {currentPurchase.dietitian?.phone && (
                      <div className={`flex items-center gap-1 text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <Phone className="w-3 h-3" />
                        <span>{currentPurchase.dietitian.phone}</span>
                      </div>
                    )} */}
                    </div>
                  </div>

                  {/* Plan Info - No meal plan yet */}
                  <div className="mt-4 pt-4 border-t border-[#3AB1A0]/10">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Your Plan</span>
                      <span
                        className={`px-3 py-1 text-xs font-semibold rounded-full flex items-center gap-1 ${isDarkMode ? 'bg-amber-900/30 text-amber-200' : 'bg-amber-100 text-amber-700'
                          }`}
                      >
                        <Clock className="w-3 h-3" />
                        Plan Soon
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-950/40' : 'bg-white/60'}`}>
                        <p className={`text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Plan</p>
                        <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{currentPurchase.planName}</p>
                      </div>
                      <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-950/40' : 'bg-white/60'}`}>
                        <p className={`text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Duration</p>
                        <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{currentPurchase.durationDays} Days</p>
                      </div>
                      {currentPurchase.expectedStartDate && (
                        <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-950/40' : 'bg-white/60'}`}>
                          <p className={`text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Expected Start</p>
                          <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                            {format(new Date(currentPurchase.expectedStartDate), 'dd MMM yyyy')}
                          </p>
                        </div>
                      )}
                      {currentPurchase.expectedEndDate && (
                        <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-950/40' : 'bg-white/60'}`}>
                          <p className={`text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Expected End</p>
                          <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                            {format(new Date(currentPurchase.expectedEndDate), 'dd MMM yyyy')}
                          </p>
                        </div>
                      )}
                    </div>
                    {/* Notice - Meal plan being prepared */}
                    <div
                      className={`p-4 mt-3 border rounded-xl ${isDarkMode ? 'bg-blue-950/30 border-blue-900' : 'bg-blue-50 border-blue-200'
                        }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-blue-900/40' : 'bg-blue-100'}`}>
                          <Utensils className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>Meal Plan Coming Soon!</p>
                          <p className={`text-xs mt-1 ${isDarkMode ? 'text-blue-200/80' : 'text-blue-600'}`}
                          >
                            Your dietitian is preparing a personalized meal plan for you. You'll be notified once it's ready.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Message & Book Appointment Actions */}
                  <div className="mt-4 pt-4 border-t border-[#3AB1A0]/10 space-y-3">
                    <Link
                      href="/user/messages"
                      className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[#3AB1A0] text-white rounded-xl text-sm font-semibold hover:bg-[#2A9A8B] transition-colors"
                    >
                      <Mail className="w-4 h-4" />
                      <span>Message Your Dietitian</span>
                    </Link>
                    <Link
                      href="/user/appointments/book"
                      className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[#E06A26] text-white rounded-xl text-sm font-semibold hover:bg-[#d55f1f] transition-colors"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Book Appointment</span>
                    </Link>
                  </div>
                </div>
              ) : (
                /* STATE 1: Plan Purchased, Waiting for Dietitian Assignment */
                <div
                  className={
                    isDarkMode
                      ? 'rounded-3xl bg-gray-900/60 p-6 shadow-sm border border-gray-800'
                      : 'rounded-3xl bg-linear-to-br from-[#E06A26]/10 to-[#DB9C6E]/10 p-6 shadow-sm border border-[#E06A26]/20'
                  }
                >
                  <div className="flex items-start gap-4">
                    <div className="h-14 w-14 rounded-2xl flex items-center justify-center">
                      <img
                        src="/images/dtps-logo.png"
                        alt="DTPS"
                        loading="lazy"
                        className="object-cover w-full h-full"
                      />
                    </div>
                    <div className="flex-1">
                      <h3 className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Plan Purchased! 🎉</h3>
                      <p className={`mt-1 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        You've successfully purchased <span className="font-semibold text-[#E06A26]">{currentPurchase.planName}</span>
                      </p>
                      <div className="mt-3 flex items-center gap-2 text-sm text-[#DB9C6E]">
                        <Clock className="w-4 h-4" />
                        <span>Dietitian will be assigned shortly...</span>
                      </div>
                      <p className={`mt-2 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Our team is reviewing your profile and will assign the best dietitian for your goals.
                      </p>
                    </div>
                  </div>

                  {/* Plan Details - Only show duration, no dates until dietitian assigned */}
                  <div className="mt-4 pt-4 border-t border-[#E06A26]/10">
                    <div className="grid grid-cols-2 gap-3">
                      <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-950/40' : 'bg-white/60'}`}>
                        <p className={`text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Plan</p>
                        <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{currentPurchase.planName}</p>
                      </div>
                      <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-950/40' : 'bg-white/60'}`}>
                        <p className={`text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Duration</p>
                        <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{currentPurchase.durationDays} Days</p>
                      </div>
                      {currentPurchase.expectedStartDate && (
                        <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-950/40' : 'bg-white/60'}`}>
                          <p className={`text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Expected Start</p>
                          <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                            {format(new Date(currentPurchase.expectedStartDate), 'dd MMM yyyy')}
                          </p>
                        </div>
                      )}
                      {currentPurchase.expectedEndDate && (
                        <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-950/40' : 'bg-white/60'}`}>
                          <p className={`text-xs tracking-wide uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Expected End</p>
                          <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                            {format(new Date(currentPurchase.expectedEndDate), 'dd MMM yyyy')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* BMI Card - Show if BMI is available */}
        {/* BMI Card */}
        {userProfile?.bmi && (
          <div className={`rounded-3xl p-6 shadow-sm border ${isDarkMode ? 'bg-gray-900/60 border-gray-800' : 'bg-white border-[#E06A26]/15'}`}>

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className={`text-xs font-medium tracking-wider uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Body Mass Index
                </p>
                <div className="flex items-end gap-2 mt-1">
                  <span className={`text-4xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {userProfile.bmi}
                  </span>
                  <span className={`mb-1 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>kg/m²</span>
                </div>
              </div>

              {/* Category Badge */}
              <span
                className={`px-4 py-1.5 rounded-full text-sm font-semibold ${userProfile.bmiCategory === 'Normal'
                  ? 'bg-[#3AB1A0]/15 text-[#3AB1A0]'
                  : userProfile.bmiCategory === 'Underweight'
                    ? 'bg-blue-100 text-blue-700'
                    : userProfile.bmiCategory === 'Overweight'
                      ? 'bg-[#DB9C6E]/20 text-[#DB9C6E]'
                      : 'bg-[#E06A26]/15 text-[#E06A26]'
                  }`}
              >
                {userProfile.bmiCategory}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="relative mt-6">
              {/* Track - proportional to BMI ranges (15-40 scale) */}
              <div className="flex h-3 overflow-hidden rounded-full">
                {/* Underweight (15-18.5 = 3.5/25 = 14%) */}
                <div className="w-[14%] bg-blue-400/70" />
                {/* Normal (18.5-25 = 6.5/25 = 26%) */}
                <div className="w-[26%] bg-[#3AB1A0]" />
                {/* Overweight (25-29.9 = 4.9/25 = 19.6%) */}
                <div className="w-[20%] bg-[#DB9C6E]" />
                {/* Obese (30-40 = 10/25 = 40%) */}
                <div className="w-[40%] bg-[#E06A26]" />
              </div>

              {/* Indicator - contained within bounds */}
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 top-1/2"
                style={{
                  left: `clamp(2.5%, ${Math.min(
                    Math.max(((parseFloat(userProfile.bmi) - 15) / (40 - 15)) * 100, 2.5),
                    97.5
                  )}%, 97.5%)`,
                }}
              >
                <div className={`w-5 h-5 rounded-full shadow-md border-2 ${isDarkMode ? 'bg-gray-950 border-gray-200' : 'bg-white border-gray-900'}`} />
              </div>
            </div>

            {/* Scale */}
            <div className={`flex justify-between mt-2 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              <span>15</span>
              <span>18.5</span>
              <span>25</span>
              <span>30</span>
              <span>40</span>
            </div>

            <div className="flex justify-between mt-1 text-xs font-medium">
              <span className="text-blue-500">Under</span>
              <span className="text-[#3AB1A0]">Normal</span>
              <span className="text-[#DB9C6E]">Over</span>
              <span className="text-[#E06A26]">Obese</span>
            </div>

            {/* Weight & Height */}
            <div className={`grid grid-cols-2 gap-4 pt-4 mt-6 border-t ${isDarkMode ? 'border-gray-800' : 'border-gray-100'}`}>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#3AB1A0]/15 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-[#3AB1A0]" />
                </div>
                <div>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Weight</p>
                  <p className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {userProfile.weightKg} kg
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#E06A26]/15 flex items-center justify-center">
                  <User className="h-5 w-5 text-[#E06A26]" />
                </div>
                <div>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Height</p>
                  <p className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {userProfile.heightCm} cm
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Swipeable Image Cards - Only shown when user has no purchases at all */}
        {!hasAnyPurchase && (
          <div className="relative">
            <div
              ref={cardsContainerRef}
              onScroll={handleCardsScroll}
              className="flex gap-4 pb-2 overflow-x-auto snap-x snap-mandatory scrollbar-hide"
            >
              {/* Card 1 - Nutrition Tips */}
              <div className="min-w-full snap-start bg-linear-to-br from-[#DB9C6E] to-[#c88b5d] rounded-3xl p-5 text-white">
                <h4 className="mb-4 text-lg font-bold">Nutrition Tips</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center justify-center h-24 mb-3 overflow-hidden bg-white/30 rounded-xl">
                      <span className="text-4xl" role="img" aria-label="Healthy breakfast">🥗</span>
                    </div>
                    <p className="text-sm font-semibold">Healthy Breakfast</p>
                    <p className="mt-1 text-xs text-white/80">Start your day right</p>
                  </div>
                  <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center justify-center h-24 mb-3 overflow-hidden bg-white/30 rounded-xl">
                      <span className="text-4xl" role="img" aria-label="Fresh salad">🥬</span>
                    </div>
                    <p className="text-sm font-semibold">Fresh Salads</p>
                    <p className="mt-1 text-xs text-white/80">Colorful vegetables</p>
                  </div>
                </div>
              </div>

              {/* Card 2 - Fitness Goals */}
              <div className="min-w-full snap-start bg-linear-to-br from-[#DB9C6E] to-[#c88b5d] rounded-3xl p-5 text-white">
                <h4 className="mb-4 text-lg font-bold">Fitness Goals</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center justify-center h-24 mb-3 overflow-hidden bg-white/30 rounded-xl">
                      <span className="text-4xl" role="img" aria-label="Workout">🏋️</span>
                    </div>
                    <p className="text-sm font-semibold">Daily Workout</p>
                    <p className="mt-1 text-xs text-white/80">30 mins exercise</p>
                  </div>
                  <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center justify-center h-24 mb-3 overflow-hidden bg-white/30 rounded-xl">
                      <span className="text-4xl" role="img" aria-label="Running">🏃</span>
                    </div>
                    <p className="text-sm font-semibold">Cardio Run</p>
                    <p className="mt-1 text-xs text-white/80">Build endurance</p>
                  </div>
                </div>
              </div>

              {/* Card 3 - Wellness */}
              <div className="min-w-full snap-start bg-linear-to-br from-[#DB9C6E] to-[#c88b5d] rounded-3xl p-5 text-white">
                <h4 className="mb-4 text-lg font-bold">Wellness & Rest</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center justify-center h-24 mb-3 overflow-hidden bg-white/30 rounded-xl">
                      <span className="text-4xl" role="img" aria-label="Yoga">🧘</span>
                    </div>
                    <p className="text-sm font-semibold">Morning Yoga</p>
                    <p className="mt-1 text-xs text-white/80">Stretch & relax</p>
                  </div>
                  <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center justify-center h-24 mb-3 overflow-hidden bg-white/30 rounded-xl">
                      <span className="text-4xl" role="img" aria-label="Sleep">😴</span>
                    </div>
                    <p className="text-sm font-semibold">Quality Sleep</p>
                    <p className="mt-1 text-xs text-white/80">7-8 hours rest</p>
                  </div>
                </div>
              </div>
            </div>
            {/* Swipe indicator dots */}
            <div className="flex justify-center gap-1.5 mt-3">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className={`w-2 h-2 rounded-full transition-colors ${activeCard === index ? 'bg-[#E06A26]' : isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
                    }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Motivational Quote */}
        <div className={`p-5 rounded-2xl shadow-sm ${isDarkMode ? 'bg-gray-900/60 border border-gray-800' : 'bg-white'}`}>
          <div className="flex items-start gap-3">
            <span className="text-3xl text-[#3AB1A0]/30">"</span>
            <div className="flex-1">
              <p className={`italic ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                "The only bad workout is the one that didn't happen."
              </p>
              <p className="text-[#E06A26] text-xs font-semibold mt-2 tracking-wider uppercase">
                Daily Motivation
              </p>
            </div>
            <span className="text-3xl text-[#3AB1A0]/30 self-end">"</span>
          </div>
        </div>

        {/* Quick Logs heading */}
        <h2 className={`text-base font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          Quick Logs
        </h2>

        {/* Water & Sleep Row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Water Card */}
          <Link
            href="/user/hydration"
            className={`rounded-2xl p-4 transition-all cursor-pointer border border-[#3AB1A0]/10 ${isDarkMode ? 'bg-gray-900/60 hover:bg-gray-900 border-gray-800' : 'bg-white shadow-sm hover:shadow-md'
              }`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className={`text-xs font-medium tracking-wider uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Water</p>
              <span className="text-[#3AB1A0] text-sm font-semibold">{Math.round(waterPercent)}%</span>
            </div>
            <div className="flex items-center justify-center mb-3">
              <div className="relative w-16 h-16">
                {/* Circular progress background */}
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle cx="32" cy="32" r="28" stroke="#3AB1A0" strokeOpacity="0.2" strokeWidth="6" fill="none" />
                  <circle
                    cx="32" cy="32" r="28"
                    stroke="#3AB1A0"
                    strokeWidth="6"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${waterPercent * 1.76} 176`}
                    className="transition-all duration-500"
                  />
                </svg>
                {/* Water drop icon in center */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Droplet className="h-6 w-6 text-[#3AB1A0]" fill="#3AB1A0" fillOpacity="0.3" />
                </div>
              </div>
            </div>
            <p className="text-center">
              <span className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{data.water.current}</span>
              <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}> / {data.water.goal}L</span>
            </p>
          </Link>

          {/* Sleep Card */}
          <Link
            href="/user/sleep"
            className={`rounded-2xl p-4 transition-all cursor-pointer border border-[#DB9C6E]/10 ${isDarkMode ? 'bg-gray-900/60 hover:bg-gray-900 border-gray-800' : 'bg-white shadow-sm hover:shadow-md'
              }`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className={`text-xs font-medium tracking-wider uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Sleep</p>
              <span className="text-[#DB9C6E] text-sm font-semibold">{data.sleep.hours}h {data.sleep.minutes}m</span>
            </div>
            <div className="flex items-center justify-center mb-3">
              <div className="h-16 w-16 rounded-2xl bg-[#DB9C6E]/10 flex items-center justify-center">
                <Bed className="h-8 w-8 text-[#DB9C6E]" />
              </div>
            </div>
            <p className="text-center">
              <span className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{data.sleep.quality}</span>
              <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}> %</span>
            </p>
          </Link>
        </div>

        {/* Activity & Steps Row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Activity Card */}
          <Link
            href="/user/activity"
            className={`rounded-2xl p-4 transition-all cursor-pointer border border-[#E06A26]/10 ${isDarkMode ? 'bg-gray-900/60 hover:bg-gray-900 border-gray-800' : 'bg-white shadow-sm hover:shadow-md'
              }`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className={`text-xs font-medium tracking-wider uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Activity</p>
              <span className={`text-sm font-semibold ${data.activity.active ? 'text-[#E06A26]' : 'text-gray-400'}`}>
                {data.activity.active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex items-center justify-center mb-3">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle cx="32" cy="32" r="28" stroke="#E06A26" strokeOpacity="0.2" strokeWidth="6" fill="none" />
                  <circle
                    cx="32" cy="32" r="28"
                    stroke="#E06A26"
                    strokeWidth="6"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${(data.activity.minutes / 60) * 176} 176`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Activity className="h-6 w-6 text-[#E06A26]" />
                </div>
              </div>
            </div>
            <p className="text-center">
              <span className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{data.activity.minutes}</span>
              <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}> min</span>
            </p>
          </Link>

          {/* Steps Card */}
          <Link
            href="/user/steps"
            className={`rounded-2xl p-4 transition-all cursor-pointer border border-[#3AB1A0]/10 ${isDarkMode ? 'bg-gray-900/60 hover:bg-gray-900 border-gray-800' : 'bg-white shadow-sm hover:shadow-md'
              }`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className={`text-xs font-medium tracking-wider uppercase ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Steps</p>
              <span className="text-[#3AB1A0] text-sm font-semibold">{data.steps.current} / {data.steps.goal}</span>
            </div>
            <div className="flex items-center justify-center mb-3">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle cx="32" cy="32" r="28" stroke="#3AB1A0" strokeOpacity="0.2" strokeWidth="6" fill="none" />
                  <circle
                    cx="32" cy="32" r="28"
                    stroke="#3AB1A0"
                    strokeWidth="6"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${mealsPercent * 1.76} 176`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Footprints className="h-6 w-6 text-[#3AB1A0]" />
                </div>
              </div>
            </div>
            <p className="text-center">
              <span className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{data.steps.current.toLocaleString()}</span>
              <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}> Steps</span>
            </p>
          </Link>
        </div>

        {/* Quick Log Section */}
        {false && (
          <div>
            <h2 className="text-lg font-bold text-[#E06A26] mb-4">
              Quick Log
            </h2>

            {/* Grid Container */}
            <div className="grid grid-cols-2 gap-4">

              {/* Water */}
              <Link
                href="/user/hydration"
                className={`flex flex-col items-center gap-4 p-6 transition-all rounded-3xl ${isDarkMode
                  ? 'bg-gray-900/60 border border-gray-800 hover:bg-gray-900'
                  : 'bg-white shadow-md hover:shadow-lg hover:bg-gray-50'
                  }`}
              >
                <div className="h-16 w-16 rounded-full bg-[#3AB1A0]/10 flex items-center justify-center">
                  <Droplet className="h-8 w-8 text-[#3AB1A0]" fill="#3AB1A0" fillOpacity="0.3" />
                </div>
                <span className={`text-base font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Water</span>
                <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>+250 ml</span>
              </Link>

              {/* Exercise */}
              <Link
                href="/user/activity"
                className={`flex flex-col items-center gap-4 p-6 transition-all rounded-3xl ${isDarkMode
                  ? 'bg-gray-900/60 border border-gray-800 hover:bg-gray-900'
                  : 'bg-white shadow-md hover:shadow-lg hover:bg-gray-50'
                  }`}
              >
                <div className="h-16 w-16 rounded-full bg-[#E06A26]/10 flex items-center justify-center">
                  <Activity className="h-8 w-8 text-[#E06A26]" />
                </div>
                <span className={`text-base font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Exercise</span>
                <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>Log Activity</span>
              </Link>

              {/* Sleep */}
              <Link
                href="/user/sleep"
                className={`flex flex-col items-center gap-4 p-6 transition-all rounded-3xl ${isDarkMode
                  ? 'bg-gray-900/60 border border-gray-800 hover:bg-gray-900'
                  : 'bg-white shadow-md hover:shadow-lg hover:bg-gray-50'
                  }`}
              >
                <div className="h-16 w-16 rounded-full bg-[#DB9C6E]/20 flex items-center justify-center">
                  <Moon className="h-8 w-8 text-[#DB9C6E]" />
                </div>
                <span className={`text-base font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Sleep</span>
                <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>Duration</span>
              </Link>

              {/* Steps */}
              <Link
                href="/user/steps"
                className={`flex flex-col items-center gap-4 p-6 transition-all rounded-3xl ${isDarkMode
                  ? 'bg-gray-900/60 border border-gray-800 hover:bg-gray-900'
                  : 'bg-white shadow-md hover:shadow-lg hover:bg-gray-50'
                  }`}
              >
                <div className="h-16 w-16 rounded-full bg-[#3AB1A0]/10 flex items-center justify-center">
                  <Footprints className="h-8 w-8 text-[#3AB1A0]" />
                </div>
                <span className={`text-base font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Steps</span>
                <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>
                  {data.steps.current.toLocaleString()}
                </span>
              </Link>

            </div>
          </div>
        )}

        {/* Transformation Success Stories */}
        <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><SpoonGifLoader size="md" /></div>}>
          <TransformationSwiper />
        </Suspense>

        {/* Blogs Section */}
        <>
          <div className="">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-[#E06A26]">Blogs</h2>
              <Link href="/user/blogs" className="text-[#3AB1A0] text-sm font-medium uppercase tracking-wider hover:underline">
                View All
              </Link>
            </div>
          </div>

          {blogsLoading ? (
            <div className={`rounded-2xl p-6 ${isDarkMode ? 'bg-gray-900/60 border border-gray-800' : 'bg-white shadow-md'}`}>
              <div className="flex items-center gap-3">
                <SpoonGifLoader size="sm" />
                <p className={`${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Loading blogs…</p>
              </div>
            </div>
          ) : blogsError ? (
            <div className={`rounded-2xl p-6 ${isDarkMode ? 'bg-gray-900/60 border border-gray-800' : 'bg-white shadow-md'}`}>
              <p className={`${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{blogsError}</p>
              <button
                type="button"
                onClick={() => {
                  setBlogsError('');
                  setBlogsLoading(true);
                  (async () => {
                    try {
                      const res = await fetchWithTimeout('/api/client/blogs?limit=5', undefined, 6000);
                      if (!res.ok) throw new Error(`Failed to fetch blogs (${res.status})`);
                      const ct = res.headers.get('content-type') || '';
                      if (!ct.includes('application/json')) throw new Error('Blogs response was not JSON');
                      const data = await res.json();
                      if (!unmountedRef.current) setBlogs(data.blogs || []);
                    } catch (e) {
                      console.error('Retry blogs failed:', e);
                      if (!unmountedRef.current) setBlogsError('Unable to load blogs right now.');
                    } finally {
                      if (!unmountedRef.current) setBlogsLoading(false);
                    }
                  })();
                }}
                className="mt-3 inline-flex items-center justify-center px-4 py-2 rounded-full bg-[#3AB1A0] text-white text-sm font-semibold"
              >
                Retry
              </button>
            </div>
          ) : blogs.length === 0 ? (
            <div className={`rounded-2xl p-6 ${isDarkMode ? 'bg-gray-900/60 border border-gray-800' : 'bg-white shadow-md'}`}>
              <p className={`${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>No blogs available yet.</p>
            </div>
          ) : (
            <div className="px-">
              <div className="flex gap-4 pb-2 overflow-x-auto snap-x snap-mandatory scrollbar-hide">
                {blogs.map((blog) => {
                  const getCategoryColor = (category: string) => {
                    switch (category.toLowerCase()) {
                      case 'nutrition': return 'text-[#E06A26]';
                      case 'fitness': return 'text-[#3AB1A0]';
                      case 'wellness': return 'text-purple-500';
                      case 'recipes': return 'text-green-500';
                      case 'lifestyle': return 'text-blue-500';
                      default: return 'text-[#DB9C6E]';
                    }
                  };
                  const getCategoryBg = (category: string) => {
                    switch (category.toLowerCase()) {
                      case 'nutrition': return 'from-amber-100 to-orange-100';
                      case 'fitness': return 'from-[#3AB1A0]/20 to-[#3AB1A0]/10';
                      case 'wellness': return 'from-purple-100 to-purple-50';
                      case 'recipes': return 'from-green-100 to-green-50';
                      case 'lifestyle': return 'from-blue-100 to-blue-50';
                      default: return 'from-[#DB9C6E]/20 to-[#DB9C6E]/10';
                    }
                  };
                  return (
                    <Link
                      key={blog._id}
                      href={`/user/blogs/${blog.slug || blog._id}`}
                      className={`min-w-65 snap-start rounded-2xl shadow-sm overflow-hidden transition-all hover:shadow-md hover:-translate-y-1 ${isDarkMode ? 'bg-gray-900/60 border border-gray-800' : 'bg-white'}`}
                    >
                      <div className={`relative h-32 bg-linear-to-br ${blog.thumbnailImage || blog.featuredImage ? '' : getCategoryBg(blog.category)}`}>
                        {(blog.thumbnailImage || blog.featuredImage) ? (
                          <img
                            src={blog.thumbnailImage || blog.featuredImage}
                            alt={blog.title}
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                        <span className={`absolute px-2 py-1 text-xs font-semibold rounded-full top-3 left-3 ${isDarkMode ? 'bg-gray-950/60 text-gray-200' : 'bg-white/90 text-gray-700'}`}>
                          {blog.category.toUpperCase()}
                        </span>
                        <div className="absolute flex items-center gap-1 px-2 py-1 text-xs text-white rounded-full bottom-3 right-3 bg-black/50">
                          <Clock className="w-3 h-3" />
                          {blog.readTime} min read
                        </div>
                      </div>
                      <div className="p-4">
                        <h3 className={`font-bold line-clamp-1 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{blog.title}</h3>
                        <p className={`mt-1 text-sm line-clamp-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                          {blog.description?.replace(/<[^>]*>/g, '').substring(0, 100)}...
                        </p>
                        <span className={`${getCategoryColor(blog.category)} text-sm font-semibold mt-3 inline-flex items-center`}>
                          Read More <ChevronRight className="w-4 h-4 ml-1" />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </>
      </div>
    </div>
  );
}