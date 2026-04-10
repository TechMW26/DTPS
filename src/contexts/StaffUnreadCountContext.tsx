'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { socketClient } from '@/lib/realtime/socket-client';
import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';

interface UnreadCounts {
  messages: number;
}

interface StaffUnreadCountContextType {
  counts: UnreadCounts;
  refreshCounts: () => Promise<void>;
  isConnected: boolean;
}

const StaffUnreadCountContext = createContext<StaffUnreadCountContextType | undefined>(undefined);

interface StaffUnreadCountProviderProps {
  children: ReactNode;
}

export function StaffUnreadCountProvider({ children }: StaffUnreadCountProviderProps) {
  const { data: session, status } = useSession();
  const [counts, setCounts] = useState<UnreadCounts>({ messages: 0 });
  const [isConnected, setIsConnected] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  const role = session?.user?.role;
  const isStaffRole = role === 'admin' || role === 'dietitian' || role === 'health_counselor';

  // Subscribe to Socket.io staff unread-count events
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user || !isStaffRole) {
      unsubRef.current?.();
      unsubRef.current = null;
      setIsConnected(false);
      return;
    }

    // Clean up previous listener
    unsubRef.current?.();

    const unsub = socketClient.on(SOCKET_EVENTS.STAFF_UNREAD_COUNTS, (data: any) => {
      setCounts({
        messages: data.messages || 0,
      });
    });

    unsubRef.current = unsub;

    // Track socket connection state
    const unsubConnect = socketClient.on('connect', () => setIsConnected(true));
    const unsubDisconnect = socketClient.on('disconnect', () => setIsConnected(false));
    setIsConnected(socketClient.connected);

    // Handle visibility change — refresh counts when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshCounts();
      }
    };

    // Handle online event — refresh counts when network is restored
    const handleOnline = () => {
      refreshCounts();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      unsub();
      unsubConnect();
      unsubDisconnect();
      unsubRef.current = null;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      setIsConnected(false);
    };
  }, [status, session?.user?.id, isStaffRole]);

  // Manual refresh function with retry logic
  const refreshCounts = useCallback(async (retryCount = 0) => {
    // Skip if not authenticated or not staff role
    if (status !== 'authenticated' || !isStaffRole) {
      return;
    }

    // Skip if offline
    if (!navigator.onLine) {
      console.warn('[StaffUnreadCountProvider] Offline, skipping refresh');
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch('/api/staff/unread-counts/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setCounts({
          messages: data.messages || 0
        });
      } else if (response.status === 401) {
        // Session expired, silently skip
        console.debug('[StaffUnreadCountProvider] Session expired');
      } else {
        console.warn('[StaffUnreadCountProvider] Refresh failed with status:', response.status);
      }
    } catch (error) {
      // Retry once on network errors
      if (retryCount < 1 && error instanceof Error) {
        const isNetworkError =
          error.message.includes('Failed to fetch') ||
          error.message.includes('NetworkError') ||
          error.name === 'AbortError';

        if (isNetworkError) {
          console.debug('[StaffUnreadCountProvider] Network error, retrying...');
          // Wait 500ms before retry
          await new Promise(resolve => setTimeout(resolve, 500));
          return refreshCounts(retryCount + 1);
        }
      }

      // Don't log every network error, just debug level
      if (error instanceof Error) {
        console.debug('[StaffUnreadCountProvider] Error refreshing counts:', error.message);
      }
    }
  }, [status, isStaffRole]);

  return (
    <StaffUnreadCountContext.Provider value={{ counts, refreshCounts, isConnected }}>
      {children}
    </StaffUnreadCountContext.Provider>
  );
}

export function useStaffUnreadCounts() {
  const context = useContext(StaffUnreadCountContext);
  if (context === undefined) {
    throw new Error('useStaffUnreadCounts must be used within a StaffUnreadCountProvider');
  }
  return context;
}

// Export a hook that's safe to use outside provider (returns defaults)
export function useStaffUnreadCountsSafe() {
  const context = useContext(StaffUnreadCountContext);
  return context || {
    counts: { messages: 0 },
    refreshCounts: async () => { },
    isConnected: false
  };
}
