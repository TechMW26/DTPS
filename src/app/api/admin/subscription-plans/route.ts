import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import SubscriptionPlan from '@/lib/db/models/SubscriptionPlan';
import { UserRole } from '@/types';
import { z } from 'zod';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

const planSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  duration: z.number().min(1),
  durationType: z.enum(['days', 'weeks', 'months']),
  price: z.number().min(0),
  currency: z.string().default('INR'),
  features: z.array(z.string()).default([]),
  category: z.enum(['weight-loss', 'weight-gain', 'muscle-gain', 'diabetes', 'pcos', 'thyroid', 'general-wellness', 'custom']),
  isActive: z.boolean().default(true),
  consultationsIncluded: z.number().min(0).default(0),
  dietPlanIncluded: z.boolean().default(true),
  followUpsIncluded: z.number().min(0).default(0),
  chatSupport: z.boolean().default(true),
  videoCallsIncluded: z.number().min(0).default(0)
});

// GET /api/admin/subscription-plans - Get all subscription plans
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins and dietitians can view plans
    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.DIETITIAN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const isActive = searchParams.get('isActive');

    const query: any = {};
    if (category) query.category = category;
    if (isActive !== null) query.isActive = isActive === 'true';

    const plans = await withCache(
      `admin:subscription-plans:${JSON.stringify(query)}`,
      async () => await SubscriptionPlan.find(query)
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 }),
      { ttl: 120000, tags: ['admin'] }
    );

    return NextResponse.json({ 
      success: true,
      plans,
      count: plans.length
    });

  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription plans' },
      { status: 500 }
    );
  }
}

// POST /api/admin/subscription-plans - Create new subscription plan (Admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = planSchema.parse(body);

    await connectDB();

    const plan = new SubscriptionPlan({
      ...validatedData,
      createdBy: session.user.id
    });

    await plan.save();
    await plan.populate('createdBy', 'firstName lastName');

    return NextResponse.json({
      success: true,
      message: 'Subscription plan created successfully',
      plan
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating subscription plan:', error);
    return NextResponse.json(
      { error: 'Failed to create subscription plan' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/subscription-plans - Update subscription plan (Admin only)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
    }

    await connectDB();

    const plan = await SubscriptionPlan.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('createdBy', 'firstName lastName');

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription plan updated successfully',
      plan
    });

  } catch (error) {
    console.error('Error updating subscription plan:', error);
    return NextResponse.json(
      { error: 'Failed to update subscription plan' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/subscription-plans - Delete subscription plan (Admin only)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
    }

    await connectDB();

    const plan = await SubscriptionPlan.findByIdAndDelete(id);

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription plan deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting subscription plan:', error);
    return NextResponse.json(
      { error: 'Failed to delete subscription plan' },
      { status: 500 }
    );
  }
}

