'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Calendar, 
  Clock, 
  Video, 
  Phone, 
  User, 
  Plus, 
  RefreshCw, 
  ExternalLink,
  MoreVertical,
  Trash2,
  Edit,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';
import { format, formatDistanceToNow, isPast, isFuture } from 'date-fns';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRealtime } from '@/hooks/useRealtime';

interface Appointment {
  _id: string;
  type: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
  scheduledAt: string;
  duration: number;
  notes?: string;
  meetingLink?: string;
  createdBy?: string;
  dietitian?: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
  client?: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
}

interface BookingsSectionProps {
  clientId: string;
  clientName?: string;
  userRole?: 'dietitian' | 'health_counselor' | 'admin';
  dietitianId?: string; // Required for booking - the dietitian to book with
  onRegisterReset?: (fn: () => void) => void;
}

export default function BookingsSection({ clientId, clientName, userRole = 'dietitian', dietitianId, onRegisterReset }: BookingsSectionProps) {
  const { data: session } = useSession();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showQuickBookModal, setShowQuickBookModal] = useState(false);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [bookingType, setBookingType] = useState('consultation');
  const [bookingDuration, setBookingDuration] = useState(30);
  const [bookingNotes, setBookingNotes] = useState('');
  const [isBooking, setIsBooking] = useState(false);

  // Helper to check if user can cancel an appointment
  const canCancelAppointment = (apt: Appointment) => {
    const currentUserId = (session?.user as any)?.id || (session?.user as any)?._id;
    return apt.createdBy === currentUserId; // Both dietitian and HC can only cancel their own
  };

  const fetchAppointments = useCallback(async (silent = false) => {
    if (!clientId) return;
    
    if (!silent) setLoading(true);
    else setRefreshing(true);
    
    try {
      // Include all appointments (past + future) for client panel view
      const response = await fetch(`/api/appointments?clientId=${clientId}&includeAll=true&limit=1000&page=1`);
      if (response.ok) {
        const data = await response.json();
        setAppointments(data.appointments || []);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
      if (!silent) toast.error('Failed to load appointments');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Register reset callback for floating back button
  useEffect(() => {
    if (onRegisterReset) {
      onRegisterReset(() => {
        setShowQuickBookModal(false);
        fetchAppointments();
      });
    }
  }, [onRegisterReset]);

  const handleRealtimeMessage = useCallback(
    (event: { type: string; data: string }) => {
      if (!event?.type) return;
      if (!['appointment_booked', 'appointment_cancelled', 'appointment_updated'].includes(event.type)) return;

      try {
        const data = JSON.parse(event.data);
        const eventClientId =
          data?.clientId ||
          data?.client?._id ||
          data?.client?.id;
        if (eventClientId && String(eventClientId) !== String(clientId)) return;
      } catch {
        // If payload isn't parseable, do a safe refresh.
      }

      fetchAppointments(true);
    },
    [clientId, fetchAppointments]
  );

  useRealtime({ onMessage: handleRealtimeMessage });

  const handleRefresh = () => {
    fetchAppointments(true);
  };

  const handleCancelAppointment = async (appointmentId: string) => {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;
    
    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      });
      
      if (response.ok) {
        toast.success('Appointment cancelled');
        fetchAppointments(true);
      } else {
        toast.error('Failed to cancel appointment');
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      toast.error('Error cancelling appointment');
    }
  };

  const handleCompleteAppointment = async (appointmentId: string) => {
    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' })
      });
      
      if (response.ok) {
        toast.success('Appointment marked as completed');
        fetchAppointments(true);
      } else {
        toast.error('Failed to update appointment');
      }
    } catch (error) {
      console.error('Error updating appointment:', error);
      toast.error('Error updating appointment');
    }
  };

  const handleQuickBook = async () => {
    if (!bookingDate || !bookingTime) {
      toast.error('Please select date and time');
      return;
    }

    // Get dietitian ID - use prop if provided, otherwise use session user id (for dietitians booking themselves)
    const bookingDietitianId = dietitianId || (session?.user as any)?.id;
    
    if (!bookingDietitianId) {
      toast.error('No dietitian assigned to this client');
      return;
    }

    setIsBooking(true);
    try {
      const scheduledAt = new Date(`${bookingDate}T${bookingTime}`);
      
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dietitianId: bookingDietitianId,
          clientId,
          type: bookingType,
          scheduledAt: scheduledAt.toISOString(),
          duration: bookingDuration,
          notes: bookingNotes
        })
      });

      if (response.ok) {
        toast.success('Appointment booked successfully!');
        setShowQuickBookModal(false);
        resetQuickBookForm();
        fetchAppointments(true);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to book appointment');
      }
    } catch (error) {
      console.error('Error booking appointment:', error);
      toast.error('Error booking appointment');
    } finally {
      setIsBooking(false);
    }
  };

  const resetQuickBookForm = () => {
    setBookingDate('');
    setBookingTime('');
    setBookingType('consultation');
    setBookingDuration(30);
    setBookingNotes('');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge className="bg-blue-100 text-blue-800">Scheduled</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      case 'no-show':
        return <Badge className="bg-yellow-100 text-yellow-800">No Show</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="h-4 w-4 text-blue-500" />;
      case 'phone':
        return <Phone className="h-4 w-4 text-green-500" />;
      default:
        return <User className="h-4 w-4 text-gray-500" />;
    }
  };

  const upcomingAppointments = appointments.filter(
    apt => apt.status === 'scheduled' && isFuture(new Date(apt.scheduledAt))
  );

  const pastAppointments = appointments.filter(
    apt => apt.status !== 'scheduled' || isPast(new Date(apt.scheduledAt))
  );

  if (loading) {
    return (
      <div className="mt-6">
        <Card>
          <CardContent className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Appointment Bookings</h2>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            size="sm" 
            onClick={() => setShowQuickBookModal(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Quick Book
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/appointments/book-client?clientId=${clientId}`}>
              <Calendar className="h-4 w-4 mr-2" />
              Advanced Booking
            </Link>
          </Button>
        </div>
      </div>

      {/* Upcoming Appointments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-500" />
            Upcoming Appointments ({upcomingAppointments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingAppointments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No upcoming appointments</p>
              <p className="text-sm mt-2">Schedule an appointment with the client</p>
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingAppointments.map((apt) => (
                <div 
                  key={apt._id} 
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {getTypeIcon(apt.type)}
                      <span className="font-medium capitalize">{apt.type}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="h-4 w-4" />
                      <span>{format(new Date(apt.scheduledAt), 'PPp')}</span>
                      <span className="text-sm">({apt.duration} min)</span>
                    </div>
                    {getStatusBadge(apt.status)}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {apt.meetingLink && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={apt.meetingLink} target="_blank" rel="noopener noreferrer">
                          <Video className="h-4 w-4 mr-2" />
                          Join
                        </a>
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleCompleteAppointment(apt._id)}>
                          <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                          Mark Complete
                        </DropdownMenuItem>
                        {canCancelAppointment(apt) && (
                          <DropdownMenuItem 
                            onClick={() => handleCancelAppointment(apt._id)}
                            className="text-red-600"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Cancel
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Past Appointments */}
      {pastAppointments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-gray-500" />
              Past Appointments ({pastAppointments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pastAppointments.map((apt) => (
                <div 
                  key={apt._id} 
                  className="flex items-center justify-between p-3 bg-gray-50/50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {getTypeIcon(apt.type)}
                      <span className="text-gray-600 capitalize">{apt.type}</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {format(new Date(apt.scheduledAt), 'PP')} at {format(new Date(apt.scheduledAt), 'p')}
                    </div>
                    {getStatusBadge(apt.status)}
                  </div>
                  {apt.notes && (
                    <span className="text-sm text-gray-500 truncate max-w-50">
                      {apt.notes}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Book Modal */}
      <Dialog open={showQuickBookModal} onOpenChange={setShowQuickBookModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Book Appointment</DialogTitle>
            <DialogDescription>
              Schedule an appointment with {clientName || 'this client'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="text"
                  value={bookingTime}
                  onChange={(e) => setBookingTime(e.target.value)}
                  placeholder="e.g., 10:00 AM"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={bookingType} onValueChange={setBookingType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="video">Video Call</SelectItem>
                    <SelectItem value="phone">Phone Call</SelectItem>
                    <SelectItem value="follow-up">Follow Up</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duration (min)</Label>
                <Select 
                  value={bookingDuration.toString()} 
                  onValueChange={(v) => setBookingDuration(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">60 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={bookingNotes}
                onChange={(e) => setBookingNotes(e.target.value)}
                placeholder="Add any notes for this appointment..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickBookModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleQuickBook} disabled={isBooking}>
              {isBooking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Booking...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 mr-2" />
                  Book Appointment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
