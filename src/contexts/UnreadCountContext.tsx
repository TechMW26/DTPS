'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { socketClient } from '@/lib/realtime/socket-client';
import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';

interface UnreadCounts {
  notifications: number;
  messages: number;
}

interface UnreadCountContextType {
  counts: UnreadCounts;
  refreshCounts: () => Promise<void>;
  isConnected: boolean;
}

const UnreadCountContext = createContext<UnreadCountContextType | undefined>(undefined);

interface UnreadCountProviderProps {
  children: ReactNode;
}

export function UnreadCountProvider({ children }: UnreadCountProviderProps) {
  const { data: session, status } = useSession();
  const [counts, setCounts] = useState<UnreadCounts>({ notifications: 0, messages: 0 });
  const [isConnected, setIsConnected] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  // Subscribe to Socket.io unread-count events
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) {
      return;
    }

    // Clean up previous listener
    unsubRef.current?.();

    const unsub = socketClient.on(SOCKET_EVENTS.UNREAD_COUNTS, (data: any) => {
      setCounts({
        notifications: data.notifications || 0,
        messages: data.messages || 0,
      });
    });

    unsubRef.current = unsub;

    // Track socket connection state
    const unsubConnect = socketClient.on('connect', () => setIsConnected(true));
    const unsubDisconnect = socketClient.on('disconnect', () => setIsConnected(false));
    setIsConnected(socketClient.connected);

    return () => {
      unsub();
      unsubConnect();
      unsubDisconnect();
      unsubRef.current = null;
      setIsConnected(false);
    };
  }, [status, session?.user]);

  // Manual refresh function
  const refreshCounts = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch('/api/client/unread-counts/refresh', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setCounts({
          notifications: data.notifications || 0,
          messages: data.messages || 0
        });
      } else {
        console.warn('[UnreadCountProvider] API returned non-ok status:', response.status);
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.warn('[UnreadCountProvider] Refresh request timeout');
        } else if (error.message.includes('Failed to fetch')) {
          console.warn('[UnreadCountProvider] Network error during refresh');
        } else {
          console.error('[UnreadCountProvider] Error refreshing counts:', error.message);
        }
      }
    }
  }, []);

  // Initial fetch when socket is not connected yet
  useEffect(() => {
    if (status === 'authenticated' && !isConnected) {
      refreshCounts();
    }
  }, [status, isConnected, refreshCounts]);

  return (
    <UnreadCountContext.Provider value={{ counts, refreshCounts, isConnected }}>
      {children}
    </UnreadCountContext.Provider>
  );
}

export function useUnreadCounts() {
  const context = useContext(UnreadCountContext);
  if (context === undefined) {
    throw new Error('useUnreadCounts must be used within an UnreadCountProvider');
  }
  return context;
}

// Export a hook that's safe to use outside provider (returns defaults)
export function useUnreadCountsSafe() {
  const context = useContext(UnreadCountContext);
  return context || {
    counts: { notifications: 0, messages: 0 },
    refreshCounts: async () => { },
    isConnected: false
  };
}
