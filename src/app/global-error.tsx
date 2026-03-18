"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error for debugging
    console.error('Global error:', error);

    // Auto-recover from chunk load errors (stale deployment)
    const msg = error?.message || '';
    if (
      msg.includes('ChunkLoadError') ||
      msg.includes('Loading chunk') ||
      msg.includes('Failed to fetch dynamically imported module')
    ) {
      // Clear all dtps caches and force reload
      if (typeof window !== 'undefined' && 'caches' in window) {
        caches.keys().then((names) => {
          Promise.all(names.filter(n => n.startsWith('dtps-')).map(n => caches.delete(n)))
            .then(() => (window as any).location.reload());
        }).catch(() => {
          if (typeof window !== 'undefined') (window as any).location.reload();
        });
      } else if (typeof window !== 'undefined') {
        (window as any).location.reload();
      }
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
