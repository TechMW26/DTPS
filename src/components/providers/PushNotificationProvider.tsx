'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useNativeApp, ForegroundNotification } from '@/hooks/useNativeApp';
import { socketClient } from '@/lib/realtime/socket-client';
import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';
import { toast } from 'sonner';

interface PushNotificationProviderProps {
    children: React.ReactNode;
    autoRegister?: boolean;
    onNotification?: (payload: any) => void;
}

function normalizeRoleValue(role: unknown): string {
    const normalized = String(role || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');

    if (normalized === 'dietician') return 'dietitian';
    if (normalized === 'healthcounselor' || normalized === 'health_counsellor') return 'health_counselor';

    return normalized;
}

/**
 * Provider component that handles push notification registration
 * Add this to your layout or a high-level component
 * 
 * Handles both:
 * 1. Web push notifications (via Firebase Messaging) - for staff dashboards
 * 2. Native Android app FCM token registration (via WebView bridge) - for clients in native app
 * 
 * Note: 
 * - User/Client panel: No web push registration here, native app handles client notifications
 * - Dietitian/Health Counselor/Admin panels: Web push enabled with role-aware routing
 */
export function PushNotificationProvider({
    children,
    autoRegister = true,
    onNotification,
}: PushNotificationProviderProps) {
    const { data: session, status } = useSession();

    // Get user role
    const userRole = normalizeRoleValue(session?.user?.role);
    const isDietitianOrCounselor = userRole === 'dietitian' || userRole === 'health_counselor';
    const isAdmin = userRole === 'admin';
    const isStaffWebPushRole = isAdmin || isDietitianOrCounselor;

    // Track last notification to prevent duplicates
    const lastNotificationRef = useRef<{ id: string; timestamp: number } | null>(null);

    // Helper to check if notification is duplicate
    const isDuplicateNotification = useCallback((title: string, body: string, data?: any): boolean => {
        const now = Date.now();
        const notificationId = `${title}-${body}-${JSON.stringify(data || {})}`;

        // Check if same notification was received within last 2 seconds
        if (lastNotificationRef.current) {
            const timeDiff = now - lastNotificationRef.current.timestamp;
            if (lastNotificationRef.current.id === notificationId && timeDiff < 2000) {
                console.log('[PushNotificationProvider] Duplicate notification detected, skipping');
                return true;
            }
        }

        // Update last notification
        lastNotificationRef.current = { id: notificationId, timestamp: now };
        return false;
    }, []);

    const syncUnreadNotificationBadge = useCallback(async () => {
        if (typeof window === 'undefined' || !('navigator' in window) || !isStaffWebPushRole) return;

        try {
            const response = await fetch('/api/client/notifications/unread-count', {
                credentials: 'same-origin',
                cache: 'no-store',
            });

            if (!response.ok) return;

            const payload = await response.json();
            const count = Number(payload?.count || 0);

            if (typeof (navigator as any).setAppBadge === 'function') {
                if (count > 0) {
                    await (navigator as any).setAppBadge(count);
                } else if (typeof (navigator as any).clearAppBadge === 'function') {
                    await (navigator as any).clearAppBadge();
                }
            }
        } catch {
            // Best effort only - badge API is optional
        }
    }, [isStaffWebPushRole]);

    const getNotificationIcon = useCallback((notificationType: string) => {
        switch (notificationType) {
            case 'new_message':
            case 'message':
                return '💬';
            case 'appointment':
            case 'appointment_booked':
            case 'appointment_cancelled':
            case 'appointment_reminder':
                return '📅';
            case 'meal':
            case 'meal_plan':
            case 'meal_plan_created':
            case 'meal_plan_updated':
                return '🍽️';
            case 'payment':
            case 'payment_link':
            case 'payment_link_created':
                return '💳';
            case 'task_assigned':
                return '✅';
            case 'call':
                return '📞';
            default:
                return '🔔';
        }
    }, []);

    const normalizeTargetPath = useCallback((target?: string): string | null => {
        const trimmed = String(target || '').trim();
        if (!trimmed) return null;
        if (/^https?:\/\//i.test(trimmed)) return trimmed;
        return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    }, []);

    const getDefaultTargetForRole = useCallback((role: string): string => {
        if (role === 'admin') return '/admin';
        if (role === 'dietitian') return '/dashboard/dietitian';
        if (role === 'health_counselor') return '/dashboard/health-counselor';
        if (role === 'client') return '/user';
        return '/';
    }, []);

    const getPayloadData = useCallback((payload: any): Record<string, any> => {
        const data = payload?.data;
        if (data && typeof data === 'object') return data;
        return {};
    }, []);

    const extractNotificationMeta = useCallback((payload: any) => {
        const data = getPayloadData(payload);
        const title = payload?.notification?.title || data.title || 'New Notification';
        const body = payload?.notification?.body || data.body || data.message || '';
        const type = data.type || data.notificationType || 'general';
        return { data, title, body, type };
    }, [getPayloadData]);

    const resolveTargetPath = useCallback((payload: any): string => {
        const { data, type } = extractNotificationMeta(payload);
        const normalizedType = String(type || 'general').toLowerCase();
        const explicitTarget = normalizeTargetPath(
            data.clickAction
            || data.click_action
            || data.url
            || data.actionUrl
            || data.action_url
        );

        if (explicitTarget) {
            return explicitTarget;
        }

        if (normalizedType === 'new_message' || normalizedType === 'message' || data.actionType === 'message') {
            const conversationWith = String(
                data.conversationWith
                || data.conversation_with
                || data.conversationWithUserId
                || data.conversation_with_user_id
                || data.senderId
                || data.sender_id
                || ''
            ).trim();
            if (userRole === 'health_counselor') {
                return conversationWith
                    ? `/health-counselor/messages?conversationWith=${encodeURIComponent(conversationWith)}`
                    : '/health-counselor/messages';
            }
            if (userRole === 'client') {
                return conversationWith
                    ? `/user/messages?conversationWith=${encodeURIComponent(conversationWith)}`
                    : '/user/messages';
            }
            return conversationWith
                ? `/messages?conversationWith=${encodeURIComponent(conversationWith)}`
                : '/messages';
        }

        if (normalizedType === 'appointment' || normalizedType === 'appointment_booked' || normalizedType === 'appointment_cancelled' || normalizedType === 'appointment_reminder') {
            return userRole === 'client' ? '/user/appointments' : '/appointments';
        }

        if (normalizedType === 'meal' || normalizedType === 'meal_plan' || normalizedType === 'meal_plan_created' || normalizedType === 'meal_plan_updated') {
            if (userRole === 'client') return '/my-plan';
            const clientId = String(data.clientId || data.client_id || '').trim();
            if (clientId && userRole === 'dietitian') return `/dietician/clients/${clientId}`;
            if (clientId && userRole === 'health_counselor') return `/health-counselor/clients/${clientId}`;
        }

        if (normalizedType === 'task_assigned') {
            return userRole === 'client' ? '/user/tasks' : '/dashboard';
        }

        if (normalizedType === 'payment' || normalizedType === 'payment_link' || normalizedType === 'payment_link_created') {
            return userRole === 'client' ? '/user/payments' : '/billing';
        }

        return getDefaultTargetForRole(userRole);
    }, [extractNotificationMeta, getDefaultTargetForRole, normalizeTargetPath, userRole]);

    const buildDetailLine = useCallback((payload: any): string => {
        const data = getPayloadData(payload);
        const details: string[] = [];

        if (data.clientName) {
            details.push(`Client: ${data.clientName}`);
        }

        if (data.senderName) {
            details.push(`From: ${data.senderName}`);
        }

        if (data.actionType) {
            const action = String(data.actionType).replace(/_/g, ' ');
            details.push(`Action: ${action}`);
        }

        const timestampRaw = data.timestamp || data.sentAt;
        if (timestampRaw) {
            const parsed = new Date(String(timestampRaw));
            if (!Number.isNaN(parsed.getTime())) {
                details.push(
                    parsed.toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                    })
                );
            }
        }

        return details.join(' • ');
    }, [getPayloadData]);

    const openNotificationTarget = useCallback((targetPath: string) => {
        if (typeof window === 'undefined') return;
        const normalized = normalizeTargetPath(targetPath) || '/';
        window.location.href = normalized;
    }, [normalizeTargetPath]);

    const showPushBanner = useCallback((payload: any) => {
        const { title, body, type } = extractNotificationMeta(payload);
        const icon = getNotificationIcon(type);
        const detailLine = buildDetailLine(payload);
        const targetPath = resolveTargetPath(payload);

        toast.custom(() => (
            <button
                type="button"
                className="web-push-banner-card"
                onClick={() => {
                    toast.dismiss();
                    openNotificationTarget(targetPath);
                }}
                title="Open related work"
            >
                <div className="web-push-banner-header">
                    <span className="web-push-banner-title">{icon} {title}</span>
                    <span className="web-push-banner-open">Open &gt;</span>
                </div>
                {body ? <p className="web-push-banner-body">{body}</p> : null}
                {detailLine ? <p className="web-push-banner-detail">{detailLine}</p> : null}
            </button>
        ), {
            duration: 6000,
            closeButton: true,
            position: 'bottom-left',
            className: 'web-push-toast',
        });
    }, [buildDetailLine, extractNotificationMeta, getNotificationIcon, openNotificationTarget, resolveTargetPath]);

    const showPreviewBanner = useCallback((previewRole: string) => {
        const previewClickAction = previewRole === 'health_counselor'
            ? '/health-counselor/messages'
            : '/messages';

        const previewPayload = {
            notification: {
                title: 'New message from Demo Client',
                body: 'Your client sent an update. Click this banner to open the related work.',
            },
            data: {
                type: 'new_message',
                senderName: 'Demo Client',
                clientName: 'Demo Client',
                actionType: 'message',
                timestamp: new Date().toISOString(),
                clickAction: previewClickAction,
            },
        };

        showPushBanner(previewPayload);
    }, [showPushBanner]);

    // Handle foreground notification display with toast for staff roles
    const handleForegroundNotification = useCallback((payload: any) => {
        console.log('[PushNotificationProvider] Foreground notification received:', payload);

        const { title, body, type, data } = extractNotificationMeta(payload);

        // Check for duplicate notification
        if (isDuplicateNotification(title, body, data)) {
            return;
        }

        console.log('[PushNotificationProvider] Showing notification banner:', { title, body, type });

        // Show bottom push banner with details and click-to-open behavior
        showPushBanner(payload);

        // Keep app-level unread badge in sync for supported browsers
        syncUnreadNotificationBadge();

        // Also call custom handler if provided
        if (onNotification) {
            onNotification(payload);
        }
    }, [extractNotificationMeta, onNotification, isDuplicateNotification, syncUnreadNotificationBadge, showPushBanner]);

    // Enable web push for staff dashboard roles
    const { isSupported, permission, registerToken } = usePushNotifications({
        autoRegister: false, // We'll handle it manually
        onNotification: handleForegroundNotification,
        enabled: isStaffWebPushRole,
    });

    // Native app hook - handles FCM token registration for Android WebView
    const {
        isNativeApp,
        fcmToken,
        tokenRegistered,
        requestNotificationPermission: requestNativePermission,
        isLoading: nativeLoading,
        onForegroundNotification: setNativeForegroundHandler
    } = useNativeApp();

    // Handle native app foreground notifications - NO toast for clients (user panel)
    const handleNativeForegroundNotification = useCallback((notification: ForegroundNotification) => {
        console.log('[PushNotificationProvider] Native foreground notification received:', JSON.stringify(notification));

        const title = notification.title || 'New Notification';
        const body = notification.body || '';
        const type = notification.data?.type || 'general';

        // Check for duplicate notification (uses the same deduplication logic)
        if (isDuplicateNotification(title, body, notification.data)) {
            return;
        }

        console.log('[PushNotificationProvider] Showing native notification banner:', { title, body, type });

        // Show bottom push banner with details and click-to-open behavior
        showPushBanner({
            notification: { title, body },
            data: notification.data || {},
        });

        // Call user's custom handler if provided
        if (onNotification) {
            onNotification({
                notification: { title, body },
                data: notification.data
            });
        }
    }, [onNotification, isDuplicateNotification, showPushBanner]);

    // Set up native foreground notification handler
    useEffect(() => {
        if (isNativeApp) {
            setNativeForegroundHandler(handleNativeForegroundNotification);
        }
    }, [isNativeApp, setNativeForegroundHandler, handleNativeForegroundNotification]);

    // Fallback for in-app real-time messages when foreground FCM notification doesn't fire.
    useEffect(() => {
        if (status !== 'authenticated') return;

        const unsubscribe = socketClient.on(SOCKET_EVENTS.NEW_MESSAGE, (payload: any) => {
            try {
                const message = payload?.message;
                if (!message) return;

                const senderId = String(message?.sender?._id || payload?.senderId || '').trim();
                const senderName = `${String(message?.sender?.firstName || '').trim()} ${String(message?.sender?.lastName || '').trim()}`.trim()
                    || String(payload?.senderName || 'New message');

                const messageText = String(message?.content || payload?.content || '').trim();
                const preview = messageText || 'You received a new message.';
                const messageId = String(message?._id || payload?.messageId || '').trim();

                let clickAction = '/messages';
                if (userRole === 'health_counselor') {
                    clickAction = senderId
                        ? `/health-counselor/messages?conversationWith=${encodeURIComponent(senderId)}`
                        : '/health-counselor/messages';
                } else if (userRole === 'client') {
                    clickAction = senderId
                        ? `/user/messages?conversationWith=${encodeURIComponent(senderId)}`
                        : '/user/messages';
                } else {
                    clickAction = senderId
                        ? `/messages?conversationWith=${encodeURIComponent(senderId)}`
                        : '/messages';
                }

                // Let existing duplicate guard suppress if FCM and socket arrive together.
                showPushBanner({
                    notification: {
                        title: `New message from ${senderName}`,
                        body: preview,
                    },
                    data: {
                        type: 'new_message',
                        actionType: 'message',
                        messageId,
                        senderName,
                        senderId,
                        conversationWith: senderId,
                        clickAction,
                        timestamp: String(message?.createdAt || new Date().toISOString()),
                    },
                });
            } catch (error) {
                console.error('[PushNotificationProvider] Failed to show socket fallback message banner:', error);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [showPushBanner, status, userRole]);

    // One-time preview for the in-app notification banner.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (status !== 'authenticated') return;

        const searchParams = new URLSearchParams(window.location.search);
        const previewParam = searchParams.get('previewNotificationBanner');
        const shouldPreview = previewParam === '1' || previewParam === 'true';

        if (!shouldPreview) {
            return;
        }

        // Wait a tick so Sonner host is fully mounted before firing preview toast.
        const timer = window.setTimeout(() => {
            showPreviewBanner(userRole);
        }, 250);

        searchParams.delete('previewNotificationBanner');
        const nextQuery = searchParams.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);

        return () => {
            window.clearTimeout(timer);
        };
    }, [showPreviewBanner, status, userRole]);

    // Manual debug hook to force preview banner from browser console.
    useEffect(() => {
        if (typeof window === 'undefined') return;

        window.__dtpsPreviewNotificationBanner = () => {
            showPreviewBanner(userRole);
        };

        return () => {
            delete window.__dtpsPreviewNotificationBanner;
        };
    }, [showPreviewBanner, userRole]);

    // Web push notification registration for staff roles (admin/dietitian/health-counselor)
    useEffect(() => {
        // Only register for web if not in native app
        if (isNativeApp) {
            return;
        }

        // Only register if:
        // 1. Auto-register is enabled
        // 2. User is authenticated
        // 3. Notifications are supported
        // 4. Permission is already granted (don't prompt automatically)
        // 5. User is staff role (admin/dietitian/health counselor)
        if (
            autoRegister &&
            status === 'authenticated' &&
            isSupported &&
            permission === 'granted' &&
            isStaffWebPushRole
        ) {
            registerToken();
        }
    }, [autoRegister, status, isSupported, permission, registerToken, isNativeApp, isStaffWebPushRole]);

    // Sync unread badge when tab becomes active
    useEffect(() => {
        if (status !== 'authenticated' || !isStaffWebPushRole || isNativeApp) return;

        syncUnreadNotificationBadge();

        const onFocus = () => {
            syncUnreadNotificationBadge();
        };

        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                syncUnreadNotificationBadge();
            }
        };

        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [status, isStaffWebPushRole, isNativeApp, syncUnreadNotificationBadge]);

    // Native app - log token registration status
    useEffect(() => {
        if (isNativeApp && !nativeLoading) {
            if (tokenRegistered) {
                console.log('[PushNotificationProvider] Native FCM token registered successfully');
            } else if (fcmToken) {
                console.log('[PushNotificationProvider] Native FCM token available, waiting for registration...');
            } else {
                console.log('[PushNotificationProvider] Native app detected, waiting for FCM token...');
            }
        }
    }, [isNativeApp, nativeLoading, tokenRegistered, fcmToken]);

    return <>{children}</>;
}

export default PushNotificationProvider;
