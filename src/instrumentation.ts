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
  }
}
