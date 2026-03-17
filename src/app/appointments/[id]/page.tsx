'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Calendar,
  Clock,
  User,
  Video,
  MessageCircle,
  ArrowLeft,
  Edit,
  Trash2,
  CreditCard,
  CheckCircle,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { ZoomMeetingCard } from '@/components/appointments/ZoomMeetingCard';
import { IZoomMeetingDetails } from '@/types';
import dynamic from 'next/dynamic';

// Import mobile version for clients
const MobileAppointmentDetailPage = dynamic(() => import('./page-mobile'), {
  ssr: false
});

interface Appointment {
  _id: string;
  type: string;
  status: string;
  scheduledAt: string;
  duration: number;
  notes?: string;
  meetingLink?: string;
  zoomMeeting?: IZoomMeetingDetails;
  dietitian: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    consultationFee?: number;
  };
  client: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
  createdAt: string;
  lifecycleHistory?: Array<{
    action: string;
    performedBy?: { _id: string; firstName?: string; lastName?: string };
    performedByRole?: string;
    timestamp: string;
  }>;
  cancelledBy?: {
    userId?: string;
    role?: string;
    name?: string;
    reason?: string;
    timestamp?: string;
  };
  rescheduledBy?: {
    userId?: string;
    role?: string;
    name?: string;
    previousScheduledAt?: string;
    timestamp?: string;
  };
}

const TIME_SLOTS = [
  '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM',
  '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM'
];

// Desktop version component
function DesktopAppointmentDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const appointmentId = params?.id as string;
  
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    scheduledAt: '',
    time: '',
    duration: 60,
    type: 'consultation',
    notes: ''
  });

  // Helper functions for audit information
  const getCreatedByLabel = (): string | null => {
    if (appointment?.lifecycleHistory && appointment.lifecycleHistory.length > 0) {
      const createdEvent = appointment.lifecycleHistory.find(e => e.action === 'created');
      if (createdEvent) {
        const roleLabel = createdEvent.performedByRole === 'dietitian' ? 'Dietitian' :
                         createdEvent.performedByRole === 'health_counselor' ? 'Health Counselor' :
                         createdEvent.performedByRole === 'admin' ? 'Admin' : 'Client';
        return `Created by ${roleLabel}`;
      }
    }
    return null;
  };

  const getCancelledByLabel = (): string | null => {
    if (appointment?.status === 'cancelled' && appointment?.cancelledBy) {
      const roleLabel = appointment.cancelledBy.role === 'dietitian' ? 'Dietitian' :
                       appointment.cancelledBy.role === 'health_counselor' ? 'Health Counselor' :
                       appointment.cancelledBy.role === 'admin' ? 'Admin' : 'Client';
      return `Cancelled by ${roleLabel}${appointment.cancelledBy.name ? ` (${appointment.cancelledBy.name})` : ''}`;
    }
    return null;
  };

  const getRescheduledByLabel = (): string | null => {
    if (appointment?.rescheduledBy) {
      const roleLabel = appointment.rescheduledBy.role === 'dietitian' ? 'Dietitian' :
                       appointment.rescheduledBy.role === 'health_counselor' ? 'Health Counselor' :
                       appointment.rescheduledBy.role === 'admin' ? 'Admin' : 'Client';
      return `Rescheduled by ${roleLabel}${appointment.rescheduledBy.name ? ` (${appointment.rescheduledBy.name})` : ''}`;
    }
    return null;
  };

  // Get the primary meeting link (prefer Google Meet, fall back to Zoom, then legacy)
  const getMeetingLink = (): string | null => {
    if (appointment?.meetingLink) return appointment.meetingLink;
    if (appointment?.zoomMeeting?.joinUrl) return appointment.zoomMeeting.joinUrl;
    return null;
  };

  const meetingLink = getMeetingLink();

  useEffect(() => {
    if (appointmentId) {
      fetchAppointment();
    }
  }, [appointmentId]);

  const fetchAppointment = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/appointments/${appointmentId}`);
      if (response.ok) {
        const data = await response.json();
        setAppointment(data);
      } else {
        setError('Failed to load appointment');
      }
    } catch (error) {
      console.error('Error fetching appointment:', error);
      setError('Failed to load appointment');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAppointment = async () => {
    if (!appointment) return;
    
    setCancelling(true);
    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setMessage('Appointment cancelled successfully');
        setTimeout(() => {
          router.push('/appointments');
        }, 2000);
      } else {
        setError('Failed to cancel appointment');
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      setError('Failed to cancel appointment');
    } finally {
      setCancelling(false);
    }
  };

  const handleEditAppointment = () => {
    if (!appointment) return;

    // Initialize edit form with current appointment data
    const appointmentDate = new Date(appointment.scheduledAt);
    const timeString = appointmentDate.toTimeString().slice(0, 5); // HH:MM format

    setEditData({
      scheduledAt: appointmentDate.toISOString().split('T')[0], // YYYY-MM-DD format
      time: timeString,
      duration: appointment.duration,
      type: appointment.type,
      notes: appointment.notes || ''
    });

    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!appointment) return;

    setEditing(true);
    setError('');

    try {
      // Parse the date and time
      const appointmentDateTime = new Date(editData.scheduledAt);
      const [hours, minutes] = editData.time.split(':').map(Number);
      appointmentDateTime.setHours(hours, minutes, 0, 0);

      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduledAt: appointmentDateTime.toISOString(),
          duration: editData.duration,
          type: editData.type,
          notes: editData.notes.trim() || undefined,
        }),
      });

      if (response.ok) {
        const updatedAppointment = await response.json();
        setAppointment(updatedAppointment);
        setMessage('Appointment updated successfully');
        setShowEditDialog(false);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update appointment');
      }
    } catch (error) {
      setError('Failed to update appointment');
    } finally {
      setEditing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'no-show':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const isUpcoming = (scheduledAt: string) => {
    return new Date(scheduledAt) > new Date();
  };

  const canCancel = (appointment: Appointment) => {
    return appointment.status === 'scheduled' && isUpcoming(appointment.scheduledAt);
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

  if (!appointment) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Appointment Not Found</h3>
              <p className="text-gray-600">The requested appointment could not be found.</p>
              <Button asChild className="mt-4">
                <Link href="/appointments">Back to Appointments</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" className="cursor-pointer" asChild>
            <Link href="/appointments">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Appointment Details</h1>
            <p className="text-gray-600 mt-1">View and manage appointment information</p>
          </div>
        </div>

        {/* Messages */}
        {message && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Appointment Info */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl capitalize">
                      {appointment.type.replace('_', ' ')}
                    </CardTitle>
                    <CardDescription>
                      Appointment #{appointment._id.slice(-8)}
                    </CardDescription>
                  </div>
                  <Badge className={getStatusColor(appointment.status)}>
                    {appointment.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Date & Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-3">
                    <Calendar className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-medium">Date</p>
                      <p className="text-sm text-gray-600">
                        {format(new Date(appointment.scheduledAt), 'EEEE, MMMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <Clock className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-medium">Time</p>
                      <p className="text-sm text-gray-600">
                        {format(new Date(appointment.scheduledAt), 'h:mm a')} ({appointment.duration} min)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Participants */}
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-900">Participants</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Dietitian */}
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={appointment.dietitian.avatar} />
                        <AvatarFallback>
                          {appointment.dietitian.firstName[0]}{appointment.dietitian.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          Dt. {appointment.dietitian.firstName} {appointment.dietitian.lastName}
                        </p>
                        <p className="text-sm text-gray-600">Dietitian</p>
                      </div>
                    </div>

                    {/* Client */}
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={appointment.client.avatar} />
                        <AvatarFallback>
                          {appointment.client.firstName[0]}{appointment.client.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {appointment.client.firstName} {appointment.client.lastName}
                        </p>
                        <p className="text-sm text-gray-600">Client</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {appointment.notes && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Notes</h3>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-700">{appointment.notes}</p>
                    </div>
                  </div>
                )}

                {/* Zoom Meeting */}
                {appointment.zoomMeeting && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-3">Video Meeting</h3>
                    <ZoomMeetingCard
                      zoomMeeting={appointment.zoomMeeting}
                      scheduledAt={new Date(appointment.scheduledAt)}
                      duration={appointment.duration}
                      isHost={session?.user?.role === 'dietitian'}
                    />
                  </div>
                )}

                {/* Legacy Meeting Link (fallback) */}
                {!appointment.zoomMeeting && appointment.meetingLink && isUpcoming(appointment.scheduledAt) && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Meeting Link</h3>
                    <Button asChild>
                      <a href={appointment.meetingLink} target="_blank" rel="noopener noreferrer">
                        <Video className="h-4 w-4 mr-2" />
                        Join Video Call
                      </a>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Actions Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Join Meeting (only if meeting link exists and appointment is upcoming) */}
                {meetingLink && isUpcoming(appointment.scheduledAt) && (
                  <Button className="w-full bg-green-600 hover:bg-green-700" asChild>
                    <a href={meetingLink} target="_blank" rel="noopener noreferrer">
                      <Video className="h-4 w-4 mr-2" />
                      Join Meet
                    </a>
                  </Button>
                )}

                {/* Message */}
                <Button variant="outline" className="w-full" asChild>
                  <Link href={`/messages?user=${
                    session?.user?.role === 'client' 
                      ? appointment.dietitian._id 
                      : appointment.client._id
                  }`}>
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Send Message
                  </Link>
                </Button>

                {/* Payment (for clients) */}
                {session?.user?.role === 'client' && appointment.status === 'scheduled' && (
                  <Button className="w-full" asChild>
                    <Link href={`/appointments/${appointment._id}/payment`}>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Make Payment
                    </Link>
                  </Button>
                )}

                {/* Edit (for dietitians and admins) */}
                {(session?.user?.role === 'dietitian' || session?.user?.role === 'admin') && canCancel(appointment) && (
                  <Button
                    variant="outline"
                    className="w-full cursor-pointer"
                    onClick={handleEditAppointment}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Appointment
                  </Button>
                )}

                {/* Cancel */}
                {canCancel(appointment) && (
                  <Button 
                    variant="destructive" 
                    className="w-full cursor-pointer"
                    onClick={handleCancelAppointment}
                    disabled={cancelling}
                  >
                    {cancelling ? (
                      <>
                        <LoadingSpinner className="h-4 w-4 mr-2" />
                        Cancelling...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Cancel Appointment
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Audit Tags */}
            <Card>
              <CardHeader>
                <CardTitle>Lifecycle</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Created By */}
                {getCreatedByLabel() && (
                  <div className="flex items-center">
                    <span className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                      📝 {getCreatedByLabel()}
                    </span>
                  </div>
                )}

                {/* Rescheduled By */}
                {getRescheduledByLabel() && (
                  <div className="flex items-center">
                    <span className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                      🔄 {getRescheduledByLabel()}
                    </span>
                  </div>
                )}

                {/* Cancelled By */}
                {getCancelledByLabel() && (
                  <div className="flex items-center">
                    <span className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                      ❌ {getCancelledByLabel()}
                    </span>
                  </div>
                )}

                {/* Fallback if no audit tags */}
                {!getCreatedByLabel() && !getRescheduledByLabel() && !getCancelledByLabel() && (
                  <p className="text-sm text-gray-500">No lifecycle events recorded</p>
                )}
              </CardContent>
            </Card>

            {/* Appointment Info */}
            <Card>
              <CardHeader>
                <CardTitle>Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Created:</span>
                  <span>{format(new Date(appointment.createdAt), 'MMM d, yyyy')}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Duration:</span>
                  <span>{appointment.duration} minutes</span>
                </div>
                
                {appointment.dietitian.consultationFee && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Fee:</span>
                    <span>${appointment.dietitian.consultationFee}</span>
                  </div>
                )}
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <Badge className={getStatusColor(appointment.status)}>
                    {appointment.status}
                  </Badge>
                </div>

                {/* Meeting Link */}
                {meetingLink && (
                  <div className="pt-2 border-t mt-2">
                    <span className="text-gray-600 block mb-1">Meeting Link:</span>
                    <a 
                      href={meetingLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-xs break-all flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      {meetingLink}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Edit Appointment Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Date */}
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={editData.scheduledAt}
                onChange={(e) => setEditData({ ...editData, scheduledAt: e.target.value })}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Time */}
            <div className="space-y-2">
              <Label>Time</Label>
              <Select
                value={editData.time}
                onValueChange={(value) => setEditData({ ...editData, time: value })}
              >
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

            {/* Duration */}
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Select
                value={editData.duration.toString()}
                onValueChange={(value) => setEditData({ ...editData, duration: parseInt(value) })}
              >
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

            {/* Type */}
            <div className="space-y-2">
              <Label>Appointment Type</Label>
              <Select
                value={editData.type}
                onValueChange={(value) => setEditData({ ...editData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultation">Consultation</SelectItem>
                  <SelectItem value="follow_up">Follow-up</SelectItem>
                  <SelectItem value="assessment">Assessment</SelectItem>
                  <SelectItem value="planning">Planning</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                value={editData.notes}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                placeholder="Add any notes for the appointment..."
                rows={3}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowEditDialog(false)}
                className="flex-1"
                disabled={editing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                className="flex-1"
                disabled={editing || !editData.scheduledAt || !editData.time}
              >
                {editing ? (
                  <>
                    <LoadingSpinner className="h-4 w-4 mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// Main export with role-based routing
export default function AppointmentDetailPage() {
  const { data: session } = useSession();
  const isClient = session?.user?.role === 'client';

  // Show mobile UI for clients
  if (isClient) {
    return <MobileAppointmentDetailPage />;
  }

  // Show desktop UI for dietitians/admins
  return <DesktopAppointmentDetailPage />;
}
