'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus,
  Edit,
  Trash2,
  IndianRupee,
  Calendar,
  CheckCircle2,
  XCircle,
  Package
} from 'lucide-react';

interface SubscriptionPlan {
  _id: string;
  name: string;
  description?: string;
  duration: number;
  durationType: 'days' | 'weeks' | 'months';
  price: number;
  currency: string;
  features: string[];
  category: string;
  isActive: boolean;
  consultationsIncluded: number;
  dietPlanIncluded: boolean;
  followUpsIncluded: number;
  chatSupport: boolean;
  videoCallsIncluded: number;
  createdAt: string;
}

export default function AdminSubscriptionPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration: 1,
    durationType: 'months' as 'days' | 'weeks' | 'months',
    price: 0,
    currency: 'INR',
    features: [] as string[],
    category: 'general-wellness',
    isActive: true,
    consultationsIncluded: 0,
    dietPlanIncluded: true,
    followUpsIncluded: 0,
    chatSupport: true,
    videoCallsIncluded: 0
  });

  const [featureInput, setFeatureInput] = useState('');

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/subscription-plans');
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans || []);
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || formData.price <= 0) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);
      const url = editingPlan 
        ? '/api/admin/subscription-plans'
        : '/api/admin/subscription-plans';
      
      const method = editingPlan ? 'PUT' : 'POST';
      const body = editingPlan 
        ? { id: editingPlan._id, ...formData }
        : formData;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        setDialogOpen(false);
        fetchPlans();
        resetForm();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to save plan');
      }
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description || '',
      duration: plan.duration,
      durationType: plan.durationType,
      price: plan.price,
      currency: plan.currency,
      features: plan.features,
      category: plan.category,
      isActive: plan.isActive,
      consultationsIncluded: plan.consultationsIncluded,
      dietPlanIncluded: plan.dietPlanIncluded,
      followUpsIncluded: plan.followUpsIncluded,
      chatSupport: plan.chatSupport,
      videoCallsIncluded: plan.videoCallsIncluded
    });
    setDialogOpen(true);
  };

  const handleDelete = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this plan?')) return;

    try {
      const response = await fetch(`/api/admin/subscription-plans?id=${planId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchPlans();
      }
    } catch (error) {
      console.error('Error deleting plan:', error);
    }
  };

  const resetForm = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      description: '',
      duration: 1,
      durationType: 'months',
      price: 0,
      currency: 'INR',
      features: [],
      category: 'general-wellness',
      isActive: true,
      consultationsIncluded: 0,
      dietPlanIncluded: true,
      followUpsIncluded: 0,
      chatSupport: true,
      videoCallsIncluded: 0
    });
    setFeatureInput('');
  };

  const addFeature = () => {
    if (featureInput.trim()) {
      setFormData({
        ...formData,
        features: [...formData.features, featureInput.trim()]
      });
      setFeatureInput('');
    }
  };

  const removeFeature = (index: number) => {
    setFormData({
      ...formData,
      features: formData.features.filter((_, i) => i !== index)
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
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
            <h1 className="text-3xl font-bold text-gray-900">Subscription Plans</h1>
            <p className="text-gray-600 mt-1">
              Manage subscription plans for your platform
            </p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="cursor-pointer">
                <Plus className="h-4 w-4 mr-2" />
                Create Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingPlan ? 'Edit Plan' : 'Create New Plan'}</DialogTitle>
                <DialogDescription>
                  {editingPlan ? 'Update the subscription plan details' : 'Create a new subscription plan for clients'}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Plan Name *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Weight Loss - 3 Months"
                    />
                  </div>

                  <div className="col-span-2">
                    <Label>Description</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Plan description..."
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label>Category *</Label>
                    <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weight-loss">Weight Loss</SelectItem>
                        <SelectItem value="weight-gain">Weight Gain</SelectItem>
                        <SelectItem value="muscle-gain">Muscle Gain</SelectItem>
                        <SelectItem value="diabetes">Diabetes</SelectItem>
                        <SelectItem value="pcos">PCOS</SelectItem>
                        <SelectItem value="thyroid">Thyroid</SelectItem>
                        <SelectItem value="general-wellness">General Wellness</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Price (₹) *</Label>
                    <Input
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                      min="0"
                    />
                  </div>

                  <div>
                    <Label>Duration *</Label>
                    <Input
                      type="number"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                      min="1"
                    />
                  </div>

                  <div>
                    <Label>Duration Type *</Label>
                    <Select value={formData.durationType} onValueChange={(value: any) => setFormData({ ...formData, durationType: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="days">Days</SelectItem>
                        <SelectItem value="weeks">Weeks</SelectItem>
                        <SelectItem value="months">Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Consultations Included</Label>
                    <Input
                      type="number"
                      value={formData.consultationsIncluded}
                      onChange={(e) => setFormData({ ...formData, consultationsIncluded: parseInt(e.target.value) })}
                      min="0"
                    />
                  </div>

                  <div>
                    <Label>Follow-ups Included</Label>
                    <Input
                      type="number"
                      value={formData.followUpsIncluded}
                      onChange={(e) => setFormData({ ...formData, followUpsIncluded: parseInt(e.target.value) })}
                      min="0"
                    />
                  </div>

                  <div>
                    <Label>Video Calls Included</Label>
                    <Input
                      type="number"
                      value={formData.videoCallsIncluded}
                      onChange={(e) => setFormData({ ...formData, videoCallsIncluded: parseInt(e.target.value) })}
                      min="0"
                    />
                  </div>

                  <div className="col-span-2 space-y-2">
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.dietPlanIncluded}
                          onChange={(e) => setFormData({ ...formData, dietPlanIncluded: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm">Diet Plan Included</span>
                      </label>
                      
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.chatSupport}
                          onChange={(e) => setFormData({ ...formData, chatSupport: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm">Chat Support</span>
                      </label>

                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isActive}
                          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm">Active</span>
                      </label>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <Label>Features</Label>
                    <div className="flex space-x-2 mb-2">
                      <Input
                        value={featureInput}
                        onChange={(e) => setFeatureInput(e.target.value)}
                        placeholder="Add a feature..."
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                      />
                      <Button type="button" onClick={addFeature}>Add</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.features.map((feature, index) => (
                        <Badge key={index} variant="outline" className="cursor-pointer" onClick={() => removeFeature(index)}>
                          {feature} ×
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Plans List */}
        {plans.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Plans Yet</h3>
              <p className="text-gray-600 mb-4">
                Create your first subscription plan
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <Card key={plan._id} className={plan.isActive ? 'border-green-500' : 'border-gray-300'}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                      {plan.description && (
                        <CardDescription className="mt-1">{plan.description}</CardDescription>
                      )}
                    </div>
                    {plan.isActive ? (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-800">
                        <XCircle className="h-3 w-3 mr-1" />
                        Inactive
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center py-4 border-y">
                    <div className="text-3xl font-bold flex items-center justify-center">
                      <IndianRupee className="h-6 w-6" />
                      {plan.price}
                    </div>
                    <p className="text-gray-600 text-sm mt-1">
                      {plan.duration} {plan.durationType}
                    </p>
                  </div>

                  <div className="space-y-2 text-sm">
                    <Badge variant="outline" className="capitalize">{plan.category.replace('-', ' ')}</Badge>
                    
                    {plan.features.length > 0 && (
                      <div>
                        <p className="text-gray-600 mb-1">Features:</p>
                        <ul className="space-y-1">
                          {plan.features.slice(0, 3).map((feature, index) => (
                            <li key={index} className="text-gray-700 flex items-start">
                              <CheckCircle2 className="h-3 w-3 mr-1 mt-0.5 text-green-600" />
                              {feature}
                            </li>
                          ))}
                          {plan.features.length > 3 && (
                            <li className="text-gray-500">+{plan.features.length - 3} more</li>
                          )}
                        </ul>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div>
                        <p className="text-gray-600">Consultations</p>
                        <p className="font-medium">{plan.consultationsIncluded}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Follow-ups</p>
                        <p className="font-medium">{plan.followUpsIncluded}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-2 border-t">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(plan)} className="cursor-pointer flex-1">
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(plan._id)}
                      className="cursor-pointer text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

