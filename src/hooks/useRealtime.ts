'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { notifyMissedCall } from '@/lib/notifications/notification-manager';
import { NotificationService } from '@/lib/notifications/notification-service';

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

// Exponential backoff configuration
const INITIAL_DELAY = 1000;
const MAX_DELAY = 30000;
const MAX_RETRIES = 15;
const BACKOFF_MULTIPLIER = 1.5;

function calculateBackoff(attempt: number): number {
  const delay = INITIAL_DELAY * Math.pow(BACKOFF_MULTIPLIER, attempt);
  const jitter = Math.random() * 0.3 * delay;
  return Math.min(delay + jitter, MAX_DELAY);
}

// Global connection manager to prevent multiple connections
class GlobalSSEManager {
  private static instance: GlobalSSEManager;
  private connections = new Map<string, EventSource>();
  private connectionStates = new Map<string, 'connecting' | 'connected' | 'disconnected'>();
  private subscribers = new Map<string, Set<(event: any) => void>>();
  private connectionPromises = new Map<string, Promise<EventSource>>();
  private closeTimers = new Map<string, any>();
  private retryAttempts = new Map<string, number>();

  static getInstance(): GlobalSSEManager {
    if (!GlobalSSEManager.instance) {
      GlobalSSEManager.instance = new GlobalSSEManager();
    }
    return GlobalSSEManager.instance;
  }

  hasConnection(userId: string): boolean {
    return this.connections.has(userId) && this.connectionStates.get(userId) === 'connected';
  }

  isConnecting(userId: string): boolean {
    return this.connectionStates.get(userId) === 'connecting';
  }

  private resetRetries(userId: string): void {
    this.retryAttempts.set(userId, 0);
  }

  private getRetryCount(userId: string): number {
    return this.retryAttempts.get(userId) || 0;
  }

  private incrementRetries(userId: string): number {
    const current = this.getRetryCount(userId);
    this.retryAttempts.set(userId, current + 1);
    return current + 1;
  }

  async getOrCreateConnection(userId: string): Promise<EventSource> {
    // If already connected, return existing connection
    if (this.hasConnection(userId)) {
      return this.connections.get(userId)!;
    }

    // If already connecting, wait for the existing promise
    if (this.isConnecting(userId) && this.connectionPromises.has(userId)) {
      return this.connectionPromises.get(userId)!;
    }

    // Create new connection
    this.connectionStates.set(userId, 'connecting');

    const connectionPromise = new Promise<EventSource>((resolve, reject) => {
      try {
        const eventSource = new EventSource('/api/realtime/sse');

        eventSource.onopen = () => {
          this.connections.set(userId, eventSource);
          this.connectionStates.set(userId, 'connected');
          this.connectionPromises.delete(userId);
          this.resetRetries(userId); // Reset retry count on successful connection

          // Set up heartbeat to keep connection alive
          const heartbeatInterval = setInterval(() => {
            if (eventSource.readyState === EventSource.CLOSED) {
              clearInterval(heartbeatInterval);
            }
          }, 30000);

          resolve(eventSource);
        };

        eventSource.onerror = () => {
          // EventSource automatically attempts to reconnect on error
          if (eventSource.readyState === EventSource.CLOSED) {
            const retryCount = this.getRetryCount(userId);

            // Only attempt reconnection if under max retries
            if (retryCount < MAX_RETRIES) {
              const delay = calculateBackoff(retryCount);
              console.info(`[SSE] Connection closed. Reconnecting in ${Math.round(delay)}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
              this.incrementRetries(userId);

              setTimeout(() => {
                if (this.subscribers.has(userId) && (this.subscribers.get(userId)?.size || 0) > 0) {
                  this.getOrCreateConnection(userId).catch(() => { });
                }
              }, delay);
            } else {
              console.warn('[SSE] Max retries exceeded, stopping reconnection');
            }

            this.connectionStates.set(userId, 'disconnected');
            this.connectionPromises.delete(userId);
            this.connections.delete(userId);

            // Notify subscribers about disconnection
            const subscribers = this.subscribers.get(userId);
            if (subscribers) {
              subscribers.forEach(callback => callback({ type: 'connection_closed', data: null }));
            }

            reject(new Error('SSE connection closed'));
          }
        };

        // Set up message forwarding to subscribers
        eventSource.onmessage = (event) => {
          const subscribers = this.subscribers.get(userId);
          if (subscribers) {
            subscribers.forEach(callback => callback({ type: 'message', data: event.data }));
          }
        };

        // Handle custom events (including call signaling)
        [
          'user_online', 'user_offline', 'typing_start', 'typing_stop', 'heartbeat', 'connected', 'new_message',
          'incoming_call', 'call_accepted', 'call_rejected', 'call_ended', 'ice_candidate', 'missed_call',
          'webrtc-signal',  // 🚀 NEW: Simple WebRTC signals

          // App domain events
          'appointment_booked', 'appointment_cancelled', 'appointment_updated',
          'task_created', 'task_updated', 'task_deleted',

          // Admin domain events
          'other_platform_payment_updated',
          'payment_updated',
          'payment_link_updated'
        ].forEach(eventType => {
          eventSource.addEventListener(eventType, (event) => {
            const subscribers = this.subscribers.get(userId);
            if (subscribers) {
              subscribers.forEach(callback => callback({ type: eventType, data: (event as MessageEvent).data }));
            }
          });
        });

        // Online snapshot on connect
        eventSource.addEventListener('online_snapshot', (event) => {
          const subscribers = this.subscribers.get(userId);
          if (subscribers) {
            subscribers.forEach(callback => callback({ type: 'online_snapshot', data: (event as MessageEvent).data }));
          }
        });

      } catch (error) {
        console.error('Failed to create SSE connection for user:', userId, error);
        this.connectionStates.set(userId, 'disconnected');
        this.connectionPromises.delete(userId);
        reject(error);
      }
    });

    this.connectionPromises.set(userId, connectionPromise);
    return connectionPromise;
  }

  subscribe(userId: string, callback: (event: any) => void): () => void {
    if (!this.subscribers.has(userId)) {
      this.subscribers.set(userId, new Set());
    }
    this.subscribers.get(userId)!.add(callback);

    // If a close was scheduled, cancel it because we have a live subscriber again
    const pending = this.closeTimers.get(userId);
    if (pending) { clearTimeout(pending); this.closeTimers.delete(userId); }

    // Return unsubscribe function
    return () => {
      const subscribers = this.subscribers.get(userId);
      if (subscribers) {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          this.subscribers.delete(userId);
          // Debounce actual close to avoid churn on rerenders/StrictMode
          const t = setTimeout(() => this.closeConnection(userId), 5000);
          this.closeTimers.set(userId, t);
        }
      }
    };
  }

  closeConnection(userId: string): void {
    const timer = this.closeTimers.get(userId);
    if (timer) { clearTimeout(timer); this.closeTimers.delete(userId); }

    const existing = this.connections.get(userId);
    if (existing) {
      existing.close();
      this.connections.delete(userId);
    }
    this.connectionStates.set(userId, 'disconnected');
    this.connectionPromises.delete(userId);
    this.subscribers.delete(userId);
  }

  getConnection(userId: string): EventSource | undefined {
    return this.connections.get(userId);
  }

  // Force disconnect a user's connection
  forceDisconnect(userId: string): void {
    const connection = this.connections.get(userId);
    if (connection) {
      connection.close();
      this.connections.delete(userId);
      this.connectionStates.set(userId, 'disconnected');
      this.connectionPromises.delete(userId);
    }
  }

  // Force reconnect a user's connection
  async forceReconnect(userId: string): Promise<EventSource> {
    this.forceDisconnect(userId);
    // Wait a bit before reconnecting
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this.getOrCreateConnection(userId);
  }
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const { data: session } = useSession();
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const globalManager = GlobalSSEManager.getInstance();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const connectionCheckRef = useRef<NodeJS.Timeout | null>(null);

  // Store latest callbacks in refs to avoid stale closures in the SSE subscriber.
  // The subscriber is registered once per mount, but always reads the latest handlers.
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

  const connect = useCallback(async () => {
    if (!session?.user?.id) {
      return;
    }

    const userId = session.user.id;

    try {
      // Use global manager to get or create connection (idempotent — reuses existing)
      await globalManager.getOrCreateConnection(userId);

      // Unsubscribe any existing subscriber before creating a new one
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      // Subscribe to events — uses refs so the subscriber never goes stale
      const unsubscribe = globalManager.subscribe(userId, (event) => {
        const onMessage = onMessageRef.current;
        const onUserOnline = onUserOnlineRef.current;
        const onUserOffline = onUserOfflineRef.current;
        const onTyping = onTypingRef.current;

        if (event.type === 'message' && onMessage) {
          try {
            const data = JSON.parse(event.data);
            onMessage({
              type: 'message',
              data,
              timestamp: Date.now()
            });
          } catch (error) {
            console.error('Failed to parse SSE message:', error);
          }
        } else if (event.type === 'new_message' && onMessage) {
          try {
            const data = JSON.parse(event.data);
            onMessage({
              type: 'new_message',
              data,
              timestamp: Date.now()
            });
          } catch (error) {
            console.error('Failed to parse new_message event:', error);
          }
        } else if (event.type === 'online_snapshot') {
          try {
            const data = JSON.parse(event.data);
            if (Array.isArray(data.onlineUsers)) {
              setOnlineUsers(data.onlineUsers);
            }
          } catch (error) {
            console.error('Failed to parse online_snapshot event:', error);
          }
        } else if (event.type === 'user_online') {
          try {
            const data = JSON.parse(event.data);
            setOnlineUsers(prev => {
              if (!prev.includes(data.userId)) {
                return [...prev, data.userId];
              }
              return prev;
            });
            if (onUserOnline) {
              onUserOnline(data.userId);
            }
          } catch (error) {
            console.error('Failed to parse user_online event:', error);
          }
        } else if (event.type === 'user_offline') {
          try {
            const data = JSON.parse(event.data);
            setOnlineUsers(prev => prev.filter(id => id !== data.userId));
            if (onUserOffline) {
              onUserOffline(data.userId);
            }
          } catch (error) {
            console.error('Failed to parse user_offline event:', error);
          }
        } else if (event.type === 'typing_start' && onTyping) {
          try {
            const data = JSON.parse(event.data);
            onTyping({ userId: data.userId, isTyping: true });
          } catch (error) {
            console.error('Failed to parse typing_start event:', error);
          }
        } else if (event.type === 'typing_stop' && onTyping) {
          try {
            const data = JSON.parse(event.data);
            onTyping({ userId: data.userId, isTyping: false });
          } catch (error) {
            console.error('Failed to parse typing_stop event:', error);
          }
        } else if (
          ['incoming_call', 'call_accepted', 'call_rejected', 'call_ended', 'ice_candidate', 'missed_call'].includes(event.type)
          && onMessage
        ) {
          try {
            const data = JSON.parse(event.data);
            onMessage({ type: event.type, data, timestamp: Date.now() });

            // Fire browser notifications for key call events
            if (event.type === 'incoming_call') {
              // Ensure SW is registered and show actionable notification
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
                console.warn('Failed to show actionable call notification', e);
              }
            } else if (event.type === 'missed_call') {
              notifyMissedCall({
                callId: data.callId,
                fromUserId: data.fromUserId || data.from || data.callerId,
                fromName: data.fromName || data.callerName,
              });
            }
          } catch (error) {
            console.error(`Failed to parse ${event.type} event:`, error);
          }
        } else if (onMessage) {
          // Forward any other custom events to consumers.
          // Keep `data` as a string for backward compatibility with existing handlers.
          onMessage({ type: event.type, data: event.data, timestamp: Date.now() });
        }
      });

      unsubscribeRef.current = unsubscribe;
      setIsConnected(true);
      setConnectionError(null);

      // Start heartbeat to keep presence updated server-side (belt-and-suspenders)
      if (!heartbeatRef.current) {
        heartbeatRef.current = setInterval(async () => {
          try {
            await fetch('/api/realtime/status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'heartbeat' })
            });
          } catch (_) { }
        }, 30000);
      }

      // Start connection health check
      if (!connectionCheckRef.current) {
        connectionCheckRef.current = setInterval(() => {
          const connection = globalManager.getConnection(userId);
          if (!connection || connection.readyState === EventSource.CLOSED) {
            setIsConnected(false);
            // Trigger reconnection
            connect();
          } else if (connection.readyState === EventSource.CONNECTING) {
          } else {
          }
        }, 10000); // Check every 10 seconds
      }

    } catch (error) {
      console.error('Failed to connect:', error);
      setIsConnected(false);
      setConnectionError('Failed to connect');
    }
  }, [session?.user?.id, globalManager]);

  const disconnect = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current as any);
      heartbeatRef.current = null;
    }
    if (connectionCheckRef.current) {
      clearInterval(connectionCheckRef.current as any);
      connectionCheckRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Connect and subscribe when session is available.
  // Always calls connect() to ensure this hook's subscriber is registered,
  // even if the SSE connection already exists from another component.
  useEffect(() => {
    if (session?.user?.id) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      // Debounced close in manager prevents churn
      disconnect();
    };
  }, [session?.user?.id, connect, disconnect]);

  // Send typing indicator
  const sendTyping = useCallback(async (conversationId: string, isTyping: boolean) => {
    if (!session?.user?.id) return;

    try {
      await fetch('/api/realtime/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          isTyping,
          userId: session.user.id
        })
      });
    } catch (error) {
      console.error('Failed to send typing indicator:', error);
    }
  }, [session?.user?.id]);

  const forceReconnect = useCallback(async () => {
    if (session?.user?.id) {
      disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000));
      connect();
    }
  }, [session?.user?.id, disconnect, connect]);

  return {
    isConnected,
    onlineUsers,
    connectionError,
    connect,
    disconnect,
    sendTyping,
    forceReconnect
  };
}
