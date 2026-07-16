'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  Calendar as CalendarIcon,
  User,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertCircle,
  Users,
  Settings,
  Plus,
  Trash2,
  Save
} from 'lucide-react';
import { format, addDays, startOfDay, endOfDay, isSameDay } from 'date-fns';
import { toast } from 'sonner';
import { useRealtime } from '@/hooks/useRealtime';
import { getClientId } from '@/lib/utils';

interface TimeSlot {
  time: string;
  display: string;
  status: 'available' | 'booked' | 'unavailable';
  appointment?: {
    _id: string;
    client: {
      _id: string;
      firstName: string;
      lastName: string;
      avatar?: string;
    };
    type: string;
    duration: number;
    notes?: string;
  };
}

interface DayAvailability {
  day: string;
  startTime: string;
  endTime: string;
}

interface DietitianSlotsViewProps {
  dietitianId?: string; // Optional - if not provided, uses current user (dietitian viewing own slots)
  showBookingButton?: boolean; // Show book button for clients
  onSlotSelect?: (date: Date, time: string) => void; // Callback when slot is selected
  selectedSlot?: { date: Date; time: string } | null; // Currently selected slot
}

export default function DietitianSlotsView({
  dietitianId,
  showBookingButton = false,
  onSlotSelect,
  selectedSlot
}: DietitianSlotsViewProps) {
  const { data: session } = useSession();
  const [selectedDate, setSelectedDate] = useState<Date>(addDays(new Date(), 1));
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Availability editing state
  const [activeTab, setActiveTab] = useState<'slots' | 'settings'>('slots');
  const [editableAvailability, setEditableAvailability] = useState<DayAvailability[]>([]);
  const [savingAvailability, setSavingAvailability] = useState(false);

  // Days and time options for availability editing
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

  // Use SSE for real-time updates
  const { isConnected } = useRealtime({
    onMessage: (event) => {
      // Handle real-time appointment updates
      if (event.type === 'appointment_booked' || event.type === 'appointment_cancelled') {
        // Refresh slots when any appointment is booked or cancelled
        fetchSlots(selectedDate, false);
        toast.info(event.type === 'appointment_booked' 
          ? 'A new appointment was booked' 
          : 'An appointment was cancelled');
      }
    }
  });

  // Determine whose slots to show
  const targetDietitianId = dietitianId || session?.user?.id;
  const isOwnSlots = !dietitianId || dietitianId === session?.user?.id;

  // Fetch availability and slots
  const fetchSlots = useCallback(async (date: Date, showLoader = true) => {
    if (!targetDietitianId) return;

    if (showLoader) setLoading(true);
    else setRefreshing(true);

    try {
      // Fetch available slots from API
      const dateStr = format(date, 'yyyy-MM-dd');
      const response = await fetch(
        `/api/appointments/available-slots?dietitianId=${targetDietitianId}&date=${dateStr}&duration=60`
      );

      if (response.ok) {
        const data = await response.json();
        
        // Convert available slots to TimeSlot format
        const availableSlotTimes = new Set(data.availableSlots || []);
        
        // Also fetch appointments for this day to show booked slots
        const appointmentsResponse = await fetch(
          `/api/appointments?dietitianId=${targetDietitianId}&date=${dateStr}`
        );
        
        let dayAppointments: any[] = [];
        if (appointmentsResponse.ok) {
          const appointmentsData = await appointmentsResponse.json();
          dayAppointments = appointmentsData.appointments || [];
          setAppointments(dayAppointments);
        }

        // Build time slots from dietitian's availability
        const dayOfWeek = date.getDay();
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[dayOfWeek];

        // Fetch dietitian's availability schedule
        const userResponse = await fetch(`/api/users/${targetDietitianId}`);
        let dietitianAvailability: DayAvailability[] = [];
        
        if (userResponse.ok) {
          const userData = await userResponse.json();
          dietitianAvailability = userData.user?.availability || userData.availability || [];
          setAvailability(dietitianAvailability);
        }

        // Find ALL schedules for this day (can have multiple like morning + afternoon)
        const daySchedules = dietitianAvailability.filter((avail: any) => avail.day === dayName);
        
        if (!daySchedules || daySchedules.length === 0) {
          setSlots([]);
          return;
        }

        // Generate slots for all day schedules
        const generatedSlots: TimeSlot[] = [];
        
        for (const daySchedule of daySchedules) {
          const [startHour, startMin] = daySchedule.startTime.split(':').map(Number);
          const [endHour, endMin] = daySchedule.endTime.split(':').map(Number);
          
          let currentHour = startHour;
          let currentMin = startMin;

          while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
            const time24 = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;
            const hour12 = currentHour > 12 ? currentHour - 12 : currentHour === 0 ? 12 : currentHour;
            const ampm = currentHour >= 12 ? 'PM' : 'AM';
            const display = `${hour12}:${currentMin.toString().padStart(2, '0')} ${ampm}`;

            // Check if this slot is booked
            const bookedAppointment = dayAppointments.find((apt: any) => {
              const aptTime = new Date(apt.scheduledAt);
              const aptHour = aptTime.getHours();
              const aptMin = aptTime.getMinutes();
              return aptHour === currentHour && aptMin === currentMin;
            });

            // Check if slot time has passed (for today)
            const now = new Date();
            const slotDateTime = new Date(date);
            slotDateTime.setHours(currentHour, currentMin, 0, 0);
            const isPastTime = slotDateTime <= now;

            // Determine slot status:
            // - booked: has an appointment
            // - unavailable: time has passed (only for today/past dates)
            // - available: within availability range and not booked
            let slotStatus: 'available' | 'booked' | 'unavailable' = 'available';
            if (bookedAppointment) {
              slotStatus = 'booked';
            } else if (isPastTime) {
              slotStatus = 'unavailable';
            }

            // Only add if not already in the list
            if (!generatedSlots.some(s => s.time === time24)) {
              generatedSlots.push({
                time: time24,
                display,
                status: slotStatus,
                appointment: bookedAppointment ? {
                  _id: bookedAppointment._id,
                  client: bookedAppointment.client,
                  type: bookedAppointment.type,
                  duration: bookedAppointment.duration,
                  notes: bookedAppointment.notes
                } : undefined
              });
            }

            // Move to next 30-minute slot
            currentMin += 30;
            if (currentMin >= 60) {
              currentHour += 1;
              currentMin = 0;
            }
          }
        }

        // Sort slots by time
        generatedSlots.sort((a, b) => a.time.localeCompare(b.time));
        setSlots(generatedSlots);
      }
    } catch (error) {
      console.error('Error fetching slots:', error);
      toast.error('Failed to load slots');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [targetDietitianId]);

  // Fetch slots when date changes
  useEffect(() => {
    if (selectedDate && targetDietitianId) {
      fetchSlots(selectedDate);
    }
  }, [selectedDate, targetDietitianId, fetchSlots]);

  // Update editable availability when availability changes
  useEffect(() => {
    if (availability.length > 0) {
      setEditableAvailability(availability);
    }
  }, [availability]);

  // Fetch simple availability for editing
  const fetchEditableAvailability = async () => {
    try {
      const response = await fetch('/api/users/dietitian/availability?format=simple');
      if (response.ok) {
        const data = await response.json();
        setEditableAvailability(data.availability || []);
      }
    } catch (error) {
      console.error('Error fetching availability:', error);
    }
  };

  // Add new availability slot
  const addAvailabilitySlot = () => {
    setEditableAvailability([
      ...editableAvailability, 
      { day: 'monday', startTime: '10:00 AM', endTime: '6:00 PM' }
    ]);
  };

  // Remove availability slot
  const removeAvailabilitySlot = (index: number) => {
    setEditableAvailability(editableAvailability.filter((_, i) => i !== index));
  };

  // Update availability slot
  const updateAvailabilitySlot = (index: number, field: keyof DayAvailability, value: string) => {
    const updated = [...editableAvailability];
    updated[index] = { ...updated[index], [field]: value };
    setEditableAvailability(updated);
  };

  // Save availability
  const saveAvailability = async () => {
    setSavingAvailability(true);
    try {
      const response = await fetch('/api/users/dietitian/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability: editableAvailability }),
      });

      if (response.ok) {
        toast.success('Availability updated successfully!');
        setAvailability(editableAvailability);
        fetchSlots(selectedDate, false); // Refresh slots
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to save availability');
      }
    } catch (error) {
      console.error('Error saving availability:', error);
      toast.error('Failed to save availability');
    } finally {
      setSavingAvailability(false);
    }
  };

  // Setup default availability (Mon-Sat 10AM-6PM)
  const setupDefaultAvailability = async () => {
    setSavingAvailability(true);
    try {
      const response = await fetch('/api/users/dietitian/availability/setup', {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        toast.success('Default availability set! (Mon-Sat, 10AM-6PM)');
        fetchEditableAvailability();
        fetchSlots(selectedDate, false);
      } else {
        toast.error('Failed to setup default availability');
      }
    } catch (error) {
      console.error('Error setting up availability:', error);
      toast.error('Failed to setup default availability');
    } finally {
      setSavingAvailability(false);
    }
  };

  const handleSlotClick = (slot: TimeSlot) => {
    if (slot.status === 'available' && onSlotSelect) {
      onSlotSelect(selectedDate, slot.time);
    }
  };

  const isSlotSelected = (slot: TimeSlot) => {
    if (!selectedSlot) return false;
    return isSameDay(selectedSlot.date, selectedDate) && selectedSlot.time === slot.time;
  };

  const getSlotStatusColor = (status: TimeSlot['status']) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200';
      case 'booked':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'unavailable':
        return 'bg-gray-100 text-gray-400 border-gray-200';
    }
  };

  const getSlotStatusIcon = (status: TimeSlot['status']) => {
    switch (status) {
      case 'available':
        return <CheckCircle className="h-3 w-3" />;
      case 'booked':
        return <XCircle className="h-3 w-3" />;
      case 'unavailable':
        return <AlertCircle className="h-3 w-3" />;
    }
  };

  const stats = {
    total: slots.length,
    available: slots.filter(s => s.status === 'available').length,
    booked: slots.filter(s => s.status === 'booked').length
  };

  if (loading && !slots.length) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs for Slots View and Availability Settings */}
      {isOwnSlots && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'slots' | 'settings')}>
          <TabsList className="mb-4">
            <TabsTrigger value="slots" className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              View Slots
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Edit Availability
            </TabsTrigger>
          </TabsList>

          {/* Slots View Tab */}
          <TabsContent value="slots" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Calendar */}
              <Card className="lg:col-span-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Select Date
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    disabled={(date) => date < startOfDay(new Date())}
                    className="rounded-md border"
                  />
                </CardContent>
              </Card>

              {/* Slots Grid */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        {format(selectedDate, 'EEEE, MMM d, yyyy')}
                      </CardTitle>
                      <CardDescription className="mt-1 flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded-full bg-green-500"></span>
                          Available: {stats.available}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded-full bg-red-500"></span>
                          Booked: {stats.booked}
                        </span>
                        {isConnected && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                            <span className="w-2 h-2 rounded-full bg-green-500 mr-1 animate-pulse"></span>
                            Live
                          </Badge>
                        )}
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchSlots(selectedDate, false)}
                      disabled={refreshing}
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {slots.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <AlertCircle className="h-10 w-10 mx-auto mb-2 text-gray-400" />
                      <p>No availability set for this day</p>
                      <Button 
                        variant="link" 
                        className="mt-2"
                        onClick={() => setActiveTab('settings')}
                      >
                        Set your availability
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                      {slots.map((slot, index) => (
                        <button
                          key={index}
                          onClick={() => handleSlotClick(slot)}
                          disabled={slot.status !== 'available' || !showBookingButton}
                          className={`
                            relative p-2 rounded-lg border text-sm font-medium transition-all
                            ${getSlotStatusColor(slot.status)}
                            ${slot.status === 'available' && showBookingButton ? 'cursor-pointer' : 'cursor-default'}
                            ${isSlotSelected(slot) ? 'ring-2 ring-primary ring-offset-1' : ''}
                          `}
                          title={slot.status === 'booked' && slot.appointment 
                            ? `Booked by ${slot.appointment.client?.firstName} ${slot.appointment.client?.lastName}`
                            : slot.status === 'available' ? 'Available' : 'Unavailable'
                          }
                        >
                          <div className="flex items-center justify-center gap-1">
                            {getSlotStatusIcon(slot.status)}
                            <span>{slot.display}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Today's Booked Appointments */}
            {appointments.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Appointments for {format(selectedDate, 'MMM d')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y">
                    {appointments.map((apt) => (
                      <div key={apt._id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">
                                {apt.client?.firstName} {apt.client?.lastName}
                              </p>
                              {apt.client?._id && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                  {getClientId(apt.client._id)}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">
                              {format(new Date(apt.scheduledAt), 'h:mm a')} • {apt.duration} min
                            </p>
                          </div>
                        </div>
                        <Badge variant={apt.status === 'scheduled' ? 'default' : 'secondary'}>
                          {apt.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Availability Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Availability Settings
                    </CardTitle>
                    <CardDescription>
                      Set your working hours for each day. Default: Mon-Sat, 10 AM - 6 PM with lunch break.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={setupDefaultAvailability}
                    disabled={savingAvailability}
                  >
                    Reset to Default
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Availability Slots List */}
                {editableAvailability.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
                    <Clock className="h-10 w-10 mx-auto mb-2 text-gray-400" />
                    <p className="text-gray-500 mb-4">No availability slots configured</p>
                    <div className="flex justify-center gap-2">
                      <Button onClick={addAvailabilitySlot} variant="outline">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Slot Manually
                      </Button>
                      <Button onClick={setupDefaultAvailability} disabled={savingAvailability}>
                        Use Default (Mon-Sat 10AM-6PM)
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {editableAvailability.map((slot, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <Select
                          value={slot.day}
                          onValueChange={(value) => updateAvailabilitySlot(index, 'day', value)}
                        >
                          <SelectTrigger className="w-35">
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

                        <Select
                          value={slot.startTime}
                          onValueChange={(value) => updateAvailabilitySlot(index, 'startTime', value)}
                        >
                          <SelectTrigger className="w-25">
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

                        <span className="text-gray-500">to</span>

                        <Select
                          value={slot.endTime}
                          onValueChange={(value) => updateAvailabilitySlot(index, 'endTime', value)}
                        >
                          <SelectTrigger className="w-25">
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

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAvailabilitySlot(index)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}

                    <Button variant="outline" onClick={addAvailabilitySlot} className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Time Slot
                    </Button>
                  </div>
                )}

                {/* Save Button */}
                {editableAvailability.length > 0 && (
                  <div className="flex justify-end pt-4 border-t">
                    <Button onClick={saveAvailability} disabled={savingAvailability}>
                      {savingAvailability ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save Availability
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Tips */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="py-4">
                <h4 className="font-medium text-blue-800 mb-2">💡 Tips for Setting Availability</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Add multiple slots per day for morning and afternoon sessions</li>
                  <li>• Leave a gap (1-2 PM) for lunch break</li>
                  <li>• Saturday availability is included by default</li>
                  <li>• Slots are shown to clients when they book appointments</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Non-own slots view (for clients viewing dietitian's slots) */}
      {!isOwnSlots && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Calendar */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Select Date
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                disabled={(date) => date < startOfDay(new Date())}
                className="rounded-md border"
              />
            </CardContent>
          </Card>

          {/* Slots Grid */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {format(selectedDate, 'EEEE, MMM d, yyyy')}
                  </CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-green-500"></span>
                      Available: {stats.available}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-red-500"></span>
                      Booked: {stats.booked}
                    </span>
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchSlots(selectedDate, false)}
                  disabled={refreshing}
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {slots.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="h-10 w-10 mx-auto mb-2 text-gray-400" />
                  <p>No availability for this day</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {slots.map((slot, index) => (
                    <button
                      key={index}
                      onClick={() => handleSlotClick(slot)}
                      disabled={slot.status !== 'available' || !showBookingButton}
                      className={`
                        relative p-2 rounded-lg border text-sm font-medium transition-all
                        ${getSlotStatusColor(slot.status)}
                        ${slot.status === 'available' && showBookingButton ? 'cursor-pointer' : 'cursor-default'}
                        ${isSlotSelected(slot) ? 'ring-2 ring-primary ring-offset-1' : ''}
                      `}
                      title={slot.status === 'available' ? 'Available' : 'Unavailable'}
                    >
                      <div className="flex items-center justify-center gap-1">
                        {getSlotStatusIcon(slot.status)}
                        <span>{slot.display}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
