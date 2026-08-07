import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connect';
import MealPlanTemplate from '@/lib/db/models/MealPlanTemplate';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag, serverCache } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';
import mongoose from 'mongoose';

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isValidObjectId(id)) {
      return NextResponse.json({ success: false, error: 'Invalid template id' }, { status: 400 });
    }

    await connectDB();
    const template = await withCache(
      `meal-plan-templates:id:${JSON.stringify(id)}`,
      async () => await MealPlanTemplate.findById(id)
        .populate('createdBy', 'firstName lastName')
      ,
      { ttl: 120000, tags: ['meal-plan-templates'] }
    );
    if (!template) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, template });
  } catch (e) {
    console.error('Error fetching meal plan template by id:', e);
    return NextResponse.json({ success: false, error: 'Failed to fetch template' }, { status: 500 });
  }
}

// Update meal plan template
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.DIETITIAN) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    if (!isValidObjectId(id)) {
      return NextResponse.json({ success: false, error: 'Invalid template id' }, { status: 400 });
    }

    await connectDB();

    const body = await request.json();

    // Find existing template
    const existingTemplate = await withCache(
      `meal-plan-templates:id:${JSON.stringify(id)}`,
      async () => await MealPlanTemplate.findById(id),
      { ttl: 120000, tags: ['meal-plan-templates'] }
    );
    if (!existingTemplate) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    // Any dietitian can update meals/recipes and template details
    // No ownership check needed - all dietitians can edit templates

    // Update fields
    const updateFields = [
      'templateType', 'name', 'description', 'category', 'duration',
      'targetCalories', 'targetMacros', 'dietaryRestrictions', 'tags',
      'meals', 'isPublic', 'isPremium', 'difficulty', 'prepTime', 'targetAudience'
    ];

    updateFields.forEach(field => {
      if (body[field] !== undefined) {
        (existingTemplate as any)[field] = body[field];
      }
    });

    await existingTemplate.save();
    await existingTemplate.populate('createdBy', 'firstName lastName');

    // Clear cache
    clearCacheByTag('meal-plan-templates');
    clearCacheByTag('meal_plan_templates');

    // Log activity
    logActivity({
      userId: session.user.id,
      userRole: session.user.role as 'admin' | 'dietitian' | 'health_counselor' | 'client',
      userName: session.user.name || session.user.email || 'Staff',
      userEmail: session.user.email || '',
      action: 'update_meal_plan_template',
      actionType: 'update',
      category: 'meal_plan',
      description: `Updated meal plan template: ${existingTemplate.name}`,
      resourceId: id,
      resourceType: 'MealPlanTemplate',
      resourceName: existingTemplate.name,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Template updated successfully',
      template: existingTemplate
    });

  } catch (error) {
    console.error('Error updating meal plan template:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update template';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// Partial update meal plan template
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.DIETITIAN) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    if (!isValidObjectId(id)) {
      return NextResponse.json({ success: false, error: 'Invalid template id' }, { status: 400 });
    }

    await connectDB();

    const body = await request.json();

    const existingTemplate = await withCache(
      `meal-plan-templates:id:${JSON.stringify(id)}`,
      async () => await MealPlanTemplate.findById(id),
      { ttl: 120000, tags: ['meal-plan-templates'] }
    );
    if (!existingTemplate) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    // Fields that any dietitian can update (meals/recipes)
    const mealsOnlyFields = ['meals', 'mealTypes'];
    // Check if updating metadata (not just meals)
    const updatingMetadata = Object.keys(body).some(
      key => !mealsOnlyFields.includes(key)
    );

    // If updating metadata, require ownership or admin
    // Any dietitian can update meals/recipes
    if (updatingMetadata) {
      if (existingTemplate.createdBy.toString() !== session.user.id && session.user.role !== UserRole.ADMIN) {
        return NextResponse.json({ success: false, error: 'Not authorized to update template details. Only the creator or admin can modify template metadata.' }, { status: 403 });
      }
    }

    // Apply partial updates
    Object.keys(body).forEach(key => {
      if (body[key] !== undefined && key !== '_id' && key !== 'createdBy') {
        (existingTemplate as any)[key] = body[key];
      }
    });

    await existingTemplate.save();
    await existingTemplate.populate('createdBy', 'firstName lastName');

    clearCacheByTag('meal-plan-templates');
    clearCacheByTag('meal_plan_templates');
    serverCache.invalidate('meal-plan-templates:');

    return NextResponse.json({
      success: true,
      message: 'Template updated successfully',
      template: existingTemplate
    });

  } catch (error) {
    console.error('Error updating meal plan template (PATCH):', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update template';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// Delete meal plan template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Resolve session and params in parallel
    const [session, { id }] = await Promise.all([
      getServerSession(authOptions),
      params,
    ]);

    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.DIETITIAN) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    if (!isValidObjectId(id)) {
      return NextResponse.json({ success: false, error: 'Invalid template id' }, { status: 400 });
    }

    await connectDB();

    // Single atomic operation — no cache read, ownership filter built into query
    const filter = session.user.role === UserRole.ADMIN
      ? { _id: id }
      : { _id: id, createdBy: session.user.id };

    const deleted = await MealPlanTemplate.findOneAndUpdate(
      filter,
      { $set: { isActive: false } },
      { projection: { _id: 1, name: 1 } }
    );

    if (!deleted) {
      if (session.user.role !== UserRole.ADMIN) {
        const exists = await MealPlanTemplate.exists({ _id: id });
        if (exists) {
          return NextResponse.json({ success: false, error: 'Not authorized to delete this template' }, { status: 403 });
        }
      }
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    // Invalidate by prefix — reliable even after hot-reloads (tagToKeys resets, serverCache does not)
    serverCache.invalidate('meal-plan-templates:');
    clearCacheByTag('meal-plan-templates');
    clearCacheByTag('meal_plan_templates');

    // Fire-and-forget activity log — does not block response
    logActivity({
      userId: session.user.id,
      userRole: session.user.role as 'admin' | 'dietitian' | 'health_counselor' | 'client',
      userName: session.user.name || session.user.email || 'Staff',
      userEmail: session.user.email || '',
      action: 'delete_meal_plan_template',
      actionType: 'delete',
      category: 'meal_plan',
      description: `Deleted meal plan template: ${deleted.name}`,
      resourceId: id,
      resourceType: 'MealPlanTemplate',
      resourceName: deleted.name,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Template deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting meal plan template:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete template';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
