'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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
import {
  Calendar as CalendarIcon,
  User,
  AlertCircle,
  Search,
  Video
} from 'lucide-react';
import { addDays, isAfter, isBefore } from 'date-fns';
import { toast } from 'sonner';

interface Dietitian {
  _id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  avatar?: string;
  bio?: string;
  experience?: number;
  consultationFee?: number;
  specializations: string[];
  credentials: string[];
}

interface Client {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  phone?: string;
  healthGoals?: string[];
}

const TIME_SLOTS = [
  '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM',
  '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM'
];

export default function FlexibleBookingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  
  // State
  const [dietitians, setDietitians] = useState<Dietitian[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedDietitian, setSelectedDietitian] = useState<Dietitian | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [appointmentType, setAppointmentType] = useState('consultation');
  const [duration, setDuration] = useState(60);
  const [notes, setNotes] = useState('');
  const [searchDietitian, setSearchDietitian] = useState('');
  const [searchClient, setSearchClient] = useState('');
  
  // Loading states
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');

  // Check permissions
  useEffect(() => {
    if (session && session.user?.role !== 'dietitian' && session.user?.role !== 'admin') {
      router.push('/appointments');
    }
  }, [session, router]);

  // Fetch data
  useEffect(() => {
    if (session?.user?.role === 'dietitian' || session?.user?.role === 'admin') {
      if (session?.user?.role === 'admin') {
        fetchDietitians(); // Only admins can select dietitians
      }
      fetchClients();
    }
  }, [session]);

  const fetchDietitians = async () => {
    try {
      const response = await fetch('/api/users/dietitians');
      if (response.ok) {
        const data = await response.json();
        setDietitians(data.dietitians || []);
      } else {
        setError('Failed to load dietitians');
      }
    } catch (error) {
      console.error('Error fetching dietitians:', error);
      setError('Failed to load dietitians');
    }
  };

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/users/clients');
      if (response.ok) {
        const data = await response.json();
        setClients(data.clients || []);
      } else {
        setError('Failed to load clients');
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      setError('Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  const handleBookAppointment = async () => {
    // For admin: require both dietitian and client selection
    // For dietitian: only require client selection (use logged-in user as dietitian)
    const isAdmin = session?.user?.role === 'admin';
    const requiredDietitian = isAdmin ? selectedDietitian : session?.user;

    if (!selectedClient || !selectedDate || !selectedTime || !requiredDietitian) {
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
          dietitianId: isAdmin ? selectedDietitian?._id : session?.user?.id,
          clientId: selectedClient._id,
          type: appointmentType,
          scheduledAt: appointmentDateTime.toISOString(),
          duration,
          notes: notes.trim() || undefined,
        }),
      });

      if (response.ok) {
        const appointment = await response.json();
        toast.success('Appointment booked successfully!');
        router.push(`/appointments/${appointment._id}`);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to book appointment');
        toast.error('Failed to book appointment');
      }
    } catch (error) {
      console.error('Error booking appointment:', error);
      setError('Failed to book appointment');
      toast.error('Failed to book appointment');
    } finally {
      setBooking(false);
    }
  };

  const isDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return isBefore(date, today) || isAfter(date, addDays(today, 90));
  };

  const filteredDietitians = dietitians.filter(dietitian =>
    dietitian.fullName.toLowerCase().includes(searchDietitian.toLowerCase()) ||
    dietitian.email.toLowerCase().includes(searchDietitian.toLowerCase()) ||
    dietitian.specializations.some(spec =>
      spec.toLowerCase().includes(searchDietitian.toLowerCase())
    )
  );

  const filteredClients = clients.filter(client =>
    `${client.firstName} ${client.lastName}`.toLowerCase().includes(searchClient.toLowerCase()) ||
    client.email.toLowerCase().includes(searchClient.toLowerCase())
  );

  if (session?.user?.role !== 'dietitian' && session?.user?.role !== 'admin') {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Only dietitians and administrators can access this page.
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
          <h1 className="text-3xl font-bold text-gray-900">Flexible Appointment Booking</h1>
          <p className="text-gray-600 mt-1">
            Book appointments at any time with any dietitian and client. Meeting links will be automatically created for online modes.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Meeting Info */}
        <Alert>
          <Video className="h-4 w-4" />
          <AlertDescription>
            <strong>Video Meeting:</strong> A secure Google Meet link will be automatically created for this appointment. 
            Both the dietitian and client will receive the meeting details.
          </AlertDescription>
        </Alert>

        {/* User Info */}
        <div className="mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={session?.user?.avatar} />
                  <AvatarFallback>
                    {session?.user?.firstName?.[0]}{session?.user?.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-gray-900">
                    {session?.user?.role === 'admin' ? 'Admin' : 'Booking as'}: {session?.user?.firstName} {session?.user?.lastName}
                  </p>
                  <p className="text-sm text-gray-600">
                    {session?.user?.role === 'admin'
                      ? 'You can book appointments for any dietitian and client'
                      : 'You are scheduling appointments for your clients'
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className={`grid grid-cols-1 ${session?.user?.role === 'admin' ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-6`}>
          {/* Dietitian Selection - Only for Admins */}
          {session?.user?.role === 'admin' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <User className="h-5 w-5" />
                  <span>Select Dietitian</span>
                </CardTitle>
                <CardDescription>
                  Choose the dietitian for this appointment
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search dietitians..."
                    value={searchDietitian}
                    onChange={(e) => setSearchDietitian(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Dietitian List */}
                <div className="space-y-2 max-h-[32rem] overflow-y-auto">
                  {filteredDietitians.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No dietitians found</p>
                  ) : (
                    filteredDietitians.map((dietitian) => (
                      <div
                        key={dietitian._id}
                        onClick={() => setSelectedDietitian(dietitian)}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedDietitian?._id === dietitian._id
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={dietitian.avatar} />
                            <AvatarFallback>
                              {dietitian.firstName[0]}{dietitian.lastName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">
                              {dietitian.fullName}
                            </p>
                            <p className="text-sm text-gray-500 truncate">
                              {dietitian.email}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Client Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="h-5 w-5" />
                <span>Select Client</span>
              </CardTitle>
              <CardDescription>
                Choose the client for this appointment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search clients..."
                  value={searchClient}
                  onChange={(e) => setSearchClient(e.target.value)}
                  className="pl-10"
                />  
              </div>

              {/* Client List */}
              <div className="space-y-2 max-h-[32rem] overflow-y-auto">
                {filteredClients.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No clients found</p>
                ) : (
                  filteredClients.map((client) => (
                    <div
                      key={client._id}
                      onClick={() => setSelectedClient(client)}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedClient?._id === client._id
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={client.avatar} />
                          <AvatarFallback>
                            {client.firstName[0]}{client.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {client.firstName} {client.lastName}
                          </p>
                          <p className="text-sm text-gray-500 truncate">
                            {client.email}
                          </p>
                          {client.healthGoals && client.healthGoals.length > 0 && (
                            <p className="text-xs text-gray-400 truncate">
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

          {/* Appointment Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CalendarIcon className="h-5 w-5" />
                <span>Appointment Details</span>
              </CardTitle>
              <CardDescription>
                Set the date, time, and details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Appointment Type */}
              <div className="space-y-2">
                <Label>Appointment Type</Label>
                <Select value={appointmentType} onValueChange={setAppointmentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="group_session">Group Session</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Select value={duration.toString()} onValueChange={(value) => setDuration(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                    <SelectItem value="90">90 minutes</SelectItem>
                    <SelectItem value="120">120 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label>Date</Label>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={isDateDisabled}
                  className="rounded-md border"
                />
              </div>

              {/* Time */}
              <div className="space-y-2">
                <Label>Time</Label>
                <Select value={selectedTime} onValueChange={setSelectedTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select time" />
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

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  placeholder="Add any notes for the appointment..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Book Button */}
              <Button
                onClick={handleBookAppointment}
                disabled={
                  booking ||
                  !selectedClient ||
                  !selectedDate ||
                  !selectedTime ||
                  (session?.user?.role === 'admin' && !selectedDietitian)
                }
                className="w-full"
              >
                {booking ? (
                  <>
                    <LoadingSpinner className="mr-2 h-4 w-4" />
                    Booking...
                  </>
                ) : (
                  <>
                    <Video className="mr-2 h-4 w-4" />
                    Book Appointment
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
