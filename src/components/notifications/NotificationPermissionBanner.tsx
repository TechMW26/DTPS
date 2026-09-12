'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';
import { Bell, BellOff } from 'lucide-react';

interface NotificationPermissionBannerProps {
  className?: string;
  onDismiss?: () => void;
  allowedRoles?: string[];
}

export function NotificationPermissionBanner({ onDismiss, allowedRoles }: NotificationPermissionBannerProps) {
  const { data: session, status } = useSession();
  const { isSupported, permission, requestPermission, registerToken } = usePushNotifications({ autoRegister: false });
  const requesting = useRef(false);
  const userId = session?.user?.id;
  const role = String(session?.user?.role || '').toLowerCase();
  const allowed = !allowedRoles?.length || allowedRoles.some(value => value.toLowerCase() === role);

  useEffect(() => {
    if (status !== 'authenticated' || !userId || !isSupported || !allowed || permission === 'granted') return;
    const dismissedKey = `notification_banner_dismissed_${userId}`;
    if (localStorage.getItem(dismissedKey) === 'true') return;
    const id = `notification-permission-${userId}`;
    const dismissed = () => {
      localStorage.setItem(dismissedKey, 'true');
      onDismiss?.();
    };
    const enable = async () => {
      if (requesting.current) return;
      requesting.current = true;
      // Keep a separate status toast: changing browser permission removes the prompt.
      const pendingId = toast.loading('Enabling notifications…');
      try {
        const granted = await requestPermission();
        const registered = granted && await registerToken();
        if (registered) {
          toast.success('Notifications enabled', { id: pendingId, description: 'You’ll receive alerts for messages and appointments.' });
        } else {
          toast.error(granted ? 'Notifications could not be enabled' : 'Notifications are not enabled', {
            id: pendingId,
            description: granted ? 'Please try again from notification settings.' : 'You can allow notifications in your browser’s site settings.',
          });
        }
      } catch {
        toast.error('Could not enable notifications', { id: pendingId, description: 'Please try again from notification settings.' });
      } finally {
        requesting.current = false;
      }
    };
    toast(permission === 'denied' ? 'Notifications are blocked' : 'Stay in the loop', {
      id,
      description: permission === 'denied'
        ? 'Allow notifications in your browser’s site settings for message and appointment alerts.'
        : 'Get reminders for appointments and new messages.',
      icon: permission === 'denied' ? <BellOff aria-hidden="true" size={20} /> : <Bell aria-hidden="true" size={20} />,
      duration: 10000,
      action: permission === 'denied' ? undefined : { label: 'Enable', onClick: enable },
      cancel: { label: 'Later', onClick: dismissed },
      onDismiss: dismissed,
      onAutoClose: dismissed,
    });
    return () => { toast.dismiss(id); };
  }, [status, userId, isSupported, allowed, permission, requestPermission, registerToken, onDismiss]);

  return null;
}
