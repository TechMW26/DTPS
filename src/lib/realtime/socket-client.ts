/**
 * Client-side Socket.io singleton.
 *
 * Replaces the GlobalSSEManager that was inside useRealtime.ts.
 * One socket per browser tab, auto-connects when imported in an
 * authenticated context, reconnects with exponential back-off.
 */

import { io, Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "./socket-events";

// Exponential backoff configuration (mirrors the old SSE config)
const INITIAL_DELAY = 1000;
const MAX_DELAY = 30000;
const MAX_RETRIES = 15;
const BACKOFF_MULTIPLIER = 1.5;

function calculateBackoff(attempt: number): number {
  const delay = INITIAL_DELAY * Math.pow(BACKOFF_MULTIPLIER, Math.min(attempt, MAX_RETRIES));
  const jitter = Math.random() * 0.3 * delay;
  return Math.min(delay + jitter, MAX_DELAY);
}

type EventCallback = (data: unknown) => void;

class SocketClient {
  private static instance: SocketClient;
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<EventCallback>>();
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private _down = false;
  private connecting = false;
  private intentionalDisconnect = false;
  private downNotificationSent = false;
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

  /** Whether Socket.io is in a permanently-down state (max retries exceeded). */
  get isDown(): boolean {
    return this._down;
  }

  /** Expose reconnect policy for verification in integration tests. */
  getReconnectPolicy(): {
    initialDelay: number;
    maxDelay: number;
    maxRetries: number;
    multiplier: number;
  } {
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
  connect(): Socket | null {
    if (this.socket?.connected || this.connecting) return this.socket;

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return this.socket;
    }

    const url = this.getConnectionUrl();
    // Skip connection if no URL is configured (e.g., on Vercel without a Socket.io server)
    if (!url) {
      console.log("[SocketClient] No Socket.io URL configured — skipping connection");
      this._down = true;
      return null;
    }

    this.intentionalDisconnect = false;
    this.connecting = true;

    // Tear down stale socket if it exists
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.io.removeAllListeners();
      this.socket.disconnect();
    }

    this.socket = io(url, {
      path: "/socket.io",
      // Prefer WebSocket to avoid proxy-sensitive XHR polling failures, while
      // retaining polling as an automatic fallback for restrictive networks.
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      rememberUpgrade: true,
      withCredentials: true, // send cookies for auth
      reconnection: false, // we handle our own reconnection with backoff
      timeout: 15000,
      forceNew: true,
      auth: async (callback) => {
        try {
          const response = await fetch("/api/realtime/socket-token", {
            credentials: "include",
            cache: "no-store",
          });
          if (!response.ok) return callback({});
          const payload = await response.json();
          callback({ token: payload.token });
        } catch {
          // Same-origin deployments can still authenticate with the session cookie.
          callback({});
        }
      },
    });

    this.socket.on("connect", () => {
      console.log("[SocketClient] Connected, socketId:", this.socket?.id);
      this.connecting = false;
      this._connected = true;
      this._down = false;
      this.downNotificationSent = false;
      this.retryCount = 0;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      // Notify listeners that socket has recovered
      this._broadcastToListeners(SOCKET_EVENTS.SOCKET_RECOVERED, {
        socketId: this.socket?.id,
        timestamp: Date.now(),
      });
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[SocketClient] Disconnected, reason:", reason);
      this.connecting = false;
      this._connected = false;

      if (this.intentionalDisconnect || reason === "io client disconnect") return;

      this.scheduleReconnect();
    });

    this.socket.on("connect_error", (err?: Error) => {
      const message = err?.message || "Socket connection failed";
      this.connecting = false;
      this._connected = false;
      if (this.shouldLogRetry()) {
        console.warn(
          `[SocketClient] Connection unavailable (${message}); retry ${this.retryCount + 1} scheduled`,
        );
      }
      // Forward error to all listeners
      this._broadcastToListeners(SOCKET_EVENTS.SOCKET_ERROR, {
        message,
        timestamp: Date.now(),
      });
      this.scheduleReconnect();
    });

    // Forward server-sent socket_error events to listeners
    this.socket.on(SOCKET_EVENTS.SOCKET_ERROR, (data) => {
      console.warn("[SocketClient] Server-reported socket error:", data);
      this._broadcastToListeners(SOCKET_EVENTS.SOCKET_ERROR, data);
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
    this.intentionalDisconnect = true;
    this.connecting = false;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryCount = 0;
    this._connected = false;
    this._down = false;
    this.downNotificationSent = false;

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.io.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /** Force a reconnect (e.g. after auth change). */
  forceReconnect(): void {
    this.disconnect();
    this.intentionalDisconnect = false;
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
  emit(event: string, data?: unknown): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }

  // ── Private ──────────────────────────────────────────────────────

  /** Broadcast an event to all registered listeners without going through the socket. */
  private _broadcastToListeners(event: string, data: unknown): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    callbacks.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error("[SocketClient] Listener error for", event, err);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.retryTimer || this.intentionalDisconnect) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    if (this.retryCount >= MAX_RETRIES && !this.downNotificationSent) {
      console.warn("[SocketClient] Realtime is degraded; background retries will continue");
      this._down = true;
      this.downNotificationSent = true;
      this._broadcastToListeners(SOCKET_EVENTS.MAX_RETRIES_EXCEEDED, {
        retries: this.retryCount,
        continuing: true,
        timestamp: Date.now(),
      });
      this._broadcastToListeners(SOCKET_EVENTS.SOCKET_DOWN, {
        message:
          "Realtime connection is degraded. Background recovery is still active.",
        continuing: true,
        timestamp: Date.now(),
      });
    }

    const delay = calculateBackoff(this.retryCount);
    this.retryCount++;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private shouldLogRetry(): boolean {
    const attempt = this.retryCount + 1;
    return attempt === 1 || attempt === MAX_RETRIES || (attempt & (attempt - 1)) === 0;
  }

  private getConnectionUrl(): string | undefined {
    // Use NEXT_PUBLIC_SOCKET_URL for the dedicated Socket.io server URL.
    // When empty/undefined (e.g., on Vercel without a socket server),
    // the connect() method will skip the connection entirely.
    if (typeof window !== "undefined") {
      const url = process.env.NEXT_PUBLIC_SOCKET_URL;
      return url || undefined;
    }
    return process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
  }

  private setupNetworkRecovery(): void {
    if (
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function" ||
      this.hasNetworkListeners
    ) return;

    const handleOnline = () => {
      console.log("[SocketClient] Network online - forcing reconnect");
      this.retryCount = 0;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      this.forceReconnect();
    };

    const handleOffline = () => {
      console.log("[SocketClient] Network offline - pausing socket");
      this.connecting = false;
      this._connected = false;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.io.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    this.hasNetworkListeners = true;
  }
}

export const socketClient = SocketClient.getInstance();
export { SocketClient };
