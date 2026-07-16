'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Loader2, 
  X, 
  ImagePlus, 
  ArrowUpDown,
  ToggleLeft,
  ToggleRight,
  Eye,
  EyeOff
} from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { compressImage, extractBase64Data } from '@/lib/imageCompression';
import { useBodyScrollLock } from '@/hooks';
import { useDataRefresh, emitDataChange, DataEventTypes } from '@/lib/events/useDataRefresh';

interface Transformation {
  _id: string;
  uuid: string;
  title: string;
  description?: string;
  beforeImage: string;
  afterImage: string;
  clientName?: string;
  durationWeeks?: number;
  weightLoss?: number;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export default function TransformationsManagement() {
  const [transformations, setTransformations] = useState<Transformation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTransformation, setEditingTransformation] = useState<Transformation | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    clientName: '',
    durationWeeks: '',
    weightLoss: '',
    isActive: true,
    displayOrder: 0,
    beforeImage: '',
    afterImage: '',
  });
  const [beforePreview, setBeforePreview] = useState<string | null>(null);
  const [afterPreview, setAfterPreview] = useState<string | null>(null);

  // Prevent body scroll when dialog is open
  useBodyScrollLock(isDialogOpen);

  const fetchTransformations = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/admin/transformations?showInactive=${showInactive}`);
      if (!response.ok) {
        throw new Error('Failed to fetch transformations');
      }
      const data = await response.json();
      setTransformations(data.transformations || []);
    } catch (error) {
      console.error('Error fetching transformations:', error);
      toast.error('Failed to load transformations');
    } finally {
      setIsLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    fetchTransformations();
  }, [fetchTransformations]);

  // Subscribe to real-time transformation updates
  useDataRefresh(DataEventTypes.TRANSFORMATIONS_UPDATED, fetchTransformations, [fetchTransformations]);

  const handleOpenDialog = (transformation?: Transformation) => {
    if (transformation) {
      setEditingTransformation(transformation);
      setFormData({
        title: transformation.title,
        description: transformation.description || '',
        clientName: transformation.clientName || '',
        durationWeeks: transformation.durationWeeks?.toString() || '',
        weightLoss: transformation.weightLoss?.toString() || '',
        isActive: transformation.isActive,
        displayOrder: transformation.displayOrder,
        beforeImage: transformation.beforeImage,
        afterImage: transformation.afterImage,
      });
      setBeforePreview(transformation.beforeImage);
      setAfterPreview(transformation.afterImage);
    } else {
      setEditingTransformation(null);
      setFormData({
        title: '',
        description: '',
        clientName: '',
        durationWeeks: '',
        weightLoss: '',
        isActive: true,
        displayOrder: transformations.length,
        beforeImage: '',
        afterImage: '',
      });
      setBeforePreview(null);
      setAfterPreview(null);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingTransformation(null);
    setBeforePreview(null);
    setAfterPreview(null);
  };

  const handleImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'before' | 'after'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Compress image before uploading
      const compressed = await compressImage(file, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.85,
        format: 'image/jpeg'
      });

      if (type === 'before') {
        setBeforePreview(compressed.base64);
        setFormData(prev => ({ ...prev, beforeImage: compressed.base64 }));
      } else {
        setAfterPreview(compressed.base64);
        setFormData(prev => ({ ...prev, afterImage: compressed.base64 }));
      }

      // Show compression stats
      const savedPercent = Math.round((1 - compressed.compressedSize / compressed.originalSize) * 100);
      toast.success(`Image compressed: ${savedPercent}% smaller`);
    } catch (error) {
      console.error('Image compression failed:', error);
      toast.error('Failed to process image');
    }
  };

  const handleSaveTransformation = async () => {
    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!editingTransformation) {
      if (!formData.beforeImage || !formData.afterImage) {
        toast.error('Both before and after images are required');
        return;
      }
    }

    try {
      setIsSaving(true);

      const submitData = new FormData();
      submitData.append('title', formData.title);
      submitData.append('description', formData.description);
      submitData.append('clientName', formData.clientName);
      submitData.append('durationWeeks', formData.durationWeeks);
      submitData.append('weightLoss', formData.weightLoss);
      submitData.append('isActive', formData.isActive.toString());
      submitData.append('displayOrder', formData.displayOrder.toString());
      
      // Only send images if they're base64 (new uploads)
      if (formData.beforeImage.includes('base64')) {
        submitData.append('beforeImage', formData.beforeImage);
      }
      if (formData.afterImage.includes('base64')) {
        submitData.append('afterImage', formData.afterImage);
      }

      if (editingTransformation) {
        const response = await fetch(`/api/admin/transformations/${editingTransformation._id}`, {
          method: 'PUT',
          body: submitData,
        });

        if (!response.ok) {
          throw new Error('Failed to update transformation');
        }

        toast.success('Transformation updated successfully');
        emitDataChange(DataEventTypes.TRANSFORMATIONS_UPDATED);
      } else {
        submitData.append('beforeImage', formData.beforeImage);
        submitData.append('afterImage', formData.afterImage);

        const response = await fetch('/api/admin/transformations', {
          method: 'POST',
          body: submitData,
        });

        if (!response.ok) {
          throw new Error('Failed to create transformation');
        }

        toast.success('Transformation created successfully');
        emitDataChange(DataEventTypes.TRANSFORMATIONS_UPDATED);
      }

      handleCloseDialog();
      fetchTransformations();
    } catch (error) {
      console.error('Error saving transformation:', error);
      toast.error(editingTransformation ? 'Failed to update transformation' : 'Failed to create transformation');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTransformation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transformation?')) return;

    try {
      const response = await fetch(`/api/admin/transformations/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete transformation');
      }

      toast.success('Transformation deleted successfully');
      emitDataChange(DataEventTypes.TRANSFORMATIONS_UPDATED);
      fetchTransformations();
    } catch (error) {
      console.error('Error deleting transformation:', error);
      toast.error('Failed to delete transformation');
    }
  };

  const handleToggleActive = async (transformation: Transformation) => {
    try {
      const submitData = new FormData();
      submitData.append('title', transformation.title);
      submitData.append('isActive', (!transformation.isActive).toString());
      submitData.append('displayOrder', transformation.displayOrder.toString());

      const response = await fetch(`/api/admin/transformations/${transformation._id}`, {
        method: 'PUT',
        body: submitData,
      });

      if (!response.ok) {
        throw new Error('Failed to update transformation');
      }

      toast.success(`Transformation ${transformation.isActive ? 'deactivated' : 'activated'}`);
      emitDataChange(DataEventTypes.TRANSFORMATIONS_UPDATED);
      fetchTransformations();
    } catch (error) {
      console.error('Error toggling transformation:', error);
      toast.error('Failed to update transformation');
    }
  };

  return (
    <DashboardLayout>
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transformation Gallery</h1>
          <p className="text-gray-500 mt-1">Manage before/after transformation images</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
            className="gap-2"
          >
            {showInactive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </Button>
          <Button onClick={() => handleOpenDialog()} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Transformation
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#3AB1A0]" />
        </div>
      ) : transformations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ImagePlus className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500 text-lg">No transformations yet</p>
            <Button onClick={() => handleOpenDialog()} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              Add Your First Transformation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {transformations.map((transformation) => (
            <Card key={transformation._id} className={`overflow-hidden ${!transformation.isActive ? 'opacity-60' : ''}`}>
              <div className="relative">
                <div className="grid grid-cols-2 gap-1">
                  <div className="relative aspect-[3/4] bg-gray-100">
                    <img
                      src={transformation.beforeImage}
                      alt="Before"
                      
                      className="object-cover"
                    />
                    <span className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      Before
                    </span>
                  </div>
                  <div className="relative aspect-[3/4] bg-gray-100">
                    <img
                      src={transformation.afterImage}
                      alt="After"
                      
                      className="object-cover"
                    />
                    <span className="absolute bottom-2 left-2 bg-[#3AB1A0]/90 text-white text-xs px-2 py-1 rounded">
                      After
                    </span>
                  </div>
                </div>
                {!transformation.isActive && (
                  <Badge className="absolute top-2 right-2 bg-gray-500">
                    Inactive
                  </Badge>
                )}
              </div>
              <CardContent className="p-4">
                <h3 className="font-semibold text-gray-900 mb-1">{transformation.title}</h3>
                {transformation.clientName && (
                  <p className="text-sm text-gray-500 mb-2">{transformation.clientName}</p>
                )}
                <div className="flex flex-wrap gap-2 mb-3">
                  {transformation.durationWeeks && (
                    <Badge variant="secondary">{transformation.durationWeeks} weeks</Badge>
                  )}
                  {transformation.weightLoss && (
                    <Badge variant="secondary">-{transformation.weightLoss} kg</Badge>
                  )}
                  <Badge variant="outline">Order: {transformation.displayOrder}</Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(transformation)}
                    className="flex-1"
                  >
                    {transformation.isActive ? (
                      <><ToggleRight className="h-4 w-4 mr-1 text-green-500" /> Active</>
                    ) : (
                      <><ToggleLeft className="h-4 w-4 mr-1 text-gray-400" /> Inactive</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenDialog(transformation)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteTransformation(transformation._id)}
                    className="text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTransformation ? 'Edit Transformation' : 'Add Transformation'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Image Upload Section */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Before Image *
                </label>
                <div className="relative aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden border-2 border-dashed border-gray-300 hover:border-[#3AB1A0] transition-colors">
                  {beforePreview ? (
                    <img
                      src={beforePreview}
                      alt="Before preview"
                      
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                      <ImagePlus className="h-8 w-8 mb-2" />
                      <span className="text-sm">Before Photo</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleImageChange(e, 'before')}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  After Image *
                </label>
                <div className="relative aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden border-2 border-dashed border-gray-300 hover:border-[#3AB1A0] transition-colors">
                  {afterPreview ? (
                    <img
                      src={afterPreview}
                      alt="After preview"
                      
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                      <ImagePlus className="h-8 w-8 mb-2" />
                      <span className="text-sm">After Photo</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleImageChange(e, 'after')}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Amazing Weight Loss Journey"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the transformation..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Name (Optional)
                </label>
                <Input
                  value={formData.clientName}
                  onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                  placeholder="e.g., Priya S."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Duration (weeks)
                </label>
                <Input
                  type="number"
                  value={formData.durationWeeks}
                  onChange={(e) => setFormData(prev => ({ ...prev, durationWeeks: e.target.value }))}
                  placeholder="e.g., 12"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Weight Loss (kg)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.weightLoss}
                  onChange={(e) => setFormData(prev => ({ ...prev, weightLoss: e.target.value }))}
                  placeholder="e.g., 15"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Order
                </label>
                <Input
                  type="number"
                  value={formData.displayOrder}
                  onChange={(e) => setFormData(prev => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Active:</label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFormData(prev => ({ ...prev, isActive: !prev.isActive }))}
                className="gap-2"
              >
                {formData.isActive ? (
                  <><ToggleRight className="h-5 w-5 text-green-500" /> Yes</>
                ) : (
                  <><ToggleLeft className="h-5 w-5 text-gray-400" /> No</>
                )}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button onClick={handleSaveTransformation} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingTransformation ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
