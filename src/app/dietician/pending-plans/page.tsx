'use client';

import { useState, useEffect } from 'react';
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
      const response = await fetch('/api/dashboard/pending-plans');
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
  const filteredPlans = pendingPlans.filter(plan => {
    // Text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch = plan.clientName.toLowerCase().includes(q) ||
        plan.email.toLowerCase().includes(q) ||
        plan.phone.includes(searchQuery);
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
  });

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center min-h-100">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-teal-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading pending plans...</p>
          </div>
        </div>
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

        {/* Search + Filter Toggle */}
        <div className="dietitian-pending-plans-search-row flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search clients by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
          <Button
            size="sm"
            variant={filtersOpen ? 'default' : 'outline'}
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="h-10 gap-1.5 shrink-0"
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 px-1 flex items-center justify-center text-xs rounded-full">
                {activeFilterCount}
              </Badge>
            )}
            {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          {activeFilterCount > 0 && (
            <Button size="sm" variant="ghost" onClick={clearFilters} className="h-10 text-red-600 hover:text-red-700 gap-1 shrink-0">
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        {/* Advanced Filters Panel */}
        {filtersOpen && (
          <Card className="border-gray-200">
            <CardContent className="px-4 py-3 space-y-3">
              {/* Row 1 */}
              <div className="pending-plans-filters-grid-1 grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Urgency</label>
                  <Select value={urgencyFilter} onValueChange={(v) => setUrgencyFilter(v === '_all' ? '' : v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High Priority</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Reason</label>
                  <Select value={reasonFilter} onValueChange={(v) => setReasonFilter(v === '_all' ? '' : v)}>
                    <SelectTrigger className="h-8 text-sm">
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
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Remaining Days</label>
                  <Select value={remainingDaysFilter} onValueChange={(v) => setRemainingDaysFilter(v === '_all' ? '' : v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">Any</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="0-3">0–3 days</SelectItem>
                      <SelectItem value="4+">4+ days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Pending Meal Days</label>
                  <Select value={pendingDaysFilter} onValueChange={(v) => setPendingDaysFilter(v === '_all' ? '' : v)}>
                    <SelectTrigger className="h-8 text-sm">
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
              </div>

              {/* Row 2 */}
              <div className="pending-plans-filters-grid-2 grid grid-cols-2 md:grid-cols-5 gap-x-3 gap-y-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Dietitian</label>
                  <Select value={dietitianFilter} onValueChange={(v) => setDietitianFilter(v === '_all' ? '' : v)}>
                    <SelectTrigger className="h-8 text-sm">
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
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Plan Name</label>
                  <Input className="h-8 text-sm" placeholder="Search plan..." value={planNameFilter} onChange={(e) => setPlanNameFilter(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Plan Start From</label>
                  <Input type="date" className="h-8 text-sm" value={planDateFrom} onChange={(e) => setPlanDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Plan End To</label>
                  <Input type="date" className="h-8 text-sm" value={planDateTo} onChange={(e) => setPlanDateTo(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <div className="flex items-center gap-2 w-full">
                    <Button size="sm" variant="outline" onClick={clearFilters} className="h-8 text-xs">
                      Reset
                    </Button>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {filteredPlans.length} / {pendingPlans.length}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
            {/* Mobile Cards View */}
            <div className="lg:hidden space-y-4">
              {filteredPlans.map((plan) => (
                <Card
                  key={plan.clientId}
                  className={`${plan.urgency === 'critical' ? 'border-red-300 bg-red-50/50' :
                    plan.urgency === 'high' ? 'border-amber-300 bg-amber-50/50' :
                      'border-gray-200'
                    }`}
                >
                  <CardContent className="p-4">
                    {/* Header with ID and Priority Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <Link
                        href={`/dietician/clients/${plan.clientId}`}
                        className="text-blue-600 hover:underline font-medium text-sm"
                      >
                        {plan.displayClientId || `C-${plan.clientId.toString().slice(-4).toUpperCase()}`}
                      </Link>
                      <Badge className={`text-xs font-semibold ${plan.urgency === 'critical' || plan.currentPlanRemainingDays <= 0
                        ? 'bg-red-600 text-white border border-red-700' :
                        plan.urgency === 'high' || (plan.currentPlanRemainingDays >= 1 && plan.currentPlanRemainingDays <= 3)
                          ? 'bg-orange-500 text-white border border-orange-600' :
                          'bg-yellow-500 text-gray-900 border border-yellow-600'
                        }`}>
                        {plan.urgency === 'critical' || plan.currentPlanRemainingDays <= 0
                          ? '🔴 Critical' :
                          plan.urgency === 'high' || (plan.currentPlanRemainingDays >= 1 && plan.currentPlanRemainingDays <= 3)
                            ? '🟠 High Priority' :
                            '🟡 Medium Priority'}
                      </Badge>
                    </div>

                    {/* Client Info */}
                    <div className="mb-3">
                      <p className="font-semibold text-gray-900">{plan.clientName}</p>
                      <p className="text-xs text-gray-500">{plan.email}</p>
                      <div className="flex items-center gap-1 text-gray-600 mt-1">
                        <Phone className="h-3 w-3" />
                        <span className="text-xs">{plan.phone}</span>
                      </div>
                    </div>

                    {/* Plan Info Grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                      <div>
                        <p className="text-gray-500 font-medium">Current Plan</p>
                        <p className="text-gray-900 truncate">
                          {plan.currentPlanName || plan.upcomingPlanName || plan.purchasedPlanName || 'NA'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">Previous Plan</p>
                        <p className="text-gray-900 truncate">{plan.previousPlanName || 'NA'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">Remaining</p>
                        <Badge className={`text-xs font-semibold ${plan.currentPlanRemainingDays <= 0 ? 'bg-red-600 text-white' :
                          plan.currentPlanRemainingDays <= 3 ? 'bg-orange-500 text-white' :
                            'bg-yellow-500 text-gray-900'
                          }`}>
                          {plan.currentPlanRemainingDays <= 0 ? 'Expired' : `${plan.currentPlanRemainingDays} days`}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">Pending Days</p>
                        <Badge className={`text-xs ${plan.pendingDaysToCreate > 14 ? 'bg-red-500 text-white' :
                          plan.pendingDaysToCreate > 7 ? 'bg-amber-500 text-white' :
                            'bg-teal-500 text-white'
                          }`}>
                          {plan.pendingDaysToCreate} days
                        </Badge>
                      </div>
                    </div>

                    {/* Expected Dates */}
                    {plan.expectedStartDate && plan.expectedEndDate && (
                      <div className="text-xs text-amber-600 mb-3">
                        <span className="text-gray-500">Expected: </span>
                        {format(new Date(plan.expectedStartDate), 'dd MMM')} - {format(new Date(plan.expectedEndDate), 'dd MMM yyyy')}
                      </div>
                    )}

                    {/* Progress */}
                    <div className="text-xs text-gray-500 mb-3">
                      {plan.totalMealPlanDays} of {plan.totalPurchasedDays} days created
                    </div>

                    {/* Action Button */}
                    <Button
                      size="sm"
                      className="w-full text-xs bg-green-600 hover:bg-green-700 text-white"
                      asChild
                    >
                      <Link href={`/dietician/clients/${plan.clientId}`}>
                        <ExternalLink className="h-3 w-3 mr-1" />
                        {plan.reason === 'no_meal_plan' ? 'Create Plan' : 'Create Phase'}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Desktop Table View */}
            <Card className="hidden lg:block">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Client ID</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Client</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Phone</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Previous Plan</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Current Plan</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Plan Dates</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Expected Dates</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Remaining Days</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Pending Meal Days</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredPlans.map((plan) => (
                        <tr
                          key={plan.clientId}
                          className={`hover:bg-gray-50 transition-colors ${plan.urgency === 'critical' ? 'bg-red-50/50' :
                            plan.urgency === 'high' ? 'bg-amber-50/50' : ''
                            }`}
                        >
                          <td className="px-4 py-3">
                            <Link
                              href={`/dietician/clients/${plan.clientId}`}
                              className="text-blue-600 hover:underline font-medium text-xs"
                            >
                              {plan.displayClientId || `C-${plan.clientId.toString().slice(-4).toUpperCase()}`}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900">{plan.clientName}</p>
                              <p className="text-xs text-gray-500">{plan.email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 text-gray-600">
                              <Phone className="h-3 w-3" />
                              <span className="text-xs">{plan.phone}</span>
                            </div>
                          </td>
                          {/* Previous Plan */}
                          <td className="px-4 py-3">
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
                          <td className="px-4 py-3">
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
                          <td className="px-4 py-3 text-center">
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
                          <td className="px-4 py-3 text-center">
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
                          <td className="px-4 py-3 text-center">
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
                          <td className="px-4 py-3 text-center">
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
                          <td className="px-4 py-3 text-center">
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
              </CardContent>
            </Card>
          </>
        )}

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
