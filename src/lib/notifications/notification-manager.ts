'use client';

// Lightweight notification manager with per-call de-duplication across tabs
// Uses Notification API directly (no Service Worker required) and BroadcastChannel
// to avoid duplicate notifications across multiple open tabs.

export interface IncomingCallPayload {
  callId: string;
  callerId: string;
  callerName?: string;
  callerAvatar?: string;
  type: 'audio' | 'video';
}

export interface MissedCallPayload {
  callId: string;
  fromUserId: string;
  fromName?: string;
}

const CHANNEL_NAME = 'call-notifications';
const channel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel(CHANNEL_NAME)
  : null;

// Acquire a simple per-call lock using localStorage to prevent duplicates across tabs
function acquireLock(key: string, ttlMs = 15000): boolean {
  if (typeof window === 'undefined') return true;
  const now = Date.now();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const { until } = JSON.parse(raw);
      if (until && until > now) {
        return false; // someone else owns the lock
      }
    }
    localStorage.setItem(key, JSON.stringify({ until: now + ttlMs }));
    return true;
  } catch {
    return true; // best effort; allow notify
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const res = await Notification.requestPermission();
    return res === 'granted';
  } catch {
    return false;
  }
}

function showBasicNotification(title: string, options?: NotificationOptions, onClick?: () => void) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  try {
    const n = new Notification(title, options);
    if (onClick) {
      n.onclick = (ev: any) => {
        try { window.focus(); } catch {}
        try { onClick(); } catch {}
        try { n.close(); } catch {}
      };
    }
  } catch (e) {
    // ignore
  }
}

export async function notifyIncomingCall(data: IncomingCallPayload) {
  const ok = await ensureNotificationPermission();
  if (!ok) return;

  // de-dupe across tabs for this callId
  const lockKey = `notif:incoming:${data.callId}`;
  if (!acquireLock(lockKey)) return;

  const title = `Incoming ${data.type === 'video' ? 'video' : 'audio'} call`;
  const body = data.callerName ? `From ${data.callerName}` : 'Someone is calling you';

  const options: NotificationOptions = {
    body,
    tag: `incoming-call-${data.callId}`, // helps browsers de-dupe
    icon: data.callerAvatar,
    silent: false,
    requireInteraction: true, // keep visible until interacted
  };

  // Broadcast to other tabs (in case they want to focus UI without showing dup notif)
  channel?.postMessage({ type: 'incoming_call', callId: data.callId, from: data.callerId });

  showBasicNotification(title, options, () => {
    // Let app know user clicked the notification
    window.dispatchEvent(new CustomEvent('incoming-call-notification-click', { detail: data }));
  });
}

export async function notifyMissedCall(data: MissedCallPayload) {
  const ok = await ensureNotificationPermission();
  if (!ok) return;

  const lockKey = `notif:missed:${data.callId}`;
  if (!acquireLock(lockKey)) return;

  const title = 'Missed call';
  const body = data.fromName ? `Missed a call from ${data.fromName}` : 'Missed a call';

  const options: NotificationOptions = {
    body,
    tag: `missed-call-${data.callId}`,
    silent: false,
  };

  channel?.postMessage({ type: 'missed_call', callId: data.callId, from: data.fromUserId });
  showBasicNotification(title, options);
}

// Optional helper for pages to listen for clicks
export function onIncomingCallNotificationClick(handler: (payload: IncomingCallPayload) => void) {
  const listener = (e: Event) => handler((e as CustomEvent).detail);
  window.addEventListener('incoming-call-notification-click', listener as any);
  return () => window.removeEventListener('incoming-call-notification-click', listener as any);
}

