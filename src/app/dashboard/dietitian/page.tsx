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
  DollarSign,
  Clock,
  CheckCircle,
  Activity,
  Plus,
  AlertTriangle,
  X,
  ExternalLink,
  Phone,
  Loader2,
  Bell,
  Gift,
  ListTodo,
} from 'lucide-react';
import Link from 'next/link';
import { formatDateIST, formatShortDateIST, formatDateTimeIST } from '@/lib/utils/formatDateIST';
import { useRealtime } from '@/hooks/useRealtime';
import { useNotifications } from '@/hooks/useNotifications';
import { toast } from 'sonner';
import { getClientId } from '@/lib/utils';
import { DashboardContentSkeleton } from '@/components/ui/skeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingPlan {
  clientId: string;
  clientName: string;
  phone: string;
  email: string;
  currentPlanName: string | null;
  currentPlanStartDate: string | null;
  currentPlanEndDate: string | null;
  currentPlanRemainingDays: number;
  previousPlanName: string | null;
  previousPlanEndDate?: string | null;
  upcomingPlanName?: string | null;
  upcomingPlanStartDate?: string | null;
  upcomingPlanEndDate?: string | null;
  daysUntilStart?: number;
  purchasedPlanName: string;
  totalPurchasedDays: number;
  totalMealPlanDays: number;
  pendingDaysToCreate: number;
  expectedStartDate?: string;
  expectedEndDate?: string;
  reason: 'no_meal_plan' | 'current_ending_soon' | 'phase_gap' | 'upcoming_with_pending';
  reasonText: string;
  urgency: 'critical' | 'high' | 'medium';
  hasNextPhase: boolean;
}

interface ExpiredMealPlan {
  id: string;
  clientId: string;
  clientName: string;
  clientCode?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAvatar?: string;
  expectedEndDate: string | Date;
  /** 0 = today, positive = already expired N days ago */
  expiredDays: number;
  isExpired: boolean;
  expiresToday: boolean;
  upcoming: boolean;
  expiryStatus: string;
}

interface MealPlan {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  mealPlanName: string;
  endDate: string | Date;
  startDate: string | Date;
  status: string;
  daysRemaining: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DietitianDashboard() {
  const { data: session, status } = useSession();

  // Pagination page sizes
  const recentClientsPerPage  = 10;
  const appointmentsPerPage   = 10;
  const expiringPlansPerPage  = 10;
  const expiredPlansPerPage   = 10;
  const celebrationsPerPage   = 8;
  const tasksPerPage          = 8;

  // Payment window: last 3 days → now
  const paymentsWindowStart = new Date();
  paymentsWindowStart.setHours(0, 0, 0, 0);
  paymentsWindowStart.setDate(paymentsWindowStart.getDate() - 3);
  const paymentsWindowEnd = new Date();
  paymentsWindowEnd.setHours(23, 59, 59, 999);

  // ─── State ─────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<{
    totalClients: number;
    activeClients: number;
    leadClients: number;
    inactiveClients: number;
    holdClients: number;
    clientsWithMealPlans: number;
    totalAppointments: number;
    todaysAppointments: number;
    confirmedAppointments: number;
    pendingAppointments: number;
    completedSessions: number;
    completionRate: number;
    activePercentage: number;
    recentClients: any[];
    todayCelebrations: any[];
    todayTasks: any[];
    todaysSchedule: any[];
    expiringMealPlans: MealPlan[];
    expiredMealPlans: ExpiredMealPlan[];
    totalRevenue: number;
    pendingPaymentsCount: number;
    completedPaymentsCount: number;
    recentPayments: any[];
  }>({
    totalClients: 0,
    activeClients: 0,
    leadClients: 0,
    inactiveClients: 0,
    holdClients: 0,
    clientsWithMealPlans: 0,
    totalAppointments: 0,
    todaysAppointments: 0,
    confirmedAppointments: 0,
    pendingAppointments: 0,
    completedSessions: 0,
    completionRate: 0,
    activePercentage: 0,
    recentClients: [],
    todayCelebrations: [],
    todayTasks: [],
    todaysSchedule: [],
    expiringMealPlans: [],
    expiredMealPlans: [],
    totalRevenue: 0,
    pendingPaymentsCount: 0,
    completedPaymentsCount: 0,
    recentPayments: [],
  });

  const [loading, setLoading] = useState(true);

  // Pending plans
  const [pendingPlans, setPendingPlans]           = useState<PendingPlan[]>([]);
  const [loadingPendingPlans, setLoadingPendingPlans] = useState(false);
  const [pendingPlansCount, setPendingPlansCount] = useState(0);
  const [criticalCount, setCriticalCount]         = useState(0);

  // Pagination state
  const [recentClientsPage,  setRecentClientsPage]  = useState(1);
  const [appointmentsPage,   setAppointmentsPage]   = useState(1);
  const [expiringPlansPage,  setExpiringPlansPage]  = useState(1);
  const [expiredPlansPage,   setExpiredPlansPage]   = useState(1);
  const [celebrationsPage,   setCelebrationsPage]   = useState(1);
  const [tasksPage,          setTasksPage]          = useState(1);

  // Keep "today" fresh if the tab is left open past midnight
  const [todayDate, setTodayDate] = useState(new Date());

  // ─── Real-time ─────────────────────────────────────────────────────────────
  const { showAppointmentNotification } = useNotifications();

  const handleRealtimeMessage = useCallback(
    (event: { type: string; data: string }) => {
      if (event.type === 'appointment_booked') {
        try {
          const data = JSON.parse(event.data);
          toast.success(
            `New appointment booked by ${data.client?.firstName} ${data.client?.lastName}`,
            {
              description: `Scheduled for ${formatDateTimeIST(data.scheduledAt)}`,
              duration:    6000,
              icon:        <Bell className="h-4 w-4 text-green-500" />,
            }
          );
          showAppointmentNotification(
            `${data.client?.firstName} ${data.client?.lastName}`,
            data.scheduledAt,
            data.duration,
            'booked',
            data.client?.avatar,
            data.appointmentId
          );
          fetchDashboardData();
        } catch (err) {
          console.error('Error parsing appointment_booked event:', err);
        }
      }
    },
    [showAppointmentNotification]
  );

  const { isConnected } = useRealtime({ onMessage: handleRealtimeMessage });

  // ─── Data fetching ─────────────────────────────────────────────────────────
  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/dashboard/dietitian-stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        console.error('Failed to fetch dashboard data');
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingPlans = async () => {
    setLoadingPendingPlans(true);
    try {
      const response = await fetch('/api/dashboard/pending-plans');
      if (response.ok) {
        const data = await response.json();
        setPendingPlans(data.pendingPlans     || []);
        setPendingPlansCount(data.totalCount  || 0);
        setCriticalCount(data.criticalCount   || 0);
      }
    } catch (err) {
      console.error('Error fetching pending plans:', err);
    } finally {
      setLoadingPendingPlans(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchDashboardData();
      fetchPendingPlans();
    } else if (status === 'unauthenticated') {
      setLoading(false);
      setLoadingPendingPlans(false);
    }
  }, [status, session?.user?.id]);

  // Midnight refresh
  useEffect(() => {
    const interval = setInterval(() => setTodayDate(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Clamp pagination pages when data changes
  useEffect(() => {
    const max = Math.max(1, Math.ceil(stats.recentClients.length / recentClientsPerPage));
    if (recentClientsPage > max) setRecentClientsPage(1);
  }, [stats.recentClients.length]);

  useEffect(() => {
    const max = Math.max(1, Math.ceil(stats.todaysSchedule.length / appointmentsPerPage));
    if (appointmentsPage > max) setAppointmentsPage(1);
  }, [stats.todaysSchedule.length]);

  useEffect(() => {
    const max = Math.max(1, Math.ceil(stats.expiringMealPlans.length / expiringPlansPerPage));
    if (expiringPlansPage > max) setExpiringPlansPage(1);
  }, [stats.expiringMealPlans.length]);

  useEffect(() => {
    const max = Math.max(1, Math.ceil(stats.expiredMealPlans.length / expiredPlansPerPage));
    if (expiredPlansPage > max) setExpiredPlansPage(1);
  }, [stats.expiredMealPlans.length]);

  useEffect(() => {
    const max = Math.max(1, Math.ceil(stats.todayCelebrations.length / celebrationsPerPage));
    if (celebrationsPage > max) setCelebrationsPage(1);
  }, [stats.todayCelebrations.length]);

  useEffect(() => {
    const max = Math.max(1, Math.ceil(stats.todayTasks.length / tasksPerPage));
    if (tasksPage > max) setTasksPage(1);
  }, [stats.todayTasks.length]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'pending':   return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default:          return 'bg-gray-100 text-gray-800';
    }
  };

  /** Calendar days from today to endDate. 0 = today, 1 = tomorrow, -1 = yesterday */
  const getDaysRemaining = (endDate: string | Date): number => {
    const base = new Date(todayDate);
    base.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    return Math.ceil((end.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Recent-payment filter (last 3 days)
  const recentThreeDayPayments = stats.recentPayments.filter((p: any) => {
    if (!p?.createdAt) return false;
    const d = new Date(p.createdAt);
    return d >= paymentsWindowStart && d <= paymentsWindowEnd;
  });

  // Expiring plans: ends today → +3 days, sorted soonest first
  const expiringMealPlans = (stats.expiringMealPlans || [])
    .filter((plan) => {
      const diff = getDaysRemaining(plan.endDate);
      return diff >= 0 && diff <= 3;
    })
    .sort((a, b) => getDaysRemaining(a.endDate) - getDaysRemaining(b.endDate));

  // FIX: Expired plans come from the API already sorted (most recently expired first).
  // expiredDays = 0  → expires/expired today
  // expiredDays > 0  → expired N days ago
  // We sort: today first, then 1 day ago, then 2, then 3
  const expiredMealPlans = (stats.expiredMealPlans || [])
    .slice()
    .sort((a, b) => a.expiredDays - b.expiredDays); // 0 first, then 1, 2, 3

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardLayout>
        <DashboardContentSkeleton sections={6} />
      </DashboardLayout>
    );
  }

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
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          <StatsCard
            title="Total Clients"
            value={loading ? '-' : stats.totalClients}
            description={loading ? 'Loading...' : `${stats.leadClients} leads, ${stats.activeClients} active`}
            icon={<Users className="h-4 w-4" />}
          />
          <StatsCard
            title="Total Appointments"
            value={loading ? '-' : stats.totalAppointments}
            description={loading ? 'Loading...' : `${stats.todaysAppointments} today`}
            icon={<Calendar className="h-4 w-4" />}
          />
          <StatsCard
            title="Total Pending Plans"
            value={pendingPlansCount}
            description={`${criticalCount} critical`}
            icon={<Activity className="h-4 w-4" />}
            loading={loadingPendingPlans}
          />
          <StatsCard
            title="Total Revenue"
            value={loading ? '-' : `₹${Math.floor(stats.totalRevenue || 0).toLocaleString('en-IN')}`}
            description={loading ? 'Loading...' : `${stats.completedPaymentsCount} completed, ${stats.pendingPaymentsCount} pending`}
            icon={<DollarSign className="h-4 w-4" />}
          />
        </div>

        {/* Client Status Snapshot */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6 mb-4 sm:mb-6">
          <Card className="flex h-[250px] flex-col overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-blue-600" />
                <span>Client Status Snapshot</span>
              </CardTitle>
              <CardDescription>Total client counts by current status</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <span className="ml-2 text-gray-600">Loading client totals...</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="text-2xl font-bold text-blue-700">{stats.totalClients}</div>
                    <div className="text-xs text-blue-700 mt-1">Total Clients</div>
                  </div>
                  <div className="text-center p-4 bg-amber-50 rounded-xl border border-amber-100">
                    <div className="text-2xl font-bold text-amber-700">{stats.leadClients}</div>
                    <div className="text-xs text-amber-700 mt-1">Leads</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-xl border border-green-100">
                    <div className="text-2xl font-bold text-green-700">{stats.activeClients}</div>
                    <div className="text-xs text-green-700 mt-1">Active</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-xl border border-red-100">
                    <div className="text-2xl font-bold text-red-700">{stats.inactiveClients}</div>
                    <div className="text-xs text-red-700 mt-1">Inactive</div>
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-200 col-span-2 lg:col-span-1">
                    <div className="text-2xl font-bold text-slate-700">{stats.holdClients}</div>
                    <div className="text-xs text-slate-700 mt-1">Hold</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Today's Schedule + Recent Clients */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

          {/* Today's Schedule */}
          <Card className="flex h-[520px] flex-col overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-green-600" />
                <span>Today's Schedule</span>
              </CardTitle>
              <CardDescription>Your appointments for today</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col overflow-y-auto">
              <div className="space-y-3">
                {loading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
                    <p className="text-sm text-gray-600 mt-2">Loading schedule...</p>
                  </div>
                ) : stats.todaysSchedule.length > 0 ? (
                  (() => {
                    const start  = (appointmentsPage - 1) * appointmentsPerPage;
                    const slice  = stats.todaysSchedule.slice(start, start + appointmentsPerPage);
                    const total  = Math.max(1, Math.ceil(stats.todaysSchedule.length / appointmentsPerPage));
                    return (
                      <>
                        <div className="space-y-3">
                          {slice.map((appt: any) => (
                            <div key={appt.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <p className="font-medium">{appt.time}</p>
                                  <Badge className={getStatusColor(appt.status)}>{appt.status}</Badge>
                                </div>
                                <p className="text-sm text-gray-600">{appt.clientName}</p>
                                <p className="text-xs text-gray-500">{appt.type}</p>
                              </div>
                              <Button variant="outline" size="sm">View</Button>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t pt-3">
                          <Button variant="outline" size="sm"
                            onClick={() => setAppointmentsPage(p => Math.max(1, p - 1))}
                            disabled={appointmentsPage === 1}>Previous</Button>
                          <span className="text-sm text-gray-600">Page {appointmentsPage} of {total}</span>
                          <Button variant="outline" size="sm"
                            onClick={() => setAppointmentsPage(p => Math.min(total, p + 1))}
                            disabled={appointmentsPage === total}>Next</Button>
                        </div>
                      </>
                    );
                  })()
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
          <Card className="flex h-[520px] flex-col overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-green-600" />
                <span>Recent Clients</span>
              </CardTitle>
              <CardDescription>Latest client activity</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col overflow-y-auto">
              <div className="flex-1 space-y-3">
                {loading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
                    <p className="text-sm text-gray-600 mt-2">Loading clients...</p>
                  </div>
                ) : stats.recentClients.length > 0 ? (
                  (() => {
                    const start = (recentClientsPage - 1) * recentClientsPerPage;
                    const slice = stats.recentClients.slice(start, start + recentClientsPerPage);
                    const total = Math.max(1, Math.ceil(stats.recentClients.length / recentClientsPerPage));
                    return (
                      <div className="space-y-3">
                        {slice.map((client: any) => (
                          <div key={client.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{client.name}</p>
                              <p className="truncate text-sm text-gray-600">{client.email}</p>
                              {client.joinedDate && (
                                <p className="mt-1 text-xs text-gray-400">Joined {formatDateIST(client.joinedDate)}</p>
                              )}
                            </div>
                            <Button variant="outline" size="sm" asChild>
                              <Link href="/dietician/clients">View Client</Link>
                            </Button>
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-3 border-t pt-3">
                          <Button variant="outline" size="sm"
                            onClick={() => setRecentClientsPage(p => Math.max(1, p - 1))}
                            disabled={recentClientsPage === 1}>Previous</Button>
                          <span className="text-sm text-gray-600">Page {recentClientsPage} of {total}</span>
                          <Button variant="outline" size="sm"
                            onClick={() => setRecentClientsPage(p => Math.min(total, p + 1))}
                            disabled={recentClientsPage === total}>Next</Button>
                        </div>
                      </div>
                    );
                  })()
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

        {/* Meal Plans Pending Soon (today → +3 days) */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6">
          <Card className="flex h-[520px] flex-col overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-orange-600" />
                <span>Meal Plans Pending Soon</span>
              </CardTitle>
              <CardDescription>Meal plans ending today and within the next 3 days</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col overflow-y-auto">
              <div className="space-y-3">
                {loading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mx-auto" />
                    <p className="text-sm text-gray-600 mt-2">Loading meal plans...</p>
                  </div>
                ) : expiringMealPlans.length > 0 ? (
                  (() => {
                    const start = (expiringPlansPage - 1) * expiringPlansPerPage;
                    const slice = expiringMealPlans.slice(start, start + expiringPlansPerPage);
                    const total = Math.max(1, Math.ceil(expiringMealPlans.length / expiringPlansPerPage));
                    return (
                      <>
                        <div className="space-y-3">
                          {slice.map((plan) => {
                            const diff = getDaysRemaining(plan.endDate);
                            const badgeClass =
                              diff === 0 ? 'border-red-200 text-red-700 bg-red-50'
                              : diff === 1 ? 'border-amber-200 text-amber-700 bg-amber-50'
                              : diff === 2 ? 'border-orange-200 text-orange-700 bg-orange-50'
                              : 'border-yellow-200 text-yellow-700 bg-yellow-50';
                            const badgeLabel =
                              diff === 0 ? 'Ends Today'
                              : diff === 1 ? '1 Day Left'
                              : `${diff} Days Left`;
                            return (
                              <div key={plan.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3 border">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate font-medium">{plan.clientName}</p>
                                    <Badge variant="outline" className={badgeClass}>{badgeLabel}</Badge>
                                  </div>
                                  <p className="truncate text-sm text-gray-600">{plan.mealPlanName}</p>
                                  <p className="mt-1 text-xs text-gray-400">Ends {formatDateIST(plan.endDate)}</p>
                                </div>
                                <Button variant="outline" size="sm" asChild>
                                  <Link href={`/dietician/clients/${plan.clientId}`}>View</Link>
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                        {total > 1 && (
                          <div className="flex items-center justify-between gap-3 border-t pt-3">
                            <Button variant="outline" size="sm"
                              onClick={() => setExpiringPlansPage(p => Math.max(1, p - 1))}
                              disabled={expiringPlansPage === 1}>Previous</Button>
                            <span className="text-sm text-gray-600">Page {expiringPlansPage} of {total}</span>
                            <Button variant="outline" size="sm"
                              onClick={() => setExpiringPlansPage(p => Math.min(total, p + 1))}
                              disabled={expiringPlansPage === total}>Next</Button>
                          </div>
                        )}
                      </>
                    );
                  })()
                ) : (
                  <div className="text-center py-8">
                    <Clock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">No meal plans ending in the next 3 days</p>
                    <p className="text-xs text-gray-400 mt-1">All client meal plans are current</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── FIX: Expired Programs (last 3 days → today) ─────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6">
          <Card className="flex h-[520px] flex-col overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span>Expired Programs</span>
              </CardTitle>
              <CardDescription>
                Payment programs that expired today or in the last 3 days
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col overflow-y-auto">
              {loading ? (
                <div className="text-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-red-600 mx-auto" />
                  <p className="text-sm text-gray-600 mt-2">Loading expired Programs...</p>
                </div>
              ) : expiredMealPlans.length > 0 ? (
                (() => {
                  const start = (expiredPlansPage - 1) * expiredPlansPerPage;
                  const slice = expiredMealPlans.slice(start, start + expiredPlansPerPage);
                  const total = Math.max(1, Math.ceil(expiredMealPlans.length / expiredPlansPerPage));

                  return (
                    <>
                      <div className="space-y-3">
                        {slice.map((plan) => {
                          // expiredDays: 0 = today, 1 = yesterday, 2 = 2 days ago, 3 = 3 days ago
                          const badgeClass =
                            plan.expiresToday
                              ? 'border-red-200 text-red-700 bg-red-50'
                              : plan.expiredDays === 1
                              ? 'border-orange-200 text-orange-700 bg-orange-50'
                              : plan.expiredDays === 2
                              ? 'border-amber-200 text-amber-700 bg-amber-50'
                              : 'border-yellow-200 text-yellow-700 bg-yellow-50';

                          // Use the pre-computed label from the backend
                          const badgeLabel = plan.expiryStatus;

                          return (
                            <div
                              key={plan.id}
                              className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3 border"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="truncate font-medium">{plan.clientName}</p>
                                  <Badge variant="outline" className={badgeClass}>
                                    {badgeLabel}
                                  </Badge>
                                </div>

                                {plan.clientCode && (
                                  <p className="truncate text-sm text-gray-600">
                                    Client ID: {plan.clientCode}
                                  </p>
                                )}

                                {plan.clientEmail && (
                                  <p className="truncate text-xs text-gray-500">{plan.clientEmail}</p>
                                )}

                                <p className="mt-1 text-xs text-gray-400">
                                  Expected End: {formatDateIST(plan.expectedEndDate)}
                                </p>
                              </div>

                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/dietician/clients/${plan.clientId}`}>View</Link>
                              </Button>
                            </div>
                          );
                        })}
                      </div>

                      {total > 1 && (
                        <div className="flex items-center justify-between gap-3 border-t pt-3">
                          <Button variant="outline" size="sm"
                            onClick={() => setExpiredPlansPage(p => Math.max(1, p - 1))}
                            disabled={expiredPlansPage === 1}>Previous</Button>
                          <span className="text-sm text-gray-600">Page {expiredPlansPage} of {total}</span>
                          <Button variant="outline" size="sm"
                            onClick={() => setExpiredPlansPage(p => Math.min(total, p + 1))}
                            disabled={expiredPlansPage === total}>Next</Button>
                        </div>
                      )}
                    </>
                  );
                })()
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">No expired payment plans</p>
                  <p className="text-xs text-gray-400 mt-1">
                    No client payments have expired in the last 3 days
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Today's Celebrations + Today's Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

          {/* Today's Celebrations */}
          <Card className="flex h-[520px] flex-col overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Gift className="h-5 w-5 text-pink-600" />
                <span>Today's Celebrations</span>
              </CardTitle>
              <CardDescription>Clients with birthdays or anniversaries today</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col overflow-y-auto">
              <div className="flex-1 space-y-3">
                {loading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-600 mx-auto" />
                    <p className="text-sm text-gray-600 mt-2">Loading celebrations...</p>
                  </div>
                ) : stats.todayCelebrations.length > 0 ? (
                  (() => {
                    const start = (celebrationsPage - 1) * celebrationsPerPage;
                    const slice = stats.todayCelebrations.slice(start, start + celebrationsPerPage);
                    const total = Math.max(1, Math.ceil(stats.todayCelebrations.length / celebrationsPerPage));
                    return (
                      <div className="space-y-3">
                        {slice.map((celebration: any) => (
                          <div key={celebration.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate font-medium">{celebration.clientName}</p>
                                <Badge variant="outline" className={
                                  celebration.type === 'Birthday'
                                    ? 'border-pink-200 text-pink-700'
                                    : 'border-amber-200 text-amber-700'
                                }>{celebration.type}</Badge>
                              </div>
                              <p className="truncate text-sm text-gray-600">{celebration.clientEmail}</p>
                              <p className="mt-1 text-xs text-gray-400">{formatShortDateIST(celebration.date)}</p>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                              <Link href="/dietician/clients">View Client</Link>
                            </Button>
                          </div>
                        ))}
                        {total > 1 && (
                          <div className="flex items-center justify-between gap-3 border-t pt-3">
                            <Button variant="outline" size="sm"
                              onClick={() => setCelebrationsPage(p => Math.max(1, p - 1))}
                              disabled={celebrationsPage === 1}>Previous</Button>
                            <span className="text-sm text-gray-600">Page {celebrationsPage} of {total}</span>
                            <Button variant="outline" size="sm"
                              onClick={() => setCelebrationsPage(p => Math.min(total, p + 1))}
                              disabled={celebrationsPage === total}>Next</Button>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-4">
                    <Gift className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">No celebrations today</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Today's Tasks */}
          <Card className="flex h-[520px] flex-col overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <ListTodo className="h-5 w-5 text-indigo-600" />
                <span>Today's Tasks</span>
              </CardTitle>
              <CardDescription>Active tasks scheduled for today</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col overflow-y-auto">
              <div className="flex-1 space-y-3">
                {loading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto" />
                    <p className="text-sm text-gray-600 mt-2">Loading tasks...</p>
                  </div>
                ) : stats.todayTasks.length > 0 ? (
                  (() => {
                    const start = (tasksPage - 1) * tasksPerPage;
                    const slice = stats.todayTasks.slice(start, start + tasksPerPage);
                    const total = Math.max(1, Math.ceil(stats.todayTasks.length / tasksPerPage));
                    return (
                      <div className="space-y-3">
                        {slice.map((task: any) => (
                          <div key={task.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate font-medium">{task.title}</p>
                                <Badge className={
                                  task.status === 'completed'   ? 'bg-green-100 text-green-800'
                                  : task.status === 'in-progress' ? 'bg-blue-100 text-blue-800'
                                  : 'bg-yellow-100 text-yellow-800'
                                }>{task.status}</Badge>
                              </div>
                              <p className="truncate text-sm text-gray-600">{task.clientName}</p>
                              <p className="mt-1 text-xs text-gray-400">
                                {task.taskType} • {task.allottedTime || '12:00 AM'}
                              </p>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                              <Link href="/dietician/clients">View Client</Link>
                            </Button>
                          </div>
                        ))}
                        {total > 1 && (
                          <div className="flex items-center justify-between gap-3 border-t pt-3">
                            <Button variant="outline" size="sm"
                              onClick={() => setTasksPage(p => Math.max(1, p - 1))}
                              disabled={tasksPage === 1}>Previous</Button>
                            <span className="text-sm text-gray-600">Page {tasksPage} of {total}</span>
                            <Button variant="outline" size="sm"
                              onClick={() => setTasksPage(p => Math.min(total, p + 1))}
                              disabled={tasksPage === total}>Next</Button>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-4">
                    <ListTodo className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">No tasks today</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Payments */}
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <span>Payments</span>
              </CardTitle>
              <CardDescription>Payments from your assigned clients</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {loading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600 mx-auto" />
                    <p className="text-sm text-gray-600 mt-2">Loading payments...</p>
                  </div>
                ) : recentThreeDayPayments.length > 0 ? (
                  <>
                    {/* Mobile */}
                    <div className="dietitian-dashboard-payments-mobile md:hidden space-y-3">
                      {recentThreeDayPayments.map((payment: any) => (
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
                              payment.status === 'completed' ? 'bg-green-100 text-green-800'
                              : payment.status === 'pending'   ? 'bg-yellow-100 text-yellow-800'
                              : payment.status === 'failed'    ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                            }>{payment.status}</Badge>
                          </div>
                          <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                            <div>
                              <p className="text-gray-500">Plan</p>
                              <p className="text-gray-900 font-medium">{payment.planName}</p>
                              {payment.planCategory && (
                                <Badge variant="outline" className="mt-1 text-xs">{payment.planCategory}</Badge>
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

                    {/* Desktop table */}
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
                          {recentThreeDayPayments.map((payment: any) => (
                            <tr key={payment.id} className="hover:bg-gray-50">
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-gray-900">{payment.clientName}</p>
                                  {payment.clientId && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                      {getClientId(payment.clientId)}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">{payment.clientEmail}</p>
                              </td>
                              <td className="px-3 py-3">
                                <p className="font-medium text-gray-800">{payment.planName}</p>
                                {payment.planCategory && (
                                  <Badge variant="outline" className="text-xs mt-1">{payment.planCategory}</Badge>
                                )}
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
                                  payment.status === 'completed' ? 'bg-green-100 text-green-800'
                                  : payment.status === 'pending'   ? 'bg-yellow-100 text-yellow-800'
                                  : payment.status === 'failed'    ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-800'
                                }>{payment.status}</Badge>
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
      </div>

      <style jsx global>{`
        @media (max-width: 768px) {
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
