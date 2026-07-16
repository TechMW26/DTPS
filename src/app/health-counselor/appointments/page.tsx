'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Calendar,
  Clock,
  Video,
  User,
  Plus,
  Eye,
  RefreshCw,
  CalendarDays
} from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatAppointmentTime, getBrowserTimezone } from '@/lib/utils/timezone';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';

// Import DietitianSlotsView for slots tab
const DietitianSlotsView = dynamic(() => import('@/components/appointments/DietitianSlotsView'), {
  ssr: false
});

// Import TimeSlotManagement for managing availability
const TimeSlotManagement = dynamic(() => import('@/components/appointments/TimeSlotManagement'), {
  ssr: false
});

interface LifecycleEvent {
  action: 'created' | 'cancelled' | 'rescheduled' | 'completed';
  performedBy: string;
  performedByRole: 'client' | 'dietitian' | 'health_counselor' | 'admin';
  performedByName: string;
  timestamp: string;
  reason?: string;
}

interface Appointment {
  _id: string;
  type: string;
  status: string;
  scheduledAt: string;
  duration: number;
  notes?: string;
  meetingLink?: string;
  modeName?: string;
  location?: string;
  appointmentTypeId?: {
    name: string;
    color?: string;
  };
  appointmentModeId?: {
    name: string;
    icon?: string;
  };
  // Audit fields
  lifecycleHistory?: LifecycleEvent[];
  cancelledBy?: {
    userId: string;
    role: string;
    name: string;
    reason?: string;
    timestamp: string;
  };
  rescheduledBy?: {
    userId: string;
    role: string;
    name: string;
    previousScheduledAt: string;
    timestamp: string;
  };
  dietitian: {
    firstName: string;
    lastName: string;
    avatar?: string;
  };
  client: {
    firstName: string;
    lastName: string;
    avatar?: string;
  };
}

export default function HealthCounselorAppointmentsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [userTimezone] = useState(() => getBrowserTimezone());

  useEffect(() => {
    // Verify user is health counselor
    if (session?.user?.role !== 'health_counselor') {
      router.push('/auth/signin');
      return;
    }
    fetchAppointments();

    // Check for success parameters and show toast
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const tab = urlParams.get('tab');

    if (success === 'booked') {
      setTimeout(() => {
        toast.success('Appointment booked successfully! 🎉');
      }, 100);
    }

    if (tab) {
      setActiveTab(tab);
    }
  }, [session, router]);

  // Add effect to refresh appointments when returning from booking
  useEffect(() => {
    const handleFocus = () => {
      fetchAppointments();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      // Fetch appointments for assigned clients only
      const response = await fetch('/api/appointments?limit=100');
      if (response.ok) {
        const data = await response.json();
        setAppointments(data.appointments);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAppointmentsByStatus = () => {
    const now = new Date();
    
    return {
      upcoming: appointments.filter(apt => 
        apt.status === 'scheduled' && new Date(apt.scheduledAt) > now
      ),
      past: appointments.filter(apt => 
        apt.status === 'completed' || 
        (apt.status === 'scheduled' && new Date(apt.scheduledAt) < now)
      ),
      cancelled: appointments.filter(apt => apt.status === 'cancelled')
    };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video_consultation':
        return <Video className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const handleCancelAppointment = async (appointmentId: string) => {
    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        toast.success('Appointment cancelled');
        fetchAppointments();
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      toast.error('Failed to cancel appointment');
    }
  };

  const appointmentGroups = getAppointmentsByStatus();

  const AppointmentCard = ({ appointment }: { appointment: Appointment }) => {
    const isUpcoming = appointment.status === 'scheduled' && new Date(appointment.scheduledAt) > new Date();
    const canCancel = isUpcoming && appointment.status === 'scheduled';
    
    // Get display name for appointment type
    const typeName = appointment.appointmentTypeId?.name || appointment.type.replace('_', ' ');
    const modeName = appointment.modeName || appointment.appointmentModeId?.name;
    
    // Get audit info - who created/cancelled/rescheduled
    const getCreatedByLabel = () => {
      if (appointment.lifecycleHistory && appointment.lifecycleHistory.length > 0) {
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

    const getCancelledByLabel = () => {
      if (appointment.status === 'cancelled' && appointment.cancelledBy) {
        const roleLabel = appointment.cancelledBy.role === 'dietitian' ? 'Dietitian' :
                         appointment.cancelledBy.role === 'health_counselor' ? 'Health Counselor' :
                         appointment.cancelledBy.role === 'admin' ? 'Admin' : 'Client';
        return `Cancelled by ${roleLabel}${appointment.cancelledBy.name ? ` (${appointment.cancelledBy.name})` : ''}`;
      }
      return null;
    };

    const getRescheduledByLabel = () => {
      if (appointment.rescheduledBy) {
        const roleLabel = appointment.rescheduledBy.role === 'dietitian' ? 'Dietitian' :
                         appointment.rescheduledBy.role === 'health_counselor' ? 'Health Counselor' :
                         appointment.rescheduledBy.role === 'admin' ? 'Admin' : 'Client';
        return `Rescheduled by ${roleLabel}${appointment.rescheduledBy.name ? ` (${appointment.rescheduledBy.name})` : ''}`;
      }
      return null;
    };

    const createdByLabel = getCreatedByLabel();
    const cancelledByLabel = getCancelledByLabel();
    const rescheduledByLabel = getRescheduledByLabel();
    
    return (
      <Card key={appointment._id}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2 flex-wrap gap-1">
                {getTypeIcon(appointment.type)}
                <h3 className="font-semibold capitalize">
                  {typeName}
                </h3>
                {modeName && (
                  <Badge variant="outline" className="text-xs">
                    {modeName}
                  </Badge>
                )}
                <Badge className={getStatusColor(appointment.status)}>
                  {appointment.status}
                </Badge>
              </div>
              
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4" />
                  <span>{formatAppointmentTime(appointment.scheduledAt, userTimezone).date}</span>
                </div>

                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4" />
                  <span>
                    {formatAppointmentTime(appointment.scheduledAt, userTimezone).time}
                    ({appointment.duration} minutes)
                  </span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span>
                    {`${appointment.client.firstName} ${appointment.client.lastName}`}
                  </span>
                </div>
              </div>

              {/* Audit Tags */}
              <div className="mt-3 flex flex-wrap gap-2">
                {createdByLabel && (
                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    📝 {createdByLabel}
                  </span>
                )}
                {rescheduledByLabel && (
                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    🔄 {rescheduledByLabel}
                  </span>
                )}
                {cancelledByLabel && (
                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-red-50 text-red-700 border border-red-200">
                    ❌ {cancelledByLabel}
                  </span>
                )}
              </div>
              
              {appointment.notes && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">{appointment.notes}</p>
                </div>
              )}
            </div>
            
            <div className="flex flex-col space-y-2 ml-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/appointments/${appointment._id}`)}
              >
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </Button>

              {appointment.meetingLink && isUpcoming && (
                <Button size="sm" asChild>
                  <a href={appointment.meetingLink} target="_blank" rel="noopener noreferrer">
                    <Video className="h-4 w-4 mr-2" />
                    Join Call
                  </a>
                </Button>
              )}

              {canCancel && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCancelAppointment(appointment._id)}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Appointments</h1>
            <p className="text-gray-600 mt-1">Manage your consultations</p>
          </div>
          <div className="flex space-x-2">
            <Button
              onClick={fetchAppointments}
              variant="outline"
              size="sm"
              disabled={loading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button asChild>
              <Link href="/appointments/unified-booking">
                <Plus className="h-4 w-4 mr-2" />
                Book Appointment
              </Link>
            </Button>
          </div>
        </div>

        {/* Appointments Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="upcoming">
              Upcoming ({appointmentGroups.upcoming.length})
            </TabsTrigger>
            <TabsTrigger value="past">
              Past ({appointmentGroups.past.length})
            </TabsTrigger>
            <TabsTrigger value="cancelled">
              Cancelled ({appointmentGroups.cancelled.length})
            </TabsTrigger>
            <TabsTrigger value="slots" className="flex items-center gap-1">
              <CalendarDays className="h-4 w-4" />
              My Slots
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <LoadingSpinner />
              </div>
            ) : appointmentGroups.upcoming.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Upcoming Appointments</h3>
                  <p className="text-gray-600 mb-4">
                    You don't have any scheduled appointments.
                  </p>
                  <Button asChild>
                    <Link href="/appointments/unified-booking">Book Appointment</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {appointmentGroups.upcoming.map((appointment) => (
                  <AppointmentCard key={appointment._id} appointment={appointment} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {appointmentGroups.past.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Past Appointments</h3>
                  <p className="text-gray-600">
                    Your completed appointments will appear here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {appointmentGroups.past.map((appointment) => (
                  <AppointmentCard key={appointment._id} appointment={appointment} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="cancelled" className="space-y-4">
            {appointmentGroups.cancelled.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Cancelled Appointments</h3>
                  <p className="text-gray-600">
                    Your cancelled appointments will appear here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {appointmentGroups.cancelled.map((appointment) => (
                  <AppointmentCard key={appointment._id} appointment={appointment} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* My Slots Tab */}
          <TabsContent value="slots" className="space-y-4">
            <TimeSlotManagement />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
