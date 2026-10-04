/**
 * Custom server — wraps Next.js + Socket.io on a single HTTP server.
 *
 * Development:  `node server.js`         (replaces `next dev`)
 * Production:   Copied into .next/standalone/ and run via `node server.js`
 *
 * IMPORTANT: The HTTP server and Socket.io are created BEFORE app.prepare()
 * so that globalThis.__socketIO is available when Next.js instrumentation
 * runs. This allows SocketManager to eagerly register auth middleware and
 * connection handlers before the server starts accepting connections.
 */

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server: SocketIOServer } = require("socket.io");

// Load .env before anything else so NEXTAUTH_URL etc. are available
// for CORS origin construction and other config below.
try {
  require("dotenv").config();
} catch {
  // dotenv not installed — env vars must be set externally
}

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);
const configuredMealEngagementIntervalMs = parseInt(
  process.env.MEAL_ENGAGEMENT_INTERVAL_MS || "60000",
  10,
);
const mealEngagementIntervalMs = Number.isFinite(configuredMealEngagementIntervalMs)
  ? Math.max(30_000, configuredMealEngagementIntervalMs)
  : 60_000;

let mealEngagementRunInProgress = false;

async function runMealEngagementNotifications() {
  if (
    process.env.MEAL_ENGAGEMENT_NOTIFICATIONS_ENABLED === "false" ||
    !process.env.CRON_SECRET ||
    mealEngagementRunInProgress
  ) {
    return;
  }

  mealEngagementRunInProgress = true;
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/internal/meal-engagement`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
      },
    );
    if (!response.ok) {
      console.warn(
        `[server] Meal engagement scheduler returned ${response.status}`,
      );
    }
  } catch (error) {
    console.warn(
      "[server] Meal engagement scheduler failed:",
      error?.message || error,
    );
  } finally {
    mealEngagementRunInProgress = false;
  }
}

// ── Build allowed CORS origins ────────────────────────────────────────
function getAllowedOrigins() {
  const origins = new Set(["https://dtps.tech", "https://www.dtps.tech"]);
  const envUrl = process.env.NEXTAUTH_URL;
  if (envUrl) {
    origins.add(envUrl.replace(/\/+$/, ""));
  }
  return Array.from(origins);
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ── Create HTTP server + Socket.io BEFORE app.prepare() ──────────────
// This ensures globalThis.__socketIO exists when instrumentation.ts runs,
// allowing SocketManager to attach auth middleware and connection handlers
// before the server starts listening for connections.
const httpServer = createServer((req, res) => {
  const parsedUrl = parse(req.url, true);
  handle(req, res, parsedUrl);
});

const allowedOrigins = getAllowedOrigins();

const io = new SocketIOServer(httpServer, {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e6,
  connectTimeout: 45000,
});

// Store io on globalThis so SocketManager (inside Next.js) can find it
globalThis.__socketIO = io;
console.log(
  "[server] Socket.io instance created, stored on globalThis.__socketIO",
);

app.prepare().then(() => {
  httpServer.listen(port, hostname, () => {
    const displayHost = hostname === "0.0.0.0" ? "localhost" : hostname;
    console.log(`> Ready on http://${displayHost}:${port}`);
    console.log(`> Socket.io attached on /socket.io`);
    console.log(`> CORS origins: ${allowedOrigins.join(", ")}`);

    if (process.env.MEAL_ENGAGEMENT_NOTIFICATIONS_ENABLED !== "false") {
      const initialRun = setTimeout(runMealEngagementNotifications, 10_000);
      initialRun.unref();
      const scheduler = setInterval(
        runMealEngagementNotifications,
        mealEngagementIntervalMs,
      );
      scheduler.unref();
      console.log(
        `> Meal engagement scheduler every ${mealEngagementIntervalMs}ms`,
      );
    }
  });
});
