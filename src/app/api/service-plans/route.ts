import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import { ServicePlan } from '@/lib/db/models/ServicePlan';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET - Fetch all active service plans (public endpoint)
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    // Fetch service plans that are active and visible to clients
    const plans = await withCache(
      `service-plans:${JSON.stringify({
      isActive: true,
      showToClients: true
    })}`,
      async () => await ServicePlan.find({
      isActive: true,
      showToClients: true
    }).sort({ createdAt: -1 }),
      { ttl: 120000, tags: ['service_plans'] }
    );

    return NextResponse.json({
      success: true,
      plans
    });
  } catch (error) {
    console.error('Error fetching service plans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch service plans' },
      { status: 500 }
    );
  }
}
