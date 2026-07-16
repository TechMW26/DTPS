'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
    Plus,
    Edit,
    Trash2,
    Clock,
    GripVertical,
    RefreshCw,
    Database
} from 'lucide-react';

interface DurationPreset {
    _id: string;
    days: number;
    label: string;
    isActive: boolean;
    sortOrder: number;
    createdBy?: {
        name: string;
        email: string;
    };
    createdAt: string;
}

export default function AdminDurationPresetsPage() {
    const [presets, setPresets] = useState<DurationPreset[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingPreset, setEditingPreset] = useState<DurationPreset | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [seeding, setSeeding] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        days: 7,
        label: '',
        isActive: true
    });

    useEffect(() => {
        fetchPresets();
    }, []);

    const fetchPresets = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/admin/duration-presets');
            if (response.ok) {
                const data = await response.json();
                setPresets(data.presets || []);
            }
        } catch (error) {
            console.error('Error fetching presets:', error);
            toast.error('Failed to load duration presets');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            days: 7,
            label: '',
            isActive: true
        });
        setEditingPreset(null);
    };

    const handleSubmit = async () => {
        if (!formData.days || !formData.label) {
            toast.error('Please fill in all fields');
            return;
        }

        try {
            setSaving(true);
            const url = '/api/duration-presets';
            const method = editingPreset ? 'PUT' : 'POST';
            const body = editingPreset
                ? { id: editingPreset._id, ...formData }
                : formData;

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const result = await response.json();

            if (response.ok && result.success) {
                toast.success(editingPreset ? 'Duration preset updated' : 'Duration preset created');
                setDialogOpen(false);
                fetchPresets();
                resetForm();
            } else {
                toast.error(result.error || 'Failed to save preset');
            }
        } catch (error) {
            console.error('Error saving preset:', error);
            toast.error('Failed to save preset');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (preset: DurationPreset) => {
        setEditingPreset(preset);
        setFormData({
            days: preset.days,
            label: preset.label,
            isActive: preset.isActive
        });
        setDialogOpen(true);
    };

    const handleDelete = async (presetId: string) => {
        try {
            const response = await fetch(`/api/duration-presets?id=${presetId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (response.ok && result.success) {
                toast.success('Duration preset deleted');
                fetchPresets();
            } else {
                toast.error(result.error || 'Failed to delete preset');
            }
        } catch (error) {
            console.error('Error deleting preset:', error);
            toast.error('Failed to delete preset');
        }
        setDeleteConfirmId(null);
    };

    const toggleStatus = async (preset: DurationPreset) => {
        try {
            const response = await fetch('/api/duration-presets', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: preset._id,
                    isActive: !preset.isActive
                })
            });

            if (response.ok) {
                toast.success(`Preset ${preset.isActive ? 'deactivated' : 'activated'}`);
                fetchPresets();
            }
        } catch (error) {
            toast.error('Failed to update preset status');
        }
    };

    const seedDefaults = async () => {
        try {
            setSeeding(true);
            const response = await fetch('/api/admin/duration-presets', {
                method: 'POST'
            });

            const result = await response.json();

            if (response.ok && result.success) {
                if (result.seeded) {
                    toast.success('Default presets created successfully');
                    fetchPresets();
                } else {
                    toast.info('Presets already exist');
                }
            } else {
                toast.error(result.error || 'Failed to seed defaults');
            }
        } catch (error) {
            toast.error('Failed to seed defaults');
        } finally {
            setSeeding(false);
        }
    };

    // Auto-generate label suggestion based on days
    const suggestLabel = (days: number): string => {
        if (days === 7) return '1 Week';
        if (days === 10) return '10 Days';
        if (days === 14) return '2 Weeks';
        if (days === 21) return '3 Weeks';
        if (days === 30) return '1 Month';
        if (days === 60) return '2 Months';
        if (days === 90) return '3 Months';
        if (days === 180) return '6 Months';
        if (days === 365) return '1 Year';
        if (days % 365 === 0) return `${days / 365} Year${days / 365 > 1 ? 's' : ''}`;
        if (days % 30 === 0) return `${days / 30} Month${days / 30 > 1 ? 's' : ''}`;
        if (days % 7 === 0) return `${days / 7} Week${days / 7 > 1 ? 's' : ''}`;
        return `${days} Days`;
    };

    return (
        <DashboardLayout>
            <div className="p-6 space-y-6 pb-24">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Duration Presets</h1>
                        <p className="text-gray-500 mt-1">Manage plan duration options shown across the platform</p>
                    </div>
                    <div className="flex gap-2">
                        {presets.length === 0 && (
                            <Button
                                variant="outline"
                                onClick={seedDefaults}
                                disabled={seeding}
                            >
                                {seeding ? (
                                    <LoadingSpinner className="h-4 w-4 mr-2" />
                                ) : (
                                    <Database className="h-4 w-4 mr-2" />
                                )}
                                Seed Defaults
                            </Button>
                        )}
                        <Button variant="outline" onClick={fetchPresets}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh
                        </Button>
                        <Dialog open={dialogOpen} onOpenChange={(open) => {
                            setDialogOpen(open);
                            if (!open) resetForm();
                        }}>
                            <DialogTrigger asChild>
                                <Button className="bg-green-600 hover:bg-green-700">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Duration
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle>{editingPreset ? 'Edit Duration Preset' : 'Add Duration Preset'}</DialogTitle>
                                    <DialogDescription>
                                        {editingPreset ? 'Update the duration preset details' : 'Create a new duration option'}
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="space-y-4 mt-4">
                                    <div>
                                        <Label className="font-semibold">Duration (Days) *</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={formData.days}
                                            onChange={(e) => {
                                                const days = parseInt(e.target.value) || 1;
                                                setFormData({
                                                    ...formData,
                                                    days,
                                                    label: formData.label || suggestLabel(days)
                                                });
                                            }}
                                            placeholder="e.g., 7"
                                            className="mt-2"
                                        />
                                    </div>

                                    <div>
                                        <Label className="font-semibold">Display Label *</Label>
                                        <Input
                                            value={formData.label}
                                            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                            placeholder="e.g., 1 Week"
                                            className="mt-2"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Suggested: {suggestLabel(formData.days)}
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <div>
                                            <p className="font-medium">Active Status</p>
                                            <p className="text-sm text-gray-500">Show this option in dropdowns</p>
                                        </div>
                                        <Switch
                                            checked={formData.isActive}
                                            onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                                        />
                                    </div>

                                    <div className="flex justify-end gap-2 pt-4 border-t">
                                        <Button
                                            variant="outline"
                                            onClick={() => { setDialogOpen(false); resetForm(); }}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={handleSubmit}
                                            disabled={saving}
                                            className="bg-green-600 hover:bg-green-700"
                                        >
                                            {saving ? (
                                                <>
                                                    <LoadingSpinner className="h-4 w-4 mr-2" />
                                                    Saving...
                                                </>
                                            ) : (
                                                editingPreset ? 'Update' : 'Create'
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Info Card */}
                <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="py-4">
                        <div className="flex items-start gap-3">
                            <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
                            <div>
                                <p className="font-medium text-blue-900">Dynamic Duration Options</p>
                                <p className="text-sm text-blue-700 mt-1">
                                    These duration presets are used throughout the platform for service plans, meal plan templates,
                                    and client subscriptions. Changes here will reflect everywhere.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Presets List */}
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <LoadingSpinner className="h-8 w-8" />
                    </div>
                ) : presets.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                            <h3 className="text-lg font-medium text-gray-900">No duration presets yet</h3>
                            <p className="text-gray-500 mt-1">Click "Seed Defaults" to create standard options or add custom ones</p>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">All Duration Presets</CardTitle>
                            <CardDescription>
                                {presets.filter(p => p.isActive).length} active, {presets.filter(p => !p.isActive).length} inactive
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {/* Header */}
                                <div className="hidden sm:grid grid-cols-6 gap-4 px-4 py-2 bg-gray-100 rounded-lg text-sm font-semibold text-gray-600">
                                    <div className="col-span-1">Days</div>
                                    <div className="col-span-2">Label</div>
                                    <div className="col-span-1">Status</div>
                                    <div className="col-span-2 text-right">Actions</div>
                                </div>

                                {/* List */}
                                {presets.map((preset) => (
                                    <div
                                        key={preset._id}
                                        className={`grid grid-cols-2 sm:grid-cols-6 gap-4 items-center p-4 rounded-lg border ${preset.isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'
                                            } hover:shadow-sm transition`}
                                    >
                                        <div className="flex items-center gap-2 col-span-1">
                                            <GripVertical className="h-4 w-4 text-gray-400 hidden sm:block" />
                                            <span className="font-bold text-lg text-gray-900">{preset.days}</span>
                                            <span className="text-xs text-gray-500">days</span>
                                        </div>
                                        <div className="col-span-1 sm:col-span-2">
                                            <span className="font-medium text-gray-800">{preset.label}</span>
                                        </div>
                                        <div className="col-span-1">
                                            <Badge variant={preset.isActive ? "default" : "secondary"} className={preset.isActive ? "bg-green-500" : ""}>
                                                {preset.isActive ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </div>
                                        <div className="col-span-2 flex items-center justify-end gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => toggleStatus(preset)}
                                                className={preset.isActive ? "text-orange-600" : "text-green-600"}
                                            >
                                                {preset.isActive ? 'Deactivate' : 'Activate'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleEdit(preset)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            {deleteConfirmId === preset._id ? (
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() => handleDelete(preset._id)}
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
                                                    onClick={() => setDeleteConfirmId(preset._id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </DashboardLayout>
    );
}
