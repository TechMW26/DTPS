'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Users,
  TrendingUp,
  IndianRupee,
  Activity,
  UserCheck,
  AlertTriangle,
  Calendar,
  Trash2,
  Tag,
  RefreshCw,
  ShieldCheck,
  FileBarChart,
  CreditCard,
  ClipboardList,
  Stethoscope,
  ArrowRight,
  Wallet,
  Hourglass,
  Bell,
} from 'lucide-react';
import Link from 'next/link';
import { SYSTEM_REFRESH_BROWSER_EVENT } from '@/lib/system-refresh';
import { DashboardContentSkeleton } from '@/components/ui/skeleton';

// Helper function to check if an alert can be deleted
const isAlertDeletable = (alertId: string) => {
  // MongoDB ObjectIds are 24 character hex strings
  return /^[0-9a-fA-F]{24}$/.test(alertId);
};

// Types for dynamic data
interface Activity {
  id: string;
  type: string;
  message: string;
  time: string;
  status: string;
}

interface SystemAlert {
  id: string;
  type: string;
  message: string;
  time: string;
  priority?: string;
  category?: string;
}

interface TopDietitian {
  id: string;
  name: string;
  email: string;
  clients: number;
  rating: number | null;
  revenue: number | null;
  completedAppointments?: number;
  totalAppointments?: number;
  completionRate?: number;
}

interface RevenueMonth {
  key: string;
  month: string;
  year: number;
  billed: number;
  collected: number;
  pending: number;
  billedCount: number;
  collectedCount: number;
  pendingCount: number;
}

interface RevenueCollection {
  months: RevenueMonth[];
  totals: { billed: number; collected: number; pending: number; pendingCount: number; collectionRate: number };
}

const RUPEE = '\u20B9';
const DASH = '\u2014';

const formatNumber = (value: number) => Math.round(Number(value || 0)).toLocaleString('en-IN');
const formatRupees = (value: number) => `${RUPEE}${formatNumber(value)}`;
const formatCompactRupees = (value: number) => {
  const amount = Math.round(Number(value || 0));
  const trim = (number: number) => String(Number(number.toFixed(1)));
  if (amount >= 10000000) return `${RUPEE}${trim(amount / 10000000)}Cr`;
  if (amount >= 100000) return `${RUPEE}${trim(amount / 100000)}L`;
  if (amount >= 1000) return `${RUPEE}${Math.round(amount / 1000)}k`;
  return `${RUPEE}${amount}`;
};

const greetingFor = (date: Date) => {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(date));
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

const todayLabel = (date: Date) => new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(date);

/** Round a chart maximum up to a clean number so gridlines read well. */
const niceMax = (value: number) => {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(multiple => multiple * magnitude >= value) ?? 10;
  return step * magnitude;
};

const toneClasses = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  sky: 'bg-sky-50 text-sky-700 ring-sky-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
} as const;

function KpiCard({ title, value, note, icon, tone }: {
  title: string; value: string; note: string; icon: React.ReactNode; tone: keyof typeof toneClasses;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200/70 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${toneClasses[tone]}`}>{icon}</span>
      </div>
      <p className="mt-3 text-[1.65rem] font-semibold leading-tight tracking-tight text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{note}</p>
    </div>
  );
}

function Panel({ title, description, action, children, className = '' }: {
  title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`flex h-full flex-col rounded-2xl border border-gray-200/70 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function RevenueCollectionChart({ data, failed }: { data: RevenueCollection | null; failed: boolean }) {
  if (failed) return <p className="flex h-64 items-center justify-center text-sm text-gray-500">Revenue data is unavailable right now</p>;
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-gray-100" aria-label="Loading revenue chart" />;
  const max = niceMax(Math.max(...data.months.map(month => month.billed), 0));
  const gridlines = [1, 0.75, 0.5, 0.25, 0];
  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Billed', value: formatRupees(data.totals.billed), dot: 'bg-[#c6ddd0]' },
          { label: 'Collected', value: formatRupees(data.totals.collected), dot: 'bg-emerald-700' },
          { label: 'Pending', value: formatRupees(data.totals.pending), dot: 'bg-amber-400' },
          { label: 'Collection rate', value: `${data.totals.collectionRate}%`, dot: '' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl bg-gray-50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              {stat.dot && <span className={`h-2 w-2 rounded-full ${stat.dot}`} />}{stat.label}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900 sm:text-base">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative h-56 w-12 shrink-0 text-right text-[11px] text-gray-400">
          {gridlines.map(line => (
            <span key={line} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - line) * 100}%` }}>
              {formatCompactRupees(max * line)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-56">
            {gridlines.map(line => (
              <div key={line} className={`absolute inset-x-0 border-t ${line === 0 ? 'border-gray-300' : 'border-dashed border-gray-200'}`} style={{ top: `${(1 - line) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-1 sm:gap-2">
              {data.months.map(month => (
                <div key={month.key} className="group relative flex h-full flex-1 items-end justify-center gap-0.5 sm:gap-1">
                  <div className="w-full max-w-4 rounded-t bg-[#c6ddd0] transition group-hover:bg-[#adcdbb]" style={{ height: `${(month.billed / max) * 100}%` }} />
                  <div className="w-full max-w-4 rounded-t bg-emerald-700 transition group-hover:bg-emerald-800" style={{ height: `${(month.collected / max) * 100}%` }} />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-44 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg group-hover:block">
                    <p className="mb-1 font-semibold">{month.month} {month.year}</p>
                    <p className="flex justify-between"><span className="text-gray-300">Billed</span>{formatRupees(month.billed)}</p>
                    <p className="flex justify-between"><span className="text-gray-300">Collected</span>{formatRupees(month.collected)}</p>
                    <p className="flex justify-between"><span className="text-gray-300">Pending</span>{formatRupees(month.pending)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex gap-1 sm:gap-2">
            {data.months.map(month => (
              <span key={month.key} className="flex-1 text-center text-[10px] text-gray-500 sm:text-[11px]">
                {month.month}{month.month === 'Jan' && <span className="hidden sm:inline"> {`\u2019${String(month.year).slice(2)}`}</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#c6ddd0]" />Billed</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-700" />Collected</span>
        <span className="hidden text-gray-400 sm:inline">Hover a month for details</span>
      </div>
    </div>
  );
}

function ClientOverview({ total, active, appointments, completedAppointments }: {
  total: number; active: number; appointments: number; completedAppointments: number;
}) {
  const radius = 40, circumference = 2 * Math.PI * radius;
  const share = total > 0 ? Math.min(1, active / total) : 0;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-5">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="50" cy="50" r={radius} fill="none" stroke="#e5efe9" strokeWidth="11" />
            <circle cx="50" cy="50" r={radius} fill="none" stroke="#1f6f4a" strokeWidth="11" strokeLinecap="round"
              strokeDasharray={`${share * circumference} ${circumference}`} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold text-gray-900">{Math.round(share * 100)}%</span>
            <span className="text-[11px] text-gray-500">active</span>
          </div>
        </div>
        <div className="flex-1 space-y-2 text-sm">
          <p className="flex items-center justify-between"><span className="flex items-center gap-2 text-gray-600"><span className="h-2 w-2 rounded-full bg-emerald-700" />Active</span><span className="font-semibold text-gray-900">{formatNumber(active)}</span></p>
          <p className="flex items-center justify-between"><span className="flex items-center gap-2 text-gray-600"><span className="h-2 w-2 rounded-full bg-emerald-100" />Inactive</span><span className="font-semibold text-gray-900">{formatNumber(Math.max(0, total - active))}</span></p>
          <p className="flex items-center justify-between border-t border-gray-100 pt-2"><span className="text-gray-600">Total</span><span className="font-semibold text-gray-900">{formatNumber(total)}</span></p>
        </div>
      </div>

      <Link href="/admin/allclients?assigned=false"
        className="group mt-5 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 transition hover:border-amber-300">
        <span className="flex items-center gap-2.5 text-sm font-medium text-amber-800">
          <AlertTriangle className="h-4 w-4" />Need Assignment
        </span>
        <span className="flex items-center gap-1 text-sm text-amber-700">View clients <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
      </Link>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm">
        <span className="flex items-center gap-2.5 text-gray-600"><Calendar className="h-4 w-4 text-gray-400" />Appointments</span>
        <span className="text-gray-900"><span className="font-semibold">{formatNumber(appointments)}</span> <span className="text-gray-500">{'\u00B7'} {formatNumber(completedAppointments)} completed</span></span>
      </div>

      <Button asChild className="mt-auto w-full bg-[#1f6f4a] hover:bg-[#185a3c]">
        <Link href="/admin/allclients">View All Clients</Link>
      </Button>
    </div>
  );
}

const quickActions = [
  { href: '/admin/allclients', label: 'All Clients', icon: Users },
  { href: '/admin/users', label: 'Manage Users', icon: UserCheck },
  { href: '/admin/appointments', label: 'Appointments', icon: Calendar },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard },
  { href: '/admin/diet-templates', label: 'Templates', icon: ClipboardList },
  { href: '/admin/dietitians/list', label: 'Dietitians', icon: Stethoscope },
  { href: '/analytics', label: 'Analytics', icon: TrendingUp },
  { href: '/admin/tags', label: 'Manage Tags', icon: Tag },
];

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

export default function AdminDashboard() {
  const { data: session } = useSession();

  // Dynamic data state
  const [stats, setStats] = useState({
    totalClients: 0,
    activeClients: 0,
    totalAppointments: 0,
    completedAppointments: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
  });
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);
  const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([]);
  const [topDietitians, setTopDietitians] = useState<TopDietitian[]>([]);
  const [revenue, setRevenue] = useState<RevenueCollection | null>(null);
  const [revenueFailed, setRevenueFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshingAllSessions, setRefreshingAllSessions] = useState(false);

  const handleSystemRefresh = async () => {
    if (refreshingAllSessions) return;
    setRefreshingAllSessions(true);

    try {
      const response = await fetch('/api/admin/system-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Admin dashboard cache clear and session-safe refresh',
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || 'Unable to start the system refresh');
      }

      toast.success(
        `Refresh sent to ${result.connectedUsers || 0} connected user${result.connectedUsers === 1 ? '' : 's'}. Other users will refresh when they return.`,
      );
      window.dispatchEvent(
        new CustomEvent(SYSTEM_REFRESH_BROWSER_EVENT, { detail: result }),
      );
      setRefreshingAllSessions(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to start the system refresh',
      );
      setRefreshingAllSessions(false);
    }
  };

  // Delete alert function
  const handleDeleteAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/admin/system-alerts?id=${alertId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Refresh alerts
        fetchSystemAlerts();
      } else {
        const errorData = await response.json();
        console.error('Error deleting alert:', errorData.error);
        // Show user-friendly message for system-generated alerts
        if (response.status === 400) {
          alert('System-generated alerts cannot be deleted. They are based on current system conditions.');
        }
      }
    } catch (error) {
      console.error('Error deleting alert:', error);
    }
  };

  // Fetch admin dashboard data
  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        const response = await fetch('/api/dashboard/admin-stats');
        if (response?.ok) {
          const data = await response?.json();
          setStats(data);
        } else {
          console.error('Failed to fetch admin dashboard data');
        }
      } catch (error) {
        console.error('Error fetching admin dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAdminData();
    fetchRecentActivity();
    fetchSystemAlerts();
    fetchTopDietitians();
    fetchRevenueCollection();
  }, []);

  // Fetch recent activity
  const fetchRecentActivity = async () => {
    try {
      const response = await fetch('/api/admin/recent-activity');
      if (response.ok) {
        const data = await response.json();
        setRecentActivity(data.activities);
      }
    } catch (error) {
      console.error('Error fetching recent activity:', error);
    }
  };

  // Fetch system alerts
  const fetchSystemAlerts = async () => {
    try {
      const response = await fetch('/api/admin/system-alerts');
      if (response.ok) {
        const data = await response.json();
        setSystemAlerts(data.alerts);
      }
    } catch (error) {
      console.error('Error fetching system alerts:', error);
    }
  };

  // Fetch top dietitians
  const fetchTopDietitians = async () => {
    try {
      const response = await fetch('/api/admin/top-dietitians');
      if (response.ok) {
        const data = await response.json();
        setTopDietitians(data.topDietitians);
      }
    } catch (error) {
      console.error('Error fetching top dietitians:', error);
    }
  };

  // Fetch 12 months of billed vs collected payments (loads on its own; the page never waits for it)
  const fetchRevenueCollection = async () => {
    try {
      const response = await fetch('/api/admin/revenue-collection');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data?.months) || !data?.totals) throw new Error('Unexpected response');
      setRevenue(data);
    } catch (error) {
      console.error('Error fetching revenue and collection:', error);
      setRevenueFailed(true);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'user_signup':
        return <UserCheck className="h-4 w-4" />;
      case 'appointment':
        return <Calendar className="h-4 w-4" />;
      case 'payment':
        return <Wallet className="h-4 w-4" />;
      case 'issue':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
      case 'warning':
        return 'bg-amber-50 text-amber-700 ring-amber-100';
      case 'error':
        return 'bg-red-50 text-red-700 ring-red-100';
      default:
        return 'bg-gray-50 text-gray-600 ring-gray-200';
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'warning':
        return 'border-amber-200 bg-amber-50/70';
      case 'error':
        return 'border-red-200 bg-red-50/70';
      case 'success':
        return 'border-emerald-200 bg-emerald-50/70';
      default:
        return 'border-sky-200 bg-sky-50/70';
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <DashboardContentSkeleton />
      </DashboardLayout>
    );
  }

  const activities = recentActivity || [];
  const alerts = systemAlerts || [];
  const dietitians = (topDietitians || []).slice(0, 5);
  const topClientCount = Math.max(1, ...dietitians.map(dietitian => Number(dietitian.clients || 0)));
  const adminName = session?.user?.firstName || session?.user?.name?.split(' ')[0] || 'Admin';
  const now = new Date();

  return (
    <DashboardLayout>
      <div className="min-h-full bg-gray-50/70 p-3 sm:p-6">
        <div className="mx-auto max-w-400 space-y-5">
          {/* Header */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm text-gray-500">{todayLabel(now)}</p>
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-gray-900 sm:text-[1.75rem]">
                {greetingFor(now)}, {adminName}
              </h1>
              <p className="mt-1 text-sm text-gray-500">System overview and management</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full gap-2 bg-white sm:w-auto"
                    disabled={refreshingAllSessions}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${refreshingAllSessions ? 'animate-spin' : ''}`}
                    />
                    {refreshingAllSessions
                      ? 'Refreshing everyone\u2026'
                      : 'Clear cache & refresh all'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-green-600" />
                      Refresh every active session?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <span className="block">
                        This clears DTPS application caches and reloads connected
                        admins, dietitians, health counsellors, and clients.
                      </span>
                      <span className="block font-medium text-gray-700">
                        Authentication cookies, saved sessions, drafts, and user
                        data are preserved. Users who are offline will refresh
                        when they next open or focus the application.
                      </span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={refreshingAllSessions}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleSystemRefresh}
                      disabled={refreshingAllSessions}
                      className="gap-2 bg-green-600 hover:bg-green-700"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Refresh all sessions
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button asChild className="w-full gap-2 bg-[#1f6f4a] hover:bg-[#185a3c] sm:w-auto">
                <Link href="/admin/payments">
                  <FileBarChart className="h-4 w-4" />
                  Payments Report
                </Link>
              </Button>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard tone="emerald" title="Total Clients" value={formatNumber(stats.totalClients)}
              note={`${formatNumber(stats.activeClients)} active`} icon={<Users className="h-4.5 w-4.5" />} />
            <KpiCard tone="sky" title="Total Revenue" value={formatRupees(stats.totalRevenue)}
              note="All-time collected" icon={<IndianRupee className="h-4.5 w-4.5" />} />
            <KpiCard tone="violet" title="Monthly Revenue" value={formatRupees(stats.monthlyRevenue)}
              note="Collected this month" icon={<TrendingUp className="h-4.5 w-4.5" />} />
            <KpiCard tone="amber" title="Pending Collection"
              value={revenue ? formatRupees(revenue.totals.pending) : DASH}
              note={revenue ? `${formatNumber(revenue.totals.pendingCount)} unpaid ${'\u00B7'} last 12 months` : revenueFailed ? 'Unavailable right now' : 'Loading\u2026'}
              icon={<Hourglass className="h-4.5 w-4.5" />} />
          </div>

          {/* Revenue vs collection + client overview */}
          <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <Panel title="Revenue & Collection" description="Billed vs collected, last 12 months">
                <RevenueCollectionChart data={revenue} failed={revenueFailed} />
              </Panel>
            </div>
            <div className="xl:col-span-4">
              <Panel title="Client Overview" description="Manage all clients and assign dietitians">
                <ClientOverview total={stats.totalClients} active={stats.activeClients}
                  appointments={stats.totalAppointments} completedAppointments={stats.completedAppointments} />
              </Panel>
            </div>
          </div>

          {/* Dietitians + quick actions */}
          <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <Panel
                title="Top Dietitians"
                description="By number of assigned clients"
                action={
                  <Link href="/admin/dietitians/list" className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-emerald-700 hover:underline">
                    View All Dietitians <ArrowRight className="h-4 w-4" />
                  </Link>
                }
              >
                {dietitians.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">No dietitian data yet</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {dietitians.map((dietitian, index) => (
                      <li key={dietitian.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                        <span className="w-4 text-sm font-medium text-gray-400">{index + 1}</span>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700">
                          {initialsOf(dietitian.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="truncate text-sm font-medium text-gray-900">{dietitian.name}</p>
                            <p className="shrink-0 text-sm text-gray-600"><span className="font-semibold text-gray-900">{formatNumber(dietitian.clients)}</span> clients</p>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(Number(dietitian.clients || 0) / topClientCount) * 100}%` }} />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
            <div className="xl:col-span-4">
              <Panel title="Quick Actions" description="Common administrative tasks">
                <div className="grid grid-cols-2 gap-2.5">
                  {quickActions.map(action => {
                    const Icon = action.icon;
                    return (
                      <Link key={action.href} href={action.href}
                        className="flex items-center gap-2.5 rounded-xl border border-gray-200/70 px-3 py-3 text-sm font-medium text-gray-800 transition hover:border-emerald-200 hover:bg-emerald-50/60">
                        <Icon className="h-4.5 w-4.5 shrink-0 text-emerald-700" />
                        <span className="truncate">{action.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </Panel>
            </div>
          </div>

          {/* Activity + alerts */}
          <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <Panel
                title="Recent Activity"
                description="Latest system activities"
                action={
                  <Link href="/admin/recent-activity" className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-emerald-700 hover:underline">
                    View All Activity <ArrowRight className="h-4 w-4" />
                  </Link>
                }
              >
                {activities.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">No recent activity</p>
                ) : (
                  <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto pr-1">
                    {activities.map((activity) => (
                      <li key={activity.id} className="flex items-center gap-3 py-3 first:pt-0">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-600">
                          {getActivityIcon(activity.type)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-gray-900">{activity.message}</p>
                          <p className="text-xs text-gray-500">{activity.time}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ${getStatusColor(activity.status)}`}>
                          {activity.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
            <div className="xl:col-span-4">
              <Panel
                title="System Alerts"
                description="Notifications that need attention"
                action={alerts.length > 0 ? (
                  <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-100">
                    <Bell className="h-3 w-3" />{alerts.length}
                  </span>
                ) : undefined}
              >
                {alerts.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">No alerts right now</p>
                ) : (
                  <ul className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
                    {alerts.map((alert) => (
                      <li key={alert.id} className={`rounded-xl border px-3.5 py-3 ${getAlertColor(alert.type)}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-900">{alert.message}</p>
                            <p className="mt-1 text-xs text-gray-500">{alert.time}</p>
                          </div>
                          {isAlertDeletable(alert.id) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAlert(alert.id)}
                              className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                              title="Delete alert"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : (
                            <div
                              className="flex h-8 w-8 items-center justify-center p-0 text-gray-400"
                              title="System-generated alert (cannot be deleted)"
                            >
                              <AlertTriangle className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
