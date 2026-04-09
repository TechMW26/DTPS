'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useRealtime } from '@/hooks/useRealtime';
import { 
  CalendarPlus, 
  User, 
  Clock, 
  Video, 
  Phone, 
  MapPin,
  ArrowLeft,
  ArrowRight,
  Check,
  Search,
  Calendar as CalendarIcon,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Client {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  phone?: string;
}

interface Provider {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  role: string;
}

interface AppointmentType {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  duration: number;
  color?: string;
  icon?: string;
}

interface AppointmentMode {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  requiresMeetingLink: boolean;
  requiresLocation: boolean;
}

interface TimeSlot {
  time: string;
  endTime?: string;
  available: boolean;
  isBooked?: boolean;
}

const STEPS = [
  { id: 1, name: 'Select Client', icon: User },
  { id: 2, name: 'Appointment Type', icon: CalendarIcon },
  { id: 3, name: 'Date & Time', icon: Clock },
  { id: 4, name: 'Appointment Mode', icon: Video },
  { id: 5, name: 'Confirm', icon: Check },
];

export default function UnifiedAppointmentBookingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);

  // Data states
  const [clients, setClients] = useState<Client[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [appointmentModes, setAppointmentModes] = useState<AppointmentMode[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [lunchBreakInfo, setLunchBreakInfo] = useState<{ start: string; end: string; message?: string } | null>(null);

  // Selection states
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [selectedType, setSelectedType] = useState<AppointmentType | null>(null);
  const [selectedMode, setSelectedMode] = useState<AppointmentMode | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');

  // Search state
  const [clientSearch, setClientSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = session?.user?.role === 'admin';
  const isDietitian = session?.user?.role === 'dietitian';
  const isHealthCounselor = session?.user?.role === 'health_counselor';

  // Real-time updates via SSE
  const { isConnected } = useRealtime({
    onMessage: (event) => {
      // Refresh slots when appointment is booked/cancelled/rescheduled
      if (
        event.type === 'appointment_booked' || 
        event.type === 'appointment_cancelled' ||
        event.type === 'appointment_rescheduled'
      ) {
        // Only refresh if we're on the date/time step and have selected a date
        if (step === 3 && selectedDate) {
          fetchAvailableSlots();
          toast.info(
            event.type === 'appointment_booked' 
              ? '🔔 A slot was just booked - refreshing availability' 
              : event.type === 'appointment_cancelled'
              ? '🔔 A slot was just freed - refreshing availability'
              : '🔔 An appointment was rescheduled - refreshing availability'
          );
        }
      }
    }
  });

  // Fetch available slots function - memoized with useCallback
  const fetchAvailableSlots = useCallback(async () => {
    const providerId = isAdmin ? selectedProvider?._id : session?.user?.id;
    if (!providerId || !selectedDate) return;

    try {
      setLoadingSlots(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      // Build URL with appointmentTypeId if selected (for duration-based slots)
      let url = `/api/appointments/available-slots?providerId=${providerId}&date=${dateStr}`;
      if (selectedType?._id) {
        url += `&appointmentTypeId=${selectedType._id}`;
      }
      
      const res = await fetch(url);
      
      if (res.ok) {
        const data = await res.json();
        
        // Map slots to include booked status
        const mappedSlots: TimeSlot[] = (data.slots || []).map((slot: any) => ({
          time: slot.time,
          endTime: slot.endTime,
          available: slot.available,
          isBooked: !slot.available
        }));
        
        setTimeSlots(mappedSlots);
        setLunchBreakInfo(data.lunchBreak || null);
        
        // Clear selected time if it's no longer available
        if (selectedTime) {
          const stillAvailable = mappedSlots.find(s => s.time === selectedTime && s.available);
          if (!stillAvailable) {
            setSelectedTime('');
            toast.warning('Your selected time slot is no longer available');
          }
        }
      }
    } catch (error) {
      console.error('Error fetching slots:', error);
      toast.error('Failed to load time slots');
    } finally {
      setLoadingSlots(false);
    }
  }, [isAdmin, selectedProvider?._id, session?.user?.id, selectedDate, selectedType?._id, selectedTime]);

  useEffect(() => {
    if (session?.user) {
      fetchInitialData();
    }
  }, [session]);

  // Fetch slots when date or type changes
  useEffect(() => {
    if (selectedDate && (selectedProvider || (!isAdmin && session?.user?.id))) {
      fetchAvailableSlots();
    }
  }, [selectedDate, selectedProvider, selectedType, fetchAvailableSlots]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
      // Fetch appointment types and modes
      const configRes = await fetch('/api/admin/appointment-config?activeOnly=true');
      if (configRes.ok) {
        const configData = await configRes.json();
        setAppointmentTypes(configData.types || []);
        setAppointmentModes(configData.modes || []);
      }

      // Fetch clients (assigned to current user for dietitian/HC, all for admin)
      await fetchClients();

      // For admin, also fetch providers
      if (isAdmin) {
        const [dietRes, hcRes] = await Promise.all([
          fetch('/api/users/dietitians'),
          fetch('/api/users/health-counselors')
        ]);
        
        const allProviders: Provider[] = [];
        const seenIds = new Set<string>();
        
        if (dietRes.ok) {
          const dietData = await dietRes.json();
          (dietData.dietitians || []).forEach((d: any) => {
            if (!seenIds.has(d._id)) {
              seenIds.add(d._id);
              allProviders.push({ ...d, role: 'Dietitian' });
            }
          });
        }
        if (hcRes.ok) {
          const hcData = await hcRes.json();
          (hcData.healthCounselors || []).forEach((h: any) => {
            if (!seenIds.has(h._id)) {
              seenIds.add(h._id);
              allProviders.push({ ...h, role: 'Health Counselor' });
            }
          });
        }
        setProviders(allProviders);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async (search = '') => {
    try {
      let url = '/api/users/clients?limit=100';
      if (search) url += `&search=${encodeURIComponent(search)}`;
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const handleSubmit = async () => {
    if (!selectedClient || !selectedType || !selectedMode || !selectedDate || !selectedTime) {
      toast.error('Please complete all required fields');
      return;
    }

    setSubmitting(true);
    try {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(hours, minutes, 0, 0);

      const providerId = isAdmin ? selectedProvider?._id : session?.user?.id;

      const payload = {
        dietitianId: providerId,
        clientId: selectedClient._id,
        scheduledAt: scheduledAt.toISOString(),
        duration: selectedType.duration,
        type: selectedType.slug || 'consultation',
        appointmentTypeId: selectedType._id,
        appointmentModeId: selectedMode._id,
        modeName: selectedMode.name,
        notes,
        location: selectedMode.requiresLocation ? location : undefined
      };

      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success('Appointment created successfully!');
        // Redirect based on role
        if (isHealthCounselor) {
          router.push('/health-counselor/appointments');
        } else {
          router.push('/appointments');
        }
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to create appointment');
      }
    } catch (error) {
      console.error('Error creating appointment:', error);
      toast.error('Failed to create appointment');
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return !!selectedClient && (isAdmin ? !!selectedProvider : true);
      case 2: return !!selectedType;
      case 3: return !!selectedDate && !!selectedTime;
      case 4: return !!selectedMode && (!selectedMode.requiresLocation || location.trim());
      case 5: return true;
      default: return false;
    }
  };

  const nextStep = () => {
    if (canProceed() && step < 5) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
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

  // Check if types and modes are configured
  if (appointmentTypes.length === 0 || appointmentModes.length === 0) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="py-12 text-center">
              <CalendarPlus className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium mb-2">Appointment Configuration Needed</h3>
              <p className="text-gray-500 mb-4">
                Appointment types and modes need to be configured by an administrator before booking.
              </p>
              {isAdmin && (
                <Button onClick={() => router.push('/admin/appointment-config')}>
                  Configure Appointments
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Book Appointment</h1>
          <p className="text-gray-600">Schedule an appointment with your client</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {STEPS.map((s, idx) => {
              const StepIcon = s.icon;
              const isActive = step === s.id;
              const isCompleted = step > s.id;
              return (
                <div key={s.id} className="flex items-center">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                    isActive ? 'bg-blue-600 text-white' : 
                    isCompleted ? 'bg-green-500 text-white' : 
                    'bg-gray-200 text-gray-500'
                  }`}>
                    {isCompleted ? <Check className="h-5 w-5" /> : <StepIcon className="h-5 w-5" />}
                  </div>
                  <span className={`ml-2 text-sm font-medium hidden sm:block ${
                    isActive ? 'text-blue-600' : 'text-gray-500'
                  }`}>{s.name}</span>
                  {idx < STEPS.length - 1 && (
                    <div className={`w-8 sm:w-16 h-1 mx-2 ${
                      isCompleted ? 'bg-green-500' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className="p-6">
            {/* Step 1: Select Client (and Provider for Admin) */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-4">Select Client</h3>
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search clients..."
                      value={clientSearch}
                      onChange={(e) => {
                        setClientSearch(e.target.value);
                        fetchClients(e.target.value);
                      }}
                      className="pl-10"
                    />
                  </div>
                  <div className="grid gap-2 max-h-64 overflow-y-auto">
                    {clients.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">No clients found</p>
                    ) : (
                      clients.map((client) => (
                        <div
                          key={client._id}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedClient?._id === client._id 
                              ? 'border-blue-500 bg-blue-50' 
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => setSelectedClient(client)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                              {client.avatar ? (
                                <img src={client.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                              ) : (
                                <User className="h-5 w-5 text-gray-500" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">{client.firstName} {client.lastName}</p>
                              <p className="text-sm text-gray-500">{client.email}</p>
                            </div>
                            {selectedClient?._id === client._id && (
                              <Check className="ml-auto h-5 w-5 text-blue-600" />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Provider selection for Admin */}
                {isAdmin && (
                  <div>
                    <h3 className="text-lg font-medium mb-4">Select Provider</h3>
                    <div className="grid gap-2 max-h-48 overflow-y-auto">
                      {providers.map((provider, index) => (
                        <div
                          key={`${provider._id}-${provider.role}-${index}`}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedProvider?._id === provider._id 
                              ? 'border-blue-500 bg-blue-50' 
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => setSelectedProvider(provider)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <User className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium">{provider.firstName} {provider.lastName}</p>
                              <p className="text-sm text-gray-500">{provider.role}</p>
                            </div>
                            {selectedProvider?._id === provider._id && (
                              <Check className="ml-auto h-5 w-5 text-blue-600" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Appointment Type */}
            {step === 2 && (
              <div>
                <h3 className="text-lg font-medium mb-4">Select Appointment Type</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {appointmentTypes.map((type) => (
                    <div
                      key={type._id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedType?._id === type._id 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedType(type)}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-12 h-12 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: type.color || '#3B82F6' }}
                        >
                          <CalendarIcon className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{type.name}</p>
                          <p className="text-sm text-gray-500">{type.duration} min</p>
                          {type.description && (
                            <p className="text-xs text-gray-400 mt-1">{type.description}</p>
                          )}
                        </div>
                        {selectedType?._id === type._id && (
                          <Check className="h-5 w-5 text-blue-600" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Date & Time */}
            {step === 3 && (
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="text-lg font-medium mb-4">Select Date</h3>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => date < new Date()}
                    className="rounded-md border"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium">Select Time</h3>
                    <div className="flex items-center gap-2">
                      {/* Real-time indicator */}
                      {isConnected ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <Wifi className="h-3 w-3" />
                          Live
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <WifiOff className="h-3 w-3" />
                        </span>
                      )}
                      {selectedDate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchAvailableSlots()}
                          disabled={loadingSlots}
                        >
                          <RefreshCw className={`h-4 w-4 ${loadingSlots ? 'animate-spin' : ''}`} />
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* Duration info */}
                  {selectedType && (
                    <div className="mb-4 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                      <p className="text-sm text-blue-700">
                        <Clock className="h-4 w-4 inline mr-1" />
                        {selectedType.duration} minute slots for <strong>{selectedType.name}</strong>
                      </p>
                    </div>
                  )}
                  
                  {/* Lunch break info */}
                  {lunchBreakInfo && (
                    <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
                      <p className="text-xs text-amber-700">
                        <AlertCircle className="h-3 w-3 inline mr-1" />
                        Lunch break: {lunchBreakInfo.start} - {lunchBreakInfo.end} (No appointments)
                      </p>
                    </div>
                  )}
                  
                  {!selectedDate ? (
                    <p className="text-gray-500">Please select a date first</p>
                  ) : loadingSlots ? (
                    <div className="flex items-center justify-center py-8">
                      <LoadingSpinner />
                    </div>
                  ) : timeSlots.length === 0 ? (
                    <div className="text-center py-8 px-4">
                      <Clock className="h-12 w-12 mx-auto mb-3 text-amber-400" />
                      <p className="text-gray-700 font-medium">No available slots for this date</p>
                      <p className="text-sm text-gray-500 mt-1 mb-4">
                        {isAdmin 
                          ? 'The provider has not set availability for this day.'
                          : 'You need to set your availability first.'
                        }
                      </p>
                      {!isAdmin && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => router.push('/appointments?tab=slots')}
                        >
                          Set My Availability
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Legend */}
                      <div className="flex items-center gap-4 text-xs mb-2">
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded bg-green-100 border border-green-300"></span>
                          Available
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded bg-red-100 border border-red-300"></span>
                          Booked
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded bg-blue-500"></span>
                          Selected
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
                        {timeSlots.map((slot) => (
                          <button
                            key={slot.time}
                            disabled={!slot.available}
                            className={`p-2 text-sm border rounded-lg transition-all ${
                              selectedTime === slot.time
                                ? 'border-blue-500 bg-blue-500 text-white font-medium shadow-md'
                                : slot.available
                                ? 'border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-300 text-green-800'
                                : 'border-red-200 bg-red-50 text-red-400 cursor-not-allowed line-through'
                            }`}
                            onClick={() => slot.available && setSelectedTime(slot.time)}
                            title={slot.available ? `Available: ${slot.time} - ${slot.endTime || ''}` : 'Already booked'}
                          >
                            <span className="block">{slot.time}</span>
                            {slot.endTime && (
                              <span className="block text-xs opacity-70">to {slot.endTime}</span>
                            )}
                          </button>
                        ))}
                      </div>
                      
                      {/* Available count */}
                      <p className="text-xs text-gray-500 text-center mt-2">
                        {timeSlots.filter(s => s.available).length} of {timeSlots.length} slots available
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Appointment Mode */}
            {step === 4 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-4">Select Appointment Mode</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {appointmentModes.map((mode) => {
                      const isOnlineMode = mode.requiresMeetingLink || 
                        ['google meet', 'video', 'online'].some(m => 
                          mode.name.toLowerCase().includes(m)
                        );
                      
                      return (
                        <div
                          key={mode._id}
                          className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                            selectedMode?._id === mode._id 
                              ? 'border-blue-500 bg-blue-50' 
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => setSelectedMode(mode)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                              isOnlineMode ? 'bg-blue-100' : 'bg-green-100'
                            }`}>
                              {mode.icon === 'video' && <Video className={`h-6 w-6 ${isOnlineMode ? 'text-blue-600' : 'text-green-600'}`} />}
                              {mode.icon === 'phone' && <Phone className={`h-6 w-6 ${isOnlineMode ? 'text-blue-600' : 'text-green-600'}`} />}
                              {mode.icon === 'map-pin' && <MapPin className="h-6 w-6 text-green-600" />}
                              {!['video', 'phone', 'map-pin'].includes(mode.icon || '') && (
                                <CalendarIcon className={`h-6 w-6 ${isOnlineMode ? 'text-blue-600' : 'text-green-600'}`} />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">{mode.name}</p>
                              {mode.description && (
                                <p className="text-xs text-gray-400 mt-1">{mode.description}</p>
                              )}
                              {isOnlineMode && (
                                <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                                  <Video className="h-3 w-3" />
                                  Meeting link will be generated automatically
                                </p>
                              )}
                            </div>
                            {selectedMode?._id === mode._id && (
                              <Check className="h-5 w-5 text-blue-600" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Meeting link info */}
                  {selectedMode && (selectedMode.requiresMeetingLink || 
                    ['google meet', 'video', 'online'].some(m => 
                      selectedMode.name.toLowerCase().includes(m)
                    )) && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                      <div className="flex items-start gap-3">
                        <Video className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-blue-800">Online Appointment</p>
                          <p className="text-sm text-blue-600 mt-1">
                            {selectedMode.name.toLowerCase().includes('google') || selectedMode.name.toLowerCase().includes('meet')
                              ? 'A Google Meet link will be generated and sent to both you and the client.'
                              : 'A meeting link will be generated and included in the confirmation email.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Location input for offline appointments */}
                {selectedMode?.requiresLocation && (
                  <div>
                    <Label>Location *</Label>
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Enter appointment location"
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Step 5: Confirm */}
            {step === 5 && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Confirm Appointment</h3>
                
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Client:</span>
                    <span className="font-medium">{selectedClient?.firstName} {selectedClient?.lastName}</span>
                  </div>
                  {isAdmin && selectedProvider && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Provider:</span>
                      <span className="font-medium">{selectedProvider.firstName} {selectedProvider.lastName}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Type:</span>
                    <span className="font-medium">{selectedType?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Mode:</span>
                    <span className="font-medium">{selectedMode?.name}</span>
                  </div>
                  {location && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Location:</span>
                      <span className="font-medium">{location}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Date:</span>
                    <span className="font-medium">{selectedDate && format(selectedDate, 'MMMM d, yyyy')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Time:</span>
                    <span className="font-medium">{selectedTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Duration:</span>
                    <span className="font-medium">{selectedType?.duration} minutes</span>
                  </div>
                </div>

                {/* Audit Info - Who is creating this appointment */}
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <p className="text-sm text-blue-700">
                    <strong>Created by:</strong>{' '}
                    {isAdmin ? 'Admin' : isDietitian ? 'Dietitian' : isHealthCounselor ? 'Health Counselor' : 'User'}
                    {session?.user?.name && ` (${session.user.name})`}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    This information will be recorded in the appointment history.
                  </p>
                </div>

                <div>
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any notes for this appointment..."
                    className="mt-1"
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-8 pt-4 border-t">
              <Button
                variant="outline"
                onClick={prevStep}
                disabled={step === 1}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              
              {step < 5 ? (
                <Button
                  onClick={nextStep}
                  disabled={!canProceed()}
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {submitting ? 'Creating...' : 'Create Appointment'}
                  <Check className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
