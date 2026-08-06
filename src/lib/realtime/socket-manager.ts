/**
 * Socket.io Server Manager
 *
 * Drop-in replacement for SSEManager and AdminSSEManager.
 * Provides the same public API: sendToUser(), sendToUsers(), broadcast().
 *
 * The raw `io` instance is created by `server.js` (project root) and stored
 * on `globalThis.__socketIO`. This manager lazily attaches auth middleware
 * and connection handlers on first access.
 *
 * Connections are organized into rooms:
 *   - `user:<userId>` — every authenticated socket auto-joins
 *   - `role:<role>`   — joined based on JWT role
 */

import { Server as SocketIOServer, Socket } from "socket.io";
import { decode } from "next-auth/jwt";
import { onlineStatusManager, typingManager } from "./online-status";
import { userRoom, roleRoom, SOCKET_EVENTS } from "./socket-events";

declare global {
  var __socketIO: SocketIOServer | undefined;
  var __socketManager: SocketManager | undefined;
}

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "";

// Cookie name varies by env
const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

export interface SocketUserData {
  userId: string;
  role: string;
  firstName?: string;
  lastName?: string;
}

type RemoteBroadcast =
  | { scope: "user"; userId: string; event: string; data: unknown }
  | { scope: "users"; userIds: string[]; event: string; data: unknown }
  | { scope: "role"; role: string; event: string; data: unknown }
  | { scope: "all"; event: string; data: unknown };

class SocketManager {
  private io: SocketIOServer | null = null;
  private initialized = false;
  private remoteWarningLogged = false;

  // Track userId → Set<socketId> for presence
  private userSockets = new Map<string, Set<string>>();

  static getInstance(): SocketManager {
    if (!globalThis.__socketManager) {
      globalThis.__socketManager = new SocketManager();
    }
    return globalThis.__socketManager;
  }

  /** Return underlying io instance. */
  getIO(): SocketIOServer | null {
    this.ensureInitialized();
    return this.io;
  }

  /**
   * Lazily grab the io instance from globalThis and wire up auth + handlers.
   * Called automatically by every public method. Safe to call multiple times.
   */
  private ensureInitialized(): void {
    if (this.initialized) return;

    const io = globalThis.__socketIO;
    if (!io) {
      console.warn(
        "[SocketManager] globalThis.__socketIO not found — server.js may not have created it yet",
      );
      return;
    }

    if (!NEXTAUTH_SECRET) {
      console.error(
        "[SocketManager] NEXTAUTH_SECRET is not set — all socket auth will fail!",
      );
    }

    this.io = io;
    this.initialized = true;

    // ── Engine-level error logging ────────────────────────────────────
    io.engine.on("connection_error", (err) => {
      console.error("[SocketManager] Engine connection error:", {
        message: err.message,
        code: (err as any).code,
        context: (err as any).context,
      });
    });

    // ── Auth middleware ────────────────────────────────────────────────
    this.io.use(async (socket, next) => {
      try {
        const token = await this.extractToken(socket);
        if (!token || !token.sub) {
          console.warn(
            "[SocketManager] Auth rejected — no valid token found in handshake cookies",
          );
          return next(new Error("Authentication required"));
        }

        // Attach user info to socket
        (socket as any).userId = token.sub;
        (socket as any).userRole = token.role || "client";
        (socket as any).firstName = token.firstName;
        (socket as any).lastName = token.lastName;

        next();
      } catch (err) {
        console.error("[SocketManager] Auth middleware error:", err);
        next(new Error("Authentication failed"));
      }
    });

    // ── Connection handler ────────────────────────────────────────────
    this.io.on("connection", (socket: Socket) => {
      const userId = (socket as any).userId as string;
      const userRole = (socket as any).userRole as string;

      console.log(
        `[SocketManager] User connected: ${userId} (${userRole}) [${socket.id}]`,
      );

      // Join user-specific + role rooms
      socket.join(userRoom(userId));
      socket.join(roleRoom(userRole));

      // Track this socket
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socket.id);

      // Update online status
      onlineStatusManager.setUserOnline(userId, socket.id);

      // Send welcome event
      socket.emit(SOCKET_EVENTS.CONNECTED, {
        status: "connected",
        userId,
        socketId: socket.id,
        timestamp: Date.now(),
      });

      // Send online snapshot to this client
      socket.emit(SOCKET_EVENTS.ONLINE_SNAPSHOT, {
        onlineUsers: onlineStatusManager.getOnlineUsers(),
        timestamp: Date.now(),
      });

      // Broadcast user_online to everyone else
      socket.broadcast.emit(SOCKET_EVENTS.USER_ONLINE, {
        userId,
        timestamp: Date.now(),
      });

      // ── Client-to-server events ──────────────────────────────────
      socket.on(
        SOCKET_EVENTS.SEND_TYPING,
        (data: { receiverId: string; isTyping: boolean }) => {
          if (data.isTyping) {
            typingManager.setUserTyping(userId, data.receiverId);
            this.sendToUser(data.receiverId, SOCKET_EVENTS.TYPING_START, {
              userId,
              timestamp: Date.now(),
            });
          } else {
            typingManager.setUserNotTyping(userId);
            this.sendToUser(data.receiverId, SOCKET_EVENTS.TYPING_STOP, {
              userId,
              timestamp: Date.now(),
            });
          }
        },
      );

      // ── Disconnect handler ───────────────────────────────────────
      socket.on("disconnect", (reason) => {
        console.log(
          `[SocketManager] User disconnected: ${userId} [${socket.id}] reason=${reason}`,
        );
        const userSet = this.userSockets.get(userId);
        if (userSet) {
          userSet.delete(socket.id);
          if (userSet.size === 0) {
            this.userSockets.delete(userId);
          }
        }

        onlineStatusManager.setUserOffline(userId, socket.id);
        typingManager.clearUserTyping(userId);

        // Broadcast offline only when the user has no remaining sockets
        if (
          !this.userSockets.has(userId) ||
          this.userSockets.get(userId)!.size === 0
        ) {
          this.io?.emit(SOCKET_EVENTS.USER_OFFLINE, {
            userId,
            timestamp: Date.now(),
          });
        }
      });

      // ── Per-socket error handler ─────────────────────────────────
      socket.on("error", (err) => {
        console.error(
          `[SocketManager] Socket error for ${userId} [${socket.id}]:`,
          err,
        );
        socket.emit(SOCKET_EVENTS.SOCKET_ERROR, {
          message: err instanceof Error ? err.message : "Unknown socket error",
          timestamp: Date.now(),
        });
      });
    });

    console.log(
      "[SocketManager] Auth middleware and connection handlers attached",
    );
  }

  // ── Public API (drop-in for SSEManager) ──────────────────────────

  /** Send an event to a specific user (all their sockets). */
  sendToUser(userId: string, event: string, data: unknown): void {
    this.ensureInitialized();
    if (!this.io) {
      this.dispatchRemote({ scope: "user", userId, event, data });
      return;
    }
    this.io.to(userRoom(userId)).emit(event, data);
  }

  /** Send to multiple users. */
  sendToUsers(userIds: string[], event: string, data: unknown): void {
    this.ensureInitialized();
    if (!this.io) {
      this.dispatchRemote({ scope: "users", userIds, event, data });
      return;
    }
    userIds.forEach((id) => this.io?.to(userRoom(id)).emit(event, data));
  }

  /** Broadcast to every connected socket. */
  broadcast(event: string, data: unknown): void {
    this.ensureInitialized();
    if (!this.io) {
      this.dispatchRemote({ scope: "all", event, data });
      return;
    }
    this.io.emit(event, data);
  }

  /** Broadcast to a specific role room. */
  broadcastToRole(role: string, event: string, data: unknown): void {
    this.ensureInitialized();
    if (!this.io) {
      this.dispatchRemote({ scope: "role", role, event, data });
      return;
    }
    this.io.to(roleRoom(role)).emit(event, data);
  }

  /** Get list of online userIds. */
  getOnlineUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }

  /** Check if user has at least one connected socket. */
  isUserOnline(userId: string): boolean {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }

  // ── Admin convenience (replaces AdminSSEManager) ─────────────────

  /** Broadcast admin-specific client update events. */
  broadcastClientUpdate(eventType: string, data: unknown): void {
    this.broadcastToRole("admin", eventType, data);
  }

  // ── Private helpers ──────────────────────────────────────────────

  private dispatchRemote(payload: RemoteBroadcast): void {
    const endpoint = process.env.SOCKET_BROADCAST_URL?.replace(/\/$/, "");
    const secret = process.env.SOCKET_INTERNAL_SECRET;

    if (!endpoint || !secret) {
      if (!this.remoteWarningLogged) {
        console.warn(
          "[SocketManager] External realtime delivery is not configured",
        );
        this.remoteWarningLogged = true;
      }
      return;
    }

    void fetch(`${endpoint}/internal/broadcast`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-socket-internal-secret": secret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    }).then((response) => {
      if (!response.ok) {
        console.error(
          `[SocketManager] External broadcast failed with ${response.status}`,
        );
      }
    }).catch((error: unknown) => {
      console.error(
        "[SocketManager] External broadcast failed:",
        error instanceof Error ? error.message : error,
      );
    });
  }

  private async extractToken(socket: Socket): Promise<any> {
    // Parse cookie from handshake headers
    const cookieHeader = socket.handshake.headers.cookie || "";
    const cookies = this.parseCookies(cookieHeader);
    const rawToken = cookies[SESSION_COOKIE_NAME];

    if (!rawToken) return null;

    // Decode the NextAuth JWT
    const decoded = await decode({
      token: rawToken,
      secret: NEXTAUTH_SECRET,
    });

    return decoded;
  }

  private parseCookies(cookieString: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (!cookieString) return result;
    cookieString.split(";").forEach((pair) => {
      const idx = pair.indexOf("=");
      if (idx < 0) return;
      const key = pair.substring(0, idx).trim();
      const val = pair.substring(idx + 1).trim();
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    });
    return result;
  }
}

export const socketManager = SocketManager.getInstance();
export { SocketManager };
