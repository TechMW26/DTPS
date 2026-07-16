// Webhook Manager for handling external webhook integrations
import crypto from 'crypto';

export interface WebhookEvent {
  id: string;
  type: 'message.sent' | 'message.received' | 'user.online' | 'user.offline' | 'appointment.created' | 'appointment.updated';
  data: any;
  timestamp: number;
  source: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  retryCount: number;
  lastDelivery?: Date;
  createdAt: Date;
}

export class WebhookManager {
  private static instance: WebhookManager;
  private endpoints: Map<string, WebhookEndpoint> = new Map();

  private constructor() {}

  static getInstance(): WebhookManager {
    if (!WebhookManager.instance) {
      WebhookManager.instance = new WebhookManager();
    }
    return WebhookManager.instance;
  }

  // Register a webhook endpoint
  registerEndpoint(endpoint: Omit<WebhookEndpoint, 'id' | 'createdAt'>): string {
    const id = crypto.randomUUID();
    const webhookEndpoint: WebhookEndpoint = {
      ...endpoint,
      id,
      createdAt: new Date()
    };
    
    this.endpoints.set(id, webhookEndpoint);
    return id;
  }

  // Remove a webhook endpoint
  removeEndpoint(id: string): boolean {
    const removed = this.endpoints.delete(id);
    if (removed) {
    }
    return removed;
  }

  // Get all endpoints
  getEndpoints(): WebhookEndpoint[] {
    return Array.from(this.endpoints.values());
  }

  // Get endpoint by ID
  getEndpoint(id: string): WebhookEndpoint | undefined {
    return this.endpoints.get(id);
  }

  // Update endpoint
  updateEndpoint(id: string, updates: Partial<WebhookEndpoint>): boolean {
    const endpoint = this.endpoints.get(id);
    if (!endpoint) return false;

    this.endpoints.set(id, { ...endpoint, ...updates });
    return true;
  }

  // Send webhook event to all registered endpoints
  async sendEvent(event: WebhookEvent): Promise<void> {
    const relevantEndpoints = Array.from(this.endpoints.values())
      .filter(endpoint => 
        endpoint.isActive && 
        endpoint.events.includes(event.type)
      );

    if (relevantEndpoints.length === 0) {
      return;
    }

    const deliveryPromises = relevantEndpoints.map(endpoint => 
      this.deliverWebhook(endpoint, event)
    );

    await Promise.allSettled(deliveryPromises);
  }

  // Deliver webhook to specific endpoint
  private async deliverWebhook(endpoint: WebhookEndpoint, event: WebhookEvent): Promise<void> {
    try {
      const payload = JSON.stringify(event);
      const signature = this.generateSignature(payload, endpoint.secret);

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event.type,
          'X-Webhook-ID': event.id,
          'User-Agent': 'DTPS-Webhooks/1.0'
        },
        body: payload,
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (response.ok) {
        this.updateEndpoint(endpoint.id, { 
          lastDelivery: new Date(),
          retryCount: 0 
        });
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error) {
      console.error(`Webhook delivery failed to ${endpoint.url}:`, error);
      
      // Increment retry count
      const newRetryCount = endpoint.retryCount + 1;
      this.updateEndpoint(endpoint.id, { retryCount: newRetryCount });

      // Disable endpoint after too many failures
      if (newRetryCount >= 5) {
        this.updateEndpoint(endpoint.id, { isActive: false });
      } else {
        // Schedule retry with exponential backoff
        setTimeout(() => {
          this.deliverWebhook(endpoint, event);
        }, Math.pow(2, newRetryCount) * 1000);
      }
    }
  }

  // Generate HMAC signature for webhook verification
  private generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  // Verify webhook signature
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  // Create webhook event
  static createEvent(
    type: WebhookEvent['type'], 
    data: any, 
    source: string = 'dtps-api'
  ): WebhookEvent {
    return {
      id: crypto.randomUUID(),
      type,
      data,
      timestamp: Date.now(),
      source
    };
  }
}

// Webhook event types for different actions
export const WebhookEvents = {
  MESSAGE_SENT: 'message.sent' as const,
  MESSAGE_RECEIVED: 'message.received' as const,
  USER_ONLINE: 'user.online' as const,
  USER_OFFLINE: 'user.offline' as const,
  APPOINTMENT_CREATED: 'appointment.created' as const,
  APPOINTMENT_UPDATED: 'appointment.updated' as const,
} as const;

// Helper function to send common webhook events
export async function sendWebhookEvent(
  type: WebhookEvent['type'],
  data: any,
  source?: string
): Promise<void> {
  const webhookManager = WebhookManager.getInstance();
  const event = WebhookManager.createEvent(type, data, source);
  await webhookManager.sendEvent(event);
}

// Predefined webhook event creators
export const createMessageWebhook = (message: any, type: 'sent' | 'received') => 
  sendWebhookEvent(
    type === 'sent' ? WebhookEvents.MESSAGE_SENT : WebhookEvents.MESSAGE_RECEIVED,
    { message }
  );

export const createUserStatusWebhook = (userId: string, status: 'online' | 'offline') =>
  sendWebhookEvent(
    status === 'online' ? WebhookEvents.USER_ONLINE : WebhookEvents.USER_OFFLINE,
    { userId, status, timestamp: Date.now() }
  );

export const createAppointmentWebhook = (appointment: any, action: 'created' | 'updated') =>
  sendWebhookEvent(
    action === 'created' ? WebhookEvents.APPOINTMENT_CREATED : WebhookEvents.APPOINTMENT_UPDATED,
    { appointment, action }
  );
