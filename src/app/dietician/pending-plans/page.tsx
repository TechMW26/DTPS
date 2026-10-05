'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Phone,
  Loader2,
  Search,
  RefreshCw,
  Filter,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import '@/components/admin/user-filters.css';
import '@/components/clients/client-filters.css';
import { DashboardContentSkeleton } from '@/components/ui/skeleton';

interface PendingPlan {
  clientId: string;
  displayClientId?: string;
  assignedDietitianId?: string;
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

export default function PendingPlansPage() {
  const { data: session } = useSession();
  const [pendingPlans, setPendingPlans] = useState<PendingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [criticalCount, setCriticalCount] = useState(0);
  const [highCount, setHighCount] = useState(0);
  const [mediumCount, setMediumCount] = useState(0);

  // Filter state
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [planNameFilter, setPlanNameFilter] = useState('');
  const [remainingDaysFilter, setRemainingDaysFilter] = useState('');
  const [pendingDaysFilter, setPendingDaysFilter] = useState('');
  const [planDateFrom, setPlanDateFrom] = useState('');
  const [planDateTo, setPlanDateTo] = useState('');
  const [dietitianFilter, setDietitianFilter] = useState('');
  const [dietitians, setDietitians] = useState<Array<{ _id: string; firstName: string; lastName: string }>>([])

  const activeFilterCount = [urgencyFilter, reasonFilter, planNameFilter, remainingDaysFilter, pendingDaysFilter, planDateFrom, planDateTo, dietitianFilter].filter(Boolean).length;

  const clearFilters = () => {
    setUrgencyFilter('');
    setReasonFilter('');
    setPlanNameFilter('');
    setRemainingDaysFilter('');
    setPendingDaysFilter('');
    setPlanDateFrom('');
    setPlanDateTo('');
    setDietitianFilter('');
  };

  // Fetch pending plans
  const fetchPendingPlans = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/dashboard/pending-plans', {
        cache: 'no-store',
      });
      if (response.ok) {
        const text = await response.text();
        if (text) {
          const data = JSON.parse(text);
          setPendingPlans(data.pendingPlans || []);
          setCriticalCount(data.criticalCount || 0);
          setHighCount(data.highCount || 0);
          setMediumCount(data.mediumCount || 0);
        } else {
          setPendingPlans([]);
          setCriticalCount(0);
          setHighCount(0);
          setMediumCount(0);
        }
      } else {
        console.error('Failed to fetch pending plans');
        setPendingPlans([]);
      }
    } catch (error) {
      console.error('Error fetching pending plans:', error);
      setPendingPlans([]);
      setCriticalCount(0);
      setHighCount(0);
      setMediumCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingPlans();
  }, []);

  // Fetch dietitians for filter
  useEffect(() => {
    const fetchDietitians = async () => {
      try {
        const response = await fetch('/api/users/dietitians?excludeHealthCounselors=true');
        if (response.ok) {
          const data = await response.json();
          setDietitians(data.dietitians || []);
        }
      } catch (error) {
        console.error('Error fetching dietitians:', error);
      }
    };
    fetchDietitians();
  }, []);

  // Filter plans based on search + filters
  const filteredPlans = useMemo(() => pendingPlans.filter(plan => {
    // Text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch = plan.clientName.toLowerCase().includes(q) ||
        (plan.email || '').toLowerCase().includes(q) ||
        (plan.phone || '').includes(searchQuery) || (plan.displayClientId || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }

    // Urgency filter
    if (urgencyFilter && plan.urgency !== urgencyFilter) return false;

    // Reason filter
    if (reasonFilter && plan.reason !== reasonFilter) return false;

    // Plan name filter
    if (planNameFilter) {
      const pn = planNameFilter.toLowerCase();
      const matchesPlan =
        (plan.currentPlanName?.toLowerCase().includes(pn)) ||
        (plan.purchasedPlanName?.toLowerCase().includes(pn)) ||
        (plan.previousPlanName?.toLowerCase().includes(pn)) ||
        (plan.upcomingPlanName?.toLowerCase().includes(pn));
      if (!matchesPlan) return false;
    }

    // Remaining days filter
    if (remainingDaysFilter) {
      const d = plan.currentPlanRemainingDays;
      if (remainingDaysFilter === 'expired' && d > 0) return false;
      if (remainingDaysFilter === '0-3' && (d < 0 || d > 3)) return false;
      if (remainingDaysFilter === '4+' && d < 4) return false;
    }

    // Pending days filter
    if (pendingDaysFilter) {
      const pd = plan.pendingDaysToCreate;
      if (pendingDaysFilter === 'high' && pd <= 14) return false;
      if (pendingDaysFilter === 'medium' && (pd <= 7 || pd > 14)) return false;
      if (pendingDaysFilter === 'low' && pd > 7) return false;
    }

    // Dietitian filter
    if (dietitianFilter && plan.assignedDietitianId !== dietitianFilter) return false;

    // Plan date range filter
    if (planDateFrom) {
      const from = new Date(planDateFrom);
      const planStart = plan.currentPlanStartDate ? new Date(plan.currentPlanStartDate) :
        plan.upcomingPlanStartDate ? new Date(plan.upcomingPlanStartDate) : null;
      if (!planStart || planStart < from) return false;
    }
    if (planDateTo) {
      const to = new Date(planDateTo);
      to.setHours(23, 59, 59, 999);
      const planEnd = plan.currentPlanEndDate ? new Date(plan.currentPlanEndDate) :
        plan.upcomingPlanEndDate ? new Date(plan.upcomingPlanEndDate) : null;
      if (!planEnd || planEnd > to) return false;
    }

    return true;
  }), [pendingPlans, searchQuery, urgencyFilter, reasonFilter, planNameFilter, remainingDaysFilter, pendingDaysFilter, dietitianFilter, planDateFrom, planDateTo]);
  useEffect(() => { setPage(1); }, [searchQuery, urgencyFilter, reasonFilter, planNameFilter, remainingDaysFilter, pendingDaysFilter, dietitianFilter, planDateFrom, planDateTo]);
  const pageCount = Math.max(1, Math.ceil(filteredPlans.length / 50));
  const currentPage = Math.min(page, pageCount);
  const visiblePlans = filteredPlans.slice((currentPage - 1) * 50, currentPage * 50);

  if (loading) {
    return (
      <DashboardLayout>
        <DashboardContentSkeleton statCards={3} sections={2} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="dietitian-pending-plans-page p-6 space-y-4">
        {/* Header */}
        <div className="dietitian-pending-plans-header flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Pending Plans</h1>
            <p className="text-gray-600 mt-1">
              Clients requiring meal plan attention
            </p>
          </div>
          <div className="dietitian-pending-plans-header-actions flex items-center gap-3">
            <Badge className="bg-teal-100 text-teal-700 border-teal-200 px-3 py-1">
              <Users className="h-4 w-4 mr-1" />
              {pendingPlans.length} Clients
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchPendingPlans}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-700 font-medium">Critical</p>
                  <p className="text-3xl font-bold text-red-600">{criticalCount}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
              </div>
              <p className="text-xs text-red-600 mt-2">Needs immediate attention</p>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-700 font-medium">High Priority</p>
                  <p className="text-3xl font-bold text-amber-600">{highCount}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                </div>
              </div>
              <p className="text-xs text-amber-600 mt-2">Plan ending soon</p>
            </CardContent>
          </Card>

          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-700 font-medium">Medium</p>
                  <p className="text-3xl font-bold text-green-600">{mediumCount}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <p className="text-xs text-green-600 mt-2">Can be scheduled</p>
            </CardContent>
          </Card>
        </div>

        <section className="user-filters client-filters" aria-labelledby="pending-filter-title">
          <div className="user-filter-heading"><div><h2 id="pending-filter-title"><Filter size={16} aria-hidden="true" /> Find pending plans</h2><p>Find clients who need a plan, or narrow the list by priority and dates.</p></div><button type="button" className="user-filter-reset" disabled={!searchQuery && !activeFilterCount} onClick={() => {setSearchQuery('');clearFilters();}}>Clear all</button></div>
          <div className="user-filter-primary client-filter-primary">
            <div className="user-filter-field user-filter-search"><label htmlFor="pending-search">Search clients</label><div className="user-filter-search-box"><Search size={18} aria-hidden="true" /><Input id="pending-search" type="search" className="user-filter-control" placeholder="Name, email, phone or ID" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div></div>
                <div className="user-filter-field">
                  <label htmlFor="pending-urgency">Urgency</label>
                  <Select value={urgencyFilter} onValueChange={(v) => setUrgencyFilter(v === '_all' ? '' : v)}>
                    <SelectTrigger id="pending-urgency" className="user-filter-control">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High Priority</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>                <div className="user-filter-field">
                  <label htmlFor="pending-reason">Reason</label>
                  <Select value={reasonFilter} onValueChange={(v) => setReasonFilter(v === '_all' ? '' : v)}>
                    <SelectTrigger id="pending-reason" className="user-filter-control">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All</SelectItem>
                      <SelectItem value="no_meal_plan">No Meal Plan</SelectItem>
                      <SelectItem value="current_ending_soon">Ending Soon</SelectItem>
                      <SelectItem value="phase_gap">Phase Gap</SelectItem>
                      <SelectItem value="upcoming_with_pending">Upcoming Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
            <button type="button" className="user-filter-more" aria-expanded={filtersOpen} aria-controls="pending-advanced" onClick={() => setFiltersOpen(!filtersOpen)}>More filters {activeFilterCount > 0 && <span className="user-filter-count">{activeFilterCount}</span>}<ChevronDown size={16} aria-hidden="true" /></button>
          </div>
          <div id="pending-advanced" className="client-filter-advanced" hidden={!filtersOpen}>
            <section className="client-filter-group"><h3>Meal plan & care team</h3><div className="client-filter-plan">
                <div className="user-filter-field">
                  <label htmlFor="pending-dietitian">Dietitian</label>
                  <Select value={dietitianFilter} onValueChange={(v) => setDietitianFilter(v === '_all' ? '' : v)}>
                    <SelectTrigger id="pending-dietitian" className="user-filter-control">
                      <SelectValue placeholder="All Dietitians" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All Dietitians</SelectItem>
                      {dietitians.map(dt => (
                        <SelectItem key={dt._id} value={dt._id}>
                          {dt.firstName} {dt.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>                <div className="user-filter-field">
                  <label htmlFor="pending-plan-name">Plan Name</label>
                  <Input id="pending-plan-name" className="user-filter-control" placeholder="Search plan..." value={planNameFilter} onChange={(e) => setPlanNameFilter(e.target.value)} />
                </div>                <div className="user-filter-field">
                  <label htmlFor="pending-remaining-days">Remaining Days</label>
                  <Select value={remainingDaysFilter} onValueChange={(v) => setRemainingDaysFilter(v === '_all' ? '' : v)}>
                    <SelectTrigger id="pending-remaining-days" className="user-filter-control">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">Any</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="0-3">0–3 days</SelectItem>
                      <SelectItem value="4+">4+ days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>                <div className="user-filter-field">
                  <label htmlFor="pending-pending-meal-days">Pending Meal Days</label>
                  <Select value={pendingDaysFilter} onValueChange={(v) => setPendingDaysFilter(v === '_all' ? '' : v)}>
                    <SelectTrigger id="pending-pending-meal-days" className="user-filter-control">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">Any</SelectItem>
                      <SelectItem value="high">High (14+)</SelectItem>
                      <SelectItem value="medium">Medium (8–14)</SelectItem>
                      <SelectItem value="low">Low (1–7)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
            </div></section>
            <section className="client-filter-group"><h3>Plan dates</h3><div className="client-filter-columns">
                <div className="user-filter-field">
                  <label htmlFor="pending-plan-start-from">Plan Start From</label>
                  <Input id="pending-plan-start-from" type="date" className="user-filter-control" value={planDateFrom} onChange={(e) => setPlanDateFrom(e.target.value)} />
                </div>                <div className="user-filter-field">
                  <label htmlFor="pending-plan-end-to">Plan End To</label>
                  <Input id="pending-plan-end-to" type="date" className="user-filter-control" value={planDateTo} onChange={(e) => setPlanDateTo(e.target.value)} />
                </div>
            </div></section>
          </div>
          <div className="user-filter-summary"><p role="status">{filteredPlans.length.toLocaleString()} clients{activeFilterCount || searchQuery ? ' matching your filters' : ' requiring attention'}. Filters update automatically.</p></div>
        </section>

        {/* Pending Plans - Responsive */}
        {filteredPlans.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700">
                {searchQuery || activeFilterCount > 0 ? 'No Results Found' : 'No Pending Plans Available'}
              </h3>
              <p className="text-gray-500 mt-2">
                {searchQuery || activeFilterCount > 0 ? 'No clients match your search or filter criteria.' : 'No pending plans available.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* One responsive list for all viewport sizes */}
            <Card>
              <CardContent className="p-0">
                <div data-table-scroll="true" tabIndex={0} role="region" aria-label="Scrollable table" className="overflow-x-auto">
                  <table role="table" data-slot="table" data-responsive-table="cards" aria-label="Pending plans" className="w-full text-sm">
                    <thead role="rowgroup" className="bg-gray-100">
                      <tr role="row">
                        <th scope="col" className="px-4 py-3 text-left font-semibold text-gray-700">Client ID</th>
                        <th scope="col" className="px-4 py-3 text-left font-semibold text-gray-700">Client</th>
                        <th scope="col" className="px-4 py-3 text-left font-semibold text-gray-700">Phone</th>
                        <th scope="col" className="px-4 py-3 text-left font-semibold text-gray-700">Previous Plan</th>
                        <th scope="col" className="px-4 py-3 text-left font-semibold text-gray-700">Current Plan</th>
                        <th scope="col" className="px-4 py-3 text-center font-semibold text-gray-700">Plan Dates</th>
                        <th scope="col" className="px-4 py-3 text-center font-semibold text-gray-700">Expected Dates</th>
                        <th scope="col" className="px-4 py-3 text-center font-semibold text-gray-700">Remaining Days</th>
                        <th scope="col" className="px-4 py-3 text-center font-semibold text-gray-700">Pending Meal Days</th>
                        <th data-table-actions="true" scope="col" className="px-4 py-3 text-center font-semibold text-gray-700">Action</th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup" className="divide-y divide-gray-100">
                      {visiblePlans.map((plan) => (
                        <tr role="row"
                          key={plan.clientId}
                          className={`hover:bg-gray-50 transition-colors ${plan.urgency === 'critical' ? 'bg-red-50/50' :
                            plan.urgency === 'high' ? 'bg-amber-50/50' : ''
                            }`}
                        >
                          <td role="cell" data-label="Client ID" className="px-4 py-3">
                            <Link
                              prefetch={false}
                        href={`/dietician/clients/${plan.clientId}`}
                              className="text-blue-600 hover:underline font-medium text-xs"
                            >
                              {plan.displayClientId || `C-${plan.clientId.toString().slice(-4).toUpperCase()}`}
                            </Link>
                          </td>
                          <td role="cell" data-label="Client" className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900">{plan.clientName}</p>
                              <p className="text-xs text-gray-500">{plan.email}</p>
                            </div>
                          </td>
                          <td role="cell" data-label="Phone" className="px-4 py-3">
                            <div className="flex items-center gap-1 text-gray-600">
                              <Phone className="h-3 w-3" />
                              <span className="text-xs">{plan.phone}</span>
                            </div>
                          </td>
                          {/* Previous Plan */}
                          <td role="cell" data-label="Previous Plan" className="px-4 py-3">
                            {plan.previousPlanName ? (
                              <div>
                                <p className="font-medium text-gray-700 text-xs truncate max-w-30">
                                  {plan.previousPlanName}
                                </p>
                                {plan.previousPlanEndDate && (
                                  <p className="text-xs text-gray-400">
                                    Ended: {format(new Date(plan.previousPlanEndDate), 'dd MMM')}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500 font-medium">NA</span>
                            )}
                          </td>
                          {/* Current Plan */}
                          <td role="cell" data-label="Current Plan" className="px-4 py-3">
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
                          {/* Plan Dates */}
                          <td role="cell" data-label="Plan Dates" className="px-4 py-3 text-center">
                            {plan.currentPlanStartDate && plan.currentPlanEndDate ? (
                              <div className="text-xs">
                                <p className="text-gray-600 font-medium">
                                  {format(new Date(plan.currentPlanStartDate), 'dd MMM')}
                                </p>
                                <p className="text-gray-400">to</p>
                                <p className="text-gray-600 font-medium">
                                  {format(new Date(plan.currentPlanEndDate), 'dd MMM yyyy')}
                                </p>
                              </div>
                            ) : plan.upcomingPlanStartDate && plan.upcomingPlanEndDate ? (
                              <div className="text-xs">
                                <p className="text-blue-600 font-medium">
                                  {format(new Date(plan.upcomingPlanStartDate), 'dd MMM')}
                                </p>
                                <p className="text-gray-400">to</p>
                                <p className="text-blue-600 font-medium">
                                  {format(new Date(plan.upcomingPlanEndDate), 'dd MMM yyyy')}
                                </p>
                                <Badge className="bg-blue-100 text-blue-700 text-xs mt-1">Upcoming</Badge>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          {/* Expected Dates */}
                          <td role="cell" data-label="Expected Dates" className="px-4 py-3 text-center">
                            {plan.expectedStartDate && plan.expectedEndDate ? (
                              <div className="text-xs">
                                <p className="text-amber-600 font-medium">
                                  {format(new Date(plan.expectedStartDate), 'dd MMM')}
                                </p>
                                <p className="text-gray-400">to</p>
                                <p className="text-amber-600 font-medium">
                                  {format(new Date(plan.expectedEndDate), 'dd MMM yyyy')}
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          {/* Remaining Days */}
                          <td role="cell" data-label="Remaining Days" className="px-4 py-3 text-center">
                            <Badge className={`font-semibold ${plan.currentPlanRemainingDays <= 0
                              ? 'bg-red-600 text-white border border-red-700' :
                              plan.currentPlanRemainingDays <= 3
                                ? 'bg-orange-500 text-white border border-orange-600' :
                                'bg-yellow-500 text-gray-900 border border-yellow-600'
                              }`}>
                              {plan.currentPlanRemainingDays <= 0
                                ? '🔴 Expired'
                                : plan.currentPlanRemainingDays <= 3
                                  ? `🟠 ${plan.currentPlanRemainingDays} days left`
                                  : `🟡 ${plan.currentPlanRemainingDays} days left`}
                            </Badge>
                          </td>
                          {/* Pending Meal Days */}
                          <td role="cell" data-label="Pending Meal Days" className="px-4 py-3 text-center">
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
                          <td role="cell" data-label="Action" className="px-4 py-3 text-center">
                            <Button
                              size="sm"
                              className="text-xs bg-green-600 hover:bg-green-700 text-white"
                              asChild
                            >
                              <Link prefetch={false}
                        href={`/dietician/clients/${plan.clientId}`}>
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
              </CardContent>
            </Card>
          </>
        )}

        {filteredPlans.length > 0 && <nav aria-label="Pending plans pagination" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">Showing {(currentPage - 1) * 50 + 1}–{Math.min(currentPage * 50, filteredPlans.length)} of {filteredPlans.length.toLocaleString()} clients</p>
          <div className="flex items-center gap-3"><Button variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span className="text-sm">Page {currentPage} of {pageCount}</span><Button variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
        </nav>}
        <style jsx global>{`
          @media (max-width: 768px) {
            /* mobile only — max-width: 768px */
            .dietitian-pending-plans-page {
              padding: 16px;
              overflow-x: hidden;
            }

            .dietitian-pending-plans-page .text-xs {
              font-size: 14px;
            }

            .dietitian-pending-plans-page button,
            .dietitian-pending-plans-page input,
            .dietitian-pending-plans-page [role='button'],
            .dietitian-pending-plans-page [role='combobox'] {
              min-height: 44px;
            }

            .dietitian-pending-plans-header,
            .dietitian-pending-plans-header-actions,
            .dietitian-pending-plans-search-row {
              width: 100%;
              flex-direction: column;
              align-items: stretch;
            }

            .pending-plans-filters-grid-1,
            .pending-plans-filters-grid-2 {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </DashboardLayout>
  );
}
