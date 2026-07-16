// Online Status Manager for tracking user presence
export class OnlineStatusManager {
  private onlineUsers: Map<string, { lastSeen: Date; connections: Set<string> }> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | undefined;

  private constructor() {
    // Clean up inactive users every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveUsers();
    }, 5 * 60 * 1000);
  }

  static getInstance(): OnlineStatusManager {
    // Ensure a single instance across module graphs using globalThis cache
    const g = globalThis as any;
    if (!g.__onlineStatusManager) {
      g.__onlineStatusManager = new OnlineStatusManager();
    }
    return g.__onlineStatusManager as OnlineStatusManager;
  }

  // Mark user as online
  setUserOnline(userId: string, connectionId: string): void {
    const userStatus = this.onlineUsers.get(userId) || {
      lastSeen: new Date(),
      connections: new Set()
    };

    userStatus.lastSeen = new Date();
    userStatus.connections.add(connectionId);
    this.onlineUsers.set(userId, userStatus);

  }

  // Mark user as offline
  setUserOffline(userId: string, connectionId?: string): void {
    const userStatus = this.onlineUsers.get(userId);
    if (!userStatus) return;

    if (connectionId) {
      userStatus.connections.delete(connectionId);
      
      // If user still has other connections, keep them online
      if (userStatus.connections.size > 0) {
        userStatus.lastSeen = new Date();
        return;
      }
    }

    // Remove user from online list
    this.onlineUsers.delete(userId);
  }

  // Check if user is online
  isUserOnline(userId: string): boolean {
    const userStatus = this.onlineUsers.get(userId);
    if (!userStatus) return false;

    // Consider user offline if last seen more than 2 minutes ago
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    return userStatus.lastSeen > twoMinutesAgo;
  }

  // Get all online users
  getOnlineUsers(): string[] {
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
    
    return Array.from(this.onlineUsers.entries())
      .filter(([_, status]) => status.lastSeen > twoMinutesAgo)
      .map(([userId]) => userId);
  }

  // Get user's last seen time
  getLastSeen(userId: string): Date | null {
    const userStatus = this.onlineUsers.get(userId);
    return userStatus?.lastSeen || null;
  }

  // Update user's last seen time
  updateLastSeen(userId: string): void {
    const userStatus = this.onlineUsers.get(userId);
    if (userStatus) {
      userStatus.lastSeen = new Date();
    }
  }

  // Get online status for multiple users
  getBulkOnlineStatus(userIds: string[]): Record<string, { isOnline: boolean; lastSeen: Date | null }> {
    const result: Record<string, { isOnline: boolean; lastSeen: Date | null }> = {};
    
    userIds.forEach(userId => {
      result[userId] = {
        isOnline: this.isUserOnline(userId),
        lastSeen: this.getLastSeen(userId)
      };
    });

    return result;
  }

  // Clean up inactive users
  private cleanupInactiveUsers(): void {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    for (const [userId, status] of this.onlineUsers.entries()) {
      if (status.lastSeen < fiveMinutesAgo) {
        this.onlineUsers.delete(userId);
      }
    }
  }

  // Get connection count for user
  getConnectionCount(userId: string): number {
    const userStatus = this.onlineUsers.get(userId);
    return userStatus?.connections.size || 0;
  }

  // Get total online users count
  getOnlineUsersCount(): number {
    return this.getOnlineUsers().length;
  }

  // Destroy instance (for cleanup)
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.onlineUsers.clear();
  }
}

// Typing indicator manager
export class TypingManager {
  private typingUsers: Map<string, { targetUserId: string; timeout: ReturnType<typeof setTimeout> }> = new Map();

  private constructor() {}

  static getInstance(): TypingManager {
    // Ensure a single instance across module graphs using globalThis cache
    const g = globalThis as any;
    if (!g.__typingManager) {
      g.__typingManager = new TypingManager();
    }
    return g.__typingManager as TypingManager;
  }

  // Set user as typing
  setUserTyping(userId: string, targetUserId: string, duration: number = 3000): void {
    // Clear existing timeout
    const existing = this.typingUsers.get(userId);
    if (existing) {
      clearTimeout(existing.timeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.setUserNotTyping(userId);
    }, duration);

    this.typingUsers.set(userId, { targetUserId, timeout });
  }

  // Set user as not typing
  setUserNotTyping(userId: string): void {
    const existing = this.typingUsers.get(userId);
    if (existing) {
      clearTimeout(existing.timeout);
      this.typingUsers.delete(userId);
    }
  }

  // Check if user is typing to specific target
  isUserTyping(userId: string, targetUserId?: string): boolean {
    const typing = this.typingUsers.get(userId);
    if (!typing) return false;
    
    return targetUserId ? typing.targetUserId === targetUserId : true;
  }

  // Get all users typing to a specific user
  getUsersTypingTo(targetUserId: string): string[] {
    return Array.from(this.typingUsers.entries())
      .filter(([_, data]) => data.targetUserId === targetUserId)
      .map(([userId]) => userId);
  }

  // Clear all typing indicators for user
  clearUserTyping(userId: string): void {
    this.setUserNotTyping(userId);
  }
}

// Export singleton instances
export const onlineStatusManager = OnlineStatusManager.getInstance();
export const typingManager = TypingManager.getInstance();
