'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/ui/stats-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  TrendingUp,
  DollarSign,
  Activity,
  UserCheck,
  AlertTriangle,
  Calendar,
  MessageSquare,
  Edit,
  Trash2,
  MoreHorizontal,
  Tag
} from 'lucide-react';
import Link from 'next/link';

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
  rating: number;
  revenue: number;
  completedAppointments?: number;
  totalAppointments?: number;
  completionRate?: number;
}

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
    avgOrderValue: 0,
    clientRetentionRate: 0,
    appointmentsByMonth: [],
    topClients: [],
    appointmentTypes: [],
    revenueByMonth: []
  });
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);
  const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([]);
  const [topDietitians, setTopDietitians] = useState<TopDietitian[]>([]);
  const [loading, setLoading] = useState(true);

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

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'user_signup':
        return <UserCheck className="h-4 w-4" />;
      case 'appointment':
        return <Calendar className="h-4 w-4" />;
      case 'payment':
        return <DollarSign className="h-4 w-4" />;
      case 'issue':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'warning':
        return 'border-yellow-200 bg-yellow-50';
      case 'error':
        return 'border-red-200 bg-red-50';
      case 'success':
        return 'border-green-200 bg-green-50';
      default:
        return 'border-blue-200 bg-blue-50';
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center min-h-100">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading admin dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Admin Dashboard
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              System overview and management
            </p>
          </div>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/admin/reports">Generate Report</Link>
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          <StatsCard
            title="Total Clients"
            value={stats.totalClients.toLocaleString()}
            description={`${stats.activeClients} active`}
            icon={<Users className="h-4 w-4" />}
            trend={{ value: 12.5, isPositive: true }}
          />
          <StatsCard
            title="Total Revenue"
            value={`₹${stats.totalRevenue.toLocaleString()}`}
            description="All time revenue"
            icon={"₹"}
            trend={{ value: 15.3, isPositive: true }}
          />
          <StatsCard
            title="Monthly Revenue"
            value={`₹${stats.monthlyRevenue.toLocaleString()}`}
            description="This month"
            icon={<TrendingUp className="h-4 w-4" />}
            trend={{ value: 8.2, isPositive: true }}
          />
          <StatsCard
            title="Appointments"
            value={stats.totalAppointments.toLocaleString()}
            description={`${stats.completedAppointments} completed`}
            icon={<Calendar className="h-4 w-4" />}
          />
        </div>

        {/* Client Management Section */}
        <Card className="border-blue-200 bg-linear-to-br from-blue-50 to-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5 text-blue-600" />
                  <span>Client Management</span>
                </CardTitle>
                <CardDescription>
                  Manage all clients and assign dietitians
                </CardDescription>
              </div>
              <Button asChild>
                <Link href="/admin/allclients">
                  View All Clients
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="p-4 bg-white rounded-lg border border-blue-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Clients</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalClients}</p>
                  </div>
                  <Users className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <div className="p-4 bg-white rounded-lg border border-green-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Active Clients</p>
                    <p className="text-2xl font-bold text-green-600">{stats.activeClients}</p>
                  </div>
                  <UserCheck className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <div className="p-4 bg-white rounded-lg border border-yellow-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Need Assignment</p>
                    <p className="text-2xl font-bold text-yellow-600">
                      <Link href="/admin/allclients?assigned=false" className="hover:underline">
                        View
                      </Link>
                    </p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-yellow-600" />
                </div>
              </div>
            </div>
            <div className="mt-4 p-4 bg-blue-100 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-900">
                <strong>Quick Tip:</strong> Click "View All Clients" to assign dietitians to clients who don't have one yet. 
                This ensures every client gets proper guidance and support.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5 text-green-600" />
                <span>Recent Activity</span>
              </CardTitle>
              <CardDescription>
                Latest system activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                    <div className="shrink-0 mt-1">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {activity.message}
                      </p>
                      <p className="text-xs text-gray-500">{activity.time}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getStatusColor(activity.status)}>
                        {activity.status}
                      </Badge>
                      {activity.type !== 'system' && activity.type !== 'maintenance' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                <Button variant="outline" className="w-full mt-4" asChild>
                  <Link href="/admin/recent-activity">View All Activity</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* System Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <span>System Alerts</span>
              </CardTitle>
              <CardDescription>
                Important system notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {systemAlerts.map((alert) => (
                  <div key={alert.id} className={`p-3 border rounded-lg ${getAlertColor(alert.type)}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{alert.message}</p>
                        <p className="text-xs text-gray-500 mt-1">{alert.time}</p>
                      </div>
                      <div className="flex items-center space-x-1 ml-2">
                        {isAlertDeletable(alert.id) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAlert(alert.id)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete alert"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          <div
                            className="h-8 w-8 p-0 flex items-center justify-center text-gray-400"
                            title="System-generated alert (cannot be deleted)"
                          >
                            <AlertTriangle className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                <Button variant="outline" className="w-full mt-4" asChild>
                  <Link href="/admin/system-alerts">View All Alerts</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Performing Dietitians */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <span>Top Performing Dietitians</span>
              </CardTitle>
              <CardDescription>
                Based on client count and ratings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topDietitians.slice(0, 5).map((dietitian, index) => (
                  <div key={dietitian.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="shrink-0">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-green-600">
                            #{index + 1}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="font-medium">{dietitian.name}</p>
                        <p className="text-sm text-gray-600">
                          {/* {dietitian.clients} clients • {dietitian.rating}★ */}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {/* <p className="font-medium">₹{dietitian.revenue.toLocaleString()}</p> */}
                      {/* <p className="text-xs text-gray-500">revenue</p> */}
                    </div>
                  </div>
                ))}
                
                <Button variant="outline" className="w-full mt-4" asChild>
                  <Link href="/admin/dietitians/list">View All Dietitians</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Admin Actions</CardTitle>
              <CardDescription>
                Common administrative tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 sm:gap-3">
                <Button variant="outline" className="h-16 sm:h-20 flex flex-col space-y-1 sm:space-y-2 text-xs sm:text-sm" asChild>
                  <Link href="/admin/allclients">
                    <Users className="h-6 w-6" />
                    <span>All Clients</span>
                  </Link>
                </Button>
                
                <Button variant="outline" className="h-16 sm:h-20 flex flex-col space-y-1 sm:space-y-2 text-xs sm:text-sm" asChild>
                  <Link href="/admin/users">
                    <UserCheck className="h-5 w-5 sm:h-6 sm:w-6" />
                    <span>Manage Users</span>
                  </Link>
                </Button>
                
                <Button variant="outline" className="h-16 sm:h-20 flex flex-col space-y-1 sm:space-y-2 text-xs sm:text-sm" asChild>
                  <Link href="/admin/analytics">
                    <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6" />
                    <span>Analytics</span>
                  </Link>
                </Button>
                
                <Button variant="outline" className="h-16 sm:h-20 flex flex-col space-y-1 sm:space-y-2 text-xs sm:text-sm" asChild>
                  <Link href="/admin/support">
                    <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
                    <span>Support</span>
                  </Link>
                </Button>

                <Button variant="outline" className="h-16 sm:h-20 flex flex-col space-y-1 sm:space-y-2 text-xs sm:text-sm" asChild>
                  <Link href="/admin/tags">
                    <Tag className="h-5 w-5 sm:h-6 sm:w-6" />
                    <span>Manage Tags</span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
