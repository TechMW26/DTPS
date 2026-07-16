import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { signOut } from 'next-auth/react';

/**
 * Hook to listen for account deactivation/suspension notifications.
 * Uses lightweight polling (every 5 min) instead of a persistent SSE connection
 * to reduce network overhead — especially important on mobile/slow networks.
 */
export function useLogoutNotification() {
  const { data: session, status } = useSession();
  const checkingRef = useRef(false);

  useEffect(() => {
    // Only set up listener if user is authenticated
    if (status !== 'authenticated' || !session?.user?.id) {
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const checkAccountStatus = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;

      try {
        const res = await fetch('/api/auth/logout-notification?check=1', {
          method: 'GET',
          credentials: 'same-origin',
        });

        if (res.ok) {
          const data = await res.json();
          if (data.type === 'deactivated' || data.type === 'suspended') {
            console.log('[LogoutNotification] Account deactivated/suspended, logging out');
            if (intervalId) clearInterval(intervalId);
            signOut({ 
              redirect: true, 
              callbackUrl: '/auth/signin?reason=deactivated' 
            });
          }
        }
      } catch {
        // Silently ignore — will retry on next interval
      } finally {
        checkingRef.current = false;
      }
    };

    // Check every 5 minutes (aligned with session refetch interval)
    intervalId = setInterval(checkAccountStatus, 5 * 60 * 1000);

    // Also check on visibility change (user comes back to app)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkAccountStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [session?.user?.id, status]);
}
