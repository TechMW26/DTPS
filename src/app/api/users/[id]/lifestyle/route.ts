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
  none: 'none',
  low: 'rarely-stressed',
  mild: 'mild-occasional-stress',
  medium: 'moderate-stress',
  moderate: 'moderate-stress',
  high: 'frequent-stress',
  'rarely stressed': 'rarely-stressed',
  'mild occasional stress': 'mild-occasional-stress',
  'moderate stress': 'moderate-stress',
  'frequent stress': 'frequent-stress',
};

const FOOD_PREFERENCE_MAP: Record<string, string> = {
  veg: 'veg',
  vegetarian: 'veg',
  vegan: 'vegan',
  'non-veg': 'non-veg',
  'non veg': 'non-veg',
  'non-vegetarian': 'non-veg',
  'non vegetarian': 'non-veg',
  eggetarian: 'eggetarian',
  none: '',
};

function normalizeSelectValue(rawValue: unknown): string {
  const key = String(rawValue ?? '').trim().toLowerCase();
  if (!key) return '';
  // Custom Select serializes empty options as values like "__empty__-none".
  if (key === '__empty__' || key.startsWith('__empty__-')) return '';
  return key;
}

function sanitizeLifestyleDoc<T extends Record<string, any> | null>(doc: T): T {
  if (!doc) return doc;
  const sanitized = { ...doc } as Record<string, any>;
  if (typeof sanitized.sleepPattern === 'string' && sanitized.sleepPattern.toLowerCase().startsWith('__empty__-')) {
    sanitized.sleepPattern = '';
  }
  if (typeof sanitized.stressLevel === 'string' && sanitized.stressLevel.toLowerCase().startsWith('__empty__-')) {
    sanitized.stressLevel = 'none';
  }
  if (sanitized.stressLevel === '') {
    sanitized.stressLevel = 'none';
  }
  return sanitized as T;
}

function normalizeLifestylePayload(body: Record<string, any>): Record<string, any> {
  const normalized = { ...body };

  if (typeof normalized.foodPreference === 'string') {
    const key = normalizeSelectValue(normalized.foodPreference);
    if (Object.prototype.hasOwnProperty.call(FOOD_PREFERENCE_MAP, key)) {
      normalized.foodPreference = FOOD_PREFERENCE_MAP[key];
    } else {
      normalized.foodPreference = key;
    }
  }

  if (typeof normalized.sleepPattern === 'string') {
    const key = normalizeSelectValue(normalized.sleepPattern).replace(/[()]/g, '');
    if (key === '' || key === 'none') {
      normalized.sleepPattern = '';
    }
    if (SLEEP_PATTERN_MAP[key]) {
      normalized.sleepPattern = SLEEP_PATTERN_MAP[key];
    } else if (key.includes('regular')) {
      normalized.sleepPattern = 'regular-sleep';
    } else if (key.includes('irregular')) {
      normalized.sleepPattern = 'irregular-sleep';
    } else if (key.includes('insomnia')) {
      normalized.sleepPattern = 'insomnia-diagnosed';
    } else if (key.includes('difficulty')) {
      normalized.sleepPattern = 'difficulty-falling-asleep';
    }
  }

  if (typeof normalized.stressLevel === 'string') {
    const key = normalizeSelectValue(normalized.stressLevel);
    if (key === '') {
      normalized.stressLevel = '';
    } else if (STRESS_LEVEL_MAP[key]) {
      normalized.stressLevel = STRESS_LEVEL_MAP[key];
    } else {
      normalized.stressLevel = key;
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
      { ttl: 10000, tags: ['users', `users:id:${id}`, `users:id:lifestyle:${id}`] }
    );

    if (!lifestyleInfo) {
      return NextResponse.json({ lifestyleInfo: null });
    }

    return NextResponse.json({ lifestyleInfo: sanitizeLifestyleDoc(lifestyleInfo) });
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

    return NextResponse.json({ lifestyleInfo: sanitizeLifestyleDoc(lifestyleInfo?.toObject?.() || lifestyleInfo) });
  } catch (error) {
    console.error('Error saving lifestyle info:', error);
    if (error && typeof error === 'object' && 'name' in error && (error as any).name === 'ValidationError') {
      const validationErrors = Object.values((error as any).errors || {}).map((e: any) => e?.message).filter(Boolean);
      return NextResponse.json(
        { error: validationErrors.join(', ') || 'Validation failed' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to save lifestyle info' },
      { status: 500 }
    );
  }
}
