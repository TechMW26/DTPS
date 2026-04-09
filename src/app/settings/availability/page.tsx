'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Clock,
  Plus,
  Trash2,
  Save,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface AvailabilitySlot {
  day: string;
  startTime: string;
  endTime: string;
}

const DAYS_OF_WEEK = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' }
];

const TIME_SLOTS = [
  '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM',
  '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM'
];

export default function AvailabilityPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Redirect if not a dietitian
  useEffect(() => {
    if (session && session.user?.role !== 'dietitian') {
      router.push('/dashboard');
    }
  }, [session, router]);

  // Load current availability
  useEffect(() => {
    if (session?.user?.role === 'dietitian') {
      fetchAvailability();
    }
  }, [session]);

  const fetchAvailability = async () => {
    try {
      const response = await fetch('/api/users/dietitian/availability?format=simple');
      if (response.ok) {
        const data = await response.json();
        setAvailability(data.availability || []);
      } else {
        setError('Failed to load availability');
      }
    } catch (error) {
      console.error('Error fetching availability:', error);
      setError('Failed to load availability');
    } finally {
      setLoading(false);
    }
  };

  const addAvailabilitySlot = () => {
    setAvailability([...availability, { day: 'monday', startTime: '10:00 AM', endTime: '6:00 PM' }]);
  };

  const removeAvailabilitySlot = (index: number) => {
    setAvailability(availability.filter((_, i) => i !== index));
  };

  const updateAvailabilitySlot = (index: number, field: keyof AvailabilitySlot, value: string) => {
    const updated = [...availability];
    updated[index] = { ...updated[index], [field]: value };
    setAvailability(updated);
  };

  const saveAvailability = async () => {
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/users/dietitian/availability', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ availability }),
      });

      if (response.ok) {
        toast.success('Availability updated successfully!');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save availability');
        toast.error('Failed to save availability');
      }
    } catch (error) {
      console.error('Error saving availability:', error);
      setError('Failed to save availability');
      toast.error('Failed to save availability');
    } finally {
      setSaving(false);
    }
  };

  const addQuickAvailability = () => {
    // Add common business hours for all weekdays
    const quickSlots: AvailabilitySlot[] = [
      { day: 'monday', startTime: '09:00', endTime: '17:00' },
      { day: 'tuesday', startTime: '09:00', endTime: '17:00' },
      { day: 'wednesday', startTime: '09:00', endTime: '17:00' },
      { day: 'thursday', startTime: '09:00', endTime: '17:00' },
      { day: 'friday', startTime: '09:00', endTime: '17:00' },
    ];
    setAvailability([...availability, ...quickSlots]);
  };

  const setupDefaultAvailability = async () => {
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/users/dietitian/availability/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        toast.success('Default availability setup completed!');
        // Refresh the availability data
        await fetchAvailability();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to setup default availability');
        toast.error('Failed to setup default availability');
      }
    } catch (error) {
      console.error('Error setting up default availability:', error);
      setError('Failed to setup default availability');
      toast.error('Failed to setup default availability');
    } finally {
      setSaving(false);
    }
  };

  if (session?.user?.role !== 'dietitian') {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Only dietitians can manage availability settings.
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

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
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Availability Settings</h1>
          <p className="text-gray-600 mt-1">
            Set your available hours for client appointments. Meeting links will be automatically created for online bookings.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Quick Setup */}
        {availability.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Quick Setup</CardTitle>
              <CardDescription>
                Get started quickly with common availability patterns
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={setupDefaultAvailability}
                disabled={saving}
                className="w-full"
              >
                {saving ? (
                  <>
                    <LoadingSpinner className="mr-2 h-4 w-4" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4 mr-2" />
                    Setup Default Schedule (Mon-Fri, 9 AM - 5 PM)
                  </>
                )}
              </Button>

              <div className="text-center text-sm text-gray-500">or</div>

              <Button onClick={addQuickAvailability} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Slots Manually
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Availability Slots */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Weekly Availability</CardTitle>
                <CardDescription>
                  Define your available time slots for each day of the week
                </CardDescription>
              </div>
              <Button onClick={addAvailabilitySlot} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Slot
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {availability.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No availability slots configured</p>
                <p className="text-sm">Add your first slot to start accepting appointments</p>
              </div>
            ) : (
              <div className="space-y-3">
                {availability.map((slot, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 border rounded-lg">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Day */}
                      <Select
                        value={slot.day}
                        onValueChange={(value) => updateAvailabilitySlot(index, 'day', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAYS_OF_WEEK.map((day) => (
                            <SelectItem key={day.value} value={day.value}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Start Time */}
                      <Select
                        value={slot.startTime}
                        onValueChange={(value) => updateAvailabilitySlot(index, 'startTime', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_SLOTS.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* End Time */}
                      <Select
                        value={slot.endTime}
                        onValueChange={(value) => updateAvailabilitySlot(index, 'endTime', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_SLOTS.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Remove Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAvailabilitySlot(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Save Button */}
            {availability.length > 0 && (
              <div className="flex justify-end pt-4 border-t">
                <Button onClick={saveAvailability} disabled={saving}>
                  {saving ? (
                    <>
                      <LoadingSpinner className="mr-2 h-4 w-4" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Availability
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span>How It Works</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-600">
            <p>• Set your available hours for each day of the week</p>
            <p>• Clients can only book appointments during your available slots</p>
            <p>• Meeting links are automatically created for online appointments</p>
            <p>• You can modify your availability anytime</p>
            <p>• Existing appointments won't be affected by availability changes</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
