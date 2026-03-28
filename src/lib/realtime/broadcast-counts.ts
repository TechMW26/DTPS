/**
 * Broadcast helpers for unread-count updates.
 *
 * These were previously exported from the SSE stream route files.
 * Now they emit Socket.io events instead of writing to SSE stream controllers.
 */

import { socketManager } from './socket-manager';
import { SOCKET_EVENTS } from './socket-events';

/** Broadcast unread counts to a client user's sockets. */
export function broadcastUnreadCounts(
    userId: string,
    counts: { notifications: number; messages: number }
): void {
    socketManager.sendToUser(userId, SOCKET_EVENTS.UNREAD_COUNTS, counts);
}

/** Broadcast unread counts to a staff user's sockets. */
export function broadcastStaffUnreadCounts(
    userId: string,
    counts: { messages: number }
): void {
    socketManager.sendToUser(userId, SOCKET_EVENTS.STAFF_UNREAD_COUNTS, counts);
}
