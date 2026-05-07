export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Enforce IST timezone for the entire Node.js process
    process.env.TZ = 'Asia/Kolkata';
    console.log(`[Instrumentation] Timezone set to ${process.env.TZ} — current time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

    // Pre-warm MongoDB connection on server startup so the first request is fast
    try {
      const { default: connectDB } = await import("@/lib/db/connection");
      connectDB().then(() => {
        console.log('[Instrumentation] MongoDB connection pre-warmed');
      }).catch((err: Error) => {
        console.warn('[Instrumentation] MongoDB pre-warm failed (will retry on first request):', err.message);
      });
    } catch {
      // Silently ignore — connection will be established on first request
    }

    // Eagerly initialize SocketManager so auth middleware and connection
    // handlers are attached BEFORE the server starts accepting connections.
    // globalThis.__socketIO is set by server.js BEFORE app.prepare() runs.
    try {
      const { socketManager } = await import("@/lib/realtime/socket-manager");
      const io = socketManager.getIO();
      if (io) {
        console.log('[Instrumentation] SocketManager initialized — auth middleware + connection handlers attached');
      } else {
        console.warn('[Instrumentation] SocketManager: globalThis.__socketIO not available yet');
      }
    } catch (err) {
      console.warn('[Instrumentation] SocketManager init failed:', err);
    }

    // Capture unhandled runtime failures and persist into SystemAlert
    try {
      const { logApiError } = await import('@/lib/utils/activityLogger');
      const endpointHint = process.env.NEXTAUTH_URL || 'server-runtime';

      process.on('unhandledRejection', (reason) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        void logApiError(endpointHint, 'RUNTIME', error, 500, {
          section: 'internal',
          source: 'system',
          event: 'unhandledRejection'
        });
      });

      process.on('uncaughtException', (error) => {
        void logApiError(endpointHint, 'RUNTIME', error, 500, {
          section: 'internal',
          source: 'system',
          event: 'uncaughtException'
        });
      });
    } catch (err) {
      console.warn('[Instrumentation] Global runtime error hooks init failed:', err);
    }
  }
}
