'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Clock,
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Settings,
  Wand2,
  Edit,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface AvailabilitySlot {
  _id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
  isActive: boolean;
}

interface TimeSlotManagementProps {
  providerId?: string;
  isAdmin?: boolean;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

// Generate time options in 30-minute intervals
const generateTimeOptions = () => {
  const times = [];
  for (let h = 6; h <= 22; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour = h.toString().padStart(2, '0');
      const min = m.toString().padStart(2, '0');
      const time24 = `${hour}:${min}`;
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const display = `${hour12}:${min.padStart(2, '0')} ${ampm}`;
      times.push({ value: time24, label: display });
    }
  }
  return times;
};

const TIME_OPTIONS = generateTimeOptions();

// Default timing: 10:00 AM to 6:00 PM for Monday to Saturday (including Saturday)
const DEFAULT_TIMING: Omit<AvailabilitySlot, '_id'>[] = [
  { dayOfWeek: 1, startTime: '10:00', endTime: '18:00', slotDuration: 60, isActive: true }, // Monday
  { dayOfWeek: 2, startTime: '10:00', endTime: '18:00', slotDuration: 60, isActive: true }, // Tuesday
  { dayOfWeek: 3, startTime: '10:00', endTime: '18:00', slotDuration: 60, isActive: true }, // Wednesday
  { dayOfWeek: 4, startTime: '10:00', endTime: '18:00', slotDuration: 60, isActive: true }, // Thursday
  { dayOfWeek: 5, startTime: '10:00', endTime: '18:00', slotDuration: 60, isActive: true }, // Friday
  { dayOfWeek: 6, startTime: '10:00', endTime: '18:00', slotDuration: 60, isActive: true }, // Saturday
];

export default function TimeSlotManagement({ providerId, isAdmin = false }: TimeSlotManagementProps) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [editingSlot, setEditingSlot] = useState<AvailabilitySlot | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDefaultConfirm, setShowDefaultConfirm] = useState(false);
  
  // New slot form state
  const [newSlot, setNewSlot] = useState<Omit<AvailabilitySlot, '_id'>>({
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '17:00',
    slotDuration: 60,
    isActive: true
  });

  const targetProviderId = providerId || session?.user?.id;
  const canEdit = !isAdmin || !providerId; // Admin can only view, not edit other providers' slots

  useEffect(() => {
    if (targetProviderId) {
      fetchAvailability();
    }
  }, [targetProviderId]);

  const fetchAvailability = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/appointments/provider-availability?providerId=${targetProviderId}`);
      if (res.ok) {
        const data = await res.json();
        setSlots(data.availability || []);
      }
    } catch (error) {
      console.error('Error fetching availability:', error);
      toast.error('Failed to load availability');
    } finally {
      setLoading(false);
    }
  };

  const saveAllSlots = async (slotsToSave: Omit<AvailabilitySlot, '_id'>[]) => {
    try {
      setSaving(true);
      const res = await fetch('/api/appointments/provider-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: targetProviderId,
          slots: slotsToSave
        })
      });

      if (res.ok) {
        toast.success('Availability saved successfully');
        await fetchAvailability();
        return true;
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save availability');
        return false;
      }
    } catch (error) {
      console.error('Error saving availability:', error);
      toast.error('Failed to save availability');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefaultTiming = async () => {
    const success = await saveAllSlots(DEFAULT_TIMING);
    if (success) {
      setShowDefaultConfirm(false);
    }
  };

  const handleAddSlot = async () => {
    // Validate times
    if (newSlot.startTime >= newSlot.endTime) {
      toast.error('End time must be after start time');
      return;
    }

    // Check for overlaps with existing slots on same day
    const sameDay = slots.filter(s => s.dayOfWeek === newSlot.dayOfWeek);
    const hasOverlap = sameDay.some(s => {
      return timesOverlap(newSlot.startTime, newSlot.endTime, s.startTime, s.endTime);
    });

    if (hasOverlap) {
      toast.error('This time slot overlaps with an existing slot');
      return;
    }

    // Add to current slots and save
    const updatedSlots = [...slots.map(s => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      slotDuration: s.slotDuration,
      isActive: s.isActive
    })), newSlot];

    const success = await saveAllSlots(updatedSlots);
    if (success) {
      setShowAddDialog(false);
      setNewSlot({
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
        slotDuration: 60,
        isActive: true
      });
    }
  };

  const handleUpdateSlot = async (index: number, updates: Partial<AvailabilitySlot>) => {
    const updatedSlots = slots.map((s, i) => {
      if (i === index) {
        return { ...s, ...updates };
      }
      return s;
    }).map(s => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      slotDuration: s.slotDuration,
      isActive: s.isActive
    }));

    await saveAllSlots(updatedSlots);
  };

  const handleDeleteSlot = async (index: number) => {
    const updatedSlots = slots.filter((_, i) => i !== index).map(s => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      slotDuration: s.slotDuration,
      isActive: s.isActive
    }));

    await saveAllSlots(updatedSlots);
  };

  const handleToggleActive = async (index: number) => {
    const updatedSlots = slots.map((s, i) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      slotDuration: s.slotDuration,
      isActive: i === index ? !s.isActive : s.isActive
    }));

    await saveAllSlots(updatedSlots);
  };

  const timesOverlap = (start1: string, end1: string, start2: string, end2: string): boolean => {
    const toMinutes = (time: string) => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };
    const s1 = toMinutes(start1), e1 = toMinutes(end1);
    const s2 = toMinutes(start2), e2 = toMinutes(end2);
    return s1 < e2 && e1 > s2;
  };

  const formatTime = (time24: string): string => {
    const [h, m] = time24.split(':').map(Number);
    const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const getDayName = (dayOfWeek: number): string => {
    return DAYS_OF_WEEK.find(d => d.value === dayOfWeek)?.label || '';
  };

  // Group slots by day
  const slotsByDay = DAYS_OF_WEEK.map(day => ({
    ...day,
    slots: slots.filter(s => s.dayOfWeek === day.value).sort((a, b) => 
      a.startTime.localeCompare(b.startTime)
    )
  }));

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Quick Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Time Slot Management
              </CardTitle>
              <CardDescription>
                {isAdmin && providerId 
                  ? 'Viewing provider availability (read-only)'
                  : 'Manage your availability for appointments'
                }
              </CardDescription>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowDefaultConfirm(true)}
                  disabled={saving}
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  Set Default Timing
                </Button>
                <Button onClick={() => setShowAddDialog(true)} disabled={saving}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Custom Slot
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Info Banner */}
      {slots.length === 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-800">No Availability Set</h4>
                <p className="text-sm text-amber-700 mt-1">
                  You haven't set any availability yet. Clients won't be able to book appointments with you.
                </p>
                {canEdit && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => setShowDefaultConfirm(true)}>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Set Default (10:00 AM - 6:00 PM, Mon-Sat)
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Custom Slot
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Schedule Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Weekly Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {slotsByDay.map(day => (
              <div key={day.value} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">{day.label}</h4>
                  {day.slots.length === 0 && (
                    <Badge variant="outline" className="text-gray-500">
                      No availability
                    </Badge>
                  )}
                </div>
                
                {day.slots.length > 0 && (
                  <div className="space-y-2">
                    {day.slots.map((slot, idx) => {
                      const slotIndex = slots.findIndex(s => 
                        s.dayOfWeek === slot.dayOfWeek && 
                        s.startTime === slot.startTime
                      );
                      
                      return (
                        <div 
                          key={idx}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            slot.isActive 
                              ? 'bg-green-50 border border-green-200' 
                              : 'bg-gray-100 border border-gray-200'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-2 h-2 rounded-full ${
                              slot.isActive ? 'bg-green-500' : 'bg-gray-400'
                            }`} />
                            <div>
                              <span className="font-medium">
                                {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                              </span>
                              <span className="text-sm text-gray-500 ml-2">
                                ({slot.slotDuration} min slots)
                              </span>
                            </div>
                            {!slot.isActive && (
                              <Badge variant="secondary">Disabled</Badge>
                            )}
                          </div>
                          
                          {canEdit && (
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={slot.isActive}
                                onCheckedChange={() => handleToggleActive(slotIndex)}
                                disabled={saving}
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteSlot(slotIndex)}
                                disabled={saving}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>{slots.filter(s => s.isActive).length} active time slots</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span>
                  {slotsByDay.filter(d => d.slots.some(s => s.isActive)).length} days with availability
                </span>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchAvailability}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Set Default Timing Confirmation Dialog */}
      <Dialog open={showDefaultConfirm} onOpenChange={setShowDefaultConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Default Timing</DialogTitle>
            <DialogDescription>
              This will replace your current availability with the default schedule:
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-800 mb-2">Default Schedule</h4>
              <ul className="space-y-1 text-sm text-blue-700">
                <li>• Monday - Saturday</li>
                <li>• 10:00 AM to 6:00 PM</li>
                <li>• 60-minute appointment slots</li>
              </ul>
            </div>
            {slots.length > 0 && (
              <p className="mt-4 text-sm text-amber-600">
                ⚠️ This will replace your {slots.length} existing time slot(s).
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDefaultConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSetDefaultTiming} disabled={saving}>
              {saving ? 'Saving...' : 'Apply Default Timing'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Custom Slot Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Time Slot</DialogTitle>
            <DialogDescription>
              Create a custom availability slot for a specific day.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Day of Week</Label>
              <Select
                value={String(newSlot.dayOfWeek)}
                onValueChange={(val) => setNewSlot({ ...newSlot, dayOfWeek: parseInt(val) })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map(day => (
                    <SelectItem key={day.value} value={String(day.value)}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Time</Label>
                <Select
                  value={newSlot.startTime}
                  onValueChange={(val) => setNewSlot({ ...newSlot, startTime: val })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map(time => (
                      <SelectItem key={time.value} value={time.value}>
                        {time.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>End Time</Label>
                <Select
                  value={newSlot.endTime}
                  onValueChange={(val) => setNewSlot({ ...newSlot, endTime: val })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map(time => (
                      <SelectItem key={time.value} value={time.value}>
                        {time.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Slot Duration (minutes)</Label>
              <Select
                value={String(newSlot.slotDuration)}
                onValueChange={(val) => setNewSlot({ ...newSlot, slotDuration: parseInt(val) })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                  <SelectItem value="90">90 minutes</SelectItem>
                  <SelectItem value="120">120 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={newSlot.isActive}
                onCheckedChange={(checked) => setNewSlot({ ...newSlot, isActive: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSlot} disabled={saving}>
              {saving ? 'Adding...' : 'Add Slot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
