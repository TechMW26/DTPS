import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connection';
import Transformation from '@/lib/db/models/Transformation';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET - Fetch all active transformations for public display
export async function GET() {
  try {
    await dbConnect();

    const transformations = await withCache(
      `client:transformations:${JSON.stringify({ isActive: true })}`,
      async () => await Transformation.find({ isActive: true })
      .select('uuid title description beforeImage afterImage clientName durationWeeks weightLoss displayOrder')
      .sort({ displayOrder: 1, createdAt: -1 })
      ,
      { ttl: 120000, tags: ['client'] }
    );

    return NextResponse.json({ transformations });
  } catch (error) {
    console.error('Error fetching transformations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transformations' },
      { status: 500 }
    );
  }
}
