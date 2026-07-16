'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Plus,
  Pencil,
  Trash2,
  Calendar,
  Video,
  Phone,
  MapPin,
  Clock,
  Settings,
  GripVertical
} from 'lucide-react';
import { toast } from 'sonner';

interface AppointmentType {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  duration: number;
  color?: string;
  icon?: string;
  isActive: boolean;
  order: number;
}

interface AppointmentMode {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  requiresMeetingLink: boolean;
  requiresLocation: boolean;
  isActive: boolean;
  order: number;
}

const ICON_OPTIONS = [
  { value: 'calendar', label: 'Calendar', icon: Calendar },
  { value: 'video', label: 'Video', icon: Video },
  { value: 'phone', label: 'Phone', icon: Phone },
  { value: 'map-pin', label: 'Location', icon: MapPin },
  { value: 'clock', label: 'Clock', icon: Clock },
];

const COLOR_OPTIONS = [
  { value: '#3B82F6', label: 'Blue' },
  { value: '#10B981', label: 'Green' },
  { value: '#F59E0B', label: 'Yellow' },
  { value: '#EF4444', label: 'Red' },
  { value: '#8B5CF6', label: 'Purple' },
  { value: '#EC4899', label: 'Pink' },
  { value: '#6B7280', label: 'Gray' },
];

export default function AppointmentConfigPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [modes, setModes] = useState<AppointmentMode[]>([]);
  const [activeTab, setActiveTab] = useState('types');

  // Dialog states
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [editingType, setEditingType] = useState<AppointmentType | null>(null);
  const [editingMode, setEditingMode] = useState<AppointmentMode | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [typeForm, setTypeForm] = useState({
    name: '',
    description: '',
    duration: 60,
    color: '#3B82F6',
    icon: 'calendar',
    isActive: true
  });

  const [modeForm, setModeForm] = useState({
    name: '',
    description: '',
    icon: 'video',
    requiresMeetingLink: false,
    requiresLocation: false,
    isActive: true
  });

  useEffect(() => {
    if (session?.user?.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    fetchConfig();
  }, [session, router]);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/appointment-config?resource=all');
      if (res.ok) {
        const data = await res.json();
        setTypes(data.types || []);
        setModes(data.modes || []);
      }
    } catch (error) {
      console.error('Error fetching config:', error);
      toast.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveType = async () => {
    if (!typeForm.name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);
    try {
      const url = '/api/admin/appointment-config';
      const method = editingType ? 'PUT' : 'POST';
      const body = editingType
        ? { resource: 'type', id: editingType._id, ...typeForm }
        : { resource: 'type', ...typeForm };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        toast.success(editingType ? 'Type updated' : 'Type created');
        setShowTypeDialog(false);
        setEditingType(null);
        resetTypeForm();
        fetchConfig();
      } else {
        const err = await res.json();
        toast.error(err?.details?.[0]?.message || err.error || 'Failed to save type');
      }
    } catch (error) {
      toast.error('Failed to save type');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMode = async () => {
    if (!modeForm.name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);
    try {
      const url = '/api/admin/appointment-config';
      const method = editingMode ? 'PUT' : 'POST';
      const body = editingMode
        ? { resource: 'mode', id: editingMode._id, ...modeForm }
        : { resource: 'mode', ...modeForm };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        toast.success(editingMode ? 'Mode updated' : 'Mode created');
        setShowModeDialog(false);
        setEditingMode(null);
        resetModeForm();
        fetchConfig();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save mode');
      }
    } catch (error) {
      toast.error('Failed to save mode');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteType = async (id: string) => {
    if (!confirm('Are you sure you want to delete this appointment type?')) return;

    try {
      const res = await fetch(`/api/admin/appointment-config?resource=type&id=${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        toast.success('Type deleted');
        fetchConfig();
      } else {
        toast.error('Failed to delete type');
      }
    } catch (error) {
      toast.error('Failed to delete type');
    }
  };

  const handleDeleteMode = async (id: string) => {
    if (!confirm('Are you sure you want to delete this appointment mode?')) return;

    try {
      const res = await fetch(`/api/admin/appointment-config?resource=mode&id=${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        toast.success('Mode deleted');
        fetchConfig();
      } else {
        toast.error('Failed to delete mode');
      }
    } catch (error) {
      toast.error('Failed to delete mode');
    }
  };

  const openEditType = (type: AppointmentType) => {
    setEditingType(type);
    setTypeForm({
      name: type.name,
      description: type.description || '',
      duration: type.duration,
      color: type.color || '#3B82F6',
      icon: type.icon || 'calendar',
      isActive: type.isActive
    });
    setShowTypeDialog(true);
  };

  const openEditMode = (mode: AppointmentMode) => {
    setEditingMode(mode);
    setModeForm({
      name: mode.name,
      description: mode.description || '',
      icon: mode.icon || 'video',
      requiresMeetingLink: mode.requiresMeetingLink,
      requiresLocation: mode.requiresLocation,
      isActive: mode.isActive
    });
    setShowModeDialog(true);
  };

  const resetTypeForm = () => {
    setTypeForm({
      name: '',
      description: '',
      duration: 60,
      color: '#3B82F6',
      icon: 'calendar',
      isActive: true
    });
  };

  const resetModeForm = () => {
    setModeForm({
      name: '',
      description: '',
      icon: 'video',
      requiresMeetingLink: false,
      requiresLocation: false,
      isActive: true
    });
  };

  const getIconComponent = (iconName: string) => {
    const option = ICON_OPTIONS.find(o => o.value === iconName);
    return option ? option.icon : Calendar;
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
            <h1 className="text-2xl font-bold text-gray-900">Appointment Configuration</h1>
            <p className="text-gray-600">Manage appointment types and modes</p>
          </div>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-500" />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="types">Appointment Types</TabsTrigger>
            <TabsTrigger value="modes">Appointment Modes</TabsTrigger>
          </TabsList>

          {/* Appointment Types Tab */}
          <TabsContent value="types">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Appointment Types</CardTitle>
                  <CardDescription>Configure types like Consultation, Follow-up, Initial Assessment, etc.</CardDescription>
                </div>
                <Button onClick={() => { resetTypeForm(); setEditingType(null); setShowTypeDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Type
                </Button>
              </CardHeader>
              <CardContent>
                {types.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>No appointment types configured yet</p>
                    <p className="text-sm">Add your first appointment type to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {types.map((type) => {
                      const IconComp = getIconComponent(type.icon || 'calendar');
                      return (
                        <div
                          key={type._id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: type.color || '#3B82F6' }}
                            >
                              <IconComp className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{type.name}</span>
                                {!type.isActive && (
                                  <Badge variant="secondary">Inactive</Badge>
                                )}
                              </div>
                              <p className="text-sm text-gray-500">
                                {type.duration} min • {type.description || 'No description'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" onClick={() => openEditType(type)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDeleteType(type._id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appointment Modes Tab */}
          <TabsContent value="modes">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Appointment Modes</CardTitle>
                  <CardDescription>Configure modes like Online, Offline, Phone Call, etc.</CardDescription>
                </div>
                <Button onClick={() => { resetModeForm(); setEditingMode(null); setShowModeDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Mode
                </Button>
              </CardHeader>
              <CardContent>
                {modes.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Video className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>No appointment modes configured yet</p>
                    <p className="text-sm">Add your first appointment mode to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {modes.map((mode) => {
                      const IconComp = getIconComponent(mode.icon || 'video');
                      return (
                        <div
                          key={mode._id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                              <IconComp className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{mode.name}</span>
                                {!mode.isActive && (
                                  <Badge variant="secondary">Inactive</Badge>
                                )}
                                {mode.requiresMeetingLink && (
                                  <Badge variant="outline" className="text-xs">Needs Link</Badge>
                                )}
                                {mode.requiresLocation && (
                                  <Badge variant="outline" className="text-xs">Needs Location</Badge>
                                )}
                              </div>
                              <p className="text-sm text-gray-500">
                                {mode.description || 'No description'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" onClick={() => openEditMode(mode)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDeleteMode(mode._id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add/Edit Type Dialog */}
      <Dialog open={showTypeDialog} onOpenChange={setShowTypeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingType ? 'Edit Appointment Type' : 'Add Appointment Type'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                placeholder="e.g., Initial Consultation"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={typeForm.description}
                onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                placeholder="Brief description of this appointment type"
              />
            </div>
            <div className="space-y-2">
              <Label>Default Duration (minutes)</Label>
              <Input
                type="number"
                value={typeForm.duration}
                onChange={(e) => setTypeForm({ ...typeForm, duration: parseInt(e.target.value) || 60 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color.value}
                    className={`w-8 h-8 rounded-full border-2 ${typeForm.color === color.value ? 'border-gray-900' : 'border-transparent'}`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setTypeForm({ ...typeForm, color: color.value })}
                    title={color.label}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex gap-2">
                {ICON_OPTIONS.map((icon) => {
                  const IconComp = icon.icon;
                  return (
                    <button
                      key={icon.value}
                      className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center ${typeForm.icon === icon.value ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}
                      onClick={() => setTypeForm({ ...typeForm, icon: icon.value })}
                      title={icon.label}
                    >
                      <IconComp className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={typeForm.isActive}
                onCheckedChange={(checked) => setTypeForm({ ...typeForm, isActive: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTypeDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveType} disabled={saving}>
              {saving ? 'Saving...' : (editingType ? 'Update' : 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Mode Dialog */}
      <Dialog open={showModeDialog} onOpenChange={setShowModeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMode ? 'Edit Appointment Mode' : 'Add Appointment Mode'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={modeForm.name}
                onChange={(e) => setModeForm({ ...modeForm, name: e.target.value })}
                placeholder="e.g., Video Call"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={modeForm.description}
                onChange={(e) => setModeForm({ ...modeForm, description: e.target.value })}
                placeholder="Brief description of this appointment mode"
              />
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex gap-2">
                {ICON_OPTIONS.map((icon) => {
                  const IconComp = icon.icon;
                  return (
                    <button
                      key={icon.value}
                      className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center ${modeForm.icon === icon.value ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}
                      onClick={() => setModeForm({ ...modeForm, icon: icon.value })}
                      title={icon.label}
                    >
                      <IconComp className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Requires Meeting Link</Label>
              <Switch
                checked={modeForm.requiresMeetingLink}
                onCheckedChange={(checked) => setModeForm({ ...modeForm, requiresMeetingLink: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Requires Location</Label>
              <Switch
                checked={modeForm.requiresLocation}
                onCheckedChange={(checked) => setModeForm({ ...modeForm, requiresLocation: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={modeForm.isActive}
                onCheckedChange={(checked) => setModeForm({ ...modeForm, isActive: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModeDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveMode} disabled={saving}>
              {saving ? 'Saving...' : (editingMode ? 'Update' : 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
