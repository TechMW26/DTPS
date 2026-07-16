'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  AlertCircle,
  Search
} from 'lucide-react';
import { format, addDays, isSameDay, isAfter, isBefore } from 'date-fns';

interface Client {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  phone?: string;
  healthGoals?: string[];
  assignedDietitian?: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

const TIME_SLOTS = [
  '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM',
  '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM'
];

function BookClientAppointmentContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [appointmentType, setAppointmentType] = useState('consultation');
  const [duration, setDuration] = useState(60);
  const [notes, setNotes] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [flexibleMode, setFlexibleMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isClientPreSelected, setIsClientPreSelected] = useState(false);

  useEffect(() => {
    if (session?.user?.role === 'dietitian') {
      fetchClients();
    } else {
      router.push('/appointments');
    }
  }, [session, router]);

  useEffect(() => {
    // Filter clients based on search term
    if (searchTerm) {
      const filtered = clients.filter(client =>
        `${client.firstName} ${client.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredClients(filtered);
    } else {
      setFilteredClients(clients);
    }
  }, [searchTerm, clients]);

  useEffect(() => {
    if (selectedDate && session?.user?.id) {
      fetchAvailableSlots();
    }
  }, [selectedDate, session?.user?.id]);

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/users/clients');
      if (response.ok) {
        const data = await response.json();
        const clientsList = data.clients || [];
        setClients(clientsList);
        setFilteredClients(clientsList);

        // Pre-select client from URL parameter
        const clientId = searchParams.get('client');
        if (clientId && clientsList.length > 0) {
          const preSelectedClient = clientsList.find((client: Client) => client._id === clientId);
          if (preSelectedClient) {
            setSelectedClient(preSelectedClient);
            setIsClientPreSelected(true);
          }
        }
      } else {
        setError('Failed to fetch clients');
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      setError('Failed to fetch clients');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableSlots = async () => {
    if (!selectedDate || !session?.user?.id) return;

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const response = await fetch(`/api/appointments/available-slots?dietitianId=${session.user.id}&date=${dateStr}&duration=${duration}`);

      if (response.ok) {
        const data = await response.json();
        setAvailableSlots(data.availableSlots || []);
      }
    } catch (error) {
      console.error('Error fetching available slots:', error);
    }
  };

  const handleBookAppointment = async () => {
    if (!selectedClient || !selectedDate || !selectedTime || !session?.user?.id) {
      setError('Please fill in all required fields');
      return;
    }

    setBooking(true);
    setError('');

    try {
      const appointmentDateTime = new Date(selectedDate);
      const [hours, minutes] = selectedTime.split(':').map(Number);
      appointmentDateTime.setHours(hours, minutes, 0, 0);

      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dietitianId: session.user.id, // Current user (dietitian) is booking for client
          clientId: selectedClient._id,
          type: appointmentType,
          scheduledAt: appointmentDateTime.toISOString(),
          duration,
          notes: notes.trim() || undefined,
        }),
      });

      if (response.ok) {
        router.push('/appointments?tab=upcoming');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to book appointment');
      }
    } catch (error) {
      console.error('Error booking appointment:', error);
      setError('Failed to book appointment');
    } finally {
      setBooking(false);
    }
  };

  const isDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return isBefore(date, today) || isAfter(date, addDays(today, 30));
  };

  if (!session) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Please sign in to book appointments.</p>
        </div>
      </DashboardLayout>
    );
  }

  if (session.user.role !== 'dietitian') {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Only dietitians can access this page.</p>
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
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Book Appointment with Client</h1>
          <p className="text-gray-600">Schedule an appointment with one of your clients</p>
        </div>

        {/* Show client info banner when pre-selected */}
        {isClientPreSelected && selectedClient && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={selectedClient.avatar} />
                  <AvatarFallback>
                    {selectedClient.firstName[0]}{selectedClient.lastName[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-gray-900">
                    Booking appointment for: {selectedClient.firstName} {selectedClient.lastName}
                  </p>
                  <p className="text-sm text-gray-500">
                    {selectedClient.email}
                  </p>
                  {selectedClient.healthGoals && selectedClient.healthGoals.length > 0 && (
                    <p className="text-xs text-gray-400">
                      Goals: {selectedClient.healthGoals.slice(0, 2).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className={`grid grid-cols-1 ${isClientPreSelected ? 'lg:grid-cols-1' : 'lg:grid-cols-2'} gap-6`}>
          {/* Client Selection - Only show when not pre-selected */}
          {!isClientPreSelected && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <User className="h-5 w-5" />
                  <span>Select Client</span>
                </CardTitle>
                <CardDescription>
                  Choose a client to book an appointment with
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search clients..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Client List */}
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {filteredClients.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No clients found</p>
                  ) : (
                    filteredClients.map((client) => (
                      <div
                        key={client._id}
                        onClick={() => setSelectedClient(client)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedClient?._id === client._id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                          }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={client.avatar} />
                            <AvatarFallback>
                              {client.firstName[0]}{client.lastName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900">
                              {client.firstName} {client.lastName}
                            </p>
                            <p className="text-sm text-gray-500 truncate">
                              {client.email}
                            </p>
                            {client.healthGoals && client.healthGoals.length > 0 && (
                              <p className="text-xs text-gray-400">
                                Goals: {client.healthGoals.slice(0, 2).join(', ')}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Appointment Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CalendarIcon className="h-5 w-5" />
                <span>Appointment Details</span>
              </CardTitle>
              <CardDescription>
                Set the date, time, and details for the appointment. A meeting link will be automatically created for online modes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Meeting Info */}
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Video Meeting:</strong> A secure Google Meet link will be automatically created for this appointment.
                  Both you and your client will receive the meeting details.
                </AlertDescription>
              </Alert>

              {/* Flexible Mode Warning */}
              {flexibleMode && (
                <Alert variant="destructive">
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Flexible Mode:</strong> You can book at any time, but please ensure the selected time works for both you and the client.
                    The client will be notified of the appointment time.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="type">Appointment Type</Label>
                <Select value={appointmentType} onValueChange={setAppointmentType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select appointment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="follow-up">Follow-up</SelectItem>
                    <SelectItem value="nutrition-planning">Nutrition Planning</SelectItem>
                    <SelectItem value="progress-review">Progress Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Select value={duration.toString()} onValueChange={(value) => setDuration(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                    <SelectItem value="90">90 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Select Date</Label>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={isDateDisabled}
                  className="rounded-md border"
                />
              </div>

              {/* Flexible Mode Toggle */}
              <div className="flex items-center justify-between">
                <Label>Booking Mode</Label>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Available Slots</span>
                  <Switch
                    checked={flexibleMode}
                    onCheckedChange={setFlexibleMode}
                  />
                  <span className="text-sm text-gray-600">Any Time</span>
                </div>
              </div>

              {selectedDate && (
                <div className="space-y-2">
                  <Label>
                    {flexibleMode ? 'Select Time' : 'Available Time Slots'}
                  </Label>

                  {flexibleMode ? (
                    // Flexible mode - show all time slots
                    <div className="grid grid-cols-3 gap-2">
                      {TIME_SLOTS.map((slot) => (
                        <Button
                          key={slot}
                          variant={selectedTime === slot ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedTime(slot)}
                          className="text-xs"
                        >
                          {slot}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    // Regular mode - show only available slots
                    <div className="grid grid-cols-3 gap-2">
                      {availableSlots.length === 0 ? (
                        <div className="col-span-3 text-center py-4">
                          <p className="text-gray-500 text-sm">
                            No available slots for this date
                          </p>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => setFlexibleMode(true)}
                            className="text-xs mt-2"
                          >
                            Switch to flexible mode to book at any time
                          </Button>
                        </div>
                      ) : (
                        availableSlots.map((slot) => (
                          <Button
                            key={slot}
                            variant={selectedTime === slot ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSelectedTime(slot)}
                            className="text-xs"
                          >
                            {slot}
                          </Button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add any notes for the appointment..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <Button
                onClick={handleBookAppointment}
                disabled={!selectedClient || !selectedDate || !selectedTime || booking}
                className="w-full"
              >
                {booking ? (
                  <>
                    <LoadingSpinner className="mr-2 h-4 w-4" />
                    Booking...
                  </>
                ) : (
                  'Book Appointment'
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function BookClientAppointmentPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
        </div>
      </DashboardLayout>
    }>
      <BookClientAppointmentContent />
    </Suspense>
  );
}
