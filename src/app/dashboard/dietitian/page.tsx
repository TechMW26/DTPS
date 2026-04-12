'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/ui/stats-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Calendar,
  TrendingUp,
  DollarSign,
  Clock,
  MessageCircle,
  Heart,
  CheckCircle,
  Activity,
  Plus,
  AlertTriangle,
  X,
  ExternalLink,
  Phone,
  Loader2,
  Bell
} from 'lucide-react';
import Link from 'next/link';
import { formatDateIST, formatShortDateIST, formatDateTimeIST } from '@/lib/utils/formatDateIST';
import { useRealtime } from '@/hooks/useRealtime';
import { useNotifications } from '@/hooks/useNotifications';
import { toast } from 'sonner';
import { getClientId } from '@/lib/utils';

interface PendingPlan {
  clientId: string;
  clientName: string;
  phone: string;
  email: string;

  // Current plan info
  currentPlanName: string | null;
  currentPlanStartDate: string | null;
  currentPlanEndDate: string | null;
  currentPlanRemainingDays: number;

  // Previous plan info
  previousPlanName: string | null;
  previousPlanEndDate?: string | null;

  // Upcoming plan info
  upcomingPlanName?: string | null;
  upcomingPlanStartDate?: string | null;
  upcomingPlanEndDate?: string | null;
  daysUntilStart?: number;

  // Purchase info
  purchasedPlanName: string;
  totalPurchasedDays: number;
  totalMealPlanDays: number;
  pendingDaysToCreate: number;

  // Expected dates
  expectedStartDate?: string;
  expectedEndDate?: string;

  // Status
  reason: 'no_meal_plan' | 'current_ending_soon' | 'phase_gap' | 'upcoming_with_pending';
  reasonText: string;
  urgency: 'critical' | 'high' | 'medium';
  hasNextPhase: boolean;
}

export default function DietitianDashboard() {
  const { data: session, status } = useSession();

  // Dynamic data state
  const [stats, setStats] = useState({
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
    // Payment data
    totalRevenue: 0,
    pendingPaymentsCount: 0,
    completedPaymentsCount: 0,
    recentPayments: []
  });
  const [loading, setLoading] = useState(true);

  // Pending plans state
  const [showPendingPlans, setShowPendingPlans] = useState(false);
  const [pendingPlans, setPendingPlans] = useState<PendingPlan[]>([]);
  const [loadingPendingPlans, setLoadingPendingPlans] = useState(false);
  const [pendingPlansCount, setPendingPlansCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);

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

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/dashboard/dietitian-stats');
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

  // Fetch pending plans
  const fetchPendingPlans = async () => {
    setLoadingPendingPlans(true);
    try {
      const response = await fetch('/api/dashboard/pending-plans');
      if (response.ok) {
        const data = await response.json();
        setPendingPlans(data.pendingPlans || []);
        setPendingPlansCount(data.totalCount || 0);
        setCriticalCount(data.criticalCount || 0);
      }
    } catch (error) {
      console.error('Error fetching pending plans:', error);
    } finally {
      setLoadingPendingPlans(false);
    }
  };

  // Initial data fetch - only when session is ready
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchDashboardData();
      fetchPendingPlans();
    } else if (status === 'unauthenticated') {
      setLoading(false);
      setLoadingPendingPlans(false);
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

  return (
    <DashboardLayout>
      <div className="dietitian-dashboard-page p-3 sm:p-6 space-y-4 sm:space-y-6">
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
          {/* <Button asChild>
            <Link href="/clients/new">Add New Client</Link>
          </Button> */}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-6">
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
            icon={<DollarSign className="h-4 w-4" />}
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
              <CardDescription className="">
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{stats.totalClients}</div>
                      <div className="text-xs text-blue-700">Total</div>
                    </div>
                    <div className="text-center p-3 bg-amber-50 rounded-lg">
                      <div className="text-2xl font-bold text-amber-600">{stats.leadClients}</div>
                      <div className="text-xs text-amber-700">Lead</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{stats.activeClients}</div>
                      <div className="text-xs text-green-700">Active</div>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">{stats.inactiveClients}</div>
                      <div className="text-xs text-red-700">Inactive</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Active Clients</span>
                      <span>{stats.activePercentage}% Active</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, stats.activePercentage))}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5 text-green-600" />
                <span>Quick Actions</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">


              {/* <Button asChild className="w-full bg-green-600 hover:bg-green-700">
                <Link href="/dietician/clients/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Client
                </Link>
              </Button> */}
              <Button asChild variant="outline" className="w-full">
                <Link href="/dietician/clients">
                  <Users className="h-4 w-4 mr-2" />
                  View My Clients
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/meal-plan-templates/plans/create">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Plan Plan
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/meal-plan-templates/diet/create">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Diet Plan
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/appointments">
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule Appointment
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/messages">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Message Clients
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Today's Schedule */}
          <Card className="">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-green-600" />
                <span>Today's Schedule</span>
              </CardTitle>
              <CardDescription className="">
                Your appointments for today
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {loading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-sm text-gray-600 mt-2">Loading schedule...</p>
                  </div>
                ) : stats.todaysSchedule.length > 0 ? (
                  stats.todaysSchedule.map((appointment: any) => (
                    <div key={appointment.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <p className="font-medium">{appointment.time}</p>
                          <Badge className={getStatusColor(appointment.status)}>
                            {appointment.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600">{appointment.clientName}</p>
                        <p className="text-xs text-gray-500">{appointment.type}</p>
                      </div>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <Calendar className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">No appointments scheduled for today</p>
                  </div>
                )}

                <Button variant="outline" className="w-full mt-4" asChild>
                  <Link href="/appointments">View All Appointments</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Clients */}
          <Card className="">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-green-600" />
                <span>Recent Clients</span>
              </CardTitle>
              <CardDescription className="">
                Latest client activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {loading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-sm text-gray-600 mt-2">Loading clients...</p>
                  </div>
                ) : stats.recentClients.length > 0 ? (
                  stats.recentClients.map((client: any) => (
                    <div key={client.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">{client.name}</p>
                        <p className="text-sm text-gray-600">{client.email}</p>
                        {client.joinedDate && (
                          <p className="text-xs text-gray-400 mt-1">Joined {formatDateIST(client.joinedDate)}</p>
                        )}
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/dietician/clients/${client.id}`}>
                          View
                        </Link>
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <Users className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">No recent clients</p>
                  </div>
                )}

                <Button variant="outline" className="w-full mt-4" asChild>
                  <Link href="/dietician/clients">View All Clients</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Payments Section */}
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <span> Payments</span>
              </CardTitle>
              <CardDescription>
                Payments from your assigned clients
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {loading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600 mx-auto"></div>
                    <p className="text-sm text-gray-600 mt-2">Loading payments...</p>
                  </div>
                ) : stats.recentPayments && stats.recentPayments.length > 0 ? (
                  <>
                    <div className="dietitian-dashboard-payments-mobile md:hidden space-y-3">
                      {stats.recentPayments.map((payment: any) => (
                        <div key={`mobile-${payment.id}`} className="rounded-lg border border-gray-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-gray-900">{payment.clientName}</p>
                                {payment.clientId && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                    {getClientId(payment.clientId)}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600">{payment.clientEmail}</p>
                            </div>
                            <Badge className={
                              payment.status === 'completed' ? 'bg-green-100 text-green-800' :
                                payment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  payment.status === 'failed' ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-800'
                            }>
                              {payment.status}
                            </Badge>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                            <div>
                              <p className="text-gray-500">Plan</p>
                              <p className="text-gray-900 font-medium">{payment.planName}</p>
                              {payment.planCategory && (
                                <Badge variant="outline" className="mt-1 text-xs">
                                  {payment.planCategory}
                                </Badge>
                              )}
                            </div>
                            <div>
                              <p className="text-gray-500">Duration</p>
                              <p className="text-gray-900">{payment.durationLabel || (payment.durationDays ? `${payment.durationDays} days` : 'N/A')}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Amount</p>
                              <p className="text-gray-900 font-semibold">{payment.currency} {payment.amount?.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Date</p>
                              <p className="text-gray-700">{payment.createdAt ? formatDateIST(payment.createdAt) : 'N/A'}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Client</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Plan</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Duration</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-600">Amount</th>
                            <th className="px-3 py-2 text-center font-medium text-gray-600">Status</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {stats.recentPayments.map((payment: any) => (
                            <tr key={payment.id} className="hover:bg-gray-50">
                              <td className="px-3 py-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-gray-900">{payment.clientName}</p>
                                    {payment.clientId && (
                                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                        {getClientId(payment.clientId)}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500">{payment.clientEmail}</p>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <div>
                                  <p className="font-medium text-gray-800">{payment.planName}</p>
                                  {payment.planCategory && (
                                    <Badge variant="outline" className="text-xs mt-1">
                                      {payment.planCategory}
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-gray-600">
                                  {payment.durationLabel || (payment.durationDays ? `${payment.durationDays} days` : 'N/A')}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-right">
                                <span className="font-semibold text-gray-900">
                                  {payment.currency} {payment.amount?.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <Badge className={
                                  payment.status === 'completed' ? 'bg-green-100 text-green-800' :
                                    payment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                      payment.status === 'failed' ? 'bg-red-100 text-red-800' :
                                        'bg-gray-100 text-gray-800'
                                }>
                                  {payment.status}
                                </Badge>
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-gray-600 text-xs">
                                  {payment.createdAt ? formatDateIST(payment.createdAt) : 'N/A'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <DollarSign className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-600">No payments yet</p>
                    <p className="text-xs text-gray-400 mt-1">Payments from assigned clients will appear here</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          Pending Tasks
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-green-600" />
                <span>Pending Tasks</span>
              </CardTitle>
              <CardDescription>
                Items that need your attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{task.task}</p>
                    </div>
                    <Badge className={getPriorityColor(task.priority)}>
                      {task.priority}
                    </Badge>
                  </div>
                ))}
                
                <Button variant="outline" className="w-full mt-4">
                  View All Tasks
                </Button>
              </div>
            </CardContent>
          </Card>

          Quick Actions
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Common tasks and shortcuts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-20 flex flex-col space-y-2" asChild>
                  <Link href="/meal-plans/create">
                    <Heart className="h-6 w-6" />
                    <span>Create Meal Plan</span>
                  </Link>
                </Button>
                
                <Button variant="outline" className="h-20 flex flex-col space-y-2" asChild>
                  <Link href="/messages">
                    <MessageCircle className="h-6 w-6" />
                    <span>Messages</span>
                  </Link>
                </Button>
                
                <Button variant="outline" className="h-20 flex flex-col space-y-2" asChild>
                  <Link href="/analytics">
                    <TrendingUp className="h-6 w-6" />
                    <span>Analytics</span>
                  </Link>
                </Button>
                
                <Button variant="outline" className="h-20 flex flex-col space-y-2" asChild>
                  <Link href="/appointments/schedule">
                    <Calendar className="h-6 w-6" />
                    <span>Schedule</span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div> */}
      </div>

      {/* Pending Plans Right Side Panel */}
      {showPendingPlans && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/40 z-40 transition-opacity"
            onClick={() => setShowPendingPlans(false)}
          />

          {/* Right Side Panel */}
          <div className="fixed right-0 top-0 h-full w-full max-w-5xl bg-gray-50 shadow-2xl z-50 overflow-hidden flex flex-col animate-slide-in-right">
            {/* Header - Website themed green gradient */}
            <div className="flex items-center justify-between p-4 border-b bg-linear-to-r from-green-600 to-teal-600">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Pending Plans</h2>
                  <p className="text-sm text-green-100">
                    Clients requiring meal plan attention
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {criticalCount > 0 && (
                  <Badge className="bg-red-500 text-white border-0">
                    {criticalCount} Critical
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPendingPlans(false)}
                  className="text-white hover:bg-white/20 rounded-full"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-white border-b">
              <div className="text-center p-3 bg-red-50 rounded-lg border border-red-100">
                <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
                <div className="text-xs text-red-700">Critical</div>
              </div>
              <div className="text-center p-3 bg-amber-50 rounded-lg border border-amber-100">
                <div className="text-2xl font-bold text-amber-600">
                  {pendingPlans.filter(p => p.urgency === 'high').length}
                </div>
                <div className="text-xs text-amber-700">High Priority</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg border border-green-100">
                <div className="text-2xl font-bold text-green-600">
                  {pendingPlans.filter(p => p.urgency === 'medium').length}
                </div>
                <div className="text-xs text-green-700">Medium</div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {loadingPendingPlans ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                  <span className="ml-2 text-gray-600">Loading pending plans...</span>
                </div>
              ) : pendingPlans.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl shadow-sm">
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700">All Caught Up!</h3>
                  <p className="text-gray-500 mt-2">No pending plans requiring attention</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="px-3 py-3 text-left font-semibold text-gray-700">Client ID</th>
                          <th className="px-3 py-3 text-left font-semibold text-gray-700">Client</th>
                          <th className="px-3 py-3 text-left font-semibold text-gray-700">Phone</th>
                          <th className="px-3 py-3 text-left font-semibold text-gray-700">Previous Plan</th>
                          <th className="px-3 py-3 text-left font-semibold text-gray-700">Current Plan</th>
                          <th className="px-3 py-3 text-center font-semibold text-gray-700">Plan Dates</th>
                          <th className="px-3 py-3 text-center font-semibold text-gray-700">Expected Dates</th>
                          <th className="px-3 py-3 text-center font-semibold text-gray-700">Remaining Days</th>
                          <th className="px-3 py-3 text-center font-semibold text-gray-700">Pending Meal Days</th>
                          <th className="px-3 py-3 text-center font-semibold text-gray-700">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {pendingPlans.map((plan) => (
                          <tr
                            key={plan.clientId}
                            className={`hover:bg-gray-50 transition-colors ${plan.urgency === 'critical' ? 'bg-red-50/50' :
                              plan.urgency === 'high' ? 'bg-amber-50/50' : ''
                              }`}
                          >
                            <td className="px-3 py-3">
                              <Link
                                href={`/dietician/clients/${plan.clientId}`}
                                className="text-blue-600 hover:underline font-medium text-xs"
                              >
                                P-{plan.clientId.toString().slice(-4).toUpperCase()}
                              </Link>
                            </td>
                            <td className="px-3 py-3">
                              <div>
                                <p className="font-medium text-gray-900">{plan.clientName}</p>
                                <p className="text-xs text-gray-500">{plan.email}</p>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1 text-gray-600">
                                <Phone className="h-3 w-3" />
                                <span className="text-xs">{plan.phone}</span>
                              </div>
                            </td>
                            {/* Previous Plan - Show name if exists, otherwise NA */}
                            <td className="px-3 py-3">
                              {plan.previousPlanName ? (
                                <div>
                                  <p className="font-medium text-gray-700 text-xs truncate max-w-30">
                                    {plan.previousPlanName}
                                  </p>
                                  {plan.previousPlanEndDate && (
                                    <p className="text-xs text-gray-400">
                                      Ended: {formatShortDateIST(plan.previousPlanEndDate)}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-500 font-medium">NA</span>
                              )}
                            </td>
                            {/* Current Plan - Show current plan, upcoming plan, or purchased plan name */}
                            <td className="px-3 py-3">
                              {plan.currentPlanName ? (
                                <div>
                                  <p className="font-medium text-gray-800 truncate max-w-35">
                                    {plan.currentPlanName}
                                  </p>
                                </div>
                              ) : plan.upcomingPlanName ? (
                                <div>
                                  <p className="font-medium text-blue-700 truncate max-w-35">
                                    {plan.upcomingPlanName}
                                  </p>
                                  <Badge className="bg-blue-100 text-blue-700 text-xs mt-1">Upcoming</Badge>
                                </div>
                              ) : (
                                <div>
                                  <p className="font-medium text-teal-700 truncate max-w-35">
                                    {plan.purchasedPlanName}
                                  </p>
                                  <p className="text-xs text-gray-400 italic">
                                    (Purchased - No meal plan)
                                  </p>
                                </div>
                              )}
                            </td>
                            {/* Plan Dates - Start and End dates */}
                            <td className="px-3 py-3 text-center">
                              {plan.currentPlanStartDate && plan.currentPlanEndDate ? (
                                <div className="text-xs">
                                  <p className="text-gray-600 font-medium">
                                    {formatShortDateIST(plan.currentPlanStartDate)}
                                  </p>
                                  <p className="text-gray-400">to</p>
                                  <p className="text-gray-600 font-medium">
                                    {formatDateIST(plan.currentPlanEndDate)}
                                  </p>
                                </div>
                              ) : plan.upcomingPlanStartDate && plan.upcomingPlanEndDate ? (
                                <div className="text-xs">
                                  <p className="text-blue-600 font-medium">
                                    {formatShortDateIST(plan.upcomingPlanStartDate)}
                                  </p>
                                  <p className="text-gray-400">to</p>
                                  <p className="text-blue-600 font-medium">
                                    {formatDateIST(plan.upcomingPlanEndDate)}
                                  </p>
                                  <Badge className="bg-blue-100 text-blue-700 text-xs mt-1">Upcoming</Badge>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            {/* Expected Dates - Expected start and end dates from purchase */}
                            <td className="px-3 py-3 text-center">
                              {plan.expectedStartDate && plan.expectedEndDate ? (
                                <div className="text-xs">
                                  <p className="text-amber-600 font-medium">
                                    {formatShortDateIST(plan.expectedStartDate)}
                                  </p>
                                  <p className="text-gray-400">to</p>
                                  <p className="text-amber-600 font-medium">
                                    {formatDateIST(plan.expectedEndDate)}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            {/* Remaining Days - Days left until current plan ends */}
                            <td className="px-3 py-3 text-center">
                              {plan.currentPlanRemainingDays > 0 ? (
                                <Badge className={`${plan.currentPlanRemainingDays <= 2 ? 'bg-red-500 text-white' :
                                  plan.currentPlanRemainingDays <= 4 ? 'bg-amber-500 text-white' :
                                    'bg-green-500 text-white'
                                  }`}>
                                  {plan.currentPlanRemainingDays} days left
                                </Badge>
                              ) : (
                                <Badge className="bg-gray-200 text-gray-600">
                                  0 days
                                </Badge>
                              )}
                            </td>
                            {/* Pending Meal Days - Days that need meal plans created */}
                            <td className="px-3 py-3 text-center">
                              <div>
                                <Badge className={`${plan.pendingDaysToCreate > 14 ? 'bg-red-500 text-white' :
                                  plan.pendingDaysToCreate > 7 ? 'bg-amber-500 text-white' :
                                    'bg-teal-500 text-white'
                                  }`}>
                                  {plan.pendingDaysToCreate} days pending
                                </Badge>
                                <p className="text-xs text-gray-400 mt-1">
                                  {plan.totalMealPlanDays} of {plan.totalPurchasedDays} days created
                                </p>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <Button
                                size="sm"
                                className="text-xs bg-green-600 hover:bg-green-700 text-white"
                                asChild
                              >
                                <Link href={`/dietician/clients/${plan.clientId}`}>
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  {plan.reason === 'no_meal_plan' ? 'Create Plan' : 'Create Phase'}
                                </Link>
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t p-4 bg-white">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>
                  Total: <strong className="text-green-600">{pendingPlans.length}</strong> clients need attention
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchPendingPlans()}
                  disabled={loadingPendingPlans}
                  className="border-green-200 text-green-700 hover:bg-green-50"
                >
                  {loadingPendingPlans ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Clock className="h-4 w-4 mr-1" />
                  )}
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx global>{`
        @media (max-width: 768px) {
          /* mobile only — max-width: 768px */
          .dietitian-dashboard-page {
            padding-left: 16px;
            padding-right: 16px;
            overflow-x: hidden;
          }

          .dietitian-dashboard-page .text-xs {
            font-size: 14px;
          }

          .dietitian-dashboard-page button,
          .dietitian-dashboard-page input,
          .dietitian-dashboard-page [role='button'],
          .dietitian-dashboard-page [role='combobox'] {
            min-height: 44px;
          }
        }
      `}</style>
    </DashboardLayout>
  );
}
