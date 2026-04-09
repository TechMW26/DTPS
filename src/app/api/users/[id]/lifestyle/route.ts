import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { LifestyleInfo } from '@/lib/db/models';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/users/[id]/lifestyle - Get lifestyle info for user
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

    const lifestyleInfo = await withCache(
      `users:id:lifestyle:${JSON.stringify({ userId: id })}`,
      async () => await LifestyleInfo.findOne({ userId: id }),
      { ttl: 120000, tags: ['users', `users:id:${id}`, `users:id:lifestyle:${id}`] }
    );

    if (!lifestyleInfo) {
      return NextResponse.json({ lifestyleInfo: null });
    }

    return NextResponse.json({ lifestyleInfo });
  } catch (error) {
    console.error('Error fetching lifestyle info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lifestyle info' },
      { status: 500 }
    );
  }
}

// POST/PUT /api/users/[id]/lifestyle - Create or update lifestyle info
export async function POST(
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

    const lifestyleInfo = await LifestyleInfo.findOneAndUpdate(
      { userId: id },
      { $set: { ...body, userId: id } },
      { upsert: true, new: true, runValidators: true }
    );

    await clearCacheByTag('users');
    await clearCacheByTag(`users:id:${id}`);
    await clearCacheByTag(`users:id:${JSON.stringify(id)}`);
    await clearCacheByTag(`users:id:lifestyle:${id}`);
    await clearCacheByTag(`users:id:lifestyle:${JSON.stringify({ userId: id })}`);
    // Also clear client cache tags for real-time sync
    await clearCacheByTag('client');
    await clearCacheByTag(`client:lifestyle-info:${id}`);
    await clearCacheByTag(`client:${id}`);

    return NextResponse.json({ lifestyleInfo });
  } catch (error) {
    console.error('Error saving lifestyle info:', error);
    return NextResponse.json(
      { error: 'Failed to save lifestyle info' },
      { status: 500 }
    );
  }
}
