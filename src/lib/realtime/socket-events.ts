/**
 * Shared Socket.io event name constants.
 * Used on both server and client to avoid typos and enable autocomplete.
 */

// Connection lifecycle
export const SOCKET_EVENTS = {
    // Connection
    CONNECTED: 'connected',
    HEARTBEAT: 'heartbeat',

    // Presence
    USER_ONLINE: 'user_online',
    USER_OFFLINE: 'user_offline',
    ONLINE_SNAPSHOT: 'online_snapshot',

    // Chat
    NEW_MESSAGE: 'new_message',
    MESSAGE_READ: 'message_read',
    MESSAGE_DELETED: 'message_deleted',
    TYPING_START: 'typing_start',
    TYPING_STOP: 'typing_stop',

    // Calls / WebRTC
    INCOMING_CALL: 'incoming_call',
    CALL_ACCEPTED: 'call_accepted',
    CALL_REJECTED: 'call_rejected',
    CALL_ENDED: 'call_ended',
    MISSED_CALL: 'missed_call',
    ICE_CANDIDATE: 'ice_candidate',
    WEBRTC_SIGNAL: 'webrtc-signal',

    // Appointments
    APPOINTMENT_BOOKED: 'appointment_booked',
    APPOINTMENT_CANCELLED: 'appointment_cancelled',
    APPOINTMENT_UPDATED: 'appointment_updated',

    // Tasks
    TASK_CREATED: 'task_created',
    TASK_UPDATED: 'task_updated',
    TASK_DELETED: 'task_deleted',

    // Payments
    PAYMENT_UPDATED: 'payment_updated',
    PAYMENT_LINK_UPDATED: 'payment_link_updated',
    OTHER_PLATFORM_PAYMENT_UPDATED: 'other_platform_payment_updated',

    // Admin SSE→Socket events
    CLIENT_UPDATED: 'client_updated',
    CLIENT_ADDED: 'client_added',
    CLIENT_WEIGHT_UPDATED: 'client_weight_updated',
    INITIAL_DATA: 'initial_data',
    NEW_LOGS: 'new_logs',

    // Unread counts (replaces the separate SSE streams)
    UNREAD_COUNTS: 'unread_counts',
    STAFF_UNREAD_COUNTS: 'staff_unread_counts',

    // Client → Server: typing indicator
    SEND_TYPING: 'send_typing',
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/**
 * Room naming helpers.
 * Every user auto-joins `user:<id>`. Admin-specific events go to `role:admin`.
 */
export function userRoom(userId: string): string {
    return `user:${userId}`;
}

export function roleRoom(role: string): string {
    return `role:${role}`;
}
