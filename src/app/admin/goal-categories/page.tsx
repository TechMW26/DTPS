'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Edit2, Trash2, Loader2, GripVertical, Target } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useDataRefresh, emitDataChange, DataEventTypes } from '@/lib/events/useDataRefresh';

interface GoalCategory {
  _id: string;
  name: string;
  value: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  order: number;
  createdAt: string;
}

export default function GoalCategoriesPage() {
  const [categories, setCategories] = useState<GoalCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<GoalCategory | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    value: '',
    description: '',
    icon: 'target',
    isActive: true,
    order: 0,
  });

  const fetchCategories = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/goal-categories?active=false');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to load goal categories');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Subscribe to real-time goal categories updates
  useDataRefresh(DataEventTypes.GOAL_CATEGORIES_UPDATED, fetchCategories, [fetchCategories]);

  const handleOpenDialog = (category?: GoalCategory) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        value: category.value,
        description: category.description || '',
        icon: category.icon || 'target',
        isActive: category.isActive,
        order: category.order,
      });
    } else {
      setEditingCategory(null);
      setFormData({
        name: '',
        value: '',
        description: '',
        icon: 'target',
        isActive: true,
        order: categories.length,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCategory(null);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.value.trim()) {
      toast.error('Name and value are required');
      return;
    }

    try {
      setIsSaving(true);

      const url = editingCategory
        ? `/api/admin/goal-categories/${editingCategory._id}`
        : '/api/admin/goal-categories';
      const method = editingCategory ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save');
      }

      const savedCategory = await response.json();
      
      if (editingCategory) {
        setCategories(categories.map(c => c._id === savedCategory._id ? savedCategory : c));
        toast.success('Goal category updated');
      } else {
        setCategories([...categories, savedCategory]);
        toast.success('Goal category created');
      }
      
      // Emit event for real-time updates
      emitDataChange(DataEventTypes.GOAL_CATEGORIES_UPDATED);

      handleCloseDialog();
    } catch (error: any) {
      console.error('Error saving category:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this goal category?')) return;

    try {
      const response = await fetch(`/api/admin/goal-categories/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete');

      setCategories(categories.filter(c => c._id !== id));
      toast.success('Goal category deleted');
      emitDataChange(DataEventTypes.GOAL_CATEGORIES_UPDATED);
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete');
    }
  };

  const handleToggleActive = async (category: GoalCategory) => {
    try {
      const response = await fetch(`/api/admin/goal-categories/${category._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...category, isActive: !category.isActive }),
      });

      if (!response.ok) throw new Error('Failed to update');

      const updated = await response.json();
      setCategories(categories.map(c => c._id === updated._id ? updated : c));
      toast.success(`Goal category ${updated.isActive ? 'activated' : 'deactivated'}`);
      emitDataChange(DataEventTypes.GOAL_CATEGORIES_UPDATED);
    } catch (error) {
      console.error('Error toggling category:', error);
      toast.error('Failed to update');
    }
  };

  // Auto-generate value from name
  const handleNameChange = (name: string) => {
    const value = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    setFormData({ ...formData, name, value: editingCategory ? formData.value : value });
  };

  return (
    <DashboardLayout>
    <div className="space-y-6 p-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Goal Categories</h1>
          <p className="text-gray-600 mt-1">
            Manage client goal options shown in dropdowns (Weight Loss, Muscle Gain, etc.)
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Category
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : categories.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Target className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No goal categories created yet</p>
            <Button onClick={() => handleOpenDialog()}>Create Your First Category</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {categories.map((category, index) => (
            <Card key={category._id} className={`${!category.isActive ? 'opacity-60' : ''}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-gray-400">
                      <GripVertical className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Target className="h-5 w-5 text-blue-500" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{category.name}</span>
                          <Badge variant="outline" className="text-xs font-mono">
                            {category.value}
                          </Badge>
                          {!category.isActive && (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </div>
                        {category.description && (
                          <p className="text-sm text-gray-500">{category.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={category.isActive}
                      onCheckedChange={() => handleToggleActive(category)}
                    />
                    <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(category)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(category._id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Edit Goal Category' : 'Create New Goal Category'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Display Name *</Label>
              <Input
                placeholder="e.g., Weight Loss, Muscle Gain"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>

            <div>
              <Label>Value (for forms) *</Label>
              <Input
                placeholder="e.g., weight-loss, muscle-gain"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                className="font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                This is the internal value used in forms and database
              </p>
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                placeholder="Optional description..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div>
              <Label>Order</Label>
              <Input
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
              />
              <p className="text-xs text-gray-500 mt-1">
                Lower numbers appear first in dropdowns
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label>Active (shown in dropdowns)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !formData.name.trim()}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : editingCategory ? (
                'Update'
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
