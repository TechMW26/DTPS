'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { 
  ArrowLeft,
  Calendar as CalendarIcon, 
  Clock, 
  User,
  Video,
  Phone,
  MapPin,
  ChevronRight,
  Check,
  Star
} from 'lucide-react';
import { format, addDays, startOfDay } from 'date-fns';
import Link from 'next/link';

interface Dietitian {
  _id: string;
  firstName: string;
  lastName: string;
  specializations?: string[];
  consultationFee?: number;
  avatar?: string;
  bio?: string;
}

export default function MobileBookAppointmentPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: Select Dietitian, 2: Select Date/Time, 3: Confirm
  const [dietitians, setDietitians] = useState<Dietitian[]>([]);
  const [selectedDietitian, setSelectedDietitian] = useState<Dietitian | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [appointmentType, setAppointmentType] = useState('video');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
      return;
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session) {
      fetchDietitians();
    }
  }, [session]);

  const fetchDietitians = async () => {
    try {
      setLoading(true);

      // For clients, fetch their assigned dietitian only
      if (session?.user?.role === 'client') {
        const userResponse = await fetch(`/api/users/${session.user.id}`);
        if (userResponse.ok) {
          const userData = await userResponse.json();

          // Check if assignedDietitian exists (could be ID or populated object)
          const assignedDietitianId = typeof userData.user?.assignedDietitian === 'string'
            ? userData.user.assignedDietitian
            : userData.user?.assignedDietitian?._id;

          if (assignedDietitianId) {
            // Fetch the assigned dietitian's details
            const dietitianResponse = await fetch(`/api/users/${assignedDietitianId}`);
            if (dietitianResponse.ok) {
              const dietitianData = await dietitianResponse.json();

              if (dietitianData.user) {
                setDietitians([dietitianData.user]);
                setSelectedDietitian(dietitianData.user); // Auto-select the assigned dietitian
                setStep(2); // Skip dietitian selection step
              } else {
                console.error('No user in dietitian data');
                setDietitians([]);
              }
            } else {
              console.error('Failed to fetch dietitian:', dietitianResponse.status);
              setDietitians([]);
            }
          } else {
            setDietitians([]);
          }
        } else {
          console.error('Failed to fetch user:', userResponse.status);
          setDietitians([]);
        }
      } else {
        // For non-clients (admins, etc.), show all dietitians
        const response = await fetch('/api/users/dietitians');
        if (response.ok) {
          const data = await response.json();
          setDietitians(data.dietitians || []);
        }
      }
    } catch (error) {
      console.error('Error fetching dietitians:', error);
      setDietitians([]);
    } finally {
      setLoading(false);
    }
  };

  const handleBookAppointment = async () => {
    if (!selectedDietitian || !selectedDate || !selectedTime) {
      alert('Please select all required fields');
      return;
    }

    if (!session?.user?.id) {
      alert('Please login to book appointment');
      return;
    }

    try {
      setBooking(true);
      const scheduledAt = new Date(selectedDate);
      const [hours, minutes] = selectedTime.split(':');
      scheduledAt.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dietitianId: selectedDietitian._id,
          clientId: session.user.id,
          scheduledAt: scheduledAt.toISOString(),
          duration: 30,
          type: appointmentType,
          notes: notes
        })
      });

      if (response.ok) {
        const data = await response.json();
        alert('Appointment booked successfully!');
        router.push('/appointments');
      } else {
        const errorData = await response.json();
        console.error('Appointment booking error:', errorData);
        alert(errorData.error || 'Failed to book appointment');
      }
    } catch (error) {
      console.error('Error booking appointment:', error);
      alert('Network error. Please check your connection and try again.');
    } finally {
      setBooking(false);
    }
  };

  // Generate time slots
  const timeSlots = [
    '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
    '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
    '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM'
  ];

  // Generate next 14 days
  const dates = Array.from({ length: 14 }, (_, i) => addDays(startOfDay(new Date()), i));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-purple-50 via-pink-50 to-blue-50">
        <LoadingSpinner className="h-12 w-12 text-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-50 via-pink-50 to-blue-50 pb-6">
      {/* Header */}
      <div className="bg-linear-to-r from-purple-600 via-pink-600 to-blue-600 text-white px-4 pt-safe-top pb-6">
        <div className="flex items-center gap-3 py-4">
          <button onClick={() => step === 1 ? router.back() : setStep(step - 1)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Book Appointment</h1>
            <p className="text-sm text-white/80 mt-1">
              {step === 1 && 'Select your dietitian'}
              {step === 2 && 'Choose date & time'}
              {step === 3 && 'Confirm booking'}
            </p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mt-4">
          <div className={`flex-1 h-2 rounded-full ${step >= 1 ? 'bg-white' : 'bg-white/30'}`} />
          <div className={`flex-1 h-2 rounded-full ${step >= 2 ? 'bg-white' : 'bg-white/30'}`} />
          <div className={`flex-1 h-2 rounded-full ${step >= 3 ? 'bg-white' : 'bg-white/30'}`} />
        </div>
      </div>

      {/* Step 1: Select Dietitian */}
      {step === 1 && (
        <div className="px-4 py-6 space-y-4">
          {dietitians.length === 0 ? (
            <div className="text-center py-12">
              <User className="h-20 w-20 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No dietitians available</h3>
              <p className="text-gray-500 text-sm">Please check back later</p>
            </div>
          ) : (
            dietitians.map((dietitian) => (
              <button
                key={dietitian._id}
                onClick={() => {
                  setSelectedDietitian(dietitian);
                  setStep(2);
                }}
                className="w-full bg-white rounded-2xl shadow-sm p-4 active:scale-98 transition-transform text-left"
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="h-16 w-16 rounded-full bg-linear-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white font-bold text-xl shrink-0">
                    {dietitian.avatar ? (
                      <img
                        src={dietitian.avatar}
                        alt={dietitian.firstName}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      <User className="h-8 w-8" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900 text-lg">
                        Dt. {dietitian.firstName} {dietitian.lastName}
                      </h3>
                      <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
                    </div>

                    {dietitian.specializations && dietitian.specializations.length > 0 && (
                      <p className="text-sm text-gray-600 mb-2">
                        {dietitian.specializations.slice(0, 2).join(', ')}
                      </p>
                    )}

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 text-yellow-500">
                        <Star className="h-4 w-4 fill-current" />
                        <span className="text-sm font-medium">4.8</span>
                      </div>
                      {dietitian.consultationFee && (
                        <span className="text-sm font-medium text-purple-600">
                          ₹{dietitian.consultationFee}/session
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Step 2: Select Date & Time */}
      {step === 2 && selectedDietitian && (
        <div className="px-4 py-6 space-y-6">
          {/* Selected Dietitian */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-linear-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white font-bold shrink-0">
                {selectedDietitian.avatar ? (
                  <img src={selectedDietitian.avatar} alt={selectedDietitian.firstName} className="h-full w-full rounded-full object-cover" />
                ) : (
                  <User className="h-6 w-6" />
                )}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">
                  Dt. {selectedDietitian.firstName} {selectedDietitian.lastName}
                </h3>
                <p className="text-sm text-gray-500">Selected Dietitian</p>
              </div>
            </div>
          </div>

          {/* Appointment Type */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Appointment Type</h3>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setAppointmentType('video')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  appointmentType === 'video'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <Video className={`h-6 w-6 mx-auto mb-2 ${appointmentType === 'video' ? 'text-purple-600' : 'text-gray-400'}`} />
                <p className={`text-sm font-medium ${appointmentType === 'video' ? 'text-purple-600' : 'text-gray-600'}`}>Video</p>
              </button>
              <button
                onClick={() => setAppointmentType('phone')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  appointmentType === 'phone'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <Phone className={`h-6 w-6 mx-auto mb-2 ${appointmentType === 'phone' ? 'text-blue-600' : 'text-gray-400'}`} />
                <p className={`text-sm font-medium ${appointmentType === 'phone' ? 'text-blue-600' : 'text-gray-600'}`}>Phone</p>
              </button>
              <button
                onClick={() => setAppointmentType('in-person')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  appointmentType === 'in-person'
                    ? 'border-pink-500 bg-pink-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <MapPin className={`h-6 w-6 mx-auto mb-2 ${appointmentType === 'in-person' ? 'text-pink-600' : 'text-gray-400'}`} />
                <p className={`text-sm font-medium ${appointmentType === 'in-person' ? 'text-pink-600' : 'text-gray-600'}`}>In-Person</p>
              </button>
            </div>
          </div>

          {/* Select Date */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Select Date</h3>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
              {dates.map((date) => {
                const isSelected = format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
                return (
                  <button
                    key={date.toISOString()}
                    onClick={() => setSelectedDate(date)}
                    className={`shrink-0 w-16 p-3 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <p className={`text-xs font-medium mb-1 ${isSelected ? 'text-purple-600' : 'text-gray-500'}`}>
                      {format(date, 'EEE')}
                    </p>
                    <p className={`text-lg font-bold ${isSelected ? 'text-purple-600' : 'text-gray-900'}`}>
                      {format(date, 'd')}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Select Time */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Select Time</h3>
            <div className="grid grid-cols-4 gap-2">
              {timeSlots.map((time) => {
                const isSelected = selectedTime === time;
                return (
                  <button
                    key={time}
                    onClick={() => setSelectedTime(time)}
                    className={`p-3 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-purple-500 bg-purple-50 text-purple-600'
                        : 'border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    <p className="text-sm font-medium">{time}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Continue Button */}
          <button
            onClick={() => setStep(3)}
            disabled={!selectedTime}
            className="w-full py-4 bg-linear-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && selectedDietitian && (
        <div className="px-4 py-6 space-y-6">
          {/* Booking Summary */}
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900 text-lg mb-4">Booking Summary</h3>
            
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
              <div className="h-14 w-14 rounded-full bg-linear-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white font-bold shrink-0">
                {selectedDietitian.avatar ? (
                  <img src={selectedDietitian.avatar} alt={selectedDietitian.firstName} className="h-full w-full rounded-full object-cover" />
                ) : (
                  <User className="h-7 w-7" />
                )}
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">
                  Dt. {selectedDietitian.firstName} {selectedDietitian.lastName}
                </h4>
                <p className="text-sm text-gray-500">Dietitian</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <CalendarIcon className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-medium text-gray-900">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Time</p>
                  <p className="font-medium text-gray-900">{selectedTime}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {appointmentType === 'video' && <Video className="h-5 w-5 text-gray-400" />}
                {appointmentType === 'phone' && <Phone className="h-5 w-5 text-gray-400" />}
                {appointmentType === 'in-person' && <MapPin className="h-5 w-5 text-gray-400" />}
                <div>
                  <p className="text-sm text-gray-500">Type</p>
                  <p className="font-medium text-gray-900 capitalize">{appointmentType}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any specific concerns or topics you'd like to discuss..."
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none resize-none"
              rows={4}
            />
          </div>

          {/* Confirm Button */}
          <button
            onClick={handleBookAppointment}
            disabled={booking}
            className="w-full py-4 bg-linear-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {booking ? (
              <>
                <LoadingSpinner className="h-5 w-5" />
                Booking...
              </>
            ) : (
              <>
                <Check className="h-5 w-5" />
                Confirm Booking
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

