/**
 * Session Keep-Alive Manager
 * 
 * Prevents session expiry during active usage.
 * Features:
 * - Detects user activity (mouse, keyboard, touch, scroll)
 * - Refreshes session token in background
 * - Configurable activity timeout
 * - No impact on UI/UX
 */

export interface SessionKeepAliveOptions {
  /** How often to check for activity and refresh session (ms) */
  refreshInterval?: number;
  /** How long after last activity before considering user idle (ms) */
  idleTimeout?: number;
  /** Session refresh endpoint */
  refreshEndpoint?: string;
  /** Callback when session is refreshed */
  onRefresh?: () => void;
  /** Callback when session refresh fails */
  onRefreshError?: (error: Error) => void;
}

class SessionKeepAlive {
  private isActive: boolean = false;
  private lastActivity: number = Date.now();
  private refreshTimer: NodeJS.Timeout | null = null;
  private activityListeners: (() => void)[] = [];
  private config: Required<SessionKeepAliveOptions>;

  constructor() {
    this.config = {
      refreshInterval: 4 * 60 * 1000, // 4 minutes (before typical 5-min session check)
      idleTimeout: 15 * 60 * 1000, // 15 minutes of inactivity
      refreshEndpoint: '/api/auth/session',
      onRefresh: () => {},
      onRefreshError: () => {},
    };
  }

  /**
   * Start monitoring user activity and keeping session alive
   */
  start(options: SessionKeepAliveOptions = {}): void {
    if (typeof window === 'undefined') return;
    if (this.isActive) return;

    this.config = { ...this.config, ...options };
    this.isActive = true;
    this.lastActivity = Date.now();

    // Activity event handlers
    const updateActivity = () => {
      this.lastActivity = Date.now();
    };

    // Listen for user activity
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
    events.forEach(event => {
      // Throttle mousemove to avoid performance issues
      if (event === 'mousemove') {
        let lastMove = 0;
        const throttledMove = () => {
          const now = Date.now();
          if (now - lastMove > 1000) { // Max once per second
            lastMove = now;
            updateActivity();
          }
        };
        window.addEventListener(event, throttledMove, { passive: true });
        this.activityListeners.push(() => window.removeEventListener(event, throttledMove));
      } else {
        window.addEventListener(event, updateActivity, { passive: true });
        this.activityListeners.push(() => window.removeEventListener(event, updateActivity));
      }
    });

    // Start refresh timer
    this.startRefreshTimer();

    console.info('[SessionKeepAlive] Started monitoring');
  }

  /**
   * Stop monitoring and cleanup
   */
  stop(): void {
    this.isActive = false;
    
    // Clear timer
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Remove event listeners
    this.activityListeners.forEach(remove => remove());
    this.activityListeners = [];

    console.info('[SessionKeepAlive] Stopped monitoring');
  }

  /**
   * Start the session refresh timer
   */
  private startRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      await this.checkAndRefresh();
    }, this.config.refreshInterval);
  }

  /**
   * Check activity and refresh session if needed
   */
  private async checkAndRefresh(): Promise<void> {
    const now = Date.now();
    const timeSinceActivity = now - this.lastActivity;

    // If user has been idle too long, don't refresh
    if (timeSinceActivity > this.config.idleTimeout) {
      console.info('[SessionKeepAlive] User idle, skipping refresh');
      return;
    }

    try {
      // Touch the session endpoint to refresh the token
      const response = await fetch(this.config.refreshEndpoint, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      if (response.ok) {
        console.debug('[SessionKeepAlive] Session refreshed');
        this.config.onRefresh();
      } else if (response.status === 401) {
        // Session expired, stop monitoring
        console.warn('[SessionKeepAlive] Session expired');
        this.stop();
      }
    } catch (error) {
      console.error('[SessionKeepAlive] Refresh failed:', error);
      this.config.onRefreshError(error instanceof Error ? error : new Error('Refresh failed'));
    }
  }

  /**
   * Force an immediate session refresh
   */
  async forceRefresh(): Promise<boolean> {
    try {
      const response = await fetch(this.config.refreshEndpoint, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get time since last user activity
   */
  getIdleTime(): number {
    return Date.now() - this.lastActivity;
  }

  /**
   * Check if user is currently active
   */
  isUserActive(): boolean {
    return this.getIdleTime() < this.config.idleTimeout;
  }

  /**
   * Update last activity timestamp (useful for manual triggers)
   */
  recordActivity(): void {
    this.lastActivity = Date.now();
  }
}

// Export singleton instance
export const sessionKeepAlive = new SessionKeepAlive();
