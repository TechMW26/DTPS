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
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  AlertCircle
} from 'lucide-react';
import { format, addDays, isSameDay, isAfter, isBefore } from 'date-fns';
import dynamic from 'next/dynamic';

// Import mobile version for clients
const MobileBookAppointmentPage = dynamic(() => import('./page-mobile'), {
  ssr: false
});

interface Dietitian {
  _id: string;
  firstName: string;
  lastName: string;
  specializations: string[];
  consultationFee: number;
  availability: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

// Desktop version component
function DesktopBookAppointmentPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [dietitians, setDietitians] = useState<Dietitian[]>([]);
  const [selectedDietitian, setSelectedDietitian] = useState<Dietitian | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [appointmentType, setAppointmentType] = useState('consultation');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);

  useEffect(() => {
    fetchDietitians();
  }, []);

  useEffect(() => {
    if (selectedDietitian && selectedDate) {
      generateTimeSlots();
    }
  }, [selectedDietitian, selectedDate]);

  const fetchDietitians = async () => {
    try {
      // For clients, fetch their assigned dietitian only
      if (session?.user?.role === 'client') {
        const userResponse = await fetch(`/api/users/${session.user.id}`);
        if (userResponse.ok) {
          const userData = await userResponse.json();
          if (userData.user?.assignedDietitian) {
            // Fetch the assigned dietitian's details
            const dietitianResponse = await fetch(`/api/users/${userData.user.assignedDietitian}`);
            if (dietitianResponse.ok) {
              const dietitianData = await dietitianResponse.json();
              setDietitians([dietitianData.user]);
              setSelectedDietitian(dietitianData.user); // Auto-select the assigned dietitian
            }
          } else {
            setDietitians([]);
            setError('You do not have an assigned dietitian. Please contact admin.');
          }
        }
      } else {
        // For non-clients (admins, etc.), show all dietitians
        const response = await fetch('/api/users?role=dietitian');
        if (response.ok) {
          const data = await response.json();
          setDietitians(data.users);
        }
      }
    } catch (error) {
      console.error('Error fetching dietitians:', error);
    }
  };

  const generateTimeSlots = () => {
    if (!selectedDietitian || !selectedDate) return;

    const dayOfWeek = selectedDate.getDay();
    const availability = selectedDietitian.availability?.find(
      avail => avail.dayOfWeek === dayOfWeek
    );

    if (!availability) {
      setAvailableSlots([]);
      return;
    }

    const slots: TimeSlot[] = [];
    const startTime = new Date(`2000-01-01T${availability.startTime}`);
    const endTime = new Date(`2000-01-01T${availability.endTime}`);
    
    // Generate 60-minute slots
    const current = new Date(startTime);
    while (current < endTime) {
      const timeString = format(current, 'HH:mm');
      slots.push({
        time: timeString,
        available: true // In a real app, you'd check against existing appointments
      });
      current.setHours(current.getHours() + 1);
    }

    setAvailableSlots(slots);
  };

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedDietitian || !selectedDate || !selectedTime) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const scheduledAt = new Date(selectedDate);
      const [hours, minutes] = selectedTime.split(':');
      scheduledAt.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dietitianId: selectedDietitian._id,
          clientId: session?.user?.id,
          scheduledAt: scheduledAt.toISOString(),
          duration: 60,
          type: appointmentType,
          notes: notes || undefined
        }),
      });

      if (response.ok) {
        router.push('/appointments?success=booked');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to book appointment');
      }
    } catch (error) {
      console.error('Error booking appointment:', error);
      setError('Failed to book appointment');
    } finally {
      setLoading(false);
    }
  };

  const isDateDisabled = (date: Date) => {
    // Disable past dates
    if (isBefore(date, new Date())) return true;
    
    // Disable dates more than 30 days in the future
    if (isAfter(date, addDays(new Date(), 30))) return true;
    
    // If dietitian is selected, check availability
    if (selectedDietitian) {
      const dayOfWeek = date.getDay();
      const hasAvailability = selectedDietitian.availability?.some(
        avail => avail.dayOfWeek === dayOfWeek
      );
      return !hasAvailability;
    }
    
    return false;
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Book Appointment</h1>
          <p className="text-gray-600 mt-1">Schedule a consultation with your dietitian</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Booking Form */}
          <Card>
            <CardHeader>
              <CardTitle>Appointment Details</CardTitle>
              <CardDescription>
                Fill in the details for your appointment. A meeting link will be automatically created for your online session.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBookAppointment} className="space-y-6">
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
                    <strong>Video Meeting:</strong> A secure Google Meet link will be automatically created for your appointment.
                    You'll receive the meeting details once your booking is confirmed.
                  </AlertDescription>
                </Alert>

                {/* Dietitian Selection */}
                <div>
                  <Label htmlFor="dietitian">Select Dietitian</Label>
                  <Select
                    value={selectedDietitian?._id || 'none'}
                    onValueChange={(value) => {
                      if (value === 'none') {
                        setSelectedDietitian(null);
                      } else {
                        const dietitian = dietitians.find(d => d._id === value);
                        setSelectedDietitian(dietitian || null);
                      }
                      setSelectedTime(''); // Reset time when dietitian changes
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose your dietitian" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Choose your dietitian</SelectItem>
                      {dietitians.map((dietitian) => (
                        <SelectItem key={dietitian._id} value={dietitian._id}>
                          <div className="flex items-center justify-between w-full">
                            <span>Dt. {dietitian.firstName} {dietitian.lastName}</span>
                            <span className="text-sm text-gray-500 ml-2">
                              ${dietitian.consultationFee}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {selectedDietitian && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium">
                        Dt. {selectedDietitian.firstName} {selectedDietitian.lastName}
                      </p>
                      {selectedDietitian.specializations && (
                        <p className="text-sm text-gray-600">
                          Specializations: {selectedDietitian.specializations.join(', ')}
                        </p>
                      )}
                      <p className="text-sm text-gray-600">
                        Consultation Fee: ${selectedDietitian.consultationFee}
                      </p>
                    </div>
                  )}
                </div>

                {/* Appointment Type */}
                <div>
                  <Label htmlFor="type">Appointment Type</Label>
                  <Select value={appointmentType} onValueChange={setAppointmentType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="consultation">Initial Consultation</SelectItem>
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                      <SelectItem value="nutrition_review">Nutrition Review</SelectItem>
                      <SelectItem value="meal_planning">Meal Planning Session</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Time Selection */}
                {selectedDietitian && selectedDate && (
                  <div>
                    <Label>Available Time Slots</Label>
                    {availableSlots.length === 0 ? (
                      <p className="text-sm text-gray-500 mt-2">
                        No available slots for this date
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {availableSlots.map((slot) => (
                          <Button
                            key={slot.time}
                            type="button"
                            variant={selectedTime === slot.time ? "default" : "outline"}
                            size="sm"
                            disabled={!slot.available}
                            onClick={() => setSelectedTime(slot.time)}
                          >
                            {slot.time}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                <div>
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any specific topics you'd like to discuss or questions you have..."
                    rows={3}
                  />
                </div>

                {/* Submit Button */}
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loading || !selectedDietitian || !selectedDate || !selectedTime}
                >
                  {loading ? (
                    <>
                      <LoadingSpinner className="mr-2 h-4 w-4" />
                      Booking...
                    </>
                  ) : (
                    'Book Appointment'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Calendar */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CalendarIcon className="h-5 w-5" />
                <span>Select Date</span>
              </CardTitle>
              <CardDescription>
                Choose your preferred appointment date
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={isDateDisabled}
                className="rounded-md border"
              />
              
              {selectedDate && (
                <div className="mt-4 p-3 bg-green-50 rounded-lg">
                  <p className="text-sm font-medium text-green-800">
                    Selected Date: {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                  </p>
                  {selectedTime && (
                    <p className="text-sm text-green-700">
                      Time: {selectedTime}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Main export with role-based routing
export default function BookAppointmentPage() {
  const { data: session } = useSession();
  const isClient = session?.user?.role === 'client';

  // Show mobile UI for clients
  if (isClient) {
    return <MobileBookAppointmentPage />;
  }

  // Show desktop UI for dietitians/admins
  return <DesktopBookAppointmentPage />;
}
