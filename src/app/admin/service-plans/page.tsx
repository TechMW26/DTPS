'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useDurationPresets } from '@/hooks/useDurationPresets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { toast } from 'sonner';
import {
  Plus,
  Edit,
  Trash2,
  Package,
  X,
  Clock,
  Eye,
  EyeOff
} from 'lucide-react';

interface PricingTier {
  _id?: string;
  durationDays: number;
  durationLabel: string;
  amount: number;
  maxDiscount: number;
  extendDays?: number;
  freezeDays?: number;
  isActive: boolean;
}

interface ServicePlan {
  _id: string;
  name: string;
  category: string;
  description?: string;
  pricingTiers: PricingTier[];
  maxDiscountPercent: number;
  isActive: boolean;
  showToClients: boolean;
  createdAt: string;
}

const CATEGORIES = [
  { value: 'weight-loss', label: 'Weight Loss' },
  { value: 'weight-gain', label: 'Weight Gain' },
  { value: 'muscle-gain', label: 'Muscle Gain' },
  { value: 'diabetes', label: 'Diabetes Management' },
  { value: 'pcos', label: 'PCOS' },
  { value: 'thyroid', label: 'Thyroid' },
  { value: 'general-wellness', label: 'General Wellness' },
  { value: 'detox', label: 'Detox' },
  { value: 'sports-nutrition', label: 'Sports Nutrition' },
  { value: 'custom', label: 'Custom' }
];

// Duration presets are now fetched dynamically from the database

export default function AdminServicePlansPage() {
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ServicePlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Fetch dynamic duration presets
  const { presets: DURATION_PRESETS, getDurationLabel, loading: presetsLoading } = useDurationPresets();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    category: 'general-wellness',
    description: '',
    isActive: true,
    showToClients: true,
    pricingTiers: [] as PricingTier[]
  });

  // New pricing tier input
  const [newTier, setNewTier] = useState({
    durationDays: 30,
    amount: 0,
    maxDiscount: 0,
    extendDays: 0,
    freezeDays: 0
  });

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/service-plans');
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans || []);
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
      toast.error('Failed to load service plans');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'general-wellness',
      description: '',
      isActive: true,
      showToClients: true,
      pricingTiers: []
    });
    setEditingPlan(null);
    setNewTier({ durationDays: 30, amount: 0, maxDiscount: 0, extendDays: 0, freezeDays: 0 });
  };

  // getDurationLabel is now provided by useDurationPresets hook

  const handleSubmit = async () => {
    if (!formData.name) {
      toast.error('Please enter a plan name');
      return;
    }

    if (formData.pricingTiers.length === 0) {
      toast.error('Please add at least one pricing tier');
      return;
    }

    try {
      setSaving(true);
      const url = '/api/admin/service-plans';
      const method = editingPlan ? 'PUT' : 'POST';
      const body = editingPlan
        ? { id: editingPlan._id, ...formData }
        : formData;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast.success(editingPlan ? 'Service plan updated' : 'Service plan created');
        setDialogOpen(false);
        fetchPlans();
        resetForm();
      } else {
        toast.error(result.error || 'Failed to save plan');
      }
    } catch (error) {
      console.error('Error saving plan:', error);
      toast.error('Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (plan: ServicePlan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      category: plan.category,
      description: plan.description || '',
      isActive: plan.isActive,
      showToClients: plan.showToClients ?? true,
      pricingTiers: plan.pricingTiers || []
    });
    setDialogOpen(true);
  };

  const handleDelete = async (planId: string) => {
    try {
      const response = await fetch(`/api/admin/service-plans?id=${planId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast.success('Service plan deleted');
        fetchPlans();
      } else {
        toast.error(result.error || 'Failed to delete plan');
      }
    } catch (error) {
      console.error('Error deleting plan:', error);
      toast.error('Failed to delete plan');
    }
    setDeleteConfirmId(null);
  };

  const addPricingTier = () => {
    if (newTier.durationDays < 1 || newTier.amount < 0) {
      toast.error('Please fill in tier details correctly');
      return;
    }

    // Check if duration already exists
    if (formData.pricingTiers.some(t => t.durationDays === newTier.durationDays)) {
      toast.error('A pricing tier with this duration already exists');
      return;
    }

    setFormData({
      ...formData,
      pricingTiers: [...formData.pricingTiers, {
        ...newTier,
        durationLabel: getDurationLabel(newTier.durationDays),
        maxDiscount: newTier.maxDiscount,
        isActive: true
      }].sort((a, b) => a.durationDays - b.durationDays)
    });
    setNewTier({ durationDays: 30, amount: 0, maxDiscount: 40, extendDays: 0, freezeDays: 0 });
  };

  const removePricingTier = (index: number) => {
    setFormData({
      ...formData,
      pricingTiers: formData.pricingTiers.filter((_, i) => i !== index)
    });
  };

  const updatePricingTier = (index: number, field: string, value: any) => {
    const updatedTiers = [...formData.pricingTiers];
    updatedTiers[index] = { ...updatedTiers[index], [field]: value };
    // Auto-update label if days change
    if (field === 'durationDays') {
      updatedTiers[index].durationLabel = getDurationLabel(value);
    }
    setFormData({ ...formData, pricingTiers: updatedTiers });
  };

  const getCategoryLabel = (value: string) => {
    return CATEGORIES.find(c => c.value === value)?.label || value;
  };

  const togglePlanStatus = async (plan: ServicePlan) => {
    try {
      const response = await fetch('/api/admin/service-plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: plan._id,
          isActive: !plan.isActive,
          showToClients: plan.showToClients
        })
      });

      if (response.ok) {
        toast.success(`Plan ${plan.isActive ? 'deactivated' : 'activated'}`);
        fetchPlans();
      }
    } catch (error) {
      toast.error('Failed to update plan status');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Service Plans</h1>
            <p className="text-gray-500 mt-1">Manage diet and nutrition service plans with pricing</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="bg-green-600 hover:bg-green-700">
                <Plus className="h-4 w-4 mr-2" />
                Create Service Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[70vw] sm:max-w-xl md:max-w-4xl lg:max-w-6xl xl:max-w-7xl max-h-[95vh] overflow-y-auto">
              <DialogHeader className="pb-4">
                <DialogTitle className="text-2xl font-bold">{editingPlan ? 'Edit Service Plan' : 'Create Service Plan'}</DialogTitle>
                <DialogDescription className="text-base">
                  {editingPlan ? 'Update the service plan details' : 'Create a new service plan with pricing tiers'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-8 mt-4 pb-6">
                {/* Basic Info */}
                <div className="bg-linear-to-br from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Package className="h-5 w-5 text-blue-600" />
                    Basic Information
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <Label className="font-semibold text-gray-700">Plan Name *</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Weight Loss Program"
                        className="mt-2 h-10 text-base"
                      />
                    </div>
                    <div>
                      <Label className="font-semibold text-gray-700">Category *</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData({ ...formData, category: value })}
                      >
                        <SelectTrigger className="mt-2 h-10 text-base">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="font-semibold text-gray-700 block mb-2">Description</Label>
                  <RichTextEditor
                    value={formData.description}
                    onChange={(value) => setFormData({ ...formData, description: value })}
                    placeholder="Describe the service plan..."
                    minHeight="120px"
                  />
                </div>

                {/* Pricing Tiers */}
                <div className="bg-linear-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl p-6">
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-5 w-5 text-amber-600" />
                      <Label className="text-lg font-bold text-gray-900">Pricing Tiers *</Label>
                    </div>
                    <p className="text-sm text-gray-600 ml-7">Add different pricing options based on duration</p>
                  </div>

                  {/* Existing Tiers */}
                  {formData.pricingTiers.length > 0 && (
                    <div className="space-y-3 mb-8">
                      <div className="hidden sm:grid grid-cols-6 gap-4 mb-3 px-4 py-3 bg-amber-100 rounded-lg text-xs font-bold text-amber-900">
                        <div>Duration (Days)</div>
                        <div>Amount (₹)</div>
                        <div>Max Discount %</div>
                        <div>Extend Days</div>
                        <div>Freeze Days</div>
                        <div>Status</div>
                      </div>
                      {formData.pricingTiers.map((tier, index) => (
                        <div key={index} className="bg-white p-4 rounded-lg border-2 border-gray-200 hover:border-amber-300 hover:shadow-md transition">
                          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 items-center">
                            <div>
                              <Label className="text-xs text-gray-500 sm:hidden">Duration (Days)</Label>
                              <Input
                                type="number"
                                min="1"
                                value={tier.durationDays}
                                onChange={(e) => updatePricingTier(index, 'durationDays', parseInt(e.target.value) || 1)}
                                className="mt-1 sm:mt-0"
                              />
                              <p className="text-xs text-gray-400 mt-1">{getDurationLabel(tier.durationDays)}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500 sm:hidden">Amount (₹)</Label>
                              <div className="relative mt-1 sm:mt-0">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                                <Input
                                  type="number"
                                  min="0"
                                  value={tier.amount}
                                  onChange={(e) => updatePricingTier(index, 'amount', parseInt(e.target.value) || 0)}
                                  className="pl-8"
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500 sm:hidden">Max Discount %</Label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={tier.maxDiscount || 0}
                                onChange={(e) => updatePricingTier(index, 'maxDiscount', Math.min(100, parseInt(e.target.value) || 0))}
                                className="mt-1 sm:mt-0"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500 sm:hidden">Extend Days</Label>
                              <Input
                                type="number"
                                min="0"
                                value={tier.extendDays || 0}
                                onChange={(e) => updatePricingTier(index, 'extendDays', parseInt(e.target.value) || 0)}
                                className="mt-1 sm:mt-0"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500 sm:hidden">Freeze Days</Label>
                              <Input
                                type="number"
                                min="0"
                                value={tier.freezeDays || 0}
                                onChange={(e) => updatePricingTier(index, 'freezeDays', parseInt(e.target.value) || 0)}
                                className="mt-1 sm:mt-0"
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={tier.isActive}
                                  onCheckedChange={(checked) => updatePricingTier(index, 'isActive', checked)}
                                />
                                <span className="text-xs text-gray-600 whitespace-nowrap">
                                  {tier.isActive ? (
                                    <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded">Active</span>
                                  ) : (
                                    <span className="inline-block bg-gray-100 text-gray-600 px-2 py-1 rounded">Inactive</span>
                                  )}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removePricingTier(index)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 h-8 w-8"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add New Tier */}
                  <div className="p-4 bg-green-50 rounded-xl border-2 border-green-300 shadow-sm">
                    <p className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <Plus className="h-4 w-4 text-green-600" />
                      Add New Pricing Tier
                    </p>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 items-end">
                        <div>
                          <Label className="text-xs font-semibold text-gray-700 mb-2 block">Duration</Label>
                          <Select
                            value={newTier.durationDays.toString()}
                            onValueChange={(value) => setNewTier({ ...newTier, durationDays: parseInt(value) })}
                          >
                            <SelectTrigger className="bg-white h-10 text-base">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DURATION_PRESETS.map(preset => (
                                <SelectItem key={preset.days} value={preset.days.toString()}>
                                  {preset.label} ({preset.days} days)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs font-semibold text-gray-700 mb-2 block">Amount (₹)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={newTier.amount}
                            onChange={(e) => setNewTier({ ...newTier, amount: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                            className="bg-white h-10 text-base"
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-semibold text-gray-700 mb-2 block">Max Discount %</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={newTier.maxDiscount}
                            onChange={(e) => setNewTier({ ...newTier, maxDiscount: Math.min(100, parseInt(e.target.value) || 0) })}
                            placeholder="0"
                            className="bg-white h-10 text-base"
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-semibold text-gray-700 mb-2 block">Extend Days</Label>
                          <Input
                            type="number"
                            min="0"
                            value={newTier.extendDays || 0}
                            onChange={(e) => setNewTier({ ...newTier, extendDays: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                            className="bg-white h-10 text-base"
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-semibold text-gray-700 mb-2 block">Freeze Days</Label>
                          <Input
                            type="number"
                            min="0"
                            value={newTier.freezeDays || 0}
                            onChange={(e) => setNewTier({ ...newTier, freezeDays: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                            className="bg-white h-10 text-base"
                          />
                        </div>
                        <div>
                          <Button
                            type="button"
                            onClick={addPricingTier}
                            className="bg-green-600 hover:bg-green-700 text-white font-medium w-full h-10 flex items-center justify-center gap-2"
                          >
                            <Plus className="h-4 w-4" /> Add
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Settings */}
                <div className="bg-linear-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-xl p-6">
                  <div className="mb-6">
                    <div className="flex items-center gap-2">
                      <Eye className="h-5 w-5 text-purple-600" />
                      <Label className="text-lg font-bold text-gray-900">Settings</Label>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-white border border-purple-100 hover:border-purple-300 hover:shadow-sm transition">
                      <div>
                        <p className="font-semibold text-gray-900">Show to Clients</p>
                        <p className="text-sm text-gray-600">Display this plan on client dashboard</p>
                      </div>
                      <Switch
                        checked={formData.showToClients}
                        onCheckedChange={(checked) => setFormData({ ...formData, showToClients: checked })}
                      />
                    </div>

                    <div className="border-t-2 border-purple-100"></div>

                    <div className="flex items-center justify-between p-4 rounded-lg bg-white border border-purple-100 hover:border-purple-300 hover:shadow-sm transition">
                      <div>
                        <p className="font-semibold text-gray-900">Plan Status</p>
                        <p className="text-sm text-gray-600">Enable or disable this plan</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={formData.isActive}
                          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                        />
                        <Badge className={formData.isActive ? "bg-linear-to-r from-green-500 to-green-600 text-white" : "bg-gray-300 text-gray-700"}>
                          {formData.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-4 pt-8 border-t-2 border-gray-200">
                  <Button
                    variant="outline"
                    onClick={() => { setDialogOpen(false); resetForm(); }}
                    className="px-8 h-11 font-semibold text-base"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={saving}
                    className="bg-linear-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold px-8 h-11 text-base"
                  >
                    {saving ? (
                      <>
                        <LoadingSpinner className="h-4 w-4 mr-2" />
                        Saving...
                      </>
                    ) : (
                      editingPlan ? 'Update Plan' : 'Create Plan'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Plans Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner className="h-8 w-8" />
          </div>
        ) : plans.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No service plans yet</h3>
              <p className="text-gray-500 mt-1">Create your first service plan to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <Card key={plan._id} className={`relative overflow-hidden ${!plan.isActive ? 'opacity-60' : ''}`}>
                {/* Status indicator stripe */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${plan.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />

                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <Badge variant="outline" className="mt-1">
                        {getCategoryLabel(plan.category)}
                      </Badge>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={plan.isActive ? "default" : "secondary"} className={plan.isActive ? "bg-green-500" : ""}>
                        {plan.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      {plan.showToClients ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <Eye className="h-3 w-3" /> Visible to clients
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <EyeOff className="h-3 w-3" /> Hidden
                        </span>
                      )}
                    </div>
                  </div>
                  {plan.description && (
                    <div
                      className="mt-2 text-sm text-gray-500 prose prose-sm max-w-none line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: plan.description }}
                    />
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Pricing Tiers */}
                  <div className="space-y-2">
                    <Label className="text-sm text-gray-500">Pricing Options</Label>
                    <div className="space-y-1">
                      {plan.pricingTiers.filter(t => t.isActive).map((tier, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-linear-to-r from-green-50 to-blue-50 rounded-lg p-2 border border-green-100">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium">{tier.durationLabel}</span>
                            <span className="text-xs text-gray-400">({tier.durationDays} days)</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                              {tier.maxDiscount > 0 ? `Max ${tier.maxDiscount}% off` : 'No discount'}
                            </span>
                            <span className="font-bold text-green-600">₹{tier.amount.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(plan)}>
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => togglePlanStatus(plan)}
                      className={plan.isActive ? "text-orange-600" : "text-green-600"}
                    >
                      {plan.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    {deleteConfirmId === plan._id ? (
                      <div className="flex gap-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(plan._id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setDeleteConfirmId(plan._id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
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
