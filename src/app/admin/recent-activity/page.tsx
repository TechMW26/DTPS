'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { 
  Activity,
  Users, 
  Calendar,
  DollarSign,
  Settings,
  AlertTriangle,
  Trash2,
  MoreHorizontal,
  RefreshCw
} from 'lucide-react';

// Types for activity data
interface ActivityItem {
  id: string;
  type: string;
  message: string;
  time: string;
  status: string;
  timestamp: Date;
}

export default function RecentActivityPage() {
  const { data: session } = useSession();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch recent activities
  const fetchActivities = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/recent-activity');
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  // Get icon for activity type
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'user_signup':
        return <Users className="h-4 w-4 text-blue-600" />;
      case 'appointment':
        return <Calendar className="h-4 w-4 text-green-600" />;
      case 'payment':
        return <DollarSign className="h-4 w-4 text-yellow-600" />;
      case 'system':
        return <Settings className="h-4 w-4 text-gray-600" />;
      case 'maintenance':
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'info':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Check if activity can be deleted (only user-generated activities)
  const isActivityDeletable = (type: string) => {
    return !['system', 'maintenance'].includes(type);
  };

  // Handle delete activity (placeholder - would need backend implementation)
  const handleDeleteActivity = async (activityId: string) => {
    // For now, just show a message since this would require backend changes
    alert('Activity deletion would require backend implementation to track deletable activities.');
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Recent Activity</h1>
            <p className="text-gray-600 mt-1">Monitor all system activities and events</p>
          </div>
          <Button onClick={fetchActivities} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Activities List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-green-600" />
              <span>All Activities</span>
            </CardTitle>
            <CardDescription>
              Complete list of system activities and events
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No activities found</h3>
                <p className="text-gray-600">Recent activities will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="shrink-0 mt-1">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {activity.message}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                      <div className="flex items-center space-x-2 mt-2">
                        <Badge className={getStatusColor(activity.status)}>
                          {activity.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {activity.type.replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isActivityDeletable(activity.type) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteActivity(activity.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Delete activity"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <div 
                          className="h-8 w-8 p-0 flex items-center justify-center text-gray-400"
                          title="System activity (cannot be deleted)"
                        >
                          <Settings className="h-4 w-4" />
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
                        title="More options"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
