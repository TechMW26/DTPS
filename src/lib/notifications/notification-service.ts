'use client';

export interface NotificationData {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  data?: any;
  actions?: any[];
  requireInteraction?: boolean;
  silent?: boolean;
}

export interface NotificationPermissionResult {
  granted: boolean;
  denied: boolean;
  default: boolean;
}

export class NotificationService {
  private static instance: NotificationService;
  private registration: ServiceWorkerRegistration | null = null;
  private isSupported = false;

  private constructor() {
    this.isSupported = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
    if (
      this.isSupported &&
      process.env.NODE_ENV === 'production' &&
      process.env.NEXT_PUBLIC_ENABLE_SW === 'true'
    ) {
      // Lazy, non-blocking SW registration (production + enabled only)
      this.initialize().catch(() => { });
    }
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private async initialize() {
    if (!this.isSupported) {
      console.warn('Notifications are not supported in this browser');
      return;
    }

    try {
      // Reuse the root app-shell registration. Firebase Messaging owns a
      // separate scope and is registered by fcmHelper when a token is needed.
      this.registration = await navigator.serviceWorker.ready;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }

  public async requestPermission(): Promise<NotificationPermissionResult> {
    if (!this.isSupported) {
      return { granted: false, denied: true, default: false };
    }

    try {
      const permission = await Notification.requestPermission();

      return {
        granted: permission === 'granted',
        denied: permission === 'denied',
        default: permission === 'default'
      };
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return { granted: false, denied: true, default: false };
    }
  }

  public getPermissionStatus(): NotificationPermissionResult {
    if (!this.isSupported) {
      return { granted: false, denied: true, default: false };
    }

    const permission = Notification.permission;
    return {
      granted: permission === 'granted',
      denied: permission === 'denied',
      default: permission === 'default'
    };
  }

  public async showNotification(data: NotificationData): Promise<void> {
    const permissionStatus = this.getPermissionStatus();

    if (!permissionStatus.granted) {
      console.warn('Notification permission not granted');
      return;
    }

    try {
      if (!this.registration && this.isSupported) {
        await this.initialize();
      }

      if (this.registration) {
        // Use service worker for better control
        await this.registration.showNotification(data.title, {
          body: data.body,
          icon: data.icon || '/vercel.svg',
          badge: data.badge || '/vercel.svg',
          tag: data.tag,
          data: data.data,
          actions: data.actions,
          requireInteraction: data.requireInteraction || false,
          silent: data.silent || false,
          vibrate: [200, 100, 200],
          timestamp: Date.now()
        } as any);
      } else {
        // Fallback to basic notification
        new Notification(data.title, {
          body: data.body,
          icon: data.icon || '/vercel.svg',
          tag: data.tag,
          data: data.data,
          requireInteraction: data.requireInteraction || false,
          silent: data.silent || false
        });
      }
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  public async showMessageNotification(
    senderName: string,
    messageContent: string,
    senderAvatar?: string,
    conversationId?: string
  ): Promise<void> {
    await this.showNotification({
      title: senderName,
      body: messageContent,
      icon: senderAvatar || '/vercel.svg',
      tag: `message-${conversationId}`,
      data: {
        type: 'message',
        conversationId,
        senderName,
        timestamp: Date.now()
      },
      actions: [
        {
          action: 'reply',
          title: 'Reply',
          icon: '/vercel.svg'
        },
        {
          action: 'mark-read',
          title: 'Mark as Read',
          icon: '/vercel.svg'
        }
      ],
      requireInteraction: true
    });
  }

  public async showCallNotification(
    callerName: string,
    callType: 'audio' | 'video',
    callerAvatar?: string,
    callId?: string,
    extraData?: any
  ): Promise<void> {
    await this.showNotification({
      title: `Incoming ${callType} call`,
      body: `${callerName} is calling you`,
      icon: callerAvatar || '/vercel.svg',
      tag: `call-${callId}`,
      data: {
        type: 'call',
        callId,
        callerName,
        callType,
        ...(extraData || {}),
        timestamp: Date.now()
      },
      actions: [
        {
          action: 'accept',
          title: 'Accept',
          icon: '/vercel.svg'
        },
        {
          action: 'decline',
          title: 'Decline',
          icon: '/vercel.svg'
        }
      ],
      requireInteraction: true,
      silent: false
    });
  }

  public async showStatusNotification(
    title: string,
    message: string,
    type: 'delivered' | 'read' | 'typing' = 'delivered'
  ): Promise<void> {
    await this.showNotification({
      title,
      body: message,
      icon: '/icons/icon-192x192.png',
      tag: `status-${type}`,
      data: {
        type: 'status',
        statusType: type,
        timestamp: Date.now()
      },
      silent: true,
      requireInteraction: false
    });
  }

  public async showAppointmentNotification(
    clientName: string,
    scheduledAt: Date | string,
    duration: number,
    type: 'booked' | 'cancelled' | 'reminder' = 'booked',
    clientAvatar?: string,
    appointmentId?: string
  ): Promise<void> {
    const scheduledDate = new Date(scheduledAt);
    const formattedDate = scheduledDate.toLocaleDateString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata'
    });

    const titles: Record<string, string> = {
      booked: '📅 New Appointment Booked!',
      cancelled: '❌ Appointment Cancelled',
      reminder: '⏰ Appointment Reminder'
    };

    const bodies: Record<string, string> = {
      booked: `${clientName} booked an appointment for ${formattedDate} (${duration} min)`,
      cancelled: `Appointment with ${clientName} on ${formattedDate} has been cancelled`,
      reminder: `You have an appointment with ${clientName} at ${formattedDate}`
    };

    await this.showNotification({
      title: titles[type],
      body: bodies[type],
      icon: clientAvatar || '/icons/icon-192x192.png',
      tag: `appointment-${appointmentId || Date.now()}`,
      data: {
        type: 'appointment',
        appointmentType: type,
        appointmentId,
        clientName,
        scheduledAt: scheduledDate.toISOString(),
        timestamp: Date.now()
      },
      actions: [
        {
          action: 'view',
          title: 'View Details',
          icon: '/icons/icon-72x72.png'
        }
      ],
      requireInteraction: type === 'booked' || type === 'reminder',
      silent: false
    });
  }

  public clearNotification(tag: string): void {
    if (this.registration) {
      this.registration.getNotifications({ tag }).then(notifications => {
        notifications.forEach(notification => notification.close());
      });
    }
  }

  public clearAllNotifications(): void {
    if (this.registration) {
      this.registration.getNotifications().then(notifications => {
        notifications.forEach(notification => notification.close());
      });
    }
  }

  public getIsSupported(): boolean {
    return this.isSupported;
  }

  // Handle notification clicks and actions
  public setupNotificationHandlers() {
    if (!this.isSupported || !this.registration) return;

    // Listen for notification clicks
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'notification-click') {
        this.handleNotificationAction(event.data);
      }
    });
  }

  private handleNotificationAction(data: any) {
    const { action, notificationData } = data;

    switch (notificationData.type) {
      case 'message':
        if (action === 'reply') {
          window.focus();
          window.location.href = `/chat/${notificationData.conversationId}`;
        } else if (action === 'mark-read') {
          this.markMessageAsRead(notificationData.conversationId);
        }
        break;

      case 'call':
        // Forward to the app so it can run the actual accept/reject logic (getUserMedia, etc.)
        try { window.focus(); } catch { }
        try {
          window.dispatchEvent(new CustomEvent('call-notification-action', {
            detail: { action: action || 'default', notificationData }
          }));
        } catch (e) {
          console.warn('Failed to dispatch call-notification-action', e);
        }
        break;

      default:
        try { window.focus(); } catch { }
        break;
    }
  }

  private async markMessageAsRead(conversationId: string) {
    try {
      await fetch('/api/messages/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId })
      });
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  }

  private async acceptCall(callId: string) {
    try {
      await fetch('/api/calls/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId })
      });
    } catch (error) {
      console.error('Failed to accept call:', error);
    }
  }

  private async declineCall(callId: string) {
    try {
      await fetch('/api/calls/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId })
      });
    } catch (error) {
      console.error('Failed to decline call:', error);
    }
  }
}
