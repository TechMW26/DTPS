export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Enforce IST timezone for the entire Node.js process
    process.env.TZ = 'Asia/Kolkata';
    console.log(`[Instrumentation] Timezone set to ${process.env.TZ} — current time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

    // Native MongoDB initializes lazily; realtime uses Vercel route handlers.

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
