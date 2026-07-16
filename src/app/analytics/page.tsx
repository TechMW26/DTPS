'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { formatDateTimeIST } from '@/lib/utils/formatDateIST';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import {
  Users,
  Calendar,
  DollarSign,
  TrendingUp,
  Activity,
  Target,
  Clock,
  Award,
  ShoppingCart,
  Package,
  CreditCard,
  RefreshCw
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';

interface AnalyticsData {
  totalClients: number;
  activeClients: number;
  totalAppointments: number;
  completedAppointments: number;
  totalRevenue: number;
  monthlyRevenue: number;
  avgSessionDuration: number;
  clientRetentionRate: number;
  appointmentsByMonth: Array<{ month: string; appointments: number; revenue: number }>;
  clientProgress: Array<{ clientName: string; weightLoss: number; adherence: number }>;
  appointmentTypes: Array<{ type: string; count: number; revenue: number }>;
  revenueByMonth: Array<{ month: string; revenue: number }>;
}

interface WooCommerceOrder {
  id: number;
  orderNumber: string;
  status: string;
  total: number;
  currency: string;
  dateCreated: string;
  dateModified: string;
  datePaid: string | null;
  customer: {
    name: string;
    email: string;
    phone: string;
    city: string;
    country: string;
  };
  shipping: {
    name: string;
    city: string;
    country: string;
  };
  payment: {
    method: string;
    methodTitle: string;
    transactionId: string;
  };
  customerId: number;
}

interface WooCommerceClient {
  name: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  totalOrders: number;
  processingOrders: number;
  completedOrders: number;
  totalSpent: number;
  processingAmount: number;
  completedAmount: number;
  firstOrderDate: string;
  lastOrderDate: string;
}

interface WooCommerceData {
  orders: WooCommerceOrder[];
  summary: {
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
    currency: string;
  };
}

export default function AnalyticsPage() {
  const { data: session, status } = useSession();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // Check if user is admin to show revenue data
  const isAdmin = session?.user?.role === 'admin';
  const [wooOrders, setWooOrders] = useState<WooCommerceOrder[]>([]);
  const [wooClients, setWooClients] = useState<WooCommerceClient[]>([]);
  const [wooSummary, setWooSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingAllData, setLoadingAllData] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [timeRange, setTimeRange] = useState('6months');
  const [isFullDataLoaded, setIsFullDataLoaded] = useState(false);
  const [clientsCurrentPage, setClientsCurrentPage] = useState(1);
  const [clientsPerPage] = useState(10);
  const [dataSource, setDataSource] = useState<'woocommerce' | 'database'>('woocommerce');
  const [dbLastSync, setDbLastSync] = useState<string | null>(null);
  const ordersPerPage = 10;

  // Only fetch when session is authenticated
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchAnalytics();
      loadDataFromDatabase(); // Load from MongoDB instead of WooCommerce
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status, session?.user?.id, timeRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Fetch real analytics data from API
      const response = await fetch('/api/analytics/stats');
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
        setWooSummary(data.wooSummary);
      } else {
        console.error('Failed to fetch analytics data');
        // Fallback to mock data
        const mockData: AnalyticsData = {
          totalClients: 0,
          activeClients: 0,
          totalAppointments: 0,
          completedAppointments: 0,
          totalRevenue: 0,
          monthlyRevenue: 0,
          avgSessionDuration: 45,
          clientRetentionRate: 0,
          appointmentsByMonth: [],
          clientProgress: [],
          appointmentTypes: [],
          revenueByMonth: []
        };
        setAnalytics(mockData);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWooCommerceOrders = async (page: number = 1) => {
    try {
      setLoadingOrders(true);

      // Fetch processing orders for display
      const processingResponse = await fetch(`/api/woocommerce/orders?status=processing&page=${page}&per_page=${ordersPerPage}`);

      // Fetch recent orders for client data - limited for performance
      const allOrdersResponse = await fetch(`/api/woocommerce/orders?status=any&per_page=500`);

      if (processingResponse.ok && allOrdersResponse.ok) {
        const processingData = await processingResponse.json();
        const allOrdersData = await allOrdersResponse.json();

        setWooOrders(processingData.orders || []);
        setWooClients(allOrdersData.clients || []);
        setWooSummary(allOrdersData.summary || null);
        setTotalOrders(processingData.pagination?.total || 0);
        setTotalPages(processingData.pagination?.total_pages || 1);
        setCurrentPage(page);

        // Log the data for debugging
      } else {
        console.error('Failed to fetch WooCommerce orders');
      }
    } catch (error) {
      console.error('Error fetching WooCommerce orders:', error);
    } finally {
      setLoadingOrders(false);
    }
  };

  const fetchAllData = async () => {
    try {
      setLoadingAllData(true);

      // Fetch ALL orders for complete client data
      const allOrdersResponse = await fetch(`/api/woocommerce/orders?status=any&per_page=1000`);

      if (allOrdersResponse.ok) {
        const allOrdersData = await allOrdersResponse.json();
        setWooClients(allOrdersData.clients || []);
        setWooSummary(allOrdersData.summary || null);
        setIsFullDataLoaded(true);

      } else {
        console.error('Failed to fetch all WooCommerce data');
      }
    } catch (error) {
      console.error('Error fetching all WooCommerce data:', error);
    } finally {
      setLoadingAllData(false);
    }
  };

  const saveDataToDatabase = async () => {
    try {
      setLoadingAllData(true);

      // First fetch all data
      const allOrdersResponse = await fetch(`/api/woocommerce/orders?status=any&per_page=1000`);

      if (allOrdersResponse.ok) {
        const allOrdersData = await allOrdersResponse.json();

        // Save to database
        const saveResponse = await fetch('/api/woocommerce/save-to-db', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orders: allOrdersData.orders,
            clients: allOrdersData.clients,
            summary: allOrdersData.summary
          })
        });

        if (saveResponse.ok) {
          const result = await saveResponse.json();
          setDbLastSync(result.timestamp);
          alert(`Successfully saved to MongoDB!\n• ${result.savedClientsCount || 0} new clients\n• ${result.updatedClientsCount || 0} updated clients\n• ${result.ordersCount || 0} orders processed`);
        } else {
          console.error('Failed to save data to MongoDB');
          alert('Failed to save data to MongoDB');
        }
      }
    } catch (error) {
      console.error('Error saving data to database:', error);
      alert('Error saving data to database');
    } finally {
      setLoadingAllData(false);
    }
  };

  const loadDataFromDatabase = async () => {
    try {
      setLoadingOrders(true);

      // Fetch data from MongoDB
      const dbResponse = await fetch('/api/woocommerce/from-db?type=all&per_page=1000');

      if (dbResponse.ok) {
        const dbData = await dbResponse.json();
        setWooOrders(dbData.orders?.slice(0, ordersPerPage) || []);
        setWooClients(dbData.clients || []);
        setWooSummary(dbData.summary || null);
        setDataSource('database');
        setDbLastSync(dbData.summary?.lastSync || null);

        // alert(`Successfully loaded from MongoDB!\n• ${dbData.clients?.length || 0} clients\n• ${dbData.orders?.length || 0} orders`);
      } else {
        console.error('Failed to load data from MongoDB');
        // alert('Failed to load data from MongoDB');
      }
    } catch (error) {
      console.error('Error loading data from database:', error);
      alert('Error loading data from database');
    } finally {
      setLoadingOrders(false);
    }
  };

  // Calculate pagination for clients
  const totalClientsPages = Math.ceil(wooClients.length / clientsPerPage);
  const startIndex = (clientsCurrentPage - 1) * clientsPerPage;
  const endIndex = startIndex + clientsPerPage;
  const currentClients = wooClients.slice(startIndex, endIndex);

  const COLORS = ['#16a34a', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  // Check if user is authenticated
  if (!session) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Please sign in to view analytics.</p>
        </div>
      </DashboardLayout>
    );
  }

  // Only allow admins to access analytics
  if (session.user.role !== 'admin') {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <Activity className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Access Restricted</h3>
            <p className="text-gray-500">Only administrators can access analytics and order data.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
        </div>
      </DashboardLayout>
    );
  }

  if (!analytics) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="text-center py-12">
              <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Analytics Data</h3>
              <p className="text-gray-600">Analytics data is not available at the moment.</p>
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
            <p className="text-gray-600 mt-1">Business analytics and client data overview</p>
          </div>

          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1month">Last Month</SelectItem>
              <SelectItem value="3months">Last 3 Months</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="1year">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">
                <Users className="h-5 w-5 text-blue-600" />
                <span>Total Clients</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-600">{analytics.totalClients}</p>
              <p className="text-sm text-gray-600">
                {analytics.activeClients} active clients
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-green-600" />
                <span>Appointments</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">{analytics.totalAppointments}</p>
              <p className="text-sm text-gray-600">
                {analytics.completedAppointments} completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">

                <span>₹ Total Revenue</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-purple-600">
                ₹{analytics.totalRevenue.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600">
                ₹{analytics.monthlyRevenue} this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">
                <Target className="h-5 w-5 text-orange-600" />
                <span>Retention Rate</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-orange-600">
                {analytics.clientRetentionRate}%
              </p>
              <p className="text-sm text-gray-600">Client retention</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Appointments & Revenue Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Appointments & Revenue Trend</CardTitle>
              <CardDescription>Monthly appointments and revenue over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.appointmentsByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="appointments"
                      stackId="1"
                      stroke="#16a34a"
                      fill="#16a34a"
                      fillOpacity={0.6}
                    />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="revenue"
                      stackId="2"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Appointment Types Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Appointment Types</CardTitle>
              <CardDescription>Distribution of appointment types</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.appointmentTypes}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ type, percent }) => `${type}: ${((percent || 0) * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {analytics.appointmentTypes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue by Month */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Revenue</CardTitle>
              <CardDescription>Revenue growth over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.revenueByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`$${value}`, 'Revenue']} />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#16a34a"
                      strokeWidth={3}
                      dot={{ fill: '#16a34a', strokeWidth: 2, r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Top Client Progress */}
          <Card>
            <CardHeader>
              <CardTitle>Client Progress Leaders</CardTitle>
              <CardDescription>Top performing clients by weight loss</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.clientProgress.map((client, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="shrink-0 w-8 h-8 bg-green-100 text-green-800 rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{client.clientName}</p>
                        <p className="text-sm text-gray-600">
                          {client.adherence}% adherence rate
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">
                        -{client.weightLoss} kg
                      </p>
                      <p className="text-xs text-gray-500">weight loss</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Additional Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <span>Avg Session Duration</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">
                {analytics.avgSessionDuration} min
              </p>
              <p className="text-sm text-gray-600">Average consultation time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <span>Success Rate</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">91%</p>
              <p className="text-sm text-gray-600">Clients achieving goals</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">
                <Award className="h-5 w-5 text-purple-600" />
                <span>Client Satisfaction</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-purple-600">4.8/5</p>
              <p className="text-sm text-gray-600">Average rating</p>
            </CardContent>
          </Card>
        </div>

        {/* Orders Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">WooCommerce Data</h2>
              <p className="text-gray-600 mt-1">Complete client overview and order management</p>
            </div>
            <Button
              onClick={loadDataFromDatabase}
              disabled={loadingOrders}
              variant="outline"
              size="sm"
            >
              {loadingOrders ? (
                <LoadingSpinner className="h-4 w-4 mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh Data
            </Button>
          </div>

          {/* Summary Cards */}
          {wooSummary && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
              {/* Total Clients Summary */}
              <div className="md:col-span-5 mb-4">
                <div className="bg-linear-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-blue-900">Nutrition App Clients</h3>
                      <p className="text-blue-700 text-sm">
                        {wooSummary.totalClients} registered clients with login access • {wooSummary.totalOrders} total orders
                      </p>
                      <div className="flex items-center mt-2 space-x-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          💾 MongoDB Client Database
                        </span>
                        {dbLastSync && (
                          <span className="text-xs text-blue-600">
                            Last updated: {formatDateTimeIST(dbLastSync)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-900">₹{wooSummary.totalRevenue?.toFixed(2) || '0.00'}</p>
                      <p className="text-sm text-blue-700">Total Revenue</p>
                    </div>
                  </div>
                </div>
              </div>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    <span>Total Clients</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-blue-600">{wooSummary.totalClients}</p>
                  <p className="text-sm text-gray-600">Unique customers</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <Package className="h-5 w-5 text-yellow-600" />
                    <span>Processing</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-yellow-600">{wooSummary.processingOrders}</p>
                  {isAdmin && (
                    <p className="text-sm text-gray-600">₹{wooSummary.processingRevenue?.toFixed(2) || '0.00'}</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <ShoppingCart className="h-5 w-5 text-green-600" />
                    <span>Completed</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-600">{wooSummary.completedOrders}</p>
                  {isAdmin && (
                    <p className="text-sm text-gray-600">₹{wooSummary.completedRevenue?.toFixed(2) || '0.00'}</p>
                  )}
                </CardContent>
              </Card>

              {isAdmin && (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <DollarSign className="h-5 w-5 text-purple-600" />
                        <span>Total Revenue</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-purple-600">
                        ₹{wooSummary.totalRevenue?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-sm text-gray-600">All paid orders</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <TrendingUp className="h-5 w-5 text-orange-600" />
                        <span>Avg Order Value</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-orange-600">
                        ₹{wooSummary.averageOrderValue?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-sm text-gray-600">Per order</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}

          {/* Clients Table */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>Registered Clients</span>
              </CardTitle>
              <CardDescription>
                Your nutrition app clients with login credentials and order history
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(loadingOrders || loadingAllData) ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner />
                  <span className="ml-2 text-gray-600">
                    {loadingAllData ? 'Loading complete client data...' : 'Loading client data...'}
                  </span>
                </div>
              ) : wooClients.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No clients found</p>
                  <p className="text-sm text-gray-400 mt-2">Click "Refresh Data" to fetch from WooCommerce</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Client</th>
                        <th className="text-left py-3 px-4 font-medium">Contact</th>
                        <th className="text-left py-3 px-4 font-medium">Login Access</th>
                        <th className="text-left py-3 px-4 font-medium">Processing</th>
                        <th className="text-left py-3 px-4 font-medium">Completed</th>
                        <th className="text-left py-3 px-4 font-medium">Total Spent</th>
                        <th className="text-left py-3 px-4 font-medium">First Order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentClients.map((client, index) => (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium">{client.name}</p>
                              <p className="text-sm text-gray-500">{client.city}, {client.country}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="text-sm">{client.email}</p>
                              <p className="text-sm text-gray-500">{client.phone}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="bg-gray-50 rounded p-2">
                              <p className="text-xs text-gray-600">Email: {client.email}</p>
                              <p className="text-xs font-mono text-blue-600">Password: Password{(startIndex + index + 1).toString().padStart(3, '0')}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium text-yellow-600">{client.processingOrders} orders</p>
                              <p className="text-sm text-gray-500">₹{client.processingAmount.toFixed(2)}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium text-green-600">{client.completedOrders} orders</p>
                              <p className="text-sm text-gray-500">₹{client.completedAmount.toFixed(2)}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium">₹{client.totalSpent.toFixed(2)}</p>
                              <p className="text-sm text-gray-500">{client.totalOrders} total orders</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="text-sm">{format(new Date(client.firstOrderDate), 'MMM dd, yyyy')}</p>
                              <p className="text-xs text-gray-500">Last: {format(new Date(client.lastOrderDate), 'MMM dd')}</p>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Client Pagination */}
              {totalClientsPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <div className="text-sm text-gray-500">
                    Showing {startIndex + 1}-{Math.min(endIndex, wooClients.length)} of {wooClients.length} clients
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setClientsCurrentPage(clientsCurrentPage - 1)}
                      disabled={clientsCurrentPage === 1}
                    >
                      Previous
                    </Button>

                    {/* Page numbers */}
                    <div className="flex items-center space-x-1">
                      {Array.from({ length: Math.min(5, totalClientsPages) }, (_, i) => {
                        const pageNum = Math.max(1, Math.min(totalClientsPages - 4, clientsCurrentPage - 2)) + i;
                        if (pageNum > totalClientsPages) return null;

                        return (
                          <Button
                            key={pageNum}
                            variant={pageNum === clientsCurrentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => setClientsCurrentPage(pageNum)}
                            className="w-8 h-8 p-0"
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setClientsCurrentPage(clientsCurrentPage + 1)}
                      disabled={clientsCurrentPage === totalClientsPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Orders Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Package className="h-5 w-5" />
                  <span>Orders</span>
                </div>
                <div className="text-sm text-gray-500">
                  Showing {((currentPage - 1) * ordersPerPage) + 1}-{Math.min(currentPage * ordersPerPage, totalOrders)} of {totalOrders}
                </div>
              </CardTitle>
              <CardDescription>
                Recent customer orders and details
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingOrders ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : wooOrders.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No processing orders found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Order #</th>
                        <th className="text-left py-3 px-4 font-medium">Customer</th>
                        <th className="text-left py-3 px-4 font-medium">Total</th>
                        <th className="text-left py-3 px-4 font-medium">Payment</th>
                        <th className="text-left py-3 px-4 font-medium">Date</th>
                        <th className="text-left py-3 px-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wooOrders.map((order) => (
                        <tr key={order.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <span className="font-medium text-blue-600">#{order.orderNumber}</span>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium">{order.customer.name}</p>
                              <p className="text-sm text-gray-500">{order.customer.email}</p>
                              <p className="text-sm text-gray-500">{order.customer.city}, {order.customer.country}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium">₹{order.total.toFixed(2)}</span>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="text-sm">{order.payment.methodTitle}</p>
                              <p className="text-xs text-gray-500">ID: {order.payment.transactionId}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="text-sm">{format(new Date(order.dateCreated), 'MMM dd, yyyy')}</p>
                              <p className="text-xs text-gray-500">{format(new Date(order.dateCreated), 'HH:mm')}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              {order.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <div className="text-sm text-gray-500">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchWooCommerceOrders(currentPage - 1)}
                      disabled={currentPage === 1 || loadingOrders}
                    >
                      Previous
                    </Button>

                    {/* Page numbers */}
                    <div className="flex items-center space-x-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                        if (pageNum > totalPages) return null;

                        return (
                          <Button
                            key={pageNum}
                            variant={pageNum === currentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => fetchWooCommerceOrders(pageNum)}
                            disabled={loadingOrders}
                            className="w-8 h-8 p-0"
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchWooCommerceOrders(currentPage + 1)}
                      disabled={currentPage === totalPages || loadingOrders}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
