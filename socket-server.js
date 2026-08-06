/**
 * Standalone Socket.io Server — DTPS Realtime
 *
 * Separated from the Next.js app for Vercel deployment.
 * Deploy this on a service that supports persistent WebSocket connections
 * (Railway, Render, Fly.io, or a VPS).
 *
 * Usage:
 *   node socket-server.js
 *
 * The Next.js app on Vercel connects to this server as a Socket.io client.
 * Set NEXT_PUBLIC_SOCKET_URL on Vercel to point to this server's URL.
 */

const { createServer } = require("http");
const { timingSafeEqual } = require("crypto");
const { Server: SocketIOServer } = require("socket.io");
const { decode: decodeJWT } = require("next-auth/jwt");
const jwt = require("jsonwebtoken");

// Load .env for local development
try {
  require("dotenv").config();
} catch {
  // dotenv not installed — env vars must be set externally
}

const PORT = parseInt(process.env.SOCKET_PORT || "3001", 10);
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "";
const SOCKET_INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET || "";
const CORS_ORIGINS = buildCorsOrigins();

if (!NEXTAUTH_SECRET || !SOCKET_INTERNAL_SECRET) {
  console.error("NEXTAUTH_SECRET and SOCKET_INTERNAL_SECRET are required");
  process.exit(1);
}

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

// ── HTTP Server + Socket.io ────────────────────────────────────────────────

const httpServer = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", "http://localhost");

  // Socket.IO owns this path through its own request listener.
  if (requestUrl.pathname.startsWith("/socket.io")) return;

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    return sendJson(res, 200, {
      status: "ok",
      uptime: process.uptime(),
      connections: io.engine.clientsCount,
      onlineUsers: onlineUsers.size,
    });
  }

  if (req.method === "GET" && requestUrl.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("DTPS Socket.io Server");
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/internal/broadcast") {
    if (!secretsMatch(req.headers["x-socket-internal-secret"], SOCKET_INTERNAL_SECRET)) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }

    try {
      const payload = await readJsonBody(req);
      if (!payload || typeof payload.event !== "string" || !payload.event || payload.event.length > 100) {
        return sendJson(res, 400, { error: "Invalid event" });
      }

      if (payload.scope === "user" && typeof payload.userId === "string") {
        io.to(userRoom(payload.userId)).emit(payload.event, payload.data);
      } else if (payload.scope === "users" && Array.isArray(payload.userIds)) {
        for (const userId of new Set(payload.userIds.filter((id) => typeof id === "string"))) {
          io.to(userRoom(userId)).emit(payload.event, payload.data);
        }
      } else if (payload.scope === "role" && typeof payload.role === "string") {
        io.to(roleRoom(payload.role)).emit(payload.event, payload.data);
      } else if (payload.scope === "all") {
        io.emit(payload.event, payload.data);
      } else {
        return sendJson(res, 400, { error: "Invalid broadcast target" });
      }

      return sendJson(res, 200, { ok: true });
    } catch (error) {
      const status = error?.code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
      return sendJson(res, status, { error: status === 413 ? "Payload too large" : "Invalid JSON" });
    }
  }

  sendJson(res, 404, { error: "Not found" });
});

const io = new SocketIOServer(httpServer, {
  path: "/socket.io",
  cors: {
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) return callback(null, true);
      callback(new Error("Origin not allowed"));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["polling", "websocket"],
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 10000,
  maxHttpBufferSize: 1e6, // 1MB
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: false,
  },
});

// ── Auth Middleware ─────────────────────────────────────────────────────────

io.use(async (socket, next) => {
  try {
    let decoded;
    const socketToken = socket.handshake.auth?.token;
    if (typeof socketToken === "string" && socketToken) {
      decoded = jwt.verify(socketToken, SOCKET_INTERNAL_SECRET, {
        algorithms: ["HS256"],
        audience: "dtps-socket",
        issuer: "dtps-web",
      });
    } else {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const sessionToken = cookies[SESSION_COOKIE_NAME] ||
        cookies["__Secure-next-auth.session-token"] ||
        cookies["next-auth.session-token"];
      if (!sessionToken) return next(new Error("Authentication required"));
      decoded = await decodeJWT({ token: sessionToken, secret: NEXTAUTH_SECRET });
    }

    if (!decoded?.sub) {
      return next(new Error("Invalid session"));
    }

    socket.data.userId = decoded.sub;
    socket.data.userRole = decoded.role || "client";
    socket.data.firstName = decoded.firstName || "";
    socket.data.lastName = decoded.lastName || "";

    next();
  } catch (err) {
    console.error("[Socket.io] Auth error:", err);
    next(new Error("Authentication failed"));
  }
});

// ── Connection Handler ─────────────────────────────────────────────────────

const userSockets = new Map(); // userId → Set<socketId>
const onlineUsers = new Map(); // userId → { lastSeen, connections }

function userRoom(userId) {
  return `user:${userId}`;
}
function roleRoom(role) {
  return `role:${role}`;
}

io.on("connection", (socket) => {
  const { userId, userRole, firstName, lastName } = socket.data;

  console.log(`[Socket.io] Connected: ${userId} (${userRole})`);

  // Join personal room
  socket.join(userRoom(userId));

  // Join role room
  if (userRole) {
    socket.join(roleRoom(userRole));
  }

  // Track presence
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socket.id);

  onlineUsers.set(userId, {
    lastSeen: Date.now(),
    connections: userSockets.get(userId).size,
    firstName,
    lastName,
    role: userRole,
  });

  // Notify others this user is online
  socket.broadcast.emit("user_online", {
    userId,
    firstName,
    lastName,
    role: userRole,
  });

  // Send current online users to the connecting socket
  const snapshot = {};
  onlineUsers.forEach((data, uid) => {
    snapshot[uid] = { ...data, connections: undefined };
  });
  socket.emit("online_snapshot", snapshot);

  // ── Typing indicators ──────────────────────────────────────────────────
  socket.on("send_typing", ({ receiverId, isTyping }) => {
    if (receiverId) {
      io.to(userRoom(receiverId)).emit("typing_update", {
        senderId: userId,
        senderName: `${firstName} ${lastName}`.trim(),
        isTyping,
      });
    }
  });

  // ── Disconnect ─────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log(`[Socket.io] Disconnected: ${userId}`);

    const sockets = userSockets.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        userSockets.delete(userId);
        onlineUsers.delete(userId);

        // Only broadcast offline when ALL connections are gone
        io.emit("user_offline", {
          userId,
          timestamp: Date.now(),
        });
      }
    }
  });
});

// ── Start ──────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[Socket.io] Server running on port ${PORT}`);
  console.log(`[Socket.io] CORS origins: ${CORS_ORIGINS.join(", ")}`);
});

httpServer.on("clientError", (_error, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Socket.io] ${signal} received; draining connections`);
  const forceTimer = setTimeout(() => process.exit(1), 10_000);
  forceTimer.unref();
  io.close(() => {
    httpServer.close(() => process.exit(0));
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

// ── Helpers ────────────────────────────────────────────────────────────────

function parseCookies(cookieString = "") {
  const result = {};
  if (!cookieString) return result;
  cookieString.split(";").forEach((pair) => {
    const index = pair.indexOf("=");
    if (index < 0) return;
    const key = pair.slice(0, index).trim();
    const rawValue = pair.slice(index + 1).trim();
    try {
      result[key] = decodeURIComponent(rawValue);
    } catch {
      result[key] = rawValue;
    }
  });
  return result;
}

function buildCorsOrigins() {
  const origins = new Set(["https://dtps.tech", "https://www.dtps.tech"]);
  for (const value of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    ...(process.env.SOCKET_CORS_ORIGINS || "").split(","),
  ]) {
    if (value?.trim()) origins.add(value.trim().replace(/\/$/, ""));
  }
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }
  return [...origins];
}

function isAllowedOrigin(origin) {
  const normalized = origin.replace(/\/$/, "");
  if (CORS_ORIGINS.includes(normalized)) return true;
  return /^https:\/\/dtps(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(normalized);
}

function secretsMatch(received, expected) {
  if (typeof received !== "string" || !received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > 1_000_000) {
        tooLarge = true;
        const error = new Error("Payload too large");
        error.code = "PAYLOAD_TOO_LARGE";
        reject(error);
      }
    });
    request.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Socket.io] SIGTERM — shutting down");
  io.close();
  httpServer.close();
  process.exit(0);
});
