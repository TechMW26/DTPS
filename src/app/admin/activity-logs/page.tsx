'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Activity,
  Search,
  Filter,
  Calendar,
  User,
  Users,
  FileText,
  CreditCard,
  Clock,
  Edit,
  Trash,
  Plus,
  LogIn,
  LogOut,
  CheckCircle,
  XCircle,
  ArrowRight,
  RefreshCw,
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface ActivityLog {
  _id: string;
  userId: string;
  userRole: string;
  userName: string;
  userEmail: string;
  action: string;
  actionType: string;
  category: string;
  description: string;
  targetUserId?: string;
  targetUserName?: string;
  resourceId?: string;
  resourceType?: string;
  resourceName?: string;
  details?: Record<string, any>;
  changeDetails?: { fieldName: string; oldValue: any; newValue: any }[];
  isRead: boolean;
  createdAt: string;
}

interface Stats {
  byCategory: { _id: string; count: number }[];
  byActionType: { _id: string; count: number }[];
  byUserRole: { _id: string; count: number }[];
  todayCount: number;
}

const actionTypeIcons: Record<string, any> = {
  create: Plus,
  update: Edit,
  delete: Trash,
  view: FileText,
  assign: ArrowRight,
  complete: CheckCircle,
  cancel: XCircle,
  payment: CreditCard,
  login: LogIn,
  logout: LogOut,
  other: Activity
};

const actionTypeColors: Record<string, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  view: 'bg-gray-100 text-gray-700',
  assign: 'bg-purple-100 text-purple-700',
  complete: 'bg-emerald-100 text-emerald-700',
  cancel: 'bg-orange-100 text-orange-700',
  payment: 'bg-amber-100 text-amber-700',
  login: 'bg-teal-100 text-teal-700',
  logout: 'bg-slate-100 text-slate-700',
  other: 'bg-gray-100 text-gray-700'
};

const categoryColors: Record<string, string> = {
  meal_plan: 'bg-green-500',
  diet_plan: 'bg-emerald-500',
  appointment: 'bg-blue-500',
  payment: 'bg-amber-500',
  task: 'bg-purple-500',
  note: 'bg-pink-500',
  document: 'bg-cyan-500',
  profile: 'bg-indigo-500',
  client_assignment: 'bg-orange-500',
  recipe: 'bg-lime-500',
  fitness: 'bg-red-500',
  message: 'bg-sky-500',
  subscription: 'bg-violet-500',
  auth: 'bg-slate-500',
  system: 'bg-gray-500',
  other: 'bg-gray-400'
};

const roleColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  dietitian: 'bg-blue-100 text-blue-700',
  health_counselor: 'bg-green-100 text-green-700',
  client: 'bg-purple-100 text-purple-700'
};

export default function ActivityLogsPage() {
  const { data: session } = useSession();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [actionTypeFilter, setActionTypeFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchActivities();
  }, [page, categoryFilter, actionTypeFilter, roleFilter]);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '30'
      });

      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (actionTypeFilter !== 'all') params.append('actionType', actionTypeFilter);
      if (roleFilter !== 'all') params.append('userRole', roleFilter);
      if (searchTerm) params.append('search', searchTerm);

      const response = await fetch(`/api/activity-logs?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities);
        setStats(data.stats);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
      toast.error('Failed to fetch activities');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchActivities();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return format(date, 'MMM dd, yyyy');
  };

  const getActionIcon = (actionType: string) => {
    const Icon = actionTypeIcons[actionType] || Activity;
    return <Icon className="h-4 w-4" />;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Activity Logs</h1>
            <p className="text-gray-600">Track all user activities across the platform</p>
          </div>
          <Button onClick={fetchActivities} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Today's Activities</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.todayCount}</p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-full">
                    <Activity className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total Activities</p>
                    <p className="text-2xl font-bold text-gray-900">{total}</p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-full">
                    <FileText className="h-5 w-5 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Payments</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {stats.byCategory.find(c => c._id === 'payment')?.count || 0}
                    </p>
                  </div>
                  <div className="p-3 bg-amber-100 rounded-full">
                    <CreditCard className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">User Actions</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {stats.byUserRole.reduce((acc, r) => acc + r.count, 0)}
                    </p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-full">
                    <Users className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search activities..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full md:w-40">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="meal_plan">Meal Plan</SelectItem>
                  <SelectItem value="diet_plan">Diet Plan</SelectItem>
                  <SelectItem value="appointment">Appointment</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="profile">Profile</SelectItem>
                  <SelectItem value="client_assignment">Client Assignment</SelectItem>
                  <SelectItem value="auth">Authentication</SelectItem>
                </SelectContent>
              </Select>
              <Select value={actionTypeFilter} onValueChange={(v) => { setActionTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full md:w-40">
                  <SelectValue placeholder="Action Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="create">Create</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                  <SelectItem value="assign">Assign</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="cancel">Cancel</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="logout">Logout</SelectItem>
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full md:w-40">
                  <SelectValue placeholder="User Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="dietitian">Dietitian</SelectItem>
                  <SelectItem value="health_counselor">Health Counselor</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleSearch} className="md:w-auto">
                <Filter className="h-4 w-4 mr-2" />
                Apply
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Activity List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activities</CardTitle>
            <CardDescription>
              Showing {activities.length} of {total} activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner className="h-8 w-8" />
                <span className="ml-2 text-gray-600">Loading activities...</span>
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900">No activities found</h3>
                <p className="text-gray-500">Activity logs will appear here as users perform actions</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div
                    key={activity._id}
                    className="flex items-start gap-4 p-4 rounded-lg border hover:bg-gray-50 transition-colors"
                  >
                    {/* Category indicator */}
                    <div className={`w-1 h-full min-h-15 rounded-full ${categoryColors[activity.category] || 'bg-gray-400'}`} />
                    
                    {/* Action icon */}
                    <div className={`p-2 rounded-lg ${actionTypeColors[activity.actionType] || 'bg-gray-100 text-gray-700'}`}>
                      {getActionIcon(activity.actionType)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-gray-900">{activity.action}</p>
                          <p className="text-sm text-gray-600">{activity.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm text-gray-500">{formatDate(activity.createdAt)}</p>
                          <Badge variant="outline" className={`text-xs mt-1 ${roleColors[activity.userRole] || ''}`}>
                            {activity.userRole.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      
                      {/* User info */}
                      <div className="flex items-center gap-2 mt-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {activity.userName?.charAt(0) || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-gray-600">{activity.userName}</span>
                        {activity.targetUserName && (
                          <>
                            <ArrowRight className="h-3 w-3 text-gray-400" />
                            <span className="text-sm text-gray-600">{activity.targetUserName}</span>
                          </>
                        )}
                      </div>

                      {/* Resource info */}
                      {activity.resourceName && (
                        <div className="mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {activity.resourceType}: {activity.resourceName}
                          </Badge>
                        </div>
                      )}

                      {/* Change details */}
                      {activity.changeDetails && activity.changeDetails.length > 0 && (
                        <div className="mt-2 text-xs text-gray-500">
                          {activity.changeDetails.slice(0, 2).map((change, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <span className="font-medium">{change.fieldName}:</span>
                              <span className="text-red-500 line-through">{String(change.oldValue).substring(0, 20)}</span>
                              <ArrowRight className="h-3 w-3" />
                              <span className="text-green-500">{String(change.newValue).substring(0, 20)}</span>
                            </div>
                          ))}
                          {activity.changeDetails.length > 2 && (
                            <span className="text-gray-400">+{activity.changeDetails.length - 2} more changes</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-gray-600">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
