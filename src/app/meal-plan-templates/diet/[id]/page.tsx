'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, ChefHat, Target, Pencil, User, Globe, Lock, Flame, Dumbbell, Clock, Star, Leaf, UtensilsCrossed, Calendar, Coffee, Sun, Moon, Utensils, Salad, Sandwich, Cookie, Soup, Pizza } from 'lucide-react';
import Link from 'next/link';
import { UserRole } from '@/types';

interface FoodOption {
  id: string;
  label: string;
  food: string;
  unit: string;
  cal: string;
  carbs: string;
  fats: string;
  protein: string;
  isAlternative?: boolean;
}

interface Meal {
  id: string;
  time: string;
  name: string;
  foodOptions: FoodOption[];
  showAlternatives?: boolean;
}

interface DayPlan {
  id: string;
  day: string;
  date: string;
  meals: { [mealType: string]: Meal };
  note: string;
}

interface DietTemplateResp {
  _id: string;
  name: string;
  description?: string;
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
  mealTypes?: { name: string; time: string }[];
  meals: DayPlan[];
  difficulty?: string;
  isPublic?: boolean;
  isPremium?: boolean;
  prepTime?: { daily: number; weekly: number };
  targetAudience?: {
    ageGroup: string[];
    activityLevel: string[];
    healthConditions: string[];
    goals: string[];
  };
  usageCount?: number;
  averageRating?: number;
  createdBy?: { _id?: string; firstName?: string; lastName?: string };
  createdAt?: string;
  updatedAt?: string;
}

// Meal type ordering and icons
const MEAL_TYPE_ORDER: { [key: string]: number } = {
  'early-morning': 1,
  'earlymorning': 1,
  'breakfast': 2,
  'mid-morning': 3,
  'midmorning': 3,
  'brunch': 4,
  'lunch': 5,
  'afternoon': 6,
  'afternoon-snack': 6,
  'snack': 7,
  'evening': 8,
  'evening-snack': 8,
  'dinner': 9,
  'supper': 10,
  'late-night': 11,
  'latenight': 11,
  'pre-workout': 12,
  'post-workout': 13,
};

const getMealIcon = (mealType: string) => {
  const type = mealType.toLowerCase().replace(/[\s-_]/g, '');
  if (type.includes('breakfast') || type.includes('earlymorning')) return Coffee;
  if (type.includes('lunch') || type.includes('brunch')) return Utensils;
  if (type.includes('dinner') || type.includes('supper')) return Moon;
  if (type.includes('snack') || type.includes('evening')) return Cookie;
  if (type.includes('morning') || type.includes('afternoon')) return Sun;
  return Salad;
};

const getMealTypeColor = (mealType: string) => {
  const type = mealType.toLowerCase().replace(/[\s-_]/g, '');
  if (type.includes('breakfast') || type.includes('earlymorning')) return 'bg-amber-50 border-amber-200 text-amber-700';
  if (type.includes('lunch') || type.includes('brunch')) return 'bg-green-50 border-green-200 text-green-700';
  if (type.includes('dinner') || type.includes('supper')) return 'bg-indigo-50 border-indigo-200 text-indigo-700';
  if (type.includes('snack')) return 'bg-pink-50 border-pink-200 text-pink-700';
  if (type.includes('morning')) return 'bg-orange-50 border-orange-200 text-orange-700';
  if (type.includes('evening') || type.includes('afternoon')) return 'bg-purple-50 border-purple-200 text-purple-700';
  return 'bg-gray-50 border-gray-200 text-gray-700';
};

// Parse time string to minutes for sorting (handles both 24-hour and 12-hour formats)
const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 720; // Default to noon if no time

  timeStr = timeStr.trim();

  // Handle 12-hour format with AM/PM
  const ampmMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3].toLowerCase();

    // Convert to 24-hour for sorting
    if (period === 'pm' && hours !== 12) {
      hours += 12;
    } else if (period === 'am' && hours === 12) {
      hours = 0;
    }

    return hours * 60 + minutes;
  }

  // Handle 24-hour format
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    return hours * 60 + minutes;
  }

  return 720; // Default to noon
};

// Sort meals by time
const sortMealsByTime = (
  meals: { [mealType: string]: Meal },
  templateMealTypes?: { name: string; time: string }[]
): [string, Meal][] => {
  const schedule = new Map<string, string>();
  if (Array.isArray(templateMealTypes)) {
    templateMealTypes.forEach((mealType) => {
      const name = String(mealType?.name || '').trim();
      if (!name) return;
      schedule.set(name.toLowerCase().replace(/[\s-_]/g, ''), String(mealType?.time || '').trim());
    });
  }

  return Object.entries(meals).sort(([typeA, mealA], [typeB, mealB]) => {
    const normalizedTypeA = typeA.toLowerCase().replace(/[\s-_]/g, '');
    const normalizedTypeB = typeB.toLowerCase().replace(/[\s-_]/g, '');

    // First sort by template schedule time when available, then meal payload time.
    const timeA = parseTimeToMinutes(schedule.get(normalizedTypeA) || mealA.time);
    const timeB = parseTimeToMinutes(schedule.get(normalizedTypeB) || mealB.time);

    if (timeA !== timeB) return timeA - timeB;

    // Then by meal type order
    const orderA = MEAL_TYPE_ORDER[normalizedTypeA] || 50;
    const orderB = MEAL_TYPE_ORDER[normalizedTypeB] || 50;

    return orderA - orderB;
  });
};

export default function DietTemplateViewPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const id = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [template, setTemplate] = useState<DietTemplateResp | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);

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

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/diet-templates/${id}`);
        if (res.ok) {
          const data = await res.json();
          setTemplate(data.template);
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
    if (id && session) fetchTemplate();
  }, [id, session]);

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'weight-loss': 'bg-red-100 text-red-800 border-red-200',
      'weight-gain': 'bg-green-100 text-green-800 border-green-200',
      'maintenance': 'bg-blue-100 text-blue-800 border-blue-200',
      'muscle-gain': 'bg-purple-100 text-purple-800 border-purple-200',
      'diabetes': 'bg-orange-100 text-orange-800 border-orange-200',
      'heart-healthy': 'bg-pink-100 text-pink-800 border-pink-200',
      'keto': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'vegan': 'bg-emerald-100 text-emerald-800 border-emerald-200',
      'custom': 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colors[category] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getDifficultyColor = (difficulty: string) => {
    const colors: { [key: string]: string } = {
      'beginner': 'bg-green-100 text-green-800',
      'intermediate': 'bg-yellow-100 text-yellow-800',
      'advanced': 'bg-red-100 text-red-800'
    };
    return colors[difficulty] || 'bg-gray-100 text-gray-800';
  };

  const formatCategoryName = (category: string) =>
    category.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  };

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
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/meal-plan-templates">
              <ArrowLeft className="h-4 w-4 mr-2" />Back to Templates
            </Link>
          </Button>
          {(session?.user?.role === UserRole.DIETITIAN || session?.user?.role === UserRole.ADMIN) && template && (
            <Button asChild>
              <Link href={`/meal-plan-templates/diet/${id}/edit`}>
                <Pencil className="h-4 w-4 mr-2" />Edit Template
              </Link>
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {template && (
          <>
            {/* Main Info Card */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="capitalize text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                        <Leaf className="h-3 w-3 mr-1" />Diet Template
                      </Badge>
                      {template.isPublic ? (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          <Globe className="h-3 w-3 mr-1" />Public
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600">
                          <Lock className="h-3 w-3 mr-1" />Private
                        </Badge>
                      )}
                      {template.isPremium && (
                        <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200">
                          <Star className="h-3 w-3 mr-1" />Premium
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <ChefHat className="h-6 w-6 text-emerald-600" />
                      {template.name}
                    </CardTitle>
                    <CardDescription className="mt-2 text-base">
                      {template.description || 'No description provided'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-linear-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                    <div className="text-xs text-blue-600 font-medium mb-1">Category</div>
                    <Badge className={`${getCategoryColor(template.category)} border`}>
                      {formatCategoryName(template.category)}
                    </Badge>
                  </div>
                  <div className="bg-linear-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200">
                    <div className="text-xs text-orange-600 font-medium mb-1">Difficulty</div>
                    <Badge className={getDifficultyColor(template.difficulty || 'intermediate')}>
                      {(template.difficulty || 'Intermediate').charAt(0).toUpperCase() + (template.difficulty || 'intermediate').slice(1)}
                    </Badge>
                  </div>
                  <div className="bg-linear-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                    <div className="text-xs text-green-600 font-medium mb-1">Usage Count</div>
                    <div className="text-lg font-bold text-green-800">{template.usageCount || 0}</div>
                  </div>
                </div>

                {/* Dietary Restrictions */}
                {template.dietaryRestrictions && template.dietaryRestrictions.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <Leaf className="h-4 w-4 text-emerald-600" />
                      Dietary Restrictions
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {template.dietaryRestrictions.map((restriction, i) => (
                        <Badge key={i} variant="outline" className="text-xs capitalize bg-emerald-50 text-emerald-700 border-emerald-200">
                          {restriction.replace('-', ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Nutrition Targets */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <Target className="h-4 w-4 text-blue-600" />
                    Nutrition Targets
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-50 border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Flame className="h-4 w-4 text-orange-500" />
                        <span className="text-xs text-gray-600">Calories</span>
                      </div>
                      <div className="font-semibold text-gray-900">
                        {template.targetCalories.min} - {template.targetCalories.max}
                      </div>
                      <div className="text-[10px] text-gray-500">kcal/day</div>
                    </div>
                    <div className="bg-gray-50 border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Dumbbell className="h-4 w-4 text-red-500" />
                        <span className="text-xs text-gray-600">Protein</span>
                      </div>
                      <div className="font-semibold text-gray-900">
                        {template.targetMacros.protein.min} - {template.targetMacros.protein.max}g
                      </div>
                      <div className="text-[10px] text-gray-500">per day</div>
                    </div>
                    <div className="bg-gray-50 border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="h-4 w-4 rounded-full bg-amber-500" />
                        <span className="text-xs text-gray-600">Carbs</span>
                      </div>
                      <div className="font-semibold text-gray-900">
                        {template.targetMacros.carbs.min} - {template.targetMacros.carbs.max}g
                      </div>
                      <div className="text-[10px] text-gray-500">per day</div>
                    </div>
                    <div className="bg-gray-50 border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="h-4 w-4 rounded-full bg-yellow-500" />
                        <span className="text-xs text-gray-600">Fat</span>
                      </div>
                      <div className="font-semibold text-gray-900">
                        {template.targetMacros.fat.min} - {template.targetMacros.fat.max}g
                      </div>
                      <div className="text-[10px] text-gray-500">per day</div>
                    </div>
                  </div>
                </div>

                {/* Prep Time */}
                {template.prepTime && (template.prepTime.daily > 0 || template.prepTime.weekly > 0) && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <Clock className="h-4 w-4 text-blue-600" />
                      Preparation Time
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 border rounded-lg p-3">
                        <div className="text-xs text-gray-600 mb-1">Daily Prep</div>
                        <div className="font-semibold text-gray-900">{template.prepTime.daily} minutes</div>
                      </div>
                      <div className="bg-gray-50 border rounded-lg p-3">
                        <div className="text-xs text-gray-600 mb-1">Weekly Total</div>
                        <div className="font-semibold text-gray-900">{template.prepTime.weekly} minutes</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Target Audience */}
                {template.targetAudience && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <User className="h-4 w-4 text-blue-600" />
                      Target Audience
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {template.targetAudience.ageGroup && template.targetAudience.ageGroup.length > 0 && (
                        <div className="bg-gray-50 border rounded-lg p-3">
                          <div className="text-xs text-gray-600 mb-2">Age Groups</div>
                          <div className="flex flex-wrap gap-1">
                            {template.targetAudience.ageGroup.map((ag, i) => (
                              <Badge key={i} variant="outline" className="text-xs capitalize">{ag}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {template.targetAudience.activityLevel && template.targetAudience.activityLevel.length > 0 && (
                        <div className="bg-gray-50 border rounded-lg p-3">
                          <div className="text-xs text-gray-600 mb-2">Activity Levels</div>
                          <div className="flex flex-wrap gap-1">
                            {template.targetAudience.activityLevel.map((al, i) => (
                              <Badge key={i} variant="outline" className="text-xs capitalize">{al}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {template.targetAudience.healthConditions && template.targetAudience.healthConditions.length > 0 && (
                        <div className="bg-gray-50 border rounded-lg p-3">
                          <div className="text-xs text-gray-600 mb-2">Health Conditions</div>
                          <div className="flex flex-wrap gap-1">
                            {template.targetAudience.healthConditions.map((hc, i) => (
                              <Badge key={i} variant="outline" className="text-xs capitalize">{hc}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {template.targetAudience.goals && template.targetAudience.goals.length > 0 && (
                        <div className="bg-gray-50 border rounded-lg p-3">
                          <div className="text-xs text-gray-600 mb-2">Goals</div>
                          <div className="flex flex-wrap gap-1">
                            {template.targetAudience.goals.map((g, i) => (
                              <Badge key={i} variant="outline" className="text-xs capitalize">{g}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Meals Section */}
                {template.meals && template.meals.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <UtensilsCrossed className="h-4 w-4 text-orange-600" />
                      Diet Plan ({template.meals.length} Days)
                    </div>

                    {/* Day Selector - Horizontal scrollable tabs */}
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                      {template.meals.map((day, index) => (
                        <Button
                          key={day.id || index}
                          variant={selectedDay === index ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedDay(index)}
                          className={`text-xs whitespace-nowrap shrink-0 ${selectedDay === index
                            ? 'bg-emerald-600 hover:bg-emerald-700'
                            : 'hover:bg-emerald-50 hover:border-emerald-300'
                            }`}
                        >
                          <Calendar className="h-3 w-3 mr-1" />
                          {day.day || `Day ${index + 1}`}
                          {day.date && (
                            <span className="ml-2 opacity-80 text-[10px] font-medium">
                              {new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })}
                            </span>
                          )}
                        </Button>
                      ))}
                    </div>

                    {/* Selected Day Meals - Improved Layout */}
                    {template.meals[selectedDay] && (
                      <Card className="border-2 border-emerald-200 overflow-hidden">
                        <CardHeader className="pb-3 bg-linear-to-r from-emerald-50 to-green-50 border-b border-emerald-100">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-3">
                              <Calendar className="h-5 w-5 text-emerald-600" />
                              <span className="font-bold text-gray-800">{template.meals[selectedDay].day || `Day ${selectedDay + 1}`}</span>
                              {template.meals[selectedDay].date && (
                                <Badge className="text-xs font-bold bg-emerald-100 text-emerald-800 border-0 ml-2">
                                  📅 {new Date(template.meals[selectedDay].date).toLocaleDateString('en-IN', {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric',
                                    timeZone: 'Asia/Kolkata',
                                  })}
                                </Badge>
                              )}
                            </CardTitle>
                            {/* Day Summary */}
                            {Object.keys(template.meals[selectedDay].meals || {}).length > 0 && (
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="font-medium">
                                  {Object.keys(template.meals[selectedDay].meals).length} meals
                                </span>
                                <span>•</span>
                                <span className="font-medium text-orange-600">
                                  {Object.values(template.meals[selectedDay].meals).reduce((total, meal: any) => {
                                    return total + (meal.foodOptions?.reduce((sum: number, f: FoodOption) => sum + (parseFloat(f.cal) || 0), 0) || 0);
                                  }, 0).toFixed(0)} cal
                                </span>
                              </div>
                            )}
                          </div>
                          {template.meals[selectedDay].note && (
                            <CardDescription className="text-xs mt-1 bg-amber-50 text-amber-800 p-2 rounded border border-amber-200">
                              📝 {template.meals[selectedDay].note}
                            </CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="p-0">
                          {Object.keys(template.meals[selectedDay].meals || {}).length > 0 ? (
                            <div className="divide-y divide-gray-100">
                              {sortMealsByTime(template.meals[selectedDay].meals, template.mealTypes).map(([mealType, meal]: [string, any]) => {
                                const MealIcon = getMealIcon(mealType);
                                const mealColorClass = getMealTypeColor(mealType);
                                const scheduleTime = (template.mealTypes || []).find(
                                  (mt) => String(mt?.name || '').toLowerCase().replace(/[\s-_]/g, '') === mealType.toLowerCase().replace(/[\s-_]/g, '')
                                )?.time;

                                // Separate primary and alternative foods
                                const primaryFoods = meal.foodOptions?.filter((f: FoodOption, idx: number) =>
                                  !f.isAlternative && idx === 0
                                ) || [];
                                const alternativeFoods = meal.foodOptions?.filter((f: FoodOption, idx: number) =>
                                  f.isAlternative || idx > 0
                                ) || [];

                                return (
                                  <div key={mealType} className="p-3 hover:bg-gray-50/50 transition-colors">
                                    {/* Meal Header */}
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <div className={`p-1.5 rounded-lg border ${mealColorClass}`}>
                                          <MealIcon className="h-4 w-4" />
                                        </div>
                                        <div>
                                          <h4 className="font-medium text-sm text-gray-900 capitalize">
                                            {meal.name || mealType.replace(/[-_]/g, ' ')}
                                          </h4>
                                          {(scheduleTime || meal.time) && (
                                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                              <Clock className="h-3 w-3" />
                                              {scheduleTime || meal.time}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {/* Meal Total Calories */}
                                      <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                                        <Flame className="h-3 w-3 mr-1" />
                                        {meal.foodOptions?.reduce((sum: number, f: FoodOption) => sum + (parseFloat(f.cal) || 0), 0).toFixed(0)} cal
                                      </Badge>
                                    </div>

                                    {/* Food Items */}
                                    {meal.foodOptions && meal.foodOptions.length > 0 ? (
                                      <div className="space-y-1.5 ml-8">
                                        {/* Primary Food (First item) */}
                                        {meal.foodOptions.slice(0, 1).map((food: FoodOption, idx: number) => (
                                          <div
                                            key={food.id || idx}
                                            className="bg-white rounded-lg p-3 border-2 border-emerald-300 shadow-sm"
                                          >
                                            <div className="flex justify-between items-start gap-2 mb-2">
                                              <div className="flex-1 min-w-0">
                                                <span className="font-semibold text-sm text-emerald-900 block truncate">
                                                  {food.food || food.label}
                                                </span>
                                                {food.unit && (
                                                  <span className="text-xs text-emerald-600 font-medium">Qty: {food.unit}</span>
                                                )}
                                              </div>
                                              <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-0 shrink-0 font-semibold">
                                                {food.cal} cal
                                              </Badge>
                                            </div>
                                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-gray-700 font-medium">
                                              <span className="flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                                <span>P: <span className="font-bold">{food.protein}g</span></span>
                                              </span>
                                              <span className="flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                                <span>C: <span className="font-bold">{food.carbs}g</span></span>
                                              </span>
                                              <span className="flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                                                <span>F: <span className="font-bold">{food.fats}g</span></span>
                                              </span>
                                            </div>
                                          </div>
                                        ))}

                                        {/* Alternative Foods (Remaining items) - Show ONLY if there are actually alternatives */}
                                        {meal.foodOptions.length > 1 && (
                                          <div className="mt-1 space-y-2 pt-2 border-t-2 border-dashed border-blue-300">
                                            <div className="text-xs text-blue-700 font-bold px-1">🔄 Alternative Options</div>
                                            {meal.foodOptions.slice(1).map((food: FoodOption, idx: number) => (
                                              <div
                                                key={food.id || `alt-${idx}`}
                                                className="bg-blue-50 rounded-lg p-2.5 border-2 border-blue-300 border-dashed"
                                              >
                                                <div className="flex justify-between items-start gap-2 mb-1.5">
                                                  <div className="flex-1 min-w-0">
                                                    <span className="font-semibold text-sm text-blue-900 block truncate">
                                                      {food.food || food.label}
                                                    </span>
                                                    {food.unit && (
                                                      <span className="text-xs text-blue-700 font-medium">Qty: {food.unit}</span>
                                                    )}
                                                  </div>
                                                  <Badge className="text-[10px] bg-blue-200 text-blue-800 border-0 shrink-0 font-semibold">
                                                    {food.cal} cal
                                                  </Badge>
                                                </div>
                                                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-blue-700 font-medium">
                                                  <span className="flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                                    <span>P: <span className="font-bold">{food.protein}g</span></span>
                                                  </span>
                                                  <span className="flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                                    <span>C: <span className="font-bold">{food.carbs}g</span></span>
                                                  </span>
                                                  <span className="flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                                                    <span>F: <span className="font-bold">{food.fats}g</span></span>
                                                  </span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-gray-400 italic ml-8">No food items added</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-gray-500">
                              <UtensilsCrossed className="h-10 w-10 mx-auto mb-2 opacity-30" />
                              <p className="text-sm">No meals planned for this day</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {/* Tags */}
                {template.tags && template.tags.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-gray-800">Tags</div>
                    <div className="flex flex-wrap gap-2">
                      {template.tags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Meta Info */}
                <div className="pt-4 border-t">
                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>Created by: {template.createdBy ? `${template.createdBy.firstName || ''} ${template.createdBy.lastName || ''}`.trim() || 'Unknown' : 'Unknown'}</span>
                    </div>
                    {template.createdAt && (
                      <div>Created: {formatDate(template.createdAt)}</div>
                    )}
                    {template.updatedAt && (
                      <div>Last updated: {formatDate(template.updatedAt)}</div>
                    )}
                    {template.averageRating && (
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-yellow-500" />
                        <span>{template.averageRating.toFixed(1)} rating</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
