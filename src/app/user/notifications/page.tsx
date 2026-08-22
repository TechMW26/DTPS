'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import UserNavBar from '@/components/client/UserNavBar';
import { useUnreadCountsSafe } from '@/contexts/UnreadCountContext';
import PageTransition from '@/components/animations/PageTransition';
import { useTheme } from '@/contexts/ThemeContext';
import { Bell, Check, CheckCheck, Trash2, Calendar, MessageSquare, Utensils, TrendingUp, Clock, CreditCard, Settings, RefreshCw, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ClientPageSkeleton, ListSkeleton } from '@/components/ui/skeleton';

interface Notification {
  _id: string;
  title: string;
  message: string;
  type: 'meal' | 'appointment' | 'progress' | 'message' | 'reminder' | 'system' | 'task' | 'payment' | 'custom';
  read: boolean;
  data?: Record<string, unknown>;
  actionUrl?: string;
  createdAt: string;
}

interface NotificationResponse {
  success: boolean;
  notifications: Notification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  unreadCount: number;
}

export default function NotificationsPage() {
    const router = useRouter();
  const { data: session, status } = useSession();
  const { refreshCounts } = useUnreadCountsSafe();
  const { isDarkMode } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const fetchNotifications = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    try {
      const params = new URLSearchParams();
      if (activeFilter === 'unread') {
        params.append('unread', 'true');
      } else if (activeFilter !== 'all') {
        params.append('type', activeFilter);
      }
      
      const response = await fetch(`/api/client/notifications?${params.toString()}`);
      if (response.ok) {
        const data: NotificationResponse = await response.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
        
        // Auto-mark all unread notifications as read when viewing the page
        if (data.unreadCount > 0 && activeFilter !== 'unread') {
          // Mark all as read in background
          fetch('/api/client/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markAll: true })
          }).then(() => {
            setUnreadCount(0);
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
          }).catch(err => console.error('Error auto-marking as read:', err));
        }
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    if (session?.user) {
      fetchNotifications();
    }
  }, [session, fetchNotifications]);

  const markAsRead = async (notificationIds: string[]) => {
    try {
      const response = await fetch('/api/client/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds })
      });
      
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.unreadCount);
        setNotifications(prev => 
          prev.map(n => 
            notificationIds.includes(n._id) ? { ...n, read: true } : n
          )
        );
        // Refresh unread counts in context after marking as read
        await refreshCounts();
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const response = await fetch('/api/client/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true })
      });
      
      if (response.ok) {
        setUnreadCount(0);
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        // Refresh unread counts in context after marking all as read
        await refreshCounts();
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/client/notifications?id=${notificationId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setNotifications(prev => prev.filter(n => n._id !== notificationId));
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'meal':
        return <Utensils className="h-5 w-5 text-green-600" />;
      case 'appointment':
        return <Calendar className="h-5 w-5 text-blue-600" />;
      case 'message':
        return <MessageSquare className="h-5 w-5 text-purple-600" />;
      case 'progress':
        return <TrendingUp className="h-5 w-5 text-emerald-600" />;
      case 'reminder':
        return <Clock className="h-5 w-5 text-amber-600" />;
      case 'task':
        return <Check className="h-5 w-5 text-indigo-600" />;
      case 'payment':
        return <CreditCard className="h-5 w-5 text-pink-600" />;
      case 'system':
        return <Settings className="h-5 w-5 text-gray-600" />;
      default:
        return <Bell className="h-5 w-5 text-orange-600" />;
    }
  };

  const getNotificationBgColor = (type: string) => {
    switch (type) {
      case 'meal':
        return 'bg-green-50';
      case 'appointment':
        return 'bg-blue-50';
      case 'message':
        return 'bg-purple-50';
      case 'progress':
        return 'bg-emerald-50';
      case 'reminder':
        return 'bg-amber-50';
      case 'task':
        return 'bg-indigo-50';
      case 'payment':
        return 'bg-pink-50';
      case 'system':
        return 'bg-gray-50';
      default:
        return 'bg-orange-50';
    }
  };

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'meal', label: 'Meals' },
    { id: 'appointment', label: 'Appointments' },
    { id: 'message', label: 'Messages' },
    { id: 'task', label: 'Tasks' },
    { id: 'payment', label: 'Payments' }
  ];

  if (status === 'loading') {
    return <ClientPageSkeleton variant="list" showHeader={false} />;
  }

  return (
    <PageTransition>
      <div className={`min-h-screen overflow-x-hidden transition-colors duration-500 ${isDarkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
      {/* Header with centered title */}
      {/* Header with centered title */}
      <div className={`sticky top-0 z-40 transition-colors duration-300 ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} border-b`}>
        <div className="relative flex items-center justify-center px-4 py-4">
          <button
            onClick={() => router.back()}
            className="absolute left-4 flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#3AB1A0]/10 transition-colors"
          >
            <ArrowLeft className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`} />
          </button>
          <h1 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-black'}`}>Notifications</h1>
        </div>
      </div>

      {/* Header Actions */}
      <div className={`transition-colors duration-300 ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} border-b px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-[#3AB1A0]" />
            <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchNotifications(true)}
              disabled={refreshing}
              className={`p-2 hover:text-[#3AB1A0] hover:bg-[#3AB1A0]/10 rounded-full transition-colors ${
                isDarkMode ? 'text-gray-300' : 'text-gray-500'
              }`}
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-[#3AB1A0] hover:bg-[#3AB1A0]/10 rounded-lg transition-colors"
              >
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div
        className={`px-4 py-3 overflow-x-auto scrollbar-hide border-b ${
          isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
        }`}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex gap-2 min-w-max">
          {filters.map(filter => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`px-5 py-2 text-base font-semibold rounded-full transition-colors ${
                activeFilter === filter.id
                  ? 'bg-[#3AB1A0] text-white'
                  : isDarkMode
                    ? 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications List */}
      <div className="p-4">
        {loading ? (
          <ListSkeleton rows={7} />
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
              <Bell className={`h-10 w-10 ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`} />
            </div>
            <h3 className={`text-lg font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>No notifications</h3>
            <p className={`text-sm max-w-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
              {activeFilter === 'unread' 
                ? "You've read all your notifications" 
                : "You don't have any notifications yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification._id}
                className={`rounded-xl shadow-sm overflow-hidden transition-all ${
                  isDarkMode ? 'bg-gray-900' : 'bg-white'
                } ${!notification.read ? 'border-l-4 border-[#3AB1A0]' : ''}`}
              >
                <div 
                  className="p-4 flex gap-3"
                  onClick={() => {
                    // Only mark as read when clicking, don't navigate anywhere
                    if (!notification.read) {
                      markAsRead([notification._id]);
                    }
                  }}
                >
                  {/* Icon */}
                  <div className="shrink-0 w-10 h-10 rounded-full bg-[#3AB1A0]/10 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-[#3AB1A0]" />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        className={`text-sm ${
                          !notification.read ? 'font-bold' : 'font-semibold'
                        } ${isDarkMode ? 'text-white' : !notification.read ? 'text-gray-900' : 'text-gray-700'}`}
                      >
                        {notification.title}
                      </h3>
                      {!notification.read && (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-[#3AB1A0]"></span>
                      )}
                    </div>
                    <p className={`text-sm mt-0.5 line-clamp-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                      {notification.message}
                    </p>
                    <p className={`text-xs mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                {/* Actions - only delete button, no type tag */}
                <div
                  className={`px-4 py-2 flex items-center justify-end border-t ${
                    isDarkMode ? 'bg-gray-950 border-gray-800' : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {!notification.read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead([notification._id]);
                        }}
                        className="p-1.5 text-gray-400 hover:text-[#3AB1A0] hover:bg-[#3AB1A0]/10 rounded-full transition-colors"
                        title="Mark as read"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification._id);
                      }}
                      className={`p-1.5 text-gray-400 hover:text-red-600 rounded-full transition-colors ${
                        isDarkMode ? 'hover:bg-red-900/30' : 'hover:bg-red-50'
                      }`}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </PageTransition>
  );
}
