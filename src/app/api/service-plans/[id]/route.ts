import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import { ServicePlan } from '@/lib/db/models/ServicePlan';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import mongoose from 'mongoose';

// GET - Fetch a single service plan by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid service plan id' },
        { status: 400 }
      );
    }

    await dbConnect();

    const plan = await withCache(
      `service-plans:id:${JSON.stringify(id)}`,
      async () => await ServicePlan.findById(id),
      { ttl: 120000, tags: ['service_plans'] }
    );

    if (!plan) {
      return NextResponse.json(
        { error: 'Service plan not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      plan
    });
  } catch (error) {
    console.error('Error fetching service plan:', error);
    return NextResponse.json(
      { error: 'Failed to fetch service plan' },
      { status: 500 }
    );
  }
}
