import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { MedicalInfo } from '@/lib/db/models';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/users/[id]/medical - Get medical info for user
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

    const medicalInfo = await withCache(
      `users:id:medical:${JSON.stringify({ userId: id })}`,
      async () => await MedicalInfo.findOne({ userId: id }),
      { ttl: 120000, tags: ['users', `users:id:${id}`, `users:id:medical:${id}`] }
    );

    if (!medicalInfo) {
      return NextResponse.json({ medicalInfo: null });
    }

    return NextResponse.json({ medicalInfo });
  } catch (error) {
    console.error('Error fetching medical info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch medical info' },
      { status: 500 }
    );
  }
}

// POST/PUT /api/users/[id]/medical - Create or update medical info
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

    // Use findOneAndUpdate to avoid version conflicts from concurrent updates
    const medicalInfo = await MedicalInfo.findOneAndUpdate(
      { userId: id },
      {
        $set: {
          ...body,
          updatedAt: new Date()
        }
      },
      {
        new: true,              // Return updated document
        upsert: true,           // Create if doesn't exist
        setDefaultsOnInsert: true,
        overwrite: false        // Don't overwrite, merge updates
      }
    );

    // Clear all related cache tags
    await clearCacheByTag('users');
    await clearCacheByTag(`users:id:${id}`);
    await clearCacheByTag(`users:id:medical:${id}`);
    // Also clear client cache tags for real-time sync
    await clearCacheByTag('client');
    await clearCacheByTag(`client:medical-info:${id}`);

    return NextResponse.json({ medicalInfo });
  } catch (error) {
    console.error('Error saving medical info:', error);
    return NextResponse.json(
      { error: 'Failed to save medical info' },
      { status: 500 }
    );
  }
}
