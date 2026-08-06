'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

// Dynamic import types — Firebase SDK is lazy-loaded to avoid 50-80KB in initial bundle
type FCMHelper = typeof import('@/lib/firebase/fcmHelper');
let fcmHelperPromise: Promise<FCMHelper> | null = null;

function loadFCMHelper(): Promise<FCMHelper> {
    if (!fcmHelperPromise) {
        fcmHelperPromise = import('@/lib/firebase/fcmHelper');
    }
    return fcmHelperPromise;
}

interface UsePushNotificationsOptions {
    autoRegister?: boolean;
    onNotification?: (payload: any) => void;
    enabled?: boolean;
}

interface UsePushNotificationsReturn {
    isSupported: boolean;
    permission: NotificationPermission | 'unsupported';
    isRegistered: boolean;
    isLoading: boolean;
    error: string | null;
    requestPermission: () => Promise<boolean>;
    registerToken: () => Promise<boolean>;
    unregisterToken: () => Promise<boolean>;
}

export function usePushNotifications(
    options: UsePushNotificationsOptions = {}
): UsePushNotificationsReturn {
    const { autoRegister = true, onNotification, enabled = true } = options;
    const { data: session, status } = useSession();

    const [isSupported, setIsSupported] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
    const [isRegistered, setIsRegistered] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const unsubscribeRef = useRef<(() => void) | null>(null);
    const hasRegisteredRef = useRef(false);

    // Check support on mount — lazy-loads Firebase check
    useEffect(() => {
        if (!enabled) {
            setIsSupported(false);
            setPermission('unsupported');
            return;
        }
        // Quick check: skip entirely for native app WebViews
        const ua = navigator?.userAgent || '';
        if (ua.includes('NativeApp') || ua.includes('DTPSApp')) {
            setIsSupported(false);
            setPermission('unsupported');
            return;
        }

        loadFCMHelper().then(({ isPushNotificationSupported, getNotificationPermission }) => {
            const supported = isPushNotificationSupported();
            setIsSupported(supported);
            if (supported) {
                setPermission(getNotificationPermission());
            } else {
                setPermission('unsupported');
            }
        }).catch(() => {
            setIsSupported(false);
            setPermission('unsupported');
        });
    }, [enabled]);

    // Keep registration state in sync when permission changes outside this hook
    // (for example from the client Settings page or browser site controls).
    useEffect(() => {
        if (!enabled || !isSupported || !('permissions' in navigator)) return;

        let disposed = false;
        let permissionStatus: PermissionStatus | null = null;
        const syncPermission = () => {
            if (!disposed) setPermission(Notification.permission);
        };

        navigator.permissions.query({ name: 'notifications' }).then((status) => {
            if (disposed) return;
            permissionStatus = status;
            status.addEventListener('change', syncPermission);
        }).catch(() => { });

        window.addEventListener('focus', syncPermission);
        document.addEventListener('visibilitychange', syncPermission);

        return () => {
            disposed = true;
            permissionStatus?.removeEventListener('change', syncPermission);
            window.removeEventListener('focus', syncPermission);
            document.removeEventListener('visibilitychange', syncPermission);
        };
    }, [enabled, isSupported]);

    // Set up foreground message listener
    useEffect(() => {
        if (!enabled || !isSupported || !isRegistered) {
            return;
        }

        console.log('[usePushNotifications] Setting up foreground message listener...');

        let cancelled = false;
        loadFCMHelper().then(async ({ onForegroundMessage }) => {
            if (cancelled) return;
            const unsub = await onForegroundMessage((payload) => {
                console.log('[usePushNotifications] Foreground message received:', payload);
                if (onNotification) {
                    console.log('[usePushNotifications] Calling custom notification handler');
                    onNotification(payload);
                }
            });
            if (cancelled && unsub) {
                unsub();
            } else {
                unsubscribeRef.current = unsub;
            }
        }).catch(() => { });

        return () => {
            cancelled = true;
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
                unsubscribeRef.current = null;
            }
        };
    }, [enabled, isSupported, isRegistered, onNotification]);

    // Request permission
    const requestPermission = useCallback(async (): Promise<boolean> => {
        if (!enabled) {
            setError('Push notifications are disabled');
            return false;
        }
        if (!isSupported) {
            setError('Push notifications are not supported in this browser');
            return false;
        }

        setIsLoading(true);
        setError(null);

        try {
            const { requestNotificationPermission } = await loadFCMHelper();
            const result = await requestNotificationPermission();
            setPermission(result);
            return result === 'granted';
        } catch (err: any) {
            setError(err.message || 'Failed to request permission');
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [enabled, isSupported]);

    // Register token with backend
    const registerToken = useCallback(async (): Promise<boolean> => {
        if (!enabled) {
            setError('Push notifications are disabled');
            return false;
        }
        if (!isSupported) {
            setError('Push notifications are not supported');
            return false;
        }

        if (permission !== 'granted') {
            const granted = await requestPermission();
            if (!granted) {
                return false;
            }
        }

        setIsLoading(true);
        setError(null);

        try {
            const { registerFCMTokenWithBackend } = await loadFCMHelper();
            const success = await registerFCMTokenWithBackend();
            setIsRegistered(success);
            hasRegisteredRef.current = success;
            return success;
        } catch (err: any) {
            setError(err.message || 'Failed to register for push notifications');
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [enabled, isSupported, permission, requestPermission]);

    // Unregister token
    const unregisterToken = useCallback(async (): Promise<boolean> => {
        if (!enabled) {
            setError('Push notifications are disabled');
            return false;
        }
        setIsLoading(true);
        setError(null);

        try {
            const { unregisterFCMToken } = await loadFCMHelper();
            const success = await unregisterFCMToken();
            if (success) {
                setIsRegistered(false);
                hasRegisteredRef.current = false;
            }
            return success;
        } catch (err: any) {
            setError(err.message || 'Failed to unregister');
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [enabled]);

    // Auto-register when user is authenticated
    useEffect(() => {
        if (
            enabled &&
            autoRegister &&
            status === 'authenticated' &&
            session?.user?.id &&
            isSupported &&
            permission === 'granted' &&
            !hasRegisteredRef.current
        ) {
            registerToken();
        }
    }, [enabled, autoRegister, status, session, isSupported, permission, registerToken]);

    return {
        isSupported,
        permission,
        isRegistered,
        isLoading,
        error,
        requestPermission,
        registerToken,
        unregisterToken,
    };
}

export default usePushNotifications;
