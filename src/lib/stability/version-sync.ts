/**
 * Version Synchronization Manager
 * 
 * Ensures frontend and backend are running compatible versions.
 * Features:
 * - Auto-detection of version mismatch
 * - Graceful reload without losing session
 * - Configurable reload behavior
 */

export interface VersionInfo {
  version: string;
  buildTime: string;
  gitCommit?: string;
}

interface VersionManagerConfig {
  /** Whether to auto-reload on version mismatch */
  autoReload: boolean;
  /** Delay before reload in ms */
  reloadDelay: number;
  /** Callback when version mismatch detected */
  onMismatch?: (currentVersion: string, serverVersion: string) => void;
}

class VersionManager {
  private currentVersion: string;
  private config: VersionManagerConfig;
  private reloadScheduled: boolean = false;
  private mismatchCallbacks: Set<(current: string, server: string) => void> = new Set();

  constructor() {
    // Version is injected at build time via Next.js
    this.currentVersion = process.env.NEXT_PUBLIC_APP_VERSION || 
                          process.env.npm_package_version || 
                          '1.0.0';
    
    this.config = {
      autoReload: true,
      reloadDelay: 3000, // 3 second delay before reload
    };
  }

  /**
   * Get current frontend version
   */
  getVersion(): string {
    return this.currentVersion;
  }

  /**
   * Configure version manager behavior
   */
  configure(config: Partial<VersionManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Register callback for version mismatch events
   */
  onVersionMismatch(callback: (current: string, server: string) => void): () => void {
    this.mismatchCallbacks.add(callback);
    return () => this.mismatchCallbacks.delete(callback);
  }

  /**
   * Check if server version matches frontend version
   * Triggers reload if mismatch detected
   */
  checkVersion(serverVersion: string): boolean {
    if (!serverVersion || serverVersion === this.currentVersion) {
      return true;
    }

    console.warn(
      `[VersionManager] Version mismatch detected. ` +
      `Frontend: ${this.currentVersion}, Server: ${serverVersion}`
    );

    // Notify callbacks
    this.mismatchCallbacks.forEach(callback => {
      try {
        callback(this.currentVersion, serverVersion);
      } catch (e) {
        console.error('[VersionManager] Callback error:', e);
      }
    });

    // Schedule graceful reload
    if (this.config.autoReload && !this.reloadScheduled) {
      this.scheduleReload();
    }

    return false;
  }

  /**
   * Schedule a graceful page reload
   * Clears in-memory state but preserves session
   */
  private scheduleReload(): void {
    if (this.reloadScheduled) return;
    
    this.reloadScheduled = true;
    
    // Check if we're in a browser environment
    if (typeof window === 'undefined') return;

    console.info(
      `[VersionManager] Scheduling reload in ${this.config.reloadDelay}ms...`
    );

    // Store a flag to indicate this is a version-triggered reload
    try {
      sessionStorage.setItem('version_reload', 'true');
      sessionStorage.setItem('reload_time', Date.now().toString());
    } catch (e) {
      // sessionStorage might not be available
    }

    setTimeout(() => {
      // Clear any cached data before reload
      this.clearCache();
      
      // Reload without losing session (soft reload)
      window.location.reload();
    }, this.config.reloadDelay);
  }

  /**
   * Clear cached data before reload
   */
  private clearCache(): void {
    if (typeof window === 'undefined') return;

    // Clear any React Query cache if available
    if ((window as any).__REACT_QUERY_CACHE__) {
      try {
        (window as any).__REACT_QUERY_CACHE__.clear();
      } catch (e) {
        // Ignore
      }
    }

    // Clear SWR cache if available
    if ((window as any).__SWR_CACHE__) {
      try {
        (window as any).__SWR_CACHE__.clear();
      } catch (e) {
        // Ignore
      }
    }
  }

  /**
   * Manual reload trigger
   */
  forceReload(): void {
    if (typeof window !== 'undefined') {
      this.clearCache();
      window.location.reload();
    }
  }

  /**
   * Check if current page load was triggered by version mismatch
   */
  wasVersionReload(): boolean {
    if (typeof window === 'undefined') return false;
    
    try {
      const wasReload = sessionStorage.getItem('version_reload') === 'true';
      if (wasReload) {
        sessionStorage.removeItem('version_reload');
        sessionStorage.removeItem('reload_time');
      }
      return wasReload;
    } catch (e) {
      return false;
    }
  }
}

// Export singleton instance
export const versionManager = new VersionManager();
