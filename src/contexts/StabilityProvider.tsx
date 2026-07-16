'use client';

/**
 * Production Stability Provider
 * 
 * Provides enterprise-grade stability features to the application:
 * - Session keep-alive during user activity
 * - Version synchronization with auto-reload
 * - Draft auto-save cleanup
 * - Error boundary integration
 * 
 * Usage:
 * Wrap your app layout with <StabilityProvider>
 */

import React, { createContext, useContext, useEffect, useCallback, useState, ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { sessionKeepAlive } from '@/lib/stability/session-keepalive';
import { versionManager } from '@/lib/stability/version-sync';
import { draftManager } from '@/lib/stability/draft-manager';

interface StabilityContextValue {
  /** Whether the app version matches the server */
  isVersionSynced: boolean;
  /** Whether the session keep-alive is active */
  isSessionAlive: boolean;
  /** Force a session refresh */
  refreshSession: () => Promise<boolean>;
  /** Force check version */
  checkVersion: () => void;
  /** Get current app version */
  appVersion: string;
  /** Whether a reload is pending due to version mismatch */
  reloadPending: boolean;
}

const StabilityContext = createContext<StabilityContextValue | null>(null);

interface StabilityProviderProps {
  children: ReactNode;
  /** Enable session keep-alive (default: true) */
  enableSessionKeepAlive?: boolean;
  /** Enable version sync (default: true) */
  enableVersionSync?: boolean;
  /** Enable draft cleanup on mount (default: true) */
  enableDraftCleanup?: boolean;
}

export function StabilityProvider({
  children,
  enableSessionKeepAlive = true,
  enableVersionSync = true,
  enableDraftCleanup = true,
}: StabilityProviderProps) {
  const { data: session, status } = useSession();
  const [isVersionSynced, setIsVersionSynced] = useState(true);
  const [reloadPending, setReloadPending] = useState(false);
  const [isSessionAlive, setIsSessionAlive] = useState(false);

  // Initialize session keep-alive when authenticated
  useEffect(() => {
    if (status === 'authenticated' && enableSessionKeepAlive) {
      sessionKeepAlive.start({
        onRefresh: () => {
          setIsSessionAlive(true);
        },
        onRefreshError: () => {
          setIsSessionAlive(false);
        },
      });

      return () => {
        sessionKeepAlive.stop();
      };
    }
  }, [status, enableSessionKeepAlive]);

  // Initialize version sync
  useEffect(() => {
    if (!enableVersionSync) return;

    const unsubscribe = versionManager.onVersionMismatch((current, server) => {
      console.warn(`[Stability] Version mismatch: ${current} → ${server}`);
      setIsVersionSynced(false);
      setReloadPending(true);
    });

    // Check if this was a version-triggered reload
    if (versionManager.wasVersionReload()) {
      console.info('[Stability] App reloaded due to version update');
    }

    return unsubscribe;
  }, [enableVersionSync]);

  // Cleanup old drafts on mount
  useEffect(() => {
    if (enableDraftCleanup) {
      draftManager.cleanup();
    }
  }, [enableDraftCleanup]);

  // Flush drafts before page unload
  useEffect(() => {
    const handleBeforeUnload = async () => {
      await draftManager.flushAll();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const refreshSession = useCallback(async () => {
    return sessionKeepAlive.forceRefresh();
  }, []);

  const checkVersion = useCallback(() => {
    // Trigger a lightweight API call to check version
    fetch('/api/health')
      .then(response => {
        const serverVersion = response.headers.get('X-App-Version');
        if (serverVersion) {
          versionManager.checkVersion(serverVersion);
        }
      })
      .catch(() => {
        // Ignore errors - version check is best-effort
      });
  }, []);

  const value: StabilityContextValue = {
    isVersionSynced,
    isSessionAlive,
    refreshSession,
    checkVersion,
    appVersion: versionManager.getVersion(),
    reloadPending,
  };

  return (
    <StabilityContext.Provider value={value}>
      {children}
    </StabilityContext.Provider>
  );
}

/**
 * Hook to access stability context
 */
export function useStability(): StabilityContextValue {
  const context = useContext(StabilityContext);
  if (!context) {
    // Return safe defaults if used outside provider
    return {
      isVersionSynced: true,
      isSessionAlive: false,
      refreshSession: async () => false,
      checkVersion: () => {},
      appVersion: '1.0.0',
      reloadPending: false,
    };
  }
  return context;
}

export default StabilityProvider;
