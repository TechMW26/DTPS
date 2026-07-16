'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { AlertCircle, Plus, Edit2, Trash2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface Tag {
  _id: string;
  name: string;
  description?: string;
  color: string;
  icon?: string;
  createdAt?: string;
}

export default function AdminTagsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    icon: 'tag'
  });

  // Check authorization
  useEffect(() => {
    if (session && session.user.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [session, router]);

  // Fetch tags
  const fetchTags = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/tags');
      if (response.ok) {
        const data = await response.json();
        setTags(data?.tags || []);
      } else {
        toast.error('Failed to fetch tags');
      }
    } catch (error) {
      console.error('Error fetching tags:', error);
      toast.error('Error loading tags');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      color: '#3B82F6',
      icon: 'tag'
    });
    setEditingTag(null);
    setIsAddingTag(false);
  };

  // Save tag (create or update)
  const handleSaveTag = async () => {
    if (!formData.name.trim()) {
      toast.error('Tag name is required');
      return;
    }

    try {
      setSaving(true);
      const url = editingTag ? `/api/tags/${editingTag._id}` : '/api/tags';
      const method = editingTag ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(editingTag ? 'Tag updated successfully' : 'Tag created successfully');
        resetForm();
        fetchTags();
      } else {
        toast.error(data.error || 'Failed to save tag');
      }
    } catch (error) {
      console.error('Error saving tag:', error);
      toast.error('Error saving tag');
    } finally {
      setSaving(false);
    }
  };

  // Delete tag
  const handleDeleteTag = async (tagId: string) => {
    if (!confirm('Are you sure you want to delete this tag?')) return;

    try {
      const response = await fetch(`/api/tags/${tagId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Tag deleted successfully');
        fetchTags();
      } else {
        toast.error('Failed to delete tag');
      }
    } catch (error) {
      console.error('Error deleting tag:', error);
      toast.error('Error deleting tag');
    }
  };

  // Edit tag
  const handleEditTag = (tag: Tag) => {
    setEditingTag(tag);
    setFormData({
      name: tag.name,
      description: tag.description || '',
      color: tag.color || '#3B82F6',
      icon: tag.icon || 'tag'
    });
    setIsAddingTag(true);
  };

  if (!session || session.user.role !== 'admin') {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
              <p className="text-gray-600 mb-4">You do not have permission to access this page.</p>
              <Button onClick={() => router.push('/dashboard')}>
                Go Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/dashboard/admin')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Button>
            </div>
            <Button
              onClick={() => {
                if (!isAddingTag) {
                  setIsAddingTag(true);
                } else {
                  resetForm();
                }
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              {isAddingTag ? 'Cancel' : 'Create Tag'}
            </Button>
          </div>

          {/* Add/Edit Tag Form */}
          {isAddingTag && (
            <Card className="mb-6 border-blue-200 bg-blue-50/50">
              <CardHeader>
                <CardTitle className="text-lg">
                  {editingTag ? 'Edit Tag' : 'Create New Tag'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Tag Name *</Label>
                  <Input
                    placeholder="e.g., High Priority"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium">Description</Label>
                  <Textarea
                    placeholder="Optional description for this tag"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="mt-1 min-h-20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Color</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        className="h-10 w-20 rounded cursor-pointer border"
                      />
                      <code className="text-xs text-gray-600">{formData.color}</code>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Icon</Label>
                    <Input
                      placeholder="e.g., tag, star, alert"
                      value={formData.icon}
                      onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={resetForm}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveTag}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {saving ? 'Saving...' : editingTag ? 'Update Tag' : 'Create Tag'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tags List */}
          <Card>
            <CardHeader>
              <CardTitle>All Tags ({tags.length})</CardTitle>
              <CardDescription>
                Create and manage tags for organizing clients
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : tags.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No tags created yet</p>
                  <p className="text-gray-400 text-xs mt-1">Create your first tag to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tags.map((tag) => (
                    <Card key={tag._id} className="border-gray-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <div
                              className="h-4 w-4 rounded-full shrink-0"
                              style={{ backgroundColor: tag.color }}
                            />
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-900">{tag.name}</h3>
                              {tag.description && (
                                <p className="text-sm text-gray-600 mt-0.5">{tag.description}</p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                {tag.icon && (
                                  <Badge variant="secondary" className="text-xs">
                                    Icon: {tag.icon}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {tag.color}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditTag(tag)}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTag(tag._id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
