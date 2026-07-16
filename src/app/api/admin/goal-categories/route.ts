import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import GoalCategory from '@/lib/db/models/GoalCategory';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/admin/goal-categories - Get all goal categories
// This endpoint allows read access for all authenticated users (needed for client forms)
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    // Get query params
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('active') !== 'false';

    const query = activeOnly ? { isActive: true } : {};

    const categories = await withCache(
      `goal-categories:${activeOnly ? 'active' : 'all'}`,
      async () => {
        return await GoalCategory.find(query).sort({ order: 1, name: 1 }).lean();
      },
      { ttl: 300000, tags: ['goal-categories'] }
    );

    return NextResponse.json(categories);
  } catch (error: any) {
    console.error('Error fetching goal categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch goal categories' },
      { status: 500 }
    );
  }
}

// POST /api/admin/goal-categories - Create a new goal category
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, value, description = '', icon = 'target', isActive = true, order = 0 } = body;

    if (!name || !value) {
      return NextResponse.json(
        { error: 'Name and value are required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Check if value already exists
    const existing = await GoalCategory.findOne({ value: value.toLowerCase().trim() });
    if (existing) {
      return NextResponse.json(
        { error: 'Goal category with this value already exists' },
        { status: 409 }
      );
    }

    const newCategory = new GoalCategory({
      name: name.trim(),
      value: value.toLowerCase().trim().replace(/\s+/g, '-'),
      description: description.trim(),
      icon,
      isActive,
      order,
      createdBy: session.user.id,
    });

    await newCategory.save();
    clearCacheByTag('goal-categories');

    return NextResponse.json(newCategory, { status: 201 });
  } catch (error: any) {
    console.error('Error creating goal category:', error);
    return NextResponse.json(
      { error: 'Failed to create goal category' },
      { status: 500 }
    );
  }
}
