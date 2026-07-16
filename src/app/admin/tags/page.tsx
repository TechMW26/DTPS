'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit2, Trash2, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useDataRefresh, emitDataChange, DataEventTypes } from '@/lib/events/useDataRefresh';

interface Tag {
  _id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  tagType: 'dietitian' | 'health_counselor' | 'general';
  createdAt: string;
  updatedAt: string;
}

const PRESET_COLORS = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Green
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#14B8A6', // Teal
];

export default function TagsManagement() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    icon: 'tag',
    tagType: 'general' as 'dietitian' | 'health_counselor' | 'general',
  });

  const fetchTags = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/tags');
      if (!response.ok) {
        throw new Error('Failed to fetch tags');
      }
      const data = await response.json();
      setTags(data);
    } catch (error) {
      console.error('Error fetching tags:', error);
      toast.error('Failed to load tags');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and real-time updates
  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Subscribe to real-time tag updates
  useDataRefresh(DataEventTypes.TAGS_UPDATED, fetchTags, [fetchTags]);

  const handleOpenDialog = (tag?: Tag) => {
    if (tag) {
      setEditingTag(tag);
      setFormData({
        name: tag.name,
        description: tag.description || '',
        color: tag.color || '#3B82F6',
        icon: tag.icon || 'tag',
        tagType: tag.tagType || 'general',
      });
    } else {
      setEditingTag(null);
      setFormData({
        name: '',
        description: '',
        color: '#3B82F6',
        icon: 'tag',
        tagType: 'general',
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingTag(null);
  };

  const handleSaveTag = async () => {
    if (!formData.name.trim()) {
      toast.error('Tag name is required');
      return;
    }

    try {
      setIsSaving(true);

      if (editingTag) {
        // Update existing tag
        const response = await fetch(`/api/admin/tags/${editingTag._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to update tag');
        }

        const updatedTag = await response.json();
        setTags(tags.map(t => (t._id === updatedTag._id ? updatedTag : t)));
        toast.success('Tag updated successfully');
        // Emit event for real-time updates
        emitDataChange(DataEventTypes.TAGS_UPDATED);
      } else {
        // Create new tag
        const response = await fetch('/api/admin/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create tag');
        }

        const newTag = await response.json();
        setTags([...tags, newTag]);
        toast.success('Tag created successfully');
        // Emit event for real-time updates
        emitDataChange(DataEventTypes.TAGS_UPDATED);
      }

      handleCloseDialog();
    } catch (error: any) {
      console.error('Error saving tag:', error);
      toast.error(error.message || 'Failed to save tag');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!confirm('Are you sure you want to delete this tag?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/tags/${tagId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete tag');
      }

      setTags(tags.filter(t => t._id !== tagId));
      toast.success('Tag deleted successfully');
      // Emit event for real-time updates
      emitDataChange(DataEventTypes.TAGS_UPDATED);
    } catch (error) {
      console.error('Error deleting tag:', error);
      toast.error('Failed to delete tag');
    }
  };

  return (
    <DashboardLayout>
    <div className="space-y-6 p-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Client Tags Management</h1>
          <p className="text-gray-600 mt-1">Create and manage tags for dietitians and health counselors to categorize clients</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Tag
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : tags.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-4">No tags created yet</p>
            <Button onClick={() => handleOpenDialog()}>Create Your First Tag</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map(tag => (
            <Card key={tag._id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: tag.color }}
                    />
                    <CardTitle className="text-lg">{tag.name}</CardTitle>
                    <Badge variant="outline" className={
                      tag.tagType === 'dietitian' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      tag.tagType === 'health_counselor' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                      'bg-gray-50 text-gray-700 border-gray-200'
                    }>
                      {tag.tagType === 'dietitian' ? 'Dietitian' : tag.tagType === 'health_counselor' ? 'Health Counselor' : 'General'}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDialog(tag)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTag(tag._id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {tag.description && (
                <CardContent>
                  <p className="text-sm text-gray-600">{tag.description}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Tag Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-125">
          <DialogHeader>
            <DialogTitle>
              {editingTag ? 'Edit Tag' : 'Create New Tag'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Tag Name */}
            <div>
              <label className="block text-sm font-medium mb-1">Tag Name *</label>
              <Input
                placeholder="e.g., VIP Client, Follow-up Required, Premium"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            {/* Tag Type */}
            <div>
              <label className="block text-sm font-medium mb-1">Tag Type *</label>
              <select
                className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.tagType}
                onChange={(e) =>
                  setFormData({ ...formData, tagType: e.target.value as 'dietitian' | 'health_counselor' | 'general' })
                }
              >
                <option value="general">General (Both can use)</option>
                <option value="dietitian">Dietitian Tags Only</option>
                <option value="health_counselor">Health Counselor Tags Only</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {formData.tagType === 'dietitian' ? 'Only dietitians can add this tag to clients' :
                 formData.tagType === 'health_counselor' ? 'Only health counselors can add this tag to clients' :
                 'Both dietitians and health counselors can use this tag'}
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Textarea
                placeholder="Describe what this tag is for..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>

            {/* Color Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">Color</label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setFormData({ ...formData, color })}
                    className={`w-8 h-8 rounded border-2 transition-all ${
                      formData.color === color
                        ? 'border-gray-800 scale-110'
                        : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>

            {/* Color Preview */}
            <div className="bg-gray-100 p-3 rounded flex items-center gap-2">
              <div
                className="w-6 h-6 rounded"
                style={{ backgroundColor: formData.color }}
              />
              <span className="text-sm text-gray-700">
                {formData.color}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseDialog}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTag}
              disabled={isSaving || !formData.name.trim()}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : editingTag ? (
                'Update Tag'
              ) : (
                'Create Tag'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
