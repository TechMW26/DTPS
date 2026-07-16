import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import SubscriptionPlan from '@/lib/db/models/SubscriptionPlan';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/subscription-plans - Get all active subscription plans
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('isActive');
    const category = searchParams.get('category');

    let query: any = {};
    
    if (isActive === 'true') {
      query.isActive = true;
    }
    
    if (category) {
      query.category = category;
    }

    // Generate cache key based on query params
    const cacheKey = `subscription-plans:${isActive || ''}:${category || ''}`;
    
    const plans = await withCache(
      cacheKey,
      async () => {
        const plans = await SubscriptionPlan.find(query)
          .sort({ price: 1 })
          .lean();
        return plans;
      },
      { ttl: 300000, tags: ['subscription-plans'] } // 5 minutes TTL
    );

    return NextResponse.json({ plans });

  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plans' },
      { status: 500 }
    );
  }
}

// POST /api/subscription-plans - Create a new subscription plan (admin/dietitian only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admin or dietitian to create plans
    if (session.user.role !== 'admin' && session.user.role !== 'dietitian') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();
    const data = await request.json();

    const plan = new SubscriptionPlan({
      ...data,
      createdBy: session.user.id
    });

    await plan.save();

    // Clear subscription-plans cache after creation
    clearCacheByTag('subscription-plans');

    return NextResponse.json({
      success: true,
      plan
    });

  } catch (error) {
    console.error('Error creating subscription plan:', error);
    return NextResponse.json(
      { error: 'Failed to create plan' },
      { status: 500 }
    );
  }
}
