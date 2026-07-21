'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Checks media storage availability and shows a persistent toast
 * on admin/dietitian dashboards when the service is degraded.
 * Only runs on staff pages — does NOT use ImageKit branding.
 */
export function useMediaServiceStatus(enabled: boolean = true) {
  const hasShownRef = useRef(false);

  useEffect(() => {
    if (!enabled || hasShownRef.current) return;

    const checkStatus = async () => {
      try {
        const res = await fetch('/api/system/status');
        if (!res.ok) return;
        const data = await res.json();

        if (data?.services?.mediaStorage?.status === 'down') {
          hasShownRef.current = true;
          toast.error('Media service disruption', {
            description:
              data.services.mediaStorage.message ||
              'File and image uploads are temporarily unavailable. Your chats and data remain accessible.',
            duration: Infinity,
            dismissible: true,
            id: 'media-service-down',
          });
        }
      } catch {
        // Silently fail — don't spam users on network errors
      }
    };

    // Delay slightly to let page render first
    const timer = setTimeout(checkStatus, 2000);
    return () => clearTimeout(timer);
  }, [enabled]);
}
