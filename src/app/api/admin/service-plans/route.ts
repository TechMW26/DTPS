import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import dbConnect from '@/lib/db/connect';
import { ServicePlan } from '@/lib/db/models/ServicePlan';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET - Fetch all service plans
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const category = searchParams.get('category');

    const query: any = {};
    if (activeOnly) {
      query.isActive = true;
    }
    if (category) {
      query.category = category;
    }

    const plans = await withCache(
      `admin:service-plans:${JSON.stringify(query)}`,
      async () => await ServicePlan.find(query)
        .populate('createdBy', 'firstName lastName')
        .sort({ createdAt: -1 }),
      { ttl: 120000, tags: ['admin'] }
    );

    return NextResponse.json({
      success: true,
      plans,
      total: plans.length
    });
  } catch (error) {
    console.error('Error fetching service plans:', error);
    return NextResponse.json({ error: 'Failed to fetch service plans' }, { status: 500 });
  }
}

// POST - Create a new service plan (Admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if ((session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can create service plans' }, { status: 403 });
    }

    await dbConnect();

    const body = await request.json();
    const { name, category, description, pricingTiers, features, maxDiscountPercent, isActive } = body;

    // Validate required fields
    if (!name || !category || !pricingTiers || pricingTiers.length === 0) {
      return NextResponse.json({
        error: 'Name, category, and at least one pricing tier are required'
      }, { status: 400 });
    }

    // Validate pricing tiers
    for (const tier of pricingTiers) {
      if (!tier.durationDays || tier.durationDays < 1) {
        return NextResponse.json({
          error: 'Each pricing tier must have valid duration days'
        }, { status: 400 });
      }
      if (!tier.durationLabel) {
        return NextResponse.json({
          error: 'Each pricing tier must have a duration label'
        }, { status: 400 });
      }
      if (tier.amount == null || tier.amount < 0) {
        return NextResponse.json({
          error: 'Each pricing tier must have a valid amount'
        }, { status: 400 });
      }
    }

    // Validate max discount (0-100%)
    const validMaxDiscount = Math.min(Math.max(maxDiscountPercent || 0, 0), 100);

    const servicePlan = new ServicePlan({
      name,
      category,
      description,
      pricingTiers,
      features: features || [],
      maxDiscountPercent: validMaxDiscount,
      isActive: isActive !== false,
      showToClients: body.showToClients !== false,
      createdBy: session.user.id
    });

    await servicePlan.save();

    // Clear cache for all service plan queries
    await clearCacheByTag('admin');
    await clearCacheByTag('client');
    await clearCacheByTag('service_plans');

    return NextResponse.json({
      success: true,
      plan: servicePlan,
      message: 'Service plan created successfully'
    });
  } catch (error) {
    console.error('Error creating service plan:', error);
    return NextResponse.json({ error: 'Failed to create service plan' }, { status: 500 });
  }
}

// PUT - Update a service plan (Admin only)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if ((session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can update service plans' }, { status: 403 });
    }

    await dbConnect();

    const body = await request.json();
    const { id, name, category, description, pricingTiers, features, maxDiscountPercent, isActive } = body;

    if (!id) {
      return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
    }

    // Validate pricing tiers if provided
    if (pricingTiers) {
      for (const tier of pricingTiers) {
        if (!tier.durationDays || tier.durationDays < 1) {
          return NextResponse.json({
            error: 'Each pricing tier must have valid duration days'
          }, { status: 400 });
        }
        if (!tier.durationLabel) {
          return NextResponse.json({
            error: 'Each pricing tier must have a duration label'
          }, { status: 400 });
        }
        if (tier.amount == null || tier.amount < 0) {
          return NextResponse.json({
            error: 'Each pricing tier must have a valid amount'
          }, { status: 400 });
        }
      }
    }

    // Validate max discount (0-100%)
    const validMaxDiscount = maxDiscountPercent != null ? Math.min(Math.max(maxDiscountPercent, 0), 100) : undefined;

    const updateData: any = {};
    if (name) updateData.name = name;
    if (category) updateData.category = category;
    if (description !== undefined) updateData.description = description;
    if (pricingTiers) updateData.pricingTiers = pricingTiers;
    if (features !== undefined) updateData.features = features;
    if (validMaxDiscount !== undefined) updateData.maxDiscountPercent = validMaxDiscount;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (body.showToClients !== undefined) updateData.showToClients = body.showToClients;

    const updatedPlan = await ServicePlan.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedPlan) {
      return NextResponse.json({ error: 'Service plan not found' }, { status: 404 });
    }

    // Clear cache for all service plan queries
    await clearCacheByTag('admin');
    await clearCacheByTag('client');
    await clearCacheByTag('service_plans');

    return NextResponse.json({
      success: true,
      plan: updatedPlan,
      message: 'Service plan updated successfully'
    });
  } catch (error) {
    console.error('Error updating service plan:', error);
    return NextResponse.json({ error: 'Failed to update service plan' }, { status: 500 });
  }
}

// DELETE - Delete a service plan (Admin only)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if ((session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can delete service plans' }, { status: 403 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
    }

    const deletedPlan = await ServicePlan.findByIdAndDelete(id);

    if (!deletedPlan) {
      return NextResponse.json({ error: 'Service plan not found' }, { status: 404 });
    }

    // Clear cache for all service plan queries
    await clearCacheByTag('admin');
    await clearCacheByTag('client');
    await clearCacheByTag('service_plans');

    return NextResponse.json({
      success: true,
      message: 'Service plan deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting service plan:', error);
    return NextResponse.json({ error: 'Failed to delete service plan' }, { status: 500 });
  }
}
