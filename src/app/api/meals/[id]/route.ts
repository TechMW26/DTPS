import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import MealPlan from '@/lib/db/models/MealPlan';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/meals/[id] - Get specific meal plan
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

    const mealPlan = await withCache(
      `meals:id:${JSON.stringify(id)}`,
      async () => await MealPlan.findById(id)
      .populate('dietitian', 'firstName lastName email avatar')
      .populate('client', 'firstName lastName email avatar')
      .populate('meals.recipe', 'name description calories macros ingredients instructions'),
      { ttl: 120000, tags: ['meals'] }
    );

    if (!mealPlan) {
      return NextResponse.json(
        { error: 'Meal plan not found' },
        { status: 404 }
      );
    }

    // Check if user has access to this meal plan
    const hasAccess = 
      session.user.role === UserRole.ADMIN ||
      mealPlan.dietitian._id.toString() === session.user.id ||
      mealPlan.client._id.toString() === session.user.id;

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(mealPlan);

  } catch (error) {
    console.error('Error fetching meal plan:', error);
    return NextResponse.json(
      { error: 'Failed to fetch meal plan' },
      { status: 500 }
    );
  }
}

// PUT /api/meals/[id] - Update meal plan
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    await connectDB();
    const { id } = await params;

    const mealPlan = await withCache(
      `meals:id:${JSON.stringify(id)}`,
      async () => await MealPlan.findById(id),
      { ttl: 120000, tags: ['meals'] }
    );
    if (!mealPlan) {
      return NextResponse.json(
        { error: 'Meal plan not found' },
        { status: 404 }
      );
    }

    // Check if user can update this meal plan
    const canUpdate = 
      session.user.role === UserRole.ADMIN ||
      mealPlan.dietitian.toString() === session.user.id;

    if (!canUpdate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update meal plan
    Object.assign(mealPlan, body);
    await mealPlan.save();

    // Populate and return updated meal plan
    await mealPlan.populate('dietitian', 'firstName lastName email avatar');
    await mealPlan.populate('client', 'firstName lastName email avatar');
    await mealPlan.populate('meals.recipe', 'name description calories macros');

    return NextResponse.json(mealPlan);

  } catch (error) {
    console.error('Error updating meal plan:', error);
    return NextResponse.json(
      { error: 'Failed to update meal plan' },
      { status: 500 }
    );
  }
}

// DELETE /api/meals/[id] - Delete meal plan
export async function DELETE(
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

    const mealPlan = await withCache(
      `meals:id:${JSON.stringify(id)}`,
      async () => await MealPlan.findById(id),
      { ttl: 120000, tags: ['meals'] }
    );
    if (!mealPlan) {
      return NextResponse.json(
        { error: 'Meal plan not found' },
        { status: 404 }
      );
    }

    // Check if user can delete this meal plan
    const canDelete = 
      session.user.role === UserRole.ADMIN ||
      mealPlan.dietitian.toString() === session.user.id;

    if (!canDelete) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Soft delete by setting isActive to false
    mealPlan.isActive = false;
    await mealPlan.save();

    return NextResponse.json({ message: 'Meal plan deleted successfully' });

  } catch (error) {
    console.error('Error deleting meal plan:', error);
    return NextResponse.json(
      { error: 'Failed to delete meal plan' },
      { status: 500 }
    );
  }
}
