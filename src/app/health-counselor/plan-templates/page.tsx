'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Search,
  ChefHat,
  Eye,
  FileText
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Link from 'next/link';

interface MealPlanTemplate {
  _id: string;
  templateType?: 'plan' | 'diet';
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

export default function HealthCounselorPlanTemplatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'plans' | 'diet'>('plans');

  // Authorization check - only health counselor can access
  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    if (session.user.role !== 'health_counselor') {
      router.push('/auth/signin');
    }
  }, [session, status, router]);

  // Plan templates state
  const [planTemplates, setPlanTemplates] = useState<MealPlanTemplate[]>([]);
  const [planSearch, setPlanSearch] = useState('');
  const [planLoading, setPlanLoading] = useState(false);

  // Diet templates state
  const [dietTemplates, setDietTemplates] = useState<MealPlanTemplate[]>([]);
  const [dietSearchTerm, setDietSearchTerm] = useState('');
  const [dietDietaryRestrictions, setDietDietaryRestrictions] = useState<string[]>([]);
  const [dietLoading, setDietLoading] = useState(false);
  
  const dietaryRestrictionsList = [
    'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 'egg-free', 'soy-free', 'keto', 'paleo', 'low-carb', 'low-fat', 'diabetic-friendly'
  ];

  useEffect(() => { 
    if (activeTab === 'plans' && session) fetchPlanTemplates(); 
  }, [activeTab, planSearch, session]);
  
  useEffect(() => { 
    if (activeTab === 'diet' && session) fetchDietTemplates(); 
  }, [activeTab, dietSearchTerm, dietDietaryRestrictions, session]);

  const fetchPlanTemplates = async () => {
    try {
      setPlanLoading(true);
      const params = new URLSearchParams();
      params.append('templateType', 'plan');
      if (planSearch) params.append('search', planSearch);
      const response = await fetch(`/api/meal-plan-templates?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setPlanTemplates((data.templates || []).filter((t: MealPlanTemplate) => t.templateType === 'plan' || t.templateType === undefined));
      } else {
        setPlanTemplates([]);
      }
    } catch { 
      setPlanTemplates([]); 
    } finally { 
      setPlanLoading(false); 
    }
  };

  const fetchDietTemplates = async () => {
    try {
      setDietLoading(true);
      const params = new URLSearchParams();
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
    } catch { 
      setDietTemplates([]); 
    } finally { 
      setDietLoading(false); 
    }
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

  const filteredPlanTemplates = planTemplates
    .filter(t => (t.templateType === 'plan' || t.templateType === undefined))
    .filter(t => planSearch === '' || t.name.toLowerCase().includes(planSearch.toLowerCase()));

  const filteredDietTemplates = dietTemplates
    .filter(t =>
      (dietSearchTerm === '' || t.name.toLowerCase().includes(dietSearchTerm.toLowerCase())) &&
      (dietDietaryRestrictions.length === 0 || dietDietaryRestrictions.every(r => t.dietaryRestrictions?.includes(r)))
    );

  if (status === 'loading') {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <LoadingSpinner className="h-8 w-8" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Plan & Diet Templates</h1>
            <p className="text-gray-600 mt-1">
              View plan templates and diet templates (Read Only)
            </p>
          </div>
          <Badge variant="outline" className="text-gray-500">
            <Eye className="h-3 w-3 mr-1" />
            View Only
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'plans' | 'diet')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="plans">Plan Templates</TabsTrigger>
            <TabsTrigger value="diet">Diet Templates</TabsTrigger>
          </TabsList>

          {/* Plan Templates Tab */}
          <TabsContent value="plans" className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative flex-1 min-w-55">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input 
                      placeholder="Search plan templates..." 
                      value={planSearch} 
                      onChange={e => setPlanSearch(e.target.value)} 
                      className="pl-10" 
                    />
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <ChefHat className="h-4 w-4" />
                    <span>{filteredPlanTemplates.length} Templates</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {planLoading ? (
              <div className="flex items-center justify-center h-32">
                <LoadingSpinner />
              </div>
            ) : filteredPlanTemplates.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No plan templates found</h3>
                  <p className="text-gray-600">Plan templates created by dietitians will appear here</p>
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
                          <th className="text-left p-4 font-medium text-gray-900">Cal Range</th>
                          <th className="text-left p-4 font-medium text-gray-900">Created By</th>
                          <th className="text-left p-4 font-medium text-gray-900">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPlanTemplates.map(t => (
                          <tr key={t._id} className="border-b hover:bg-gray-50">
                            <td className="p-4">
                              <div>
                                <p className="font-medium text-gray-900">{t.name}</p>
                                {t.description && (
                                  <p className="text-sm text-gray-500 truncate max-w-xs">{t.description}</p>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-sm">
                              <Badge className={getCategoryColor(t.category)}>
                                {formatCategoryName(t.category)}
                              </Badge>
                            </td>
                            <td className="p-4 text-sm text-gray-700">
                              {t.targetCalories.min}-{t.targetCalories.max} kcal
                            </td>
                            <td className="p-4 text-sm text-gray-600">
                              {t.createdBy?.firstName} {t.createdBy?.lastName}
                            </td>
                            <td className="p-4">
                              <Button size="sm" variant="outline" asChild>
                                <Link href={`/meal-plan-templates/${t._id}`}>
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  View
                                </Link>
                              </Button>
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

          {/* Diet Templates Tab */}
          <TabsContent value="diet" className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative flex-1 min-w-55">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input 
                      placeholder="Search diet templates..." 
                      value={dietSearchTerm} 
                      onChange={e => setDietSearchTerm(e.target.value)} 
                      className="pl-10" 
                    />
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <FileText className="h-4 w-4" />
                    <span>{filteredDietTemplates.length} Templates</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-600">Dietary Restrictions</div>
                  <div className="flex flex-wrap gap-2">
                    {dietDietaryRestrictions.length > 0 && (
                      <Button 
                        variant="outline" 
                        onClick={() => setDietDietaryRestrictions([])} 
                        className="h-6 px-2 text-xs"
                      >
                        Clear
                      </Button>
                    )}
                    {dietDietaryRestrictions.length === 0 && (
                      <span className="text-[11px] text-gray-400">Select restrictions to filter</span>
                    )}
                    {dietaryRestrictionsList.map(r => {
                      const selected = dietDietaryRestrictions.includes(r);
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setDietDietaryRestrictions(prev => 
                            selected ? prev.filter(x => x !== r) : [...prev, r]
                          )}
                          className={`px-2 py-1 rounded border text-xs capitalize transition ${
                            selected 
                              ? 'bg-blue-600 text-white border-blue-600' 
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
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
              <div className="flex items-center justify-center h-32">
                <LoadingSpinner />
              </div>
            ) : filteredDietTemplates.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No diet templates found</h3>
                  <p className="text-gray-600">Diet templates created by dietitians will appear here</p>
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
                          <th className="text-left p-4 font-medium text-gray-900">Cal Range</th>
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
                                {t.description && (
                                  <p className="text-sm text-gray-500 truncate max-w-xs">{t.description}</p>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-sm">
                              <Badge className={getCategoryColor(t.category)}>
                                {formatCategoryName(t.category)}
                              </Badge>
                            </td>
                            <td className="p-4 text-sm text-gray-700">
                              {t.targetCalories.min}-{t.targetCalories.max} kcal
                            </td>
                            <td className="p-4">
                              <div className="flex flex-wrap gap-1">
                                {t.dietaryRestrictions?.slice(0, 2).map(r => (
                                  <Badge key={r} variant="outline" className="text-xs capitalize">
                                    {r.replace('-', ' ')}
                                  </Badge>
                                ))}
                                {t.dietaryRestrictions && t.dietaryRestrictions.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{t.dietaryRestrictions.length - 2}
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="p-4">
                              <Button size="sm" variant="outline" asChild>
                                <Link href={`/meal-plan-templates/diet/${t._id}`}>
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  View
                                </Link>
                              </Button>
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
      </div>
    </DashboardLayout>
  );
}
