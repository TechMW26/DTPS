'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/ui/stats-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Users,
  Calendar,
  TrendingUp,
  Clock,
  MessageCircle,
  CheckCircle,
  Activity,
  Plus,
  ExternalLink,
  Phone,
  Loader2,
  Bell,
  FileText,
  Utensils
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { formatDateTimeIST, formatTimeIST } from '@/lib/utils/formatDateIST';
import { useRealtime } from '@/hooks/useRealtime';
import { useNotifications } from '@/hooks/useNotifications';
import { toast } from 'sonner';
import { getClientId } from '@/lib/utils';

interface DashboardStats {
  totalClients: number;
  activeClients: number;
  leadClients: number;
  inactiveClients: number;
  clientsWithMealPlans: number;
  todaysAppointments: number;
  confirmedAppointments: number;
  pendingAppointments: number;
  completedSessions: number;
  completionRate: number;
  activePercentage: number;
  recentClients: Array<{
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    clientStatus?: string;
    createdAt: string;
  }>;
  todaysSchedule: Array<{
    _id: string;
    client: {
      _id: string;
      firstName: string;
      lastName: string;
      avatar?: string;
    };
    scheduledAt: string;
    duration: number;
    status: string;
  }>;
  totalRevenue: number;
  pendingPaymentsCount: number;
  completedPaymentsCount: number;
}

export default function HealthCounselorDashboard() {
  const { data: session, status } = useSession();

  // Dynamic data state
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    activeClients: 0,
    leadClients: 0,
    inactiveClients: 0,
    clientsWithMealPlans: 0,
    todaysAppointments: 0,
    confirmedAppointments: 0,
    pendingAppointments: 0,
    completedSessions: 0,
    completionRate: 0,
    activePercentage: 0,
    recentClients: [],
    todaysSchedule: [],
    totalRevenue: 0,
    pendingPaymentsCount: 0,
    completedPaymentsCount: 0
  });
  const [loading, setLoading] = useState(true);

  // Real-time appointment notifications
  const { showAppointmentNotification } = useNotifications();

  // Handle real-time events (appointment bookings)
  const handleRealtimeMessage = useCallback((event: { type: string; data: string }) => {
    if (event.type === 'appointment_booked') {
      try {
        const data = JSON.parse(event.data);
        // Show toast notification
        toast.success(
          `New appointment booked by ${data.client?.firstName} ${data.client?.lastName}`,
          {
            description: `Scheduled for ${formatDateTimeIST(data.scheduledAt)}`,
            duration: 6000,
            icon: <Bell className="h-4 w-4 text-green-500" />,
          }
        );

        // Show browser notification
        showAppointmentNotification(
          `${data.client?.firstName} ${data.client?.lastName}`,
          data.scheduledAt,
          data.duration,
          'booked',
          data.client?.avatar,
          data.appointmentId
        );

        // Refresh stats to update today's appointments
        fetchDashboardData();
      } catch (error) {
        console.error('Error parsing appointment_booked event:', error);
      }
    }
  }, [showAppointmentNotification]);

  // Connect to real-time updates
  const { isConnected } = useRealtime({
    onMessage: handleRealtimeMessage
  });

  // Fetch dashboard data - use health counselor specific endpoint
  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/dashboard/health-counselor-stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        console.error('Failed to fetch dashboard data');
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial data fetch - only when session is ready
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchDashboardData();
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status, session?.user?.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getClientStatusColor = (status?: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'lead':
        return 'bg-gray-100 text-gray-800';
      case 'inactive':
        return 'bg-red-100 text-red-800';
      case 'hold':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">
              Good morning, {session?.user?.firstName}!
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              You have {stats.todaysAppointments} appointments scheduled for today
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-6">
          <StatsCard
            title="Total Clients"
            value={loading ? '-' : stats.totalClients}
            description={loading ? 'Loading...' : `${stats.activeClients} active`}
            icon={<Users className="h-4 w-4" />}
            trend={{ value: 12, isPositive: true }}
          />
          <StatsCard
            title="Today's Appointments"
            value={loading ? '-' : stats.todaysAppointments}
            description={loading ? 'Loading...' : `${stats.confirmedAppointments} confirmed, ${stats.pendingAppointments} pending`}
            icon={<Calendar className="h-4 w-4" />}
          />
          <StatsCard
            title="Active Programs"
            value={loading ? '-' : stats.clientsWithMealPlans}
            description={loading ? 'Loading...' : 'Clients with Diet plans'}
            icon={<Activity className="h-4 w-4" />}
            trend={{ value: 15, isPositive: true }}
          />
          <StatsCard
            title="Completed Sessions"
            value={loading ? '-' : stats.completedSessions}
            description={loading ? 'Loading...' : `${stats.completionRate}% completion rate`}
            icon={<CheckCircle className="h-4 w-4" />}
          />
          <StatsCard
            title="Total Revenue"
            value={loading ? '-' : `₹${stats.totalRevenue?.toLocaleString() || 0}`}
            description={loading ? 'Loading...' : `${stats.completedPaymentsCount} completed, ${stats.pendingPaymentsCount} pending`}
            icon={<TrendingUp className="h-4 w-4" />}
            trend={{ value: 8, isPositive: true }}
          />
        </div>

        {/* Client Overview Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-4 sm:mb-6">
          <Card className="lg:col-span-2 overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-blue-600" />
                <span>Client Overview</span>
              </CardTitle>
              <CardDescription>
                Your nutrition clients and their progress
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <span className="ml-2 text-gray-600">Loading client data...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-3xl font-bold text-blue-600">{stats.totalClients}</div>
                      <div className="text-sm text-blue-700">Total Clients</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-3xl font-bold text-green-600">{stats.activeClients}</div>
                      <div className="text-sm text-green-700">Active Clients</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                      <span>Client Progress</span>
                      <span>{stats.activePercentage || 0}% Active</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${stats.activePercentage || 0}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5 text-purple-600" />
                <span>Quick Actions</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/health-counselor/clients">
                  <Users className="h-4 w-4 mr-2" />
                  View My Clients
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/health-counselor/plan-templates">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Plan Plan
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/health-counselor/pending-plans">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Diet Plan
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/appointments/unified-booking">
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule Appointment
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/health-counselor/messages">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Message Clients
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Today's Schedule and Recent Clients */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Today's Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-green-600" />
                <span>Today's Schedule</span>
              </CardTitle>
              <CardDescription>Your appointments for today</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-green-600" />
                </div>
              ) : stats.todaysSchedule.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No appointments scheduled for today</p>
                  <Button asChild variant="link" className="mt-2">
                    <Link href="/appointments/unified-booking">Schedule an appointment</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {stats.todaysSchedule.slice(0, 5).map((appointment) => (
                    <div
                      key={appointment._id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={appointment.client?.avatar} />
                          <AvatarFallback className="bg-green-100 text-green-600">
                            {appointment.client?.firstName?.[0]}{appointment.client?.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-gray-900">
                            {appointment.client?.firstName} {appointment.client?.lastName}
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatTimeIST(appointment.scheduledAt)} • {appointment.duration} min
                          </p>
                        </div>
                      </div>
                      <Badge className={getStatusColor(appointment.status)}>
                        {appointment.status}
                      </Badge>
                    </div>
                  ))}
                  {stats.todaysSchedule.length > 5 && (
                    <Button asChild variant="link" className="w-full">
                      <Link href="/health-counselor/appointments">
                        View all {stats.todaysSchedule.length} appointments
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Clients */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-orange-600" />
                <span>Recent Clients</span>
              </CardTitle>
              <CardDescription>Your latest assigned clients</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
                </div>
              ) : stats.recentClients.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No clients assigned yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {stats.recentClients.slice(0, 5).map((client) => (
                    <Link
                      key={client._id}
                      href={`/health-counselor/clients/${client._id}`}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={client.avatar} />
                          <AvatarFallback className="bg-orange-100 text-orange-600">
                            {client.firstName?.[0]}{client.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-gray-900">
                            {client.firstName} {client.lastName}
                          </p>
                          <p className="text-sm text-gray-500">
                            Added {formatDistanceToNow(new Date(client.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <Badge className={getClientStatusColor(client.clientStatus)}>
                        {(client.clientStatus || 'lead') === 'hold' ? 'On Hold' : (client.clientStatus || 'lead')}
                      </Badge>
                    </Link>
                  ))}
                  {stats.recentClients.length > 5 && (
                    <Button asChild variant="link" className="w-full">
                      <Link href="/health-counselor/clients">
                        View all clients
                      </Link>
                    </Button>
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
