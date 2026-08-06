"use client";

import { useEffect } from "react";

// Reload loop guard constants
const RELOAD_GUARD_KEY = 'dtps_error_reload_ts';
const RELOAD_COOLDOWN_MS = 15000; // 15 seconds between reload attempts

/**
 * Safely check if we should skip reload due to recent attempt
 * Returns true if we should skip (reload already attempted recently)
 */
function shouldSkipReload(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const lastReloadTs = sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (lastReloadTs) {
      const elapsed = Date.now() - parseInt(lastReloadTs, 10);
      if (elapsed < RELOAD_COOLDOWN_MS) {
        console.warn(`[GlobalError] Skipping reload — last attempt was ${elapsed}ms ago`);
        return true;
      }
    }
  } catch {
    // sessionStorage not available
  }
  return false;
}

/**
 * Record a reload attempt timestamp
 */
function recordReloadAttempt(): void {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, Date.now().toString());
  } catch {
    // Ignore
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // === BULLETPROOF ERROR HANDLER ===
    // Entire body wrapped in try-catch - this component must NEVER throw
    try {
      // Log error for debugging
      console.error('Global error:', error);

      // Auto-recover from chunk load errors (stale deployment)
      const msg = error?.message || '';
      const isChunkError =
        msg.includes('ChunkLoadError') ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch dynamically imported module');

      if (isChunkError && typeof window !== 'undefined') {
        // Check reload guard - prevent infinite loops
        if (shouldSkipReload()) {
          return;
        }

        // Record this reload attempt before proceeding
        recordReloadAttempt();

        // Clear all dtps caches and force reload
        if ('caches' in window) {
          caches.keys()
            .then((names) => {
              Promise.all(names.filter(n => n.startsWith('dtps-')).map(n => caches.delete(n)))
                .then(() => window.location.reload())
                .catch(() => window.location.reload());
            })
            .catch(() => {
              window.location.reload();
            });
        } else {
          globalThis.location.reload();
        }
      }
    } catch (handlerError) {
      // Error handler itself failed - just log and render fallback UI
      console.error('[GlobalError] Error handler failed:', handlerError);
    }
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f9fafb',
          padding: '1rem',
        }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{
              width: 64, height: 64, margin: '0 auto 1.5rem',
              borderRadius: 12, background: '#E06A26',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '1.5rem', fontWeight: 'bold',
            }}>D</div>
            <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#1f2937' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Please try again. If the problem persists, clear your browser cache.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#E06A26', color: 'white', border: 'none',
                padding: '0.75rem 2rem', borderRadius: 8, fontSize: '1rem',
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
