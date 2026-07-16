import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import ClientSubscription from '@/lib/db/models/ClientSubscription';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/subscriptions/[id] - Get specific subscription
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const subscription = await withCache(
      `subscriptions:id:${JSON.stringify(id)}`,
      async () => await ClientSubscription.findById(id)
      .populate('client', 'firstName lastName email phone')
      .populate('dietitian', 'firstName lastName email')
      .populate('plan'),
      { ttl: 120000, tags: ['subscriptions'] }
    );

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // Check permissions
    const canView = 
      session.user.role === UserRole.ADMIN ||
      subscription.client.toString() === session.user.id ||
      subscription.dietitian.toString() === session.user.id;

    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      subscription
    });

  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}

// PUT /api/subscriptions/[id] - Update subscription (mark as paid, cancel, etc.)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const body = await request.json();

    const subscription = await withCache(
      `subscriptions:id:${JSON.stringify(id)}`,
      async () => await ClientSubscription.findById(id),
      { ttl: 120000, tags: ['subscriptions'] }
    );
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // Check permissions
    const canUpdate = 
      session.user.role === UserRole.ADMIN ||
      subscription.dietitian.toString() === session.user.id;

    if (!canUpdate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { action, ...updates } = body;

    // Handle specific actions
    if (action === 'mark-paid') {
      subscription.paymentStatus = 'paid';
      subscription.status = 'active';
      subscription.paidAt = new Date();
      if (updates.transactionId) {
        subscription.transactionId = updates.transactionId;
      }
      if (updates.notes) {
        subscription.notes = updates.notes;
      }
    } else if (action === 'cancel') {
      subscription.status = 'cancelled';
    } else {
      // General update
      Object.assign(subscription, updates);
    }

    await subscription.save();

    await subscription.populate([
      { path: 'client', select: 'firstName lastName email phone' },
      { path: 'dietitian', select: 'firstName lastName email' },
      { path: 'plan' }
    ]);

    return NextResponse.json({
      success: true,
      message: 'Subscription updated successfully',
      subscription
    });

  } catch (error) {
    console.error('Error updating subscription:', error);
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    );
  }
}

// DELETE /api/subscriptions/[id] - Delete subscription (Admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const subscription = await ClientSubscription.findByIdAndDelete(id);
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting subscription:', error);
    return NextResponse.json(
      { error: 'Failed to delete subscription' },
      { status: 500 }
    );
  }
}

