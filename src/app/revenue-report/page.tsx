'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import {
  Download,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  Users,
  FileText,
  RefreshCw,
  FileSpreadsheet,
  Printer
} from 'lucide-react';
import { UserRole } from '@/types';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';

interface RevenueData {
  totalRevenue: number;
  monthlyRevenue: number;
  previousMonthRevenue: number;
  weeklyRevenue: number;
  avgOrderValue: number;
  totalOrders: number;
  processingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  refundedAmount: number;
  growthRate: number;
  revenueByMonth: Array<{ month: string; revenue: number; orders: number }>;
  revenueBySource: Array<{ source: string; revenue: number; percentage: number }>;
  topClients: Array<{ name: string; email: string; totalSpent: number; orders: number }>;
  recentTransactions: Array<{
    id: string;
    clientName: string;
    amount: number;
    date: string;
    status: string;
    paymentMethod: string;
  }>;
  dailyRevenue: Array<{ date: string; revenue: number }>;
}

const COLORS = ['#16a34a', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function RevenueReportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [timeRange, setTimeRange] = useState('6months');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/auth/signin');
      return;
    }

    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.HEALTH_COUNSELOR) {
      router.push('/dashboard');
      return;
    }

    fetchRevenueData();
  }, [session, status, router]);

  useEffect(() => {
    if (session) {
      fetchRevenueData();
    }
  }, [timeRange]);

  const fetchRevenueData = async () => {
    try {
      setLoading(true);
      
      const [statsRes, ordersRes] = await Promise.all([
        fetch('/api/analytics/stats'),
        fetch('/api/woocommerce/from-db?type=all&per_page=1000')
      ]);
      
      let analyticsData: any = null;
      let ordersData: any = null;
      
      if (statsRes.ok) analyticsData = await statsRes.json();
      if (ordersRes.ok) ordersData = await ordersRes.json();
      
      const revenueByMonth = analyticsData?.revenueByMonth || [];
      const clients = ordersData?.clients || [];
      const orders = ordersData?.orders || [];
      
      const totalRevenue = analyticsData?.totalRevenue || 0;
      const monthlyRevenue = analyticsData?.monthlyRevenue || 0;
      const previousMonthRevenue = revenueByMonth[revenueByMonth.length - 2]?.revenue || 0;
      
      const growthRate = previousMonthRevenue > 0 
        ? ((monthlyRevenue - previousMonthRevenue) / previousMonthRevenue) * 100 
        : 0;
      
      const weeklyRevenue = orders
        .filter((o: any) => new Date(o.dateCreated) >= subDays(new Date(), 7))
        .reduce((sum: number, o: any) => sum + (parseFloat(o.total) || 0), 0);
      
      const paymentMethods: { [key: string]: number } = {};
      orders.forEach((o: any) => {
        const method = o.payment?.methodTitle || 'Other';
        paymentMethods[method] = (paymentMethods[method] || 0) + (parseFloat(o.total) || 0);
      });
      const revenueBySource = Object.entries(paymentMethods).map(([source, revenue]) => ({
        source,
        revenue,
        percentage: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0
      }));
      
      const topClients = clients
        .sort((a: any, b: any) => (b.totalSpent || 0) - (a.totalSpent || 0))
        .slice(0, 10)
        .map((c: any) => ({
          name: c.name || 'Unknown',
          email: c.email || '',
          totalSpent: c.totalSpent || 0,
          orders: c.totalOrders || 0
        }));
      
      const recentTransactions = orders
        .sort((a: any, b: any) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime())
        .slice(0, 20)
        .map((o: any) => ({
          id: o.orderNumber || o.id?.toString() || '',
          clientName: o.customer?.name || 'Unknown',
          amount: parseFloat(o.total) || 0,
          date: o.dateCreated || '',
          status: o.status || 'unknown',
          paymentMethod: o.payment?.methodTitle || 'Unknown'
        }));
      
      const dailyRevenueMap: { [date: string]: number } = {};
      for (let i = 29; i >= 0; i--) {
        dailyRevenueMap[format(subDays(new Date(), i), 'yyyy-MM-dd')] = 0;
      }
      orders.forEach((o: any) => {
        const date = format(new Date(o.dateCreated), 'yyyy-MM-dd');
        if (dailyRevenueMap[date] !== undefined) {
          dailyRevenueMap[date] += parseFloat(o.total) || 0;
        }
      });
      const dailyRevenue = Object.entries(dailyRevenueMap).map(([date, revenue]) => ({
        date: format(new Date(date), 'MMM dd'),
        revenue
      }));
      
      setRevenueData({
        totalRevenue,
        monthlyRevenue,
        previousMonthRevenue,
        weeklyRevenue,
        avgOrderValue: analyticsData?.avgOrderValue || (totalRevenue / Math.max(orders.length, 1)),
        totalOrders: orders.length,
        processingOrders: orders.filter((o: any) => o.status === 'processing').length,
        completedOrders: orders.filter((o: any) => o.status === 'completed').length,
        cancelledOrders: orders.filter((o: any) => o.status === 'cancelled').length,
        refundedAmount: orders
          .filter((o: any) => o.status === 'refunded')
          .reduce((sum: number, o: any) => sum + (parseFloat(o.total) || 0), 0),
        growthRate,
        revenueByMonth,
        revenueBySource,
        topClients,
        recentTransactions,
        dailyRevenue
      });
    } catch (error) {
      console.error('Error fetching revenue data:', error);
      toast.error('Failed to load revenue data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRevenueData();
    setRefreshing(false);
    toast.success('Revenue data refreshed');
  };

  const downloadCSV = useCallback(() => {
    if (!revenueData) return;
    
    let csvContent = 'Revenue Report\n';
    csvContent += `Generated: ${format(new Date(), 'PPP pp')}\n\n`;
    csvContent += 'SUMMARY\n';
    csvContent += `Total Revenue,₹${revenueData.totalRevenue.toLocaleString()}\n`;
    csvContent += `Monthly Revenue,₹${revenueData.monthlyRevenue.toLocaleString()}\n`;
    csvContent += `Weekly Revenue,₹${revenueData.weeklyRevenue.toLocaleString()}\n`;
    csvContent += `Average Order Value,₹${revenueData.avgOrderValue.toFixed(2)}\n`;
    csvContent += `Total Orders,${revenueData.totalOrders}\n`;
    csvContent += `Growth Rate,${revenueData.growthRate.toFixed(1)}%\n\n`;
    
    csvContent += 'MONTHLY REVENUE\nMonth,Revenue,Orders\n';
    revenueData.revenueByMonth.forEach(item => {
      csvContent += `${item.month},₹${item.revenue},${item.orders || 0}\n`;
    });
    csvContent += '\n';
    
    csvContent += 'TOP CLIENTS\nName,Email,Total Spent,Orders\n';
    revenueData.topClients.forEach(client => {
      csvContent += `"${client.name}",${client.email},₹${client.totalSpent.toLocaleString()},${client.orders}\n`;
    });
    csvContent += '\n';
    
    csvContent += 'RECENT TRANSACTIONS\nOrder ID,Client,Amount,Date,Status,Payment Method\n';
    revenueData.recentTransactions.forEach(tx => {
      csvContent += `${tx.id},"${tx.clientName}",₹${tx.amount.toLocaleString()},${tx.date ? format(new Date(tx.date), 'PPP') : '-'},${tx.status},${tx.paymentMethod}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `revenue-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    toast.success('CSV report downloaded');
  }, [revenueData]);

  const downloadJSON = useCallback(() => {
    if (!revenueData) return;
    
    const exportData = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalRevenue: revenueData.totalRevenue,
        monthlyRevenue: revenueData.monthlyRevenue,
        weeklyRevenue: revenueData.weeklyRevenue,
        avgOrderValue: revenueData.avgOrderValue,
        totalOrders: revenueData.totalOrders,
        growthRate: revenueData.growthRate
      },
      revenueByMonth: revenueData.revenueByMonth,
      revenueBySource: revenueData.revenueBySource,
      topClients: revenueData.topClients,
      recentTransactions: revenueData.recentTransactions
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `revenue-report-${format(new Date(), 'yyyy-MM-dd')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    toast.success('JSON report downloaded');
  }, [revenueData]);

  const handlePrint = useCallback(() => window.print(), []);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center space-y-4">
            <LoadingSpinner size="lg" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Loading Revenue Report</h3>
              <p className="text-gray-600 dark:text-gray-400">Fetching real-time revenue data...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!session || (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.HEALTH_COUNSELOR)) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 print:p-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Revenue Report</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Comprehensive revenue analytics and financial overview</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1month">Last Month</SelectItem>
                <SelectItem value="3months">Last 3 Months</SelectItem>
                <SelectItem value="6months">Last 6 Months</SelectItem>
                <SelectItem value="1year">Last Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button variant="outline" onClick={downloadCSV}><FileSpreadsheet className="h-4 w-4 mr-2" />CSV</Button>
            <Button variant="outline" onClick={downloadJSON}><Download className="h-4 w-4 mr-2" />JSON</Button>
            <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Print</Button>
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">Revenue Report</h1>
          <p className="text-gray-600">Generated: {format(new Date(), 'PPP pp')}</p>
        </div>

        {!revenueData || (revenueData.totalRevenue === 0 && revenueData.totalOrders === 0) ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <DollarSign className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No Revenue Data Available</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                There is no revenue data for the selected time period. Revenue data will appear here once transactions are recorded.
              </p>
              <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh Data
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium">Total Revenue</p>
                      <p className="text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-300">₹{revenueData.totalRevenue.toLocaleString()}</p>
                    </div>
                    <DollarSign className="h-10 w-10 text-green-500" />
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">This Month</p>
                      <p className="text-2xl sm:text-3xl font-bold text-blue-700 dark:text-blue-300">₹{revenueData.monthlyRevenue.toLocaleString()}</p>
                      <div className="flex items-center gap-1 mt-1">
                        {revenueData.growthRate >= 0 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
                        <span className={`text-xs font-medium ${revenueData.growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {revenueData.growthRate >= 0 ? '+' : ''}{revenueData.growthRate.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <TrendingUp className="h-10 w-10 text-blue-500" />
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">Avg Order Value</p>
                      <p className="text-2xl sm:text-3xl font-bold text-purple-700 dark:text-purple-300">₹{revenueData.avgOrderValue.toFixed(0)}</p>
                    </div>
                    <FileText className="h-10 w-10 text-purple-500" />
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200 dark:border-orange-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Total Orders</p>
                      <p className="text-2xl sm:text-3xl font-bold text-orange-700 dark:text-orange-300">{revenueData.totalOrders}</p>
                    </div>
                    <Users className="h-10 w-10 text-orange-500" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Order Status Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Badge className="bg-yellow-100 text-yellow-800">Processing</Badge><span className="text-xl font-bold">{revenueData.processingOrders}</span></div></CardContent></Card>
              <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Badge className="bg-green-100 text-green-800">Completed</Badge><span className="text-xl font-bold">{revenueData.completedOrders}</span></div></CardContent></Card>
              <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Badge className="bg-red-100 text-red-800">Cancelled</Badge><span className="text-xl font-bold">{revenueData.cancelledOrders}</span></div></CardContent></Card>
              <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Badge className="bg-gray-100 text-gray-800">Refunded</Badge><span className="text-xl font-bold">₹{revenueData.refundedAmount.toLocaleString()}</span></div></CardContent></Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>Monthly Revenue Trend</CardTitle><CardDescription>Revenue growth over time</CardDescription></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={revenueData.revenueByMonth}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`₹${((value as number) || 0).toLocaleString()}`, 'Revenue']} />
                        <Area type="monotone" dataKey="revenue" stroke="#16a34a" fill="#16a34a" fillOpacity={0.3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Daily Revenue (Last 30 Days)</CardTitle><CardDescription>Day-to-day revenue performance</CardDescription></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueData.dailyRevenue}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" angle={-45} textAnchor="end" height={60} fontSize={10} />
                        <YAxis />
                        <Tooltip formatter={(value) => [`₹${((value as number) || 0).toLocaleString()}`, 'Revenue']} />
                        <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Revenue by Source & Top Clients */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>Revenue by Payment Method</CardTitle><CardDescription>Distribution of payment sources</CardDescription></CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={revenueData.revenueBySource} cx="50%" cy="50%" labelLine={false} label={({ payload }) => `${payload?.source || ''}: ${(payload?.percentage || 0).toFixed(0)}%`} outerRadius={80} dataKey="revenue">
                          {revenueData.revenueBySource.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                        </Pie>
                        <Tooltip formatter={(value) => [`₹${(value as number).toLocaleString()}`, 'Revenue']} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Top Clients by Revenue</CardTitle><CardDescription>Highest spending clients</CardDescription></CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {revenueData.topClients.map((client, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full flex items-center justify-center text-sm font-medium">{index + 1}</div>
                          <div><p className="font-medium text-gray-900 dark:text-gray-100">{client.name}</p><p className="text-xs text-gray-500 dark:text-gray-400">{client.email}</p></div>
                        </div>
                        <div className="text-right"><p className="font-bold text-green-600 dark:text-green-400">₹{client.totalSpent.toLocaleString()}</p><p className="text-xs text-gray-500 dark:text-gray-400">{client.orders} orders</p></div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Transactions */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div><CardTitle>Recent Transactions</CardTitle><CardDescription>Latest payment activities</CardDescription></div>
                  <Input placeholder="Search transactions..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-64" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="text-left p-3 text-sm font-medium text-gray-600 dark:text-gray-300">Order ID</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-600 dark:text-gray-300">Client</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-600 dark:text-gray-300">Amount</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-600 dark:text-gray-300">Date</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-600 dark:text-gray-300">Status</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-600 dark:text-gray-300">Payment Method</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueData.recentTransactions.filter(tx => tx.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || tx.id.includes(searchQuery)).map((tx, index) => (
                        <tr key={index} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="p-3 text-sm font-mono">#{tx.id}</td>
                          <td className="p-3 text-sm">{tx.clientName}</td>
                          <td className="p-3 text-sm font-medium text-green-600 dark:text-green-400">₹{tx.amount.toLocaleString()}</td>
                          <td className="p-3 text-sm text-gray-600 dark:text-gray-400">{tx.date ? format(new Date(tx.date), 'MMM dd, yyyy') : '-'}</td>
                          <td className="p-3"><Badge className={tx.status === 'completed' ? 'bg-green-100 text-green-800' : tx.status === 'processing' ? 'bg-yellow-100 text-yellow-800' : tx.status === 'cancelled' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}>{tx.status}</Badge></td>
                          <td className="p-3 text-sm text-gray-600 dark:text-gray-400">{tx.paymentMethod}</td>
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
