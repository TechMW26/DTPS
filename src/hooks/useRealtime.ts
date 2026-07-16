'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { notifyMissedCall } from '@/lib/notifications/notification-manager';
import { NotificationService } from '@/lib/notifications/notification-service';
import { socketClient } from '@/lib/realtime/socket-client';
import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';

export interface RealtimeEvent {
  type: string;
  data: any;
  timestamp: number;
}

export interface UseRealtimeOptions {
  onMessage?: (event: RealtimeEvent) => void;
  onUserOnline?: (userId: string) => void;
  onUserOffline?: (userId: string) => void;
  onTyping?: (data: { userId: string; isTyping: boolean }) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

/**
 * All known event types that consumers can receive via `onMessage`.
 * Socket.io delivers data already parsed — no JSON.parse needed.
 */
const CALL_EVENTS = new Set([
  'incoming_call', 'call_accepted', 'call_rejected',
  'call_ended', 'ice_candidate', 'missed_call',
]);

export function useRealtime(options: UseRealtimeOptions = {}) {
  const { data: session } = useSession();
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const unsubsRef = useRef<Array<() => void>>([]);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Store latest callbacks in refs to avoid stale closures.
  const onMessageRef = useRef(options.onMessage);
  const onUserOnlineRef = useRef(options.onUserOnline);
  const onUserOfflineRef = useRef(options.onUserOffline);
  const onTypingRef = useRef(options.onTyping);

  useEffect(() => {
    onMessageRef.current = options.onMessage;
    onUserOnlineRef.current = options.onUserOnline;
    onUserOfflineRef.current = options.onUserOffline;
    onTypingRef.current = options.onTyping;
  });

  const connect = useCallback(() => {
    if (!session?.user?.id) return;

    // Clean up any previous subscriptions
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];

    // Ensure socket is connected (idempotent)
    socketClient.connect();

    const unsubs: Array<() => void> = [];

    // ── Connection lifecycle ──────────────────────────────────────
    unsubs.push(socketClient.on('connect', () => {
      setIsConnected(true);
      setConnectionError(null);
    }));

    unsubs.push(socketClient.on('disconnect', () => {
      setIsConnected(false);
    }));

    unsubs.push(socketClient.on('connect_error', () => {
      setIsConnected(false);
      setConnectionError('Failed to connect');
    }));

    // ── Presence ──────────────────────────────────────────────────
    unsubs.push(socketClient.on(SOCKET_EVENTS.ONLINE_SNAPSHOT, (data: any) => {
      if (Array.isArray(data.onlineUsers)) {
        setOnlineUsers(data.onlineUsers);
      }
    }));

    unsubs.push(socketClient.on(SOCKET_EVENTS.USER_ONLINE, (data: any) => {
      setOnlineUsers((prev) => {
        if (!prev.includes(data.userId)) return [...prev, data.userId];
        return prev;
      });
      onUserOnlineRef.current?.(data.userId);
    }));

    unsubs.push(socketClient.on(SOCKET_EVENTS.USER_OFFLINE, (data: any) => {
      setOnlineUsers((prev) => prev.filter((id) => id !== data.userId));
      onUserOfflineRef.current?.(data.userId);
    }));

    // ── Typing ────────────────────────────────────────────────────
    unsubs.push(socketClient.on(SOCKET_EVENTS.TYPING_START, (data: any) => {
      onTypingRef.current?.({ userId: data.userId, isTyping: true });
    }));

    unsubs.push(socketClient.on(SOCKET_EVENTS.TYPING_STOP, (data: any) => {
      onTypingRef.current?.({ userId: data.userId, isTyping: false });
    }));

    // ── Chat ──────────────────────────────────────────────────────
    unsubs.push(socketClient.on(SOCKET_EVENTS.NEW_MESSAGE, (data: any) => {
      onMessageRef.current?.({ type: 'new_message', data, timestamp: Date.now() });
    }));

    unsubs.push(socketClient.on(SOCKET_EVENTS.MESSAGE_READ, (data: any) => {
      onMessageRef.current?.({ type: 'message_read', data, timestamp: Date.now() });
    }));

    unsubs.push(socketClient.on(SOCKET_EVENTS.MESSAGE_DELETED, (data: any) => {
      onMessageRef.current?.({ type: 'message_deleted', data, timestamp: Date.now() });
    }));

    // ── Calls / WebRTC ────────────────────────────────────────────
    for (const evt of CALL_EVENTS) {
      unsubs.push(socketClient.on(evt, (data: any) => {
        onMessageRef.current?.({ type: evt, data, timestamp: Date.now() });

        if (evt === 'incoming_call') {
          try {
            const ns = NotificationService.getInstance();
            ns.showCallNotification(
              data.callerName || 'Incoming call',
              (data.type as 'audio' | 'video') || 'audio',
              data.callerAvatar,
              data.callId,
              {
                callerId: data.callerId,
                offer: data.offer,
                conversationId: data.conversationId,
              }
            );
          } catch (e) {
            console.warn('Failed to show call notification', e);
          }
        } else if (evt === 'missed_call') {
          notifyMissedCall({
            callId: data.callId,
            fromUserId: data.fromUserId || data.from || data.callerId,
            fromName: data.fromName || data.callerName,
          });
        }
      }));
    }

    unsubs.push(socketClient.on(SOCKET_EVENTS.WEBRTC_SIGNAL, (data: any) => {
      onMessageRef.current?.({ type: 'webrtc-signal', data, timestamp: Date.now() });
    }));

    // ── Domain events (payments, appointments, tasks) ─────────────
    const domainEvents = [
      SOCKET_EVENTS.APPOINTMENT_BOOKED,
      SOCKET_EVENTS.APPOINTMENT_CANCELLED,
      SOCKET_EVENTS.APPOINTMENT_UPDATED,
      SOCKET_EVENTS.TASK_CREATED,
      SOCKET_EVENTS.TASK_UPDATED,
      SOCKET_EVENTS.TASK_DELETED,
      SOCKET_EVENTS.PAYMENT_UPDATED,
      SOCKET_EVENTS.PAYMENT_LINK_UPDATED,
      SOCKET_EVENTS.OTHER_PLATFORM_PAYMENT_UPDATED,
      // Admin events
      SOCKET_EVENTS.CLIENT_UPDATED,
      SOCKET_EVENTS.CLIENT_ADDED,
      SOCKET_EVENTS.INITIAL_DATA,
      SOCKET_EVENTS.NEW_LOGS,
    ];

    for (const evt of domainEvents) {
      unsubs.push(socketClient.on(evt, (data: any) => {
        // Socket.io delivers objects directly — stringify for backward compat
        // with consumers that call JSON.parse on event.data
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        onMessageRef.current?.({ type: evt, data: payload, timestamp: Date.now() });
      }));
    }

    unsubsRef.current = unsubs;
    setIsConnected(socketClient.connected);
    setConnectionError(null);

    // Heartbeat to keep server-side presence updated
    if (!heartbeatRef.current) {
      heartbeatRef.current = setInterval(async () => {
        try {
          await fetch('/api/realtime/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'heartbeat' }),
          });
        } catch (_) { }
      }, 30000);
    }
  }, [session?.user?.id]);

  const disconnect = useCallback(() => {
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current as any);
      heartbeatRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Connect when authenticated, disconnect when not.
  useEffect(() => {
    if (session?.user?.id) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [session?.user?.id, connect, disconnect]);

  // Send typing indicator via socket (with REST fallback)
  const sendTyping = useCallback(
    async (conversationId: string, isTyping: boolean) => {
      if (!session?.user?.id) return;

      // Prefer socket emit — avoids an HTTP round-trip
      if (socketClient.connected) {
        socketClient.emit(SOCKET_EVENTS.SEND_TYPING, {
          receiverId: conversationId,
          isTyping,
        });
      } else {
        // Fallback to REST
        try {
          await fetch('/api/realtime/typing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId,
              isTyping,
              userId: session.user.id,
            }),
          });
        } catch (error) {
          console.error('Failed to send typing indicator:', error);
        }
      }
    },
    [session?.user?.id]
  );

  const forceReconnect = useCallback(() => {
    if (session?.user?.id) {
      disconnect();
      socketClient.forceReconnect();
      // Re-register listeners after a tick
      setTimeout(connect, 100);
    }
  }, [session?.user?.id, disconnect, connect]);

  return {
    isConnected,
    onlineUsers,
    connectionError,
    connect,
    disconnect,
    sendTyping,
    forceReconnect,
  };
}
