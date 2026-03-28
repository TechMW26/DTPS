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

  // Manual refresh function
  const refreshCounts = useCallback(async () => {
    try {
      const response = await fetch('/api/staff/unread-counts/refresh', {
        method: 'POST'
      });
      if (response.ok) {
        const data = await response.json();
        setCounts({
          messages: data.messages || 0
        });
      }
    } catch (error) {
      console.error('[StaffUnreadCountProvider] Error refreshing counts:', error);
    }
  }, []);

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
