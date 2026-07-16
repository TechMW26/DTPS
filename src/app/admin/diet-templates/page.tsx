'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Search,
  Plus,
  ChefHat,
  Pencil,
  Trash2,
  Eye,
  ArrowLeft,
  CheckCircle,
  Users,
  Globe,
  Lock,
} from 'lucide-react';
import Link from 'next/link';
import { UserRole } from '@/types';
import { toast } from 'sonner';

interface Creator {
  _id: string;
  firstName: string;
  lastName: string;
  role: string;
  templateCount: number;
  personalCount: number;
  sharedCount: number;
  templates: DietTemplate[];
}

interface DietTemplate {
  _id: string;
  name: string;
  description: string;
  category: string;
  duration: number;
  targetCalories: { min: number; max: number };
  dietaryRestrictions: string[];
  isPublic: boolean;
  createdBy: { _id: string; firstName: string; lastName: string; role?: string };
  createdAt: string;
  totalRecipes: number;
  usageCount: number;
}

interface GroupedTemplates {
  [creatorId: string]: Creator;
}

function AdminDietTemplatesPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [templates, setTemplates] = useState<DietTemplate[]>([]);
  const [groupedTemplates, setGroupedTemplates] = useState<GroupedTemplates>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dietitianFilter, setDietitianFilter] = useState('all');
  const [selectedTemplate, setSelectedTemplate] = useState<DietTemplate | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<DietTemplate>>({});
  const [editLoading, setEditLoading] = useState(false);

  // Authorization check
  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/login');
      return;
    }
    if (session.user.role !== UserRole.ADMIN) {
      router.push('/dashboard');
    }
  }, [session, status, router]);

  // Fetch all templates
  useEffect(() => {
    if (session?.user?.role === UserRole.ADMIN) {
      fetchAllTemplates();
    }
  }, [session]);

  const fetchAllTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/diet-templates?limit=10000');
      if (response.ok) {
        const data = await response.json();
        const allTemplates = data.templates || [];

        // Group templates by creator
        const grouped: GroupedTemplates = {};

        allTemplates.forEach((template: DietTemplate) => {
          const creatorId = template.createdBy._id;
          if (!grouped[creatorId]) {
            grouped[creatorId] = {
              _id: creatorId,
              firstName: template.createdBy.firstName,
              lastName: template.createdBy.lastName,
              role: template.createdBy.role || 'Unknown',
              templateCount: 0,
              personalCount: 0,
              sharedCount: 0,
              templates: [],
            };
          }
          grouped[creatorId].templates.push(template);
          grouped[creatorId].templateCount++;
          if (template.isPublic) {
            grouped[creatorId].sharedCount++;
          } else {
            grouped[creatorId].personalCount++;
          }
        });

        setTemplates(allTemplates);
        setGroupedTemplates(grouped);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to fetch templates');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (template: DietTemplate) => {
    setSelectedTemplate(template);
    setEditFormData({
      name: template.name,
      description: template.description,
      category: template.category,
      duration: template.duration,
      targetCalories: { ...template.targetCalories },
      dietaryRestrictions: [...template.dietaryRestrictions],
      isPublic: template.isPublic,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedTemplate) return;

    try {
      setEditLoading(true);
      const response = await fetch(`/api/diet-templates/${selectedTemplate._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      });

      if (response.ok) {
        toast.success('Template updated successfully');
        setEditDialogOpen(false);
        await fetchAllTemplates();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update template');
      }
    } catch (error) {
      console.error('Error updating template:', error);
      toast.error('Failed to update template');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const response = await fetch(`/api/diet-templates/${templateId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Template deleted successfully');
        await fetchAllTemplates();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete template');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };

  const getRoleColor = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'admin':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'dietitian':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'health_counselor':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'weight-loss': 'bg-orange-100 text-orange-800',
      'weight-gain': 'bg-green-100 text-green-800',
      'maintenance': 'bg-blue-100 text-blue-800',
      'muscle-gain': 'bg-purple-100 text-purple-800',
      'diabetes': 'bg-red-100 text-red-800',
      'heart-healthy': 'bg-pink-100 text-pink-800',
      'keto': 'bg-yellow-100 text-yellow-800',
      'vegan': 'bg-green-100 text-green-800',
      'custom': 'bg-gray-100 text-gray-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  const formatRoleName = (role: string) => {
    return role
      ?.replace(/_/g, ' ')
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ') || 'Unknown';
  };

  const dietitianOptions = Object.values(groupedTemplates)
    .filter(creator => creator.role?.toLowerCase() === UserRole.DIETITIAN)
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  const filteredCreators = Object.values(groupedTemplates).filter(creator => {
    const searchLower = searchTerm.toLowerCase();
    const matchesDietitian = dietitianFilter === 'all' || creator._id === dietitianFilter;

    const matchesSearch = (
      creator.firstName.toLowerCase().includes(searchLower) ||
      creator.lastName.toLowerCase().includes(searchLower) ||
      creator.templates.some(t =>
        t.name.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower)
      )
    );

    return matchesDietitian && matchesSearch;
  });

  if (status === 'loading' || !session) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Diet Templates Management</h1>
            <p className="text-gray-600 mt-1">
              View and manage diet templates created by all users
            </p>
          </div>
          <Button asChild>
            <Link href="/meal-plan-templates/diet/create">
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Link>
          </Button>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-gray-600 text-sm mb-1">Total Templates</p>
                <p className="text-3xl font-bold text-gray-900">{templates.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-gray-600 text-sm mb-1">Total Creators</p>
                <p className="text-3xl font-bold text-gray-900">{Object.keys(groupedTemplates).length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-gray-600 text-sm mb-1">Personal Templates</p>
                <p className="text-3xl font-bold text-gray-900">
                  {Object.values(groupedTemplates).reduce((sum, c) => sum + c.personalCount, 0)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-gray-600 text-sm mb-1">Shared Templates</p>
                <p className="text-3xl font-bold text-gray-900">
                  {Object.values(groupedTemplates).reduce((sum, c) => sum + c.sharedCount, 0)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search + Dietitian Filter */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by creator name or template name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={dietitianFilter} onValueChange={setDietitianFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by dietitian" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dietitians</SelectItem>
                  {dietitianOptions.map((creator) => (
                    <SelectItem key={creator._id} value={creator._id}>
                      {creator.firstName} {creator.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Templates by Creator */}
        {loading ? (
          <div className="flex items-center justify-center h-96">
            <LoadingSpinner />
          </div>
        ) : filteredCreators.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
              <p className="text-gray-600">
                {searchTerm ? 'Try adjusting your search' : 'Templates will appear here'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {filteredCreators.map((creator) => (
              <Card key={creator._id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-blue-600" />
                        {creator.firstName} {creator.lastName}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        <Badge variant="outline" className={`${getRoleColor(creator.role)} border`}>
                          {formatRoleName(creator.role)}
                        </Badge>
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {creator.templateCount} Template{creator.templateCount !== 1 ? 's' : ''}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        <span className="mr-3">
                          <Lock className="inline h-3 w-3 mr-1" />
                          {creator.personalCount} Personal
                        </span>
                        <span>
                          <Globe className="inline h-3 w-3 mr-1" />
                          {creator.sharedCount} Shared
                        </span>
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {creator.templates
                      .filter(t =>
                        !searchTerm ||
                        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        t.description.toLowerCase().includes(searchTerm.toLowerCase())
                      )
                      .map((template) => (
                        <div
                          key={template._id}
                          className="flex items-start justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-3 mb-2">
                              <h4 className="font-medium text-gray-900 flex-1">{template.name}</h4>
                              <Badge className={getCategoryColor(template.category)} variant="secondary">
                                {template.category.replace('-', ' ').toUpperCase()}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={template.isPublic ? 'bg-green-50' : 'bg-gray-50'}
                              >
                                {template.isPublic ? (
                                  <>
                                    <Globe className="h-3 w-3 mr-1" />
                                    Shared
                                  </>
                                ) : (
                                  <>
                                    <Lock className="h-3 w-3 mr-1" />
                                    Personal
                                  </>
                                )}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 line-clamp-2 mb-2">{template.description}</p>
                            <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                              <span>📅 {template.duration} days</span>
                              <span>🔥 {template.targetCalories.min}-{template.targetCalories.max} cal</span>
                              <span>🍽️ {template.totalRecipes} recipes</span>
                              {template.dietaryRestrictions.length > 0 && (
                                <span>🌱 {template.dietaryRestrictions.length} restrictions</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4 shrink-0">
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/meal-plan-templates/diet/${template._id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditClick(template)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteTemplate(template._id)}
                              title="Delete template"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Template Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Diet Template</DialogTitle>
            <DialogDescription>
              {selectedTemplate?.name}
            </DialogDescription>
          </DialogHeader>

          {selectedTemplate && (
            <div className="space-y-4 py-4">
              {/* Template Name */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Template Name
                </label>
                <Input
                  value={editFormData.name || ''}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter template name"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Description
                </label>
                <textarea
                  value={editFormData.description || ''}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter template description"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Category
                </label>
                <select
                  value={editFormData.category || ''}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="weight-loss">Weight Loss</option>
                  <option value="weight-gain">Weight Gain</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="muscle-gain">Muscle Gain</option>
                  <option value="diabetes">Diabetes Friendly</option>
                  <option value="heart-healthy">Heart Healthy</option>
                  <option value="keto">Keto</option>
                  <option value="vegan">Vegan</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {/* Duration */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Duration (days)
                </label>
                <Input
                  type="number"
                  value={editFormData.duration || 7}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                  min="1"
                  max="365"
                />
              </div>

              {/* Calories */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Min Calories
                  </label>
                  <Input
                    type="number"
                    value={editFormData.targetCalories?.min || 1200}
                    onChange={(e) => {
                      const minVal = parseInt(e.target.value);
                      const maxVal = editFormData.targetCalories?.max || 2500;
                      setEditFormData(prev => ({
                        ...prev,
                        targetCalories: { min: minVal, max: maxVal }
                      }));
                    }}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Max Calories
                  </label>
                  <Input
                    type="number"
                    value={editFormData.targetCalories?.max || 2500}
                    onChange={(e) => {
                      const maxVal = parseInt(e.target.value);
                      const minVal = editFormData.targetCalories?.min || 1200;
                      setEditFormData(prev => ({
                        ...prev,
                        targetCalories: { min: minVal, max: maxVal }
                      }));
                    }}
                  />
                </div>
              </div>

              {/* Public/Private Toggle */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Visibility
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={!editFormData.isPublic ? 'default' : 'outline'}
                    onClick={() => setEditFormData(prev => ({ ...prev, isPublic: false }))}
                    className="flex-1"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Personal
                  </Button>
                  <Button
                    type="button"
                    variant={editFormData.isPublic ? 'default' : 'outline'}
                    onClick={() => setEditFormData(prev => ({ ...prev, isPublic: true }))}
                    className="flex-1"
                  >
                    <Globe className="h-4 w-4 mr-2" />
                    Shared
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={editLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={editLoading}>
              {editLoading ? (
                <>
                  <LoadingSpinner className="h-4 w-4 mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

export default function AdminDietTemplatesPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner />
        </div>
      </DashboardLayout>
    }>
      <AdminDietTemplatesPageContent />
    </Suspense>
  );
}
