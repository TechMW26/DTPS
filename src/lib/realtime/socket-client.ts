/**
 * Client-side Socket.io singleton.
 *
 * Replaces the GlobalSSEManager that was inside useRealtime.ts.
 * One socket per browser tab, auto-connects when imported in an
 * authenticated context, reconnects with exponential back-off.
 */

import { io, Socket } from 'socket.io-client';

// Exponential backoff configuration (mirrors the old SSE config)
const INITIAL_DELAY = 1000;
const MAX_DELAY = 30000;
const MAX_RETRIES = 15;
const BACKOFF_MULTIPLIER = 1.5;

function calculateBackoff(attempt: number): number {
    const delay = INITIAL_DELAY * Math.pow(BACKOFF_MULTIPLIER, attempt);
    const jitter = Math.random() * 0.3 * delay;
    return Math.min(delay + jitter, MAX_DELAY);
}

type EventCallback = (data: any) => void;

class SocketClient {
    private static instance: SocketClient;
    private socket: Socket | null = null;
    private listeners = new Map<string, Set<EventCallback>>();
    private retryCount = 0;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private _connected = false;
    private hasNetworkListeners = false;

    private constructor() {
        this.setupNetworkRecovery();
    }

    static getInstance(): SocketClient {
        if (!SocketClient.instance) {
            SocketClient.instance = new SocketClient();
        }
        return SocketClient.instance;
    }

    /** Whether the socket is currently connected. */
    get connected(): boolean {
        return this._connected;
    }

    /** Expose reconnect policy for verification in integration tests. */
    getReconnectPolicy(): { initialDelay: number; maxDelay: number; maxRetries: number; multiplier: number } {
        return {
            initialDelay: INITIAL_DELAY,
            maxDelay: MAX_DELAY,
            maxRetries: MAX_RETRIES,
            multiplier: BACKOFF_MULTIPLIER,
        };
    }

    /** Get the raw socket (for advanced usage). */
    getSocket(): Socket | null {
        return this.socket;
    }

    /**
     * Connect to the Socket.io server.
     * Idempotent — calling multiple times returns the existing socket.
     */
    connect(): Socket {
        if (this.socket?.connected) return this.socket;

        // Tear down stale socket if it exists
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
        }

        this.socket = io(this.getConnectionUrl(), {
            path: '/socket.io',
            // Polling-first is more reliable on restrictive Wi-Fi/corporate networks.
            transports: ['polling', 'websocket'],
            withCredentials: true,  // send cookies for auth
            reconnection: false,    // we handle our own reconnection with backoff
            timeout: 10000,
        });

        this.socket.on('connect', () => {
            console.log('[SocketClient] Connected, socketId:', this.socket?.id);
            this._connected = true;
            this.retryCount = 0;
            if (this.retryTimer) {
                clearTimeout(this.retryTimer);
                this.retryTimer = null;
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[SocketClient] Disconnected, reason:', reason);
            this._connected = false;

            // If the server forcefully disconnected, don't auto-reconnect
            if (reason === 'io server disconnect') return;

            this.scheduleReconnect();
        });

        this.socket.on('connect_error', (err) => {
            console.error('[SocketClient] Connection error:', err.message);
            this._connected = false;
            this.scheduleReconnect();
        });

        // Re-register all stored listeners on the new socket
        this.listeners.forEach((callbacks, event) => {
            callbacks.forEach((cb) => {
                this.socket!.on(event, cb);
            });
        });

        return this.socket;
    }

    /** Disconnect and clean up. */
    disconnect(): void {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        this.retryCount = 0;
        this._connected = false;

        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
        }
    }

    /** Force a reconnect (e.g. after auth change). */
    forceReconnect(): void {
        this.disconnect();
        this.connect();
    }

    /**
     * Subscribe to a server event. The callback is automatically attached
     * to the current socket and re-attached on reconnect.
     *
     * Returns an unsubscribe function.
     */
    on(event: string, callback: EventCallback): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);

        // If already connected, attach immediately
        if (this.socket) {
            this.socket.on(event, callback);
        }

        return () => {
            this.off(event, callback);
        };
    }

    /** Remove a specific listener. */
    off(event: string, callback: EventCallback): void {
        const set = this.listeners.get(event);
        if (set) {
            set.delete(callback);
            if (set.size === 0) this.listeners.delete(event);
        }
        if (this.socket) {
            this.socket.off(event, callback);
        }
    }

    /** Emit an event to the server. */
    emit(event: string, data?: any): void {
        if (this.socket?.connected) {
            this.socket.emit(event, data);
        }
    }

    // ── Private ──────────────────────────────────────────────────────

    private scheduleReconnect(): void {
        if (this.retryTimer) return; // already scheduled
        if (this.retryCount >= MAX_RETRIES) {
            console.warn('[SocketClient] Max retries exceeded, stopping reconnection');
            return;
        }

        const delay = calculateBackoff(this.retryCount);
        this.retryCount++;

        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.connect();
        }, delay);
    }

    private getConnectionUrl(): string | undefined {
        if (typeof window !== 'undefined') {
            return undefined;
        }

        return process.env.NEXTAUTH_URL;
    }

    private setupNetworkRecovery(): void {
        if (typeof window === 'undefined' || this.hasNetworkListeners) return;

        const handleOnline = () => {
            console.log('[SocketClient] Network online - forcing reconnect');
            this.retryCount = 0;
            if (this.retryTimer) {
                clearTimeout(this.retryTimer);
                this.retryTimer = null;
            }
            this.forceReconnect();
        };

        const handleOffline = () => {
            console.log('[SocketClient] Network offline - pausing socket');
            this._connected = false;
            if (this.retryTimer) {
                clearTimeout(this.retryTimer);
                this.retryTimer = null;
            }
            if (this.socket) {
                this.socket.disconnect();
            }
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        this.hasNetworkListeners = true;
    }
}

export const socketClient = SocketClient.getInstance();
export { SocketClient };
