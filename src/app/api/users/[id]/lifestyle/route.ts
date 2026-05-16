import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { LifestyleInfo } from '@/lib/db/models';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

const SLEEP_PATTERN_MAP: Record<string, string> = {
  regular: 'regular-sleep',
  irregular: 'irregular-sleep',
  insomnia: 'insomnia-diagnosed',
  difficulty: 'difficulty-falling-asleep',
};

const STRESS_LEVEL_MAP: Record<string, string> = {
  low: 'rarely-stressed',
  mild: 'mild-occasional-stress',
  medium: 'moderate-stress',
  moderate: 'moderate-stress',
  high: 'frequent-stress',
};

function normalizeLifestylePayload(body: Record<string, any>): Record<string, any> {
  const normalized = { ...body };

  if (typeof normalized.sleepPattern === 'string') {
    const key = normalized.sleepPattern.trim().toLowerCase();
    if (SLEEP_PATTERN_MAP[key]) {
      normalized.sleepPattern = SLEEP_PATTERN_MAP[key];
    }
  }

  if (typeof normalized.stressLevel === 'string') {
    const key = normalized.stressLevel.trim().toLowerCase();
    if (STRESS_LEVEL_MAP[key]) {
      normalized.stressLevel = STRESS_LEVEL_MAP[key];
    }
  }

  return normalized;
}

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

    const { id } = await params;

    const lifestyleInfo = await withCache(
      `users:id:lifestyle:${JSON.stringify({ userId: id })}`,
      async () => {
        await connectDB();
        return await LifestyleInfo.findOne({ userId: id })
          .select('foodPreference preferredCuisine allergiesFood fastDays nonVegExemptDays foodLikes foodDislikes eatOutFrequency smokingFrequency alcoholFrequency activityRate cookingOil monthlyOilConsumption cookingSalt carbonatedBeverageFrequency cravingType sleepPattern stressLevel heightFeet heightInch heightCm weightKg targetWeightKg idealWeightKg bmi userId updatedAt')
          .lean();
      },
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
    const normalizedBody = normalizeLifestylePayload(body);

    const lifestyleInfo = await LifestyleInfo.findOneAndUpdate(
      { userId: id },
      { $set: { ...normalizedBody, userId: id } },
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
