'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
// If you still get an error, check if the file exists at src/components/ui/card.tsx
// If your Card component is in a different location, update the import path accordingly, e.g.:
// import { Card, CardContent } from '../../components/ui/card';
// or
// import { Card, CardContent } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Users,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Phone,
  Loader2,
  Search,
  RefreshCw,
  Eye
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

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

export default function HealthCounselorPendingPlansPage() {
  const { data: session, status } = useSession();
  const [pendingPlans, setPendingPlans] = useState<PendingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [criticalCount, setCriticalCount] = useState(0);
  const [highCount, setHighCount] = useState(0);
  const [mediumCount, setMediumCount] = useState(0);

  const fetchPendingPlans = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/dashboard/pending-plans');
      if (response.ok) {
        const text = await response.text();
        if (text) {
          try {
            const data = JSON.parse(text);
            setPendingPlans(data.pendingPlans || []);
            setCriticalCount(data.criticalCount || 0);
            setHighCount(data.highCount || 0);
            setMediumCount(data.mediumCount || 0);
          } catch (parseError) {
            console.error('Error parsing response:', parseError);
            setPendingPlans([]);
            setCriticalCount(0);
            setHighCount(0);
            setMediumCount(0);
          }
        } else {
          setPendingPlans([]);
          setCriticalCount(0);
          setHighCount(0);
          setMediumCount(0);
        }
      } else {
        console.error('Failed to fetch pending plans:', response.status);
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

  // Only fetch when session is authenticated
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchPendingPlans();
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status, session?.user?.id]);

  const filteredPlans = pendingPlans.filter(plan => 
    plan.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    plan.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    plan.phone.includes(searchQuery)
  );

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
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Pending Plans</h1>
            <p className="text-gray-600 mt-1">
              View clients requiring meal plan attention
            </p>
          </div>
          <div className="flex items-center gap-3">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

        {/* Search */}
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search clients by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Pending Plans */}
        {filteredPlans.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700">
                {searchQuery ? 'No Results Found' : 'No Pending Plans Available'}
              </h3>
              <p className="text-gray-500 mt-2">
                {searchQuery ? 'No clients match your search criteria.' : 'No pending plans available.'}
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
                  className={`${
                    plan.urgency === 'critical' ? 'border-red-300 bg-red-50/50' : 
                    plan.urgency === 'high' ? 'border-amber-300 bg-amber-50/50' : 
                    'border-gray-200'
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Link 
                        href={`/health-counselor/clients/${plan.clientId}`}
                        className="text-blue-600 hover:underline font-medium text-sm"
                      >
                        P-{plan.clientId.toString().slice(-4).toUpperCase()}
                      </Link>
                      <Badge className={`text-xs font-semibold ${
                        plan.urgency === 'critical' || plan.currentPlanRemainingDays <= 0 
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

                    <div className="mb-3">
                      <p className="font-semibold text-gray-900">{plan.clientName}</p>
                      <p className="text-xs text-gray-500">{plan.email}</p>
                      <div className="flex items-center gap-1 text-gray-600 mt-1">
                        <Phone className="h-3 w-3" />
                        <span className="text-xs">{plan.phone}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                      <div>
                        <p className="text-gray-500 font-medium">Current Plan</p>
                        <p className="text-gray-900 truncate">
                          {plan.currentPlanName || plan.upcomingPlanName || plan.purchasedPlanName || 'NA'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">Remaining</p>
                        <Badge className={`text-xs font-semibold ${
                          plan.currentPlanRemainingDays <= 0 ? 'bg-red-600 text-white' :
                          plan.currentPlanRemainingDays <= 3 ? 'bg-orange-500 text-white' :
                          'bg-yellow-500 text-gray-900'
                        }`}>
                          {plan.currentPlanRemainingDays <= 0 ? 'Expired' : `${plan.currentPlanRemainingDays} days`}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">Pending Days</p>
                        <Badge className={`text-xs ${
                          plan.pendingDaysToCreate > 14 ? 'bg-red-500 text-white' :
                          plan.pendingDaysToCreate > 7 ? 'bg-amber-500 text-white' :
                          'bg-teal-500 text-white'
                        }`}>
                          {plan.pendingDaysToCreate} days
                        </Badge>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">Progress</p>
                        <p className="text-gray-700">{plan.totalMealPlanDays}/{plan.totalPurchasedDays}</p>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      asChild
                    >
                      <Link href={`/health-counselor/clients/${plan.clientId}`}>
                        <Eye className="h-3 w-3 mr-1" />
                        View Client
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
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Current Plan</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Remaining Days</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Pending Days</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Urgency</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredPlans.map((plan) => (
                        <tr 
                          key={plan.clientId} 
                          className={`hover:bg-gray-50 transition-colors ${
                            plan.urgency === 'critical' ? 'bg-red-50/50' : 
                            plan.urgency === 'high' ? 'bg-amber-50/50' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <Link 
                              href={`/health-counselor/clients/${plan.clientId}`}
                              className="text-blue-600 hover:underline font-medium text-xs"
                            >
                              P-{plan.clientId.toString().slice(-4).toUpperCase()}
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
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-800 truncate max-w-35">
                              {plan.currentPlanName || plan.upcomingPlanName || plan.purchasedPlanName || 'NA'}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={`font-semibold ${
                              plan.currentPlanRemainingDays <= 0 
                                ? 'bg-red-600 text-white border border-red-700' :
                              plan.currentPlanRemainingDays <= 3 
                                ? 'bg-orange-500 text-white border border-orange-600' :
                                'bg-yellow-500 text-gray-900 border border-yellow-600'
                            }`}>
                              {plan.currentPlanRemainingDays <= 0 
                                ? '🔴 Expired' 
                                : plan.currentPlanRemainingDays <= 3 
                                  ? `🟠 ${plan.currentPlanRemainingDays} days` 
                                  : `🟡 ${plan.currentPlanRemainingDays} days`}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={`${
                              plan.pendingDaysToCreate > 14 ? 'bg-red-500 text-white' :
                              plan.pendingDaysToCreate > 7 ? 'bg-amber-500 text-white' :
                              'bg-teal-500 text-white'
                            }`}>
                              {plan.pendingDaysToCreate} days
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={`text-xs font-semibold ${
                              plan.urgency === 'critical' || plan.currentPlanRemainingDays <= 0 
                                ? 'bg-red-600 text-white border border-red-700' :
                              plan.urgency === 'high' || (plan.currentPlanRemainingDays >= 1 && plan.currentPlanRemainingDays <= 3)
                                ? 'bg-orange-500 text-white border border-orange-600' :
                                'bg-yellow-500 text-gray-900 border border-yellow-600'
                            }`}>
                              {plan.urgency === 'critical' || plan.currentPlanRemainingDays <= 0 
                                ? '🔴 Critical' :
                              plan.urgency === 'high' || (plan.currentPlanRemainingDays >= 1 && plan.currentPlanRemainingDays <= 3)
                                ? '🟠 High' :
                                '🟡 Medium'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              asChild
                            >
                              <Link href={`/health-counselor/clients/${plan.clientId}`}>
                                <Eye className="h-3 w-3 mr-1" />
                                View
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
      </div>
    </DashboardLayout>
  );
}
