import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import GoalCategory from '@/lib/db/models/GoalCategory';
import { clearCacheByTag } from '@/lib/api/utils';
import mongoose from 'mongoose';

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

// GET /api/admin/goal-categories/[id] - Get single goal category
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid goal category id' }, { status: 400 });
    }
    await connectDB();

    const category = await GoalCategory.findById(id).lean();
    if (!category) {
      return NextResponse.json({ error: 'Goal category not found' }, { status: 404 });
    }

    return NextResponse.json(category);
  } catch (error: any) {
    console.error('Error fetching goal category:', error);
    return NextResponse.json({ error: 'Failed to fetch goal category' }, { status: 500 });
  }
}

// PUT /api/admin/goal-categories/[id] - Update goal category
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid goal category id' }, { status: 400 });
    }
    const body = await req.json();
    const { name, value, description, icon, isActive, order } = body;

    await connectDB();

    const category = await GoalCategory.findById(id);
    if (!category) {
      return NextResponse.json({ error: 'Goal category not found' }, { status: 404 });
    }

    // Check if new value conflicts with another category
    if (value && value !== category.value) {
      const existing = await GoalCategory.findOne({ value: value.toLowerCase().trim(), _id: { $ne: id } });
      if (existing) {
        return NextResponse.json({ error: 'Another category with this value already exists' }, { status: 409 });
      }
    }

    // Update fields
    if (name !== undefined) category.name = name.trim();
    if (value !== undefined) category.value = value.toLowerCase().trim();
    if (description !== undefined) category.description = description.trim();
    if (icon !== undefined) category.icon = icon;
    if (isActive !== undefined) category.isActive = isActive;
    if (order !== undefined) category.order = order;

    await category.save();
    clearCacheByTag('goal-categories');

    return NextResponse.json(category);
  } catch (error: any) {
    console.error('Error updating goal category:', error);
    return NextResponse.json({ error: 'Failed to update goal category' }, { status: 500 });
  }
}

// DELETE /api/admin/goal-categories/[id] - Delete goal category
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid goal category id' }, { status: 400 });
    }
    await connectDB();

    const category = await GoalCategory.findByIdAndDelete(id);
    if (!category) {
      return NextResponse.json({ error: 'Goal category not found' }, { status: 404 });
    }

    clearCacheByTag('goal-categories');

    return NextResponse.json({ success: true, message: 'Goal category deleted' });
  } catch (error: any) {
    console.error('Error deleting goal category:', error);
    return NextResponse.json({ error: 'Failed to delete goal category' }, { status: 500 });
  }
}
