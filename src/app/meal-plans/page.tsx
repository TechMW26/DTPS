'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Plus,
  ChefHat,
  Calendar,
  Users,
  Target,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  Filter,
  Star,
  TrendingUp,
  Heart,
  Zap,
  Clock
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { UserRole } from '@/types';

interface MealPlan {
  _id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  targetCalories: number;
  targetMacros: {
    protein: number;
    carbs: number;
    fat: number;
  };
  isActive: boolean;
  client: {
    firstName: string;
    lastName: string;
  };
  dietitian: {
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

interface MealPlanTemplate {
  _id: string;
  name: string;
  description: string;
  category: string;
  duration: number;
  targetCalories: {
    min: number;
    max: number;
  };
  targetMacros: {
    protein: { min: number; max: number };
    carbs: { min: number; max: number };
    fat: { min: number; max: number };
  };
  dietaryRestrictions: string[];
  tags: string[];
  isPublic: boolean;
  createdBy: {
    firstName: string;
    lastName: string;
  };
  
  usageCount: number;
  averageRating?: number;
  averageDailyCalories: number;
  totalRecipes: number;
  createdAt: string;
}

// Fixed meal plans page
function MealPlansPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();

  // Meal Plans State
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [mealPlansLoading, setMealPlansLoading] = useState(true);
  const [mealPlanSearch, setMealPlanSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Templates State
  const [templates, setTemplates] = useState<MealPlanTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState('plans');

  useEffect(() => {
    fetchMealPlans();
    fetchTemplates();
  }, [searchParams]);

  useEffect(() => {
    fetchTemplates();
  }, [templateSearch, selectedCategory]);

  useEffect(() => {
    // Check for success message
    if (searchParams?.get('success') === 'created') {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const fetchMealPlans = async () => {
    try {
      setMealPlansLoading(true);

      // Check if there's a client parameter to filter by
      const clientId = searchParams.get('client');
      const url = clientId ? `/api/meals?client=${clientId}` : '/api/meals';

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setMealPlans(data.mealPlans);
      }
    } catch (error) {
      console.error('Error fetching meal plans:', error);
    } finally {
      setMealPlansLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      setTemplatesLoading(true);

      const params = new URLSearchParams();
      if (templateSearch) params.append('search', templateSearch);
      if (selectedCategory && selectedCategory !== 'all') params.append('category', selectedCategory);

      const response = await fetch(`/api/meal-plan-templates?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
        setCategories(data.filters?.categories || []);
        setTags(data?.filters?.tags || []);
      } else {
        console.error('Failed to fetch meal plan templates:', response.status);
        setTemplates([]);
        setCategories([]);
        setTags([]);
      }
    } catch (error) {
      console.error('Error fetching meal plan templates:', error);
      setTemplates([]);
      setCategories([]);
      setTags([]);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const filteredMealPlans = mealPlans.filter(plan => {
    const matchesSearch =
      plan.name.toLowerCase().includes(mealPlanSearch.toLowerCase()) ||
      plan.client.firstName.toLowerCase().includes(mealPlanSearch.toLowerCase()) ||
      plan.client.lastName.toLowerCase().includes(mealPlanSearch.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && plan.isActive) ||
      (statusFilter === 'inactive' && !plan.isActive);

    return matchesSearch && matchesStatus;
  });

  // Helper functions for templates
  const getCategoryIcon = (category: string) => {
    const icons: { [key: string]: any } = {
      'weight-loss': TrendingUp,
      'weight-gain': Target,
      'maintenance': Heart,
      'muscle-gain': Zap,
      'diabetes': Heart,
      'heart-healthy': Heart,
      'keto': Zap,
      'vegan': Heart,
      'custom': Star
    };
    return icons[category] || Star;
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

  const formatCategoryName = (category: string) => {
    return category.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive 
      ? 'bg-green-100 text-green-800' 
      : 'bg-gray-100 text-gray-800';
  };

  const isPlanActive = (startDate: string, endDate: string) => {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    return now >= start && now <= end;
  };

  // Dummy clients shown when no plans & no filters
  const dummyClients = [
    {
      name: 'Rahul Verma', id: 'CLT-001', phone: '+91 98765 43210', email: 'rahul.verma@example.com', type: 'Weight Loss',
      programStart: new Date(), programEnd: new Date(Date.now() + 30*24*60*60*1000), dateJoined: new Date(Date.now() - 10*24*60*60*1000)
    },
    {
      name: 'Sneha Kapoor', id: 'CLT-002', phone: '+91 91234 56789', email: 'sneha.kapoor@example.com', type: 'Diabetes',
      programStart: new Date(Date.now() - 3*24*60*60*1000), programEnd: new Date(Date.now() + 27*24*60*60*1000), dateJoined: new Date(Date.now() - 45*24*60*60*1000)
    },
    {
      name: 'Arjun Mehta', id: 'CLT-003', phone: '+91 98111 22334', email: 'arjun.mehta@example.com', type: 'Muscle Gain',
      programStart: new Date(Date.now() - 14*24*60*60*1000), programEnd: new Date(Date.now() + 16*24*60*60*1000), dateJoined: new Date(Date.now() - 120*24*60*60*1000)
    },
    {
      name: 'Priya Nair', id: 'CLT-004', phone: '+91 99900 88776', email: 'priya.nair@example.com', type: 'Maintenance',
      programStart: new Date(Date.now() + 2*24*60*60*1000), programEnd: new Date(Date.now() + 32*24*60*60*1000), dateJoined: new Date(Date.now() - 5*24*60*60*1000)
    }
  ];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Diet Plans & Templates</h1>
            <p className="text-gray-600 mt-1">
              Manage Diet plans and templates for your clients
            </p>
          </div>

          {/* {(session?.user?.role === UserRole.DIETITIAN || session?.user?.role === UserRole.ADMIN) && (
            <div className="flex gap-2">
              <Button variant="outline" className="cursor-pointer" asChild>
                <Link href="/meal-plans/templates/create">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </Link>
              </Button>
              <Button className="cursor-pointer" asChild>
                <Link href="/meal-plans/create">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Diet Plan
                </Link>
              </Button>
            </div>
          )} */}
        </div>

        {/* Success Message */}
        {showSuccess && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Diet plan template created successfully! 🎉
            </AlertDescription>
          </Alert>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
       

          <TabsContent value="plans" className="space-y-6">
            {/* Client Types Quick View (only when empty and no filters) */}
            {filteredMealPlans.length === 0 && !mealPlanSearch && statusFilter === 'all' && (
              <div className="flex flex-wrap gap-2">
                {/* {Array.from(new Set(dummyClients.map(dc => dc.type))).map(t => (
                  <span key={t} className="px-3 py-1 text-xs rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                    {t}
                  </span>
                ))} */}
              </div>
            )}
            {/* Search and Filters */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search Diet plans or clients..."
                      value={mealPlanSearch}
                      onChange={(e) => setMealPlanSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="All status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <ChefHat className="h-4 w-4" />
                    <span>{filteredMealPlans.length} Diet plans</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Meal Plans List */}
            {mealPlansLoading ? (
          <div className="flex items-center justify-center h-32">
            <LoadingSpinner />
          </div>
        ) : filteredMealPlans.length === 0 ? (
          mealPlanSearch || statusFilter !== 'all' ? (
            <Card>
              <CardContent className="text-center py-12">
                <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Diet plans found</h3>
                <p className="text-gray-600 mb-4">Try adjusting your search criteria</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="border-b px-6 py-5 bg-linear-to-r from-slate-50 to-white flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">Clients Overview</h3>
                    <p className="text-sm text-slate-600 mt-1">No diet plans yet. Review your clients and start a program.</p>
                  </div>
                  <Button asChild className="bg-slate-900 hover:bg-slate-800 shadow">
                    <Link href="/meal-plans/create">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Diet Plan
                    </Link>
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left p-4 font-medium text-gray-900">Client Name</th>
                        <th className="text-left p-4 font-medium text-gray-900">Client ID</th>
                        <th className="text-left p-4 font-medium text-gray-900">Phone</th>
                        <th className="text-left p-4 font-medium text-gray-900">Email</th>
                        <th className="text-left p-4 font-medium text-gray-900">Type</th>
                        <th className="text-left p-4 font-medium text-gray-900">Program Start</th>
                        <th className="text-left p-4 font-medium text-gray-900">Program End</th>
                        <th className="text-left p-4 font-medium text-gray-900">Date Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dummyClients.map(c => (
                        <tr key={c.id} className="border-b hover:bg-gray-50">
                          <td className="p-4">
                            <div className="flex items-center space-x-2">
                              <Users className="h-4 w-4 text-gray-400" />
                              <Link href={`/meal-plans/create?client=${c.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                                {c.name}
                              </Link>
                            </div>
                          </td>
                          <td className="p-4 text-sm text-gray-700 font-mono">{c.id}</td>
                          <td className="p-4 text-sm text-gray-700">{c.phone}</td>
                          <td className="p-4 text-sm text-gray-700">{c.email}</td>
                          <td className="p-4 text-sm">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-green-100 text-green-800 border border-green-200">Active</Badge>
                              
                            </div>
                          </td>
                          <td className="p-4 text-sm text-gray-600">{format(c.programStart, 'MMM d, yyyy')}</td>
                          <td className="p-4 text-sm text-gray-600">{format(c.programEnd, 'MMM d, yyyy')}</td>
                          <td className="p-4 text-sm text-gray-600">{format(c.dateJoined, 'MMM d, yyyy')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-6 py-4 bg-slate-50 border-t text-sm text-slate-600 flex items-center justify-between">
                    <span>Ready to begin? Create a diet plan for any of these clients.</span>
                    <Button variant="outline" asChild>
                      <Link href="/meal-plans/create">
                        <Plus className="h-4 w-4 mr-2" />
                        New Diet Plan
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-4 font-medium text-gray-900">Plan Name</th>
                      <th className="text-left p-4 font-medium text-gray-900">Client</th>
                      <th className="text-left p-4 font-medium text-gray-900">Duration</th>
                      <th className="text-left p-4 font-medium text-gray-900">Calories</th>
                      <th className="text-left p-4 font-medium text-gray-900">Status</th>
                      <th className="text-left p-4 font-medium text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMealPlans.map((plan) => (
                      <tr key={plan._id} className="border-b hover:bg-gray-50">
                        <td className="p-4">
                          <div>
                            <p className="font-medium text-gray-900">{plan.name}</p>
                            <p className="text-sm text-gray-600 line-clamp-1">{plan.description}</p>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center space-x-2">
                            <Users className="h-4 w-4 text-gray-400" />
                            <span className="text-sm">{plan.client.firstName} {plan.client.lastName}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm text-gray-600">
                            <div>{format(new Date(plan.startDate), 'MMM d')}</div>
                            <div>to {format(new Date(plan.endDate), 'MMM d, yyyy')}</div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm">
                            <div className="font-medium">{plan.targetCalories} cal</div>
                            <div className="text-gray-500">
                              P:{(plan.targetMacros.protein || 0).toFixed(2)}g C:{(plan.targetMacros.carbs || 0).toFixed(2)}g F:{(plan.targetMacros.fat || 0).toFixed(2)}g
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col space-y-1">
                            <Badge className={getStatusColor(plan.isActive)}>
                              {plan.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                            {isPlanActive(plan.startDate, plan.endDate) && (
                              <div className="flex items-center space-x-1 text-xs text-green-600">
                                <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                                <span>Current</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex space-x-2">
                            <Button size="sm" variant="outline" className="cursor-pointer" asChild>
                              <Link href={`/meal-plans/${plan._id}`}>
                                <Eye className="h-3 w-3" />
                              </Link>
                            </Button>
                            <Button size="sm" variant="outline" className="cursor-pointer" asChild>
                              <Link href={`/meal-plans/${plan._id}/edit`}>
                                <Edit className="h-3 w-3" />
                              </Link>
                            </Button>
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

          <TabsContent value="templates" className="space-y-6">
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-600">
                  Diet plan templates will be displayed here. Visit{' '}
                  <Link href="/meal-plan-templates" className="text-blue-600 hover:underline">
                    Diet Plan Templates
                  </Link>{' '}
                  to manage templates.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

export default function MealPlansPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LoadingSpinner /></div>}>
      <MealPlansPageContent />
    </Suspense>
  );
}
