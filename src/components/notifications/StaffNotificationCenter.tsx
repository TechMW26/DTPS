'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Bell, Check, CheckCheck, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface StaffNotificationCenterProps {
    isDarkMode?: boolean;
    className?: string;
}

interface NotificationItem {
    _id: string;
    title: string;
    message: string;
    type: string;
    read: boolean;
    actionUrl?: string;
    data?: Record<string, unknown>;
    createdAt: string;
}

function toRelativeTime(dateValue: string): string {
    const now = Date.now();
    const date = new Date(dateValue).getTime();
    const diffMs = Math.max(0, now - date);

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diffMs < minute) return 'Just now';
    if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
    if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
    return `${Math.floor(diffMs / day)}d ago`;
}

function normalizeRole(role?: string): string {
    return String(role || '').toLowerCase();
}

export default function StaffNotificationCenter({ isDarkMode = false, className }: StaffNotificationCenterProps) {
    const { data: session, status } = useSession();
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [markingAll, setMarkingAll] = useState(false);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [markingIds, setMarkingIds] = useState<Record<string, boolean>>({});

    const isStaffRole = useMemo(() => {
        const role = normalizeRole(session?.user?.role);
        return role === 'admin' || role === 'dietitian' || role === 'health_counselor';
    }, [session?.user?.role]);

    const fetchNotifications = useCallback(async (asRefresh = false) => {
        if (status !== 'authenticated' || !isStaffRole) return;

        if (asRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const [listResponse, unreadResponse] = await Promise.all([
                fetch('/api/client/notifications?limit=20', {
                    credentials: 'same-origin',
                    cache: 'no-store',
                }),
                fetch('/api/client/notifications/unread-count', {
                    credentials: 'same-origin',
                    cache: 'no-store',
                }),
            ]);

            if (listResponse.ok) {
                const listPayload = await listResponse.json();
                setNotifications(Array.isArray(listPayload.notifications) ? listPayload.notifications : []);
            }

            if (unreadResponse.ok) {
                const unreadPayload = await unreadResponse.json();
                setUnreadCount(Number(unreadPayload.count || 0));
            }
        } catch (error) {
            console.error('Failed to fetch staff notifications:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [status, isStaffRole]);

    useEffect(() => {
        if (status !== 'authenticated' || !isStaffRole) return;

        fetchNotifications();

        const interval = setInterval(() => {
            fetchNotifications(true);
        }, 30000);

        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                fetchNotifications(true);
            }
        };

        window.addEventListener('focus', onVisibility);
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', onVisibility);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [status, isStaffRole, fetchNotifications]);

    const markAsRead = useCallback(async (notificationId: string) => {
        setMarkingIds((prev) => ({ ...prev, [notificationId]: true }));

        try {
            const response = await fetch('/api/client/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ notificationIds: [notificationId] }),
            });

            if (response.ok) {
                setNotifications((prev) =>
                    prev.map((item) => (item._id === notificationId ? { ...item, read: true } : item))
                );
                setUnreadCount((prev) => Math.max(0, prev - 1));
            }
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        } finally {
            setMarkingIds((prev) => {
                const next = { ...prev };
                delete next[notificationId];
                return next;
            });
        }
    }, []);

    const markAllAsRead = useCallback(async () => {
        if (unreadCount <= 0 || markingAll) return;

        setMarkingAll(true);
        try {
            const response = await fetch('/api/client/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ markAll: true }),
            });

            if (response.ok) {
                setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
                setUnreadCount(0);
            }
        } catch (error) {
            console.error('Failed to mark all notifications as read:', error);
        } finally {
            setMarkingAll(false);
        }
    }, [unreadCount, markingAll]);

    const resolveActionUrl = useCallback((item: NotificationItem): string | null => {
        if (item.actionUrl) return item.actionUrl;
        if (typeof item.data?.clickAction === 'string' && item.data.clickAction) {
            return item.data.clickAction;
        }
        if (typeof item.data?.url === 'string' && item.data.url) {
            return item.data.url;
        }
        return null;
    }, []);

    const onNotificationClick = useCallback(async (item: NotificationItem) => {
        const actionUrl = resolveActionUrl(item);

        if (!item.read) {
            await markAsRead(item._id);
        }

        if (actionUrl) {
            window.location.href = actionUrl;
        }

        setOpen(false);
    }, [markAsRead, resolveActionUrl]);

    if (!isStaffRole || status !== 'authenticated') {
        return null;
    }

    return (
        <DropdownMenu
            open={open}
            onOpenChange={(nextOpen) => {
                setOpen(nextOpen);
                if (nextOpen) {
                    fetchNotifications(true);
                }
            }}
        >
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                        'relative h-9 w-9',
                        isDarkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100',
                        className
                    )}
                    aria-label="Open notifications"
                >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="end"
                className={cn(
                    'w-[22rem] max-w-[calc(100vw-1rem)] p-0',
                    isDarkMode ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'
                )}
            >
                <div className={cn('border-b px-3 py-2', isDarkMode ? 'border-gray-700' : 'border-gray-200')}>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">Notifications</p>
                            <Badge variant="secondary" className="h-5 rounded-full px-2 text-[11px]">
                                {unreadCount} unread
                            </Badge>
                        </div>

                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => fetchNotifications(true)}
                                disabled={isRefreshing}
                            >
                                {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            </Button>

                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={markAllAsRead}
                                disabled={unreadCount <= 0 || markingAll}
                            >
                                {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="mr-1 h-3.5 w-3.5" />}
                                Mark all
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="max-h-96 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading notifications...
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-gray-500">
                            No notifications yet
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-800">
                            {notifications.map((item) => {
                                const actionUrl = resolveActionUrl(item);
                                const isMarking = Boolean(markingIds[item._id]);

                                return (
                                    <div
                                        key={item._id}
                                        className={cn(
                                            'px-3 py-2 transition-colors',
                                            item.read
                                                ? isDarkMode
                                                    ? 'bg-gray-900'
                                                    : 'bg-white'
                                                : isDarkMode
                                                    ? 'bg-gray-800/70'
                                                    : 'bg-blue-50/60'
                                        )}
                                    >
                                        <div className="mb-1 flex items-start justify-between gap-2">
                                            <button
                                                className="min-w-0 flex-1 text-left"
                                                onClick={() => onNotificationClick(item)}
                                            >
                                                <p className={cn('truncate text-sm font-medium', isDarkMode ? 'text-gray-100' : 'text-gray-900')}>
                                                    {item.title}
                                                </p>
                                                <p className={cn('mt-0.5 line-clamp-2 text-xs', isDarkMode ? 'text-gray-300' : 'text-gray-600')}>
                                                    {item.message}
                                                </p>
                                            </button>

                                            {!item.read && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 shrink-0"
                                                    disabled={isMarking}
                                                    onClick={() => markAsRead(item._id)}
                                                    aria-label="Mark notification as read"
                                                >
                                                    {isMarking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                                </Button>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className={cn('text-[11px]', isDarkMode ? 'text-gray-400' : 'text-gray-500')}>
                                                {toRelativeTime(item.createdAt)}
                                            </span>

                                            {actionUrl && (
                                                <button
                                                    className={cn(
                                                        'inline-flex items-center text-[11px] font-medium',
                                                        isDarkMode ? 'text-blue-300 hover:text-blue-200' : 'text-blue-600 hover:text-blue-700'
                                                    )}
                                                    onClick={() => onNotificationClick(item)}
                                                >
                                                    Open
                                                    <RefreshCw className="ml-1 h-3 w-3 rotate-45" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
