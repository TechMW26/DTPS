'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bell, BellOff, X } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface NotificationPermissionBannerProps {
  className?: string;
  onDismiss?: () => void;
  /**
   * Roles that should see the banner. If not specified, shows for all authenticated users.
   */
  allowedRoles?: string[];
}

export function NotificationPermissionBanner({
  className,
  onDismiss,
  allowedRoles
}: NotificationPermissionBannerProps) {
  const { data: session, status } = useSession();
  const {
    isSupported,
    permission,
    isLoading,
    requestPermission,
    registerToken
  } = usePushNotifications({ autoRegister: false });
  const [isRequesting, setIsRequesting] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);

  const normalizedUserRole = String(session?.user?.role || '').toLowerCase();
  const isStaffRole = ['admin', 'dietitian', 'health_counselor'].includes(normalizedUserRole);

  // Check if banner should be shown
  useEffect(() => {
    if (status !== 'authenticated') {
      setShouldShow(false);
      return;
    }

    // Check role if allowedRoles is specified
    if (allowedRoles && allowedRoles.length > 0) {
      const normalizedAllowedRoles = allowedRoles.map((role) => String(role || '').toLowerCase());
      if (!normalizedUserRole || !normalizedAllowedRoles.includes(normalizedUserRole)) {
        setShouldShow(false);
        return;
      }
    }

    // Persist dismissal for non-staff users only.
    // Staff should continue seeing this prompt until notifications are enabled.
    if (!isStaffRole && session?.user?.id) {
      const dismissedKey = `notification_banner_dismissed_${session.user.id}`;
      const wasDismissed = localStorage.getItem(dismissedKey) === 'true';
      if (wasDismissed) {
        setIsDismissed(true);
        setShouldShow(false);
        return;
      }
    }

    if (isStaffRole) {
      setIsDismissed(false);
    }

    setShouldShow(true);
  }, [status, session, allowedRoles, normalizedUserRole, isStaffRole]);

  // Don't show if notifications are already granted, not supported, or dismissed
  if (!shouldShow || permission === 'granted' || !isSupported || isDismissed) {
    return null;
  }

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    try {
      const granted = await requestPermission();
      if (granted) {
        // Also register the FCM token
        const registered = await registerToken();
        if (registered) {
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

  const handleDismiss = () => {
    setIsDismissed(true);

    // Remember dismissal in local storage for non-staff only.
    if (!isStaffRole && session?.user?.id) {
      const dismissedKey = `notification_banner_dismissed_${session.user.id}`;
      localStorage.setItem(dismissedKey, 'true');
    }

    onDismiss?.();
  };

  const getAlertVariant = () => {
    switch (permission) {
      case 'denied':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const getIcon = () => {
    switch (permission) {
      case 'denied':
        return <BellOff className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getMessage = () => {
    switch (permission) {
      case 'denied':
        return 'Notifications are blocked. To receive alerts for new appointments and messages, please enable them in your browser settings.';
      default:
        return 'Enable push notifications to receive instant alerts for new appointments, messages, and important updates.';
    }
  };

  const getActionButton = () => {
    switch (permission) {
      case 'denied':
        return (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Open browser settings (this is browser-specific)
              alert('Please enable notifications in your browser settings:\n\n1. Click the lock icon in the address bar\n2. Set notifications to "Allow"\n3. Refresh the page');
            }}
          >
            Browser Settings
          </Button>
        );
      default:
        return (
          <Button
            variant="default"
            size="sm"
            onClick={handleRequestPermission}
            disabled={isRequesting}
          >
            {isRequesting ? 'Requesting...' : 'Enable Notifications'}
          </Button>
        );
    }
  };

  return (
    <Alert variant={getAlertVariant()} className={cn("relative", className)}>
      {getIcon()}
      <AlertDescription className="">
        {getMessage()}
      </AlertDescription>

      <div className="flex items-center space-x-2 mt-3">
        {getActionButton()}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
        >
          Maybe Later
        </Button>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleDismiss}
        className="absolute top-2 right-2 h-6 w-6 p-0"
      >
        <X className="h-3 w-3" />
      </Button>
    </Alert>
  );
}
