'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, ChefHat, Target, Pencil, User, Globe, Lock, Flame, Dumbbell, Clock, Star } from 'lucide-react';
import Link from 'next/link';
import { UserRole } from '@/types';

interface TemplateResp {
  _id: string;
  templateType?: 'plan' | 'diet';
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
  meals: any[];
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

export default function MealPlanTemplateViewPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const id = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [template, setTemplate] = useState<TemplateResp | null>(null);

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
        const res = await fetch(`/api/meal-plan-templates/${id}`);
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
    if (id) fetchTemplate();
  }, [id]);

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
              <Link href={`/meal-plan-templates/${id}/edit`}>
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
                      <Badge variant="outline" className="capitalize text-xs">
                        {template.templateType || 'plan'} template
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
                      <ChefHat className="h-6 w-6 text-blue-600" />
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

                {/* Prep Time (if available) */}
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

                {/* Target Audience (if available) */}
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

                {/* Tags (if available) */}
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
