'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';
import { Bell, BellOff, X } from 'lucide-react';

interface NotificationPermissionBannerProps {
  className?: string;
  onDismiss?: () => void;
  allowedRoles?: string[];
}

export function NotificationPermissionBanner({
  className: _className,
  onDismiss,
  allowedRoles
}: NotificationPermissionBannerProps) {
  const { data: session, status } = useSession();
  const {
    isSupported,
    permission,
    requestPermission,
    registerToken
  } = usePushNotifications({ autoRegister: false });
  const [isRequesting, setIsRequesting] = useState(false);
  const toastIdRef = useRef<string | number | null>(null);

  const normalizedUserRole = String(session?.user?.role || '').toLowerCase();
  const isStaffRole = ['admin', 'dietitian', 'health_counselor'].includes(normalizedUserRole);

  const shouldShow =
    status === 'authenticated' &&
    permission !== 'granted' &&
    isSupported &&
    (!allowedRoles || allowedRoles.length === 0 ||
      allowedRoles.some(role => String(role).toLowerCase() === normalizedUserRole));

  const handleDismiss = () => {
    if (toastIdRef.current !== null) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }
    if (!isStaffRole && session?.user?.id) {
      localStorage.setItem(`notification_banner_dismissed_${session.user.id}`, 'true');
    }
    onDismiss?.();
  };

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    try {
      const granted = await requestPermission();
      if (granted) {
        const registered = await registerToken();
        if (registered) {
          if (toastIdRef.current !== null) {
            toast.dismiss(toastIdRef.current);
            toastIdRef.current = null;
          }
          toast.success('Push notifications enabled! You will receive alerts for new appointments and messages.');
        }
      }
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      toast.error('Failed to enable notifications. Please try again.');
    } finally {
      setIsRequesting(false);
    }
  };

  useEffect(() => {
    if (toastIdRef.current !== null) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }

    if (!shouldShow) return;

    if (!isStaffRole && session?.user?.id) {
      const dismissedKey = `notification_banner_dismissed_${session.user.id}`;
      if (localStorage.getItem(dismissedKey) === 'true') return;
    }

    const isDenied = permission === 'denied';

    toastIdRef.current = toast.custom(
      (t) => (
        <div className="pointer-events-auto w-80 rounded-lg border bg-white shadow-lg dark:bg-gray-900 dark:border-gray-700">
          {/* Header row */}
          <div className="flex items-start justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              {isDenied ? (
                <BellOff className="h-4 w-4 text-red-500 shrink-0" />
              ) : (
                <Bell className="h-4 w-4 text-[#E06A26] shrink-0" />
              )}
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                {isDenied ? 'Notifications Blocked' : 'Enable Notifications'}
              </span>
            </div>
            <button
              onClick={() => {
                toast.dismiss(t);
                toastIdRef.current = null;
                handleDismiss();
              }}
              className="rounded-md p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Description */}
          <p className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {isDenied
              ? 'Notifications are blocked. To receive alerts for new appointments and messages, please enable them in your browser settings.'
              : 'Enable push notifications to receive instant alerts for new appointments, messages, and important updates.'}
          </p>

          {/* Button row */}
          <div className="flex items-center justify-end gap-2 px-4 pb-4 pt-0">
            <button
              onClick={() => {
                toast.dismiss(t);
                toastIdRef.current = null;
                handleDismiss();
              }}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Maybe Later
            </button>
            {isDenied ? (
              <button
                onClick={() => {
                  alert(
                    'Please enable notifications in your browser settings:\n\n1. Click the lock icon in the address bar\n2. Set notifications to "Allow"\n3. Refresh the page'
                  );
                }}
                className="rounded-md bg-[#E06A26] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#c55a1f] transition-colors"
              >
                Browser Settings
              </button>
            ) : (
              <button
                onClick={handleRequestPermission}
                disabled={isRequesting}
                className="rounded-md bg-[#E06A26] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#c55a1f] disabled:opacity-50 transition-colors"
              >
                {isRequesting ? 'Requesting...' : 'Enable'}
              </button>
            )}
          </div>
        </div>
      ),
      {
        position: 'bottom-right',
        duration: Infinity,
        dismissible: true,
      }
    );
  }, [shouldShow, permission, isStaffRole, isRequesting, status]);

  return null;
}
