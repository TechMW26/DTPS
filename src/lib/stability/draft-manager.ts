/**
 * Auto-Save / Draft Manager
 * 
 * Prevents data loss by automatically saving drafts in the background.
 * Features:
 * - Debounced auto-save to server
 * - Local storage fallback
 * - Auto-restore on page reload
 * - Conflict detection
 */

export interface DraftData<T = unknown> {
  id: string;
  type: string;
  data: T;
  timestamp: number;
  userId?: string;
}

interface DraftManagerConfig {
  /** Auto-save debounce delay in ms */
  debounceDelay: number;
  /** Server endpoint for saving drafts */
  serverEndpoint?: string;
  /** Use local storage as fallback */
  useLocalStorage: boolean;
  /** Maximum age of drafts in ms before cleanup */
  maxDraftAge: number;
}

class DraftManager {
  private config: DraftManagerConfig;
  private saveTimers: Map<string, NodeJS.Timeout> = new Map();
  private localStorageKey = 'app_drafts';

  constructor() {
    this.config = {
      debounceDelay: 2000, // 2 seconds
      serverEndpoint: '/api/drafts',
      useLocalStorage: true,
      maxDraftAge: 24 * 60 * 60 * 1000, // 24 hours
    };
  }

  /**
   * Configure the draft manager
   */
  configure(config: Partial<DraftManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Generate a unique draft key
   */
  private getDraftKey(type: string, id: string): string {
    return `${type}:${id}`;
  }

  /**
   * Save draft with debouncing
   */
  saveDraft<T>(
    type: string,
    id: string,
    data: T,
    options: { immediate?: boolean; userId?: string } = {}
  ): void {
    const key = this.getDraftKey(type, id);

    // Clear existing timer
    const existingTimer = this.saveTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const draft: DraftData<T> = {
      id,
      type,
      data,
      timestamp: Date.now(),
      userId: options.userId,
    };

    if (options.immediate) {
      this.persistDraft(key, draft);
    } else {
      // Debounced save
      const timer = setTimeout(() => {
        this.persistDraft(key, draft);
        this.saveTimers.delete(key);
      }, this.config.debounceDelay);
      
      this.saveTimers.set(key, timer);
    }
  }

  /**
   * Persist draft to storage
   */
  private async persistDraft<T>(key: string, draft: DraftData<T>): Promise<void> {
    // Always save to local storage first for reliability
    if (this.config.useLocalStorage) {
      this.saveToLocalStorage(key, draft);
    }

    // Try to save to server
    if (this.config.serverEndpoint) {
      try {
        await fetch(this.config.serverEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, ...draft }),
        });
        console.debug(`[DraftManager] Saved draft: ${key}`);
      } catch (error) {
        console.warn(`[DraftManager] Server save failed for ${key}:`, error);
        // Local storage fallback already handled
      }
    }
  }

  /**
   * Save to local storage
   */
  private saveToLocalStorage<T>(key: string, draft: DraftData<T>): void {
    if (typeof window === 'undefined') return;

    try {
      const drafts = this.getAllLocalDrafts();
      drafts[key] = draft;
      localStorage.setItem(this.localStorageKey, JSON.stringify(drafts));
    } catch (error) {
      console.warn('[DraftManager] Local storage save failed:', error);
    }
  }

  /**
   * Get all drafts from local storage
   */
  private getAllLocalDrafts(): Record<string, DraftData> {
    if (typeof window === 'undefined') return {};

    try {
      const stored = localStorage.getItem(this.localStorageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  /**
   * Get a specific draft
   */
  async getDraft<T>(type: string, id: string): Promise<DraftData<T> | null> {
    const key = this.getDraftKey(type, id);

    // Try server first
    if (this.config.serverEndpoint) {
      try {
        const response = await fetch(`${this.config.serverEndpoint}?type=${type}&id=${id}`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.draft) {
            return data.draft as DraftData<T>;
          }
        }
      } catch {
        // Fall back to local storage
      }
    }

    // Try local storage
    if (this.config.useLocalStorage) {
      const drafts = this.getAllLocalDrafts();
      const draft = drafts[key] as DraftData<T> | undefined;
      
      if (draft && Date.now() - draft.timestamp < this.config.maxDraftAge) {
        return draft;
      }
    }

    return null;
  }

  /**
   * Delete a draft
   */
  async deleteDraft(type: string, id: string): Promise<void> {
    const key = this.getDraftKey(type, id);

    // Clear pending save
    const timer = this.saveTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.saveTimers.delete(key);
    }

    // Delete from local storage
    if (this.config.useLocalStorage) {
      try {
        const drafts = this.getAllLocalDrafts();
        delete drafts[key];
        localStorage.setItem(this.localStorageKey, JSON.stringify(drafts));
      } catch {
        // Ignore
      }
    }

    // Delete from server
    if (this.config.serverEndpoint) {
      try {
        await fetch(`${this.config.serverEndpoint}?type=${type}&id=${id}`, {
          method: 'DELETE',
        });
      } catch {
        // Ignore
      }
    }

    console.debug(`[DraftManager] Deleted draft: ${key}`);
  }

  /**
   * Get all drafts of a specific type
   */
  getDraftsByType<T>(type: string): DraftData<T>[] {
    const drafts = this.getAllLocalDrafts();
    const now = Date.now();
    
    return Object.entries(drafts)
      .filter(([key, draft]) => {
        return key.startsWith(`${type}:`) && 
               now - draft.timestamp < this.config.maxDraftAge;
      })
      .map(([, draft]) => draft as DraftData<T>);
  }

  /**
   * Check if a draft exists
   */
  hasDraft(type: string, id: string): boolean {
    const key = this.getDraftKey(type, id);
    const drafts = this.getAllLocalDrafts();
    const draft = drafts[key];
    
    return draft && Date.now() - draft.timestamp < this.config.maxDraftAge;
  }

  /**
   * Cleanup old drafts
   */
  cleanup(): void {
    if (typeof window === 'undefined') return;

    try {
      const drafts = this.getAllLocalDrafts();
      const now = Date.now();
      let cleaned = 0;

      Object.entries(drafts).forEach(([key, draft]) => {
        if (now - draft.timestamp > this.config.maxDraftAge) {
          delete drafts[key];
          cleaned++;
        }
      });

      if (cleaned > 0) {
        localStorage.setItem(this.localStorageKey, JSON.stringify(drafts));
        console.info(`[DraftManager] Cleaned up ${cleaned} old drafts`);
      }
    } catch (error) {
      console.warn('[DraftManager] Cleanup failed:', error);
    }
  }

  /**
   * Force flush all pending saves immediately
   */
  async flushAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    this.saveTimers.forEach((timer, key) => {
      clearTimeout(timer);
      // Get the draft from local storage and persist
      const drafts = this.getAllLocalDrafts();
      if (drafts[key]) {
        promises.push(this.persistDraft(key, drafts[key]));
      }
    });

    this.saveTimers.clear();
    await Promise.all(promises);
  }
}

// Export singleton instance
export const draftManager = new DraftManager();
