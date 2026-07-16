import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { WebhookManager } from '@/lib/webhooks/webhook-manager';
import { UserRole } from '@/types';
import { z } from 'zod';

const createWebhookSchema = z.object({
  url: z.string().url('Invalid URL'),
  events: z.array(z.string()).min(1, 'At least one event type is required'),
  secret: z.string().min(8, 'Secret must be at least 8 characters'),
});

// GET /api/webhooks/endpoints - Get all webhook endpoints
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const webhookManager = WebhookManager.getInstance();
    const endpoints = webhookManager.getEndpoints();

    return NextResponse.json({ endpoints });

  } catch (error) {
    console.error('Error fetching webhook endpoints:', error);
    return NextResponse.json(
      { error: 'Failed to fetch webhook endpoints' },
      { status: 500 }
    );
  }
}

// POST /api/webhooks/endpoints - Create new webhook endpoint
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createWebhookSchema.parse(body);

    const webhookManager = WebhookManager.getInstance();
    const endpointId = webhookManager.registerEndpoint({
      url: validatedData.url,
      secret: validatedData.secret,
      events: validatedData.events,
      isActive: true,
      retryCount: 0
    });

    const endpoint = webhookManager.getEndpoint(endpointId);

    return NextResponse.json({ 
      endpoint: {
        ...endpoint,
        secret: '***' // Don't return the actual secret
      }
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation error',
          details: error.issues
        },
        { status: 400 }
      );
    }

    console.error('Error creating webhook endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to create webhook endpoint' },
      { status: 500 }
    );
  }
}

// PUT /api/webhooks/endpoints - Update webhook endpoint
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Endpoint ID is required' }, { status: 400 });
    }

    const webhookManager = WebhookManager.getInstance();
    const success = webhookManager.updateEndpoint(id, updates);

    if (!success) {
      return NextResponse.json({ error: 'Webhook endpoint not found' }, { status: 404 });
    }

    const endpoint = webhookManager.getEndpoint(id);
    return NextResponse.json({ 
      endpoint: {
        ...endpoint,
        secret: '***' // Don't return the actual secret
      }
    });

  } catch (error) {
    console.error('Error updating webhook endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to update webhook endpoint' },
      { status: 500 }
    );
  }
}

// DELETE /api/webhooks/endpoints - Delete webhook endpoint
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Endpoint ID is required' }, { status: 400 });
    }

    const webhookManager = WebhookManager.getInstance();
    const success = webhookManager.removeEndpoint(id);

    if (!success) {
      return NextResponse.json({ error: 'Webhook endpoint not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Webhook endpoint deleted successfully' });

  } catch (error) {
    console.error('Error deleting webhook endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to delete webhook endpoint' },
      { status: 500 }
    );
  }
}
