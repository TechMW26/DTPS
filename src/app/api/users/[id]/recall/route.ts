import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import DietaryRecall from '@/lib/db/models/DietaryRecall';
import User from '@/lib/db/models/User';
import { logHistoryServer } from '@/lib/server/history';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { MEAL_TYPES, MEAL_TYPE_KEYS } from '@/lib/mealConfig';

// Build valid mealType labels from canonical config
const VALID_MEAL_TYPES = MEAL_TYPE_KEYS.map(k => MEAL_TYPES[k].label);

// Normalize mealType to match canonical labels (case-insensitive)
const normalizeMealType = (mealType: string): string | null => {
  if (!mealType) return null;

  const normalized = mealType.trim();

  // Find matching meal type (case-insensitive)
  const match = VALID_MEAL_TYPES.find(
    validType => validType.toLowerCase() === normalized.toLowerCase()
  );

  return match || null; // Return canonical form or null if no match
};

// GET /api/users/[id]/recall - Fetch dietary recall for a user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: userId } = await params;

    // Verify user exists
    const user = await withCache(
      `users:id:recall:${JSON.stringify(userId)}`,
      async () => {
        await connectDB();
        return await User.findById(userId).select('_id').lean();
      },
      { ttl: 10000, tags: ['users'] }
    );
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const recallPayload = await withCache(
      `users:id:recall:payload:${JSON.stringify(userId)}`,
      async () => {
        await connectDB();

        // Fetch the latest dietary recall document for this user (or create default)
        const recall: any = await DietaryRecall.findOne({ userId }).sort({ date: -1 }).lean();

        // If no recall exists, return empty meals array
        if (!recall) {
          return {
            success: true,
            meals: [],
            entries: [],
            recallId: null
          };
        }

        // Map meals to include id for frontend
        const entriesWithId = (recall.meals || []).map((meal: any, index: number) => ({
          id: meal._id?.toString() || `meal-${index}`,
          _id: meal._id?.toString(),
          mealType: meal.mealType,
          hour: meal.hour,
          minute: meal.minute,
          meridian: meal.meridian,
          food: meal.food || ''
        }));

        return {
          success: true,
          meals: recall.meals || [],
          entries: entriesWithId,
          recallId: recall._id,
          date: recall.date
        };
      },
      { ttl: 10000, tags: ['users', `users:id:${userId}`, `users:id:recall:${userId}`] }
    );

    return NextResponse.json(recallPayload, { status: 200 });
  } catch (error) {
    // console.error('Error fetching dietary recall:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dietary recall' },
      { status: 500 }
    );
  }
}

// POST /api/users/[id]/recall - Save/update dietary recall meals array
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { id: userId } = await params;
    const body = await request.json();

    // Handle both full-array payloads and single-entry payloads
    const mealsData = Array.isArray(body.meals)
      ? body.meals
      : Array.isArray(body.entries)
        ? body.entries
        : [];
    const hasSingleEntryPayload = !mealsData.length && typeof body.mealType === 'string';

    // Default times for each meal type (canonical 8 types)
    const defaultTimes: { [key: string]: { hour: string; minute: string; meridian: 'AM' | 'PM' } } = {
      'Early Morning': { hour: '6', minute: '00', meridian: 'AM' },
      'Breakfast': { hour: '9', minute: '00', meridian: 'AM' },
      'Mid Morning': { hour: '11', minute: '00', meridian: 'AM' },
      'Lunch': { hour: '1', minute: '00', meridian: 'PM' },
      'Mid Evening': { hour: '4', minute: '00', meridian: 'PM' },
      'Evening': { hour: '7', minute: '00', meridian: 'PM' },
      'Dinner': { hour: '7', minute: '00', meridian: 'PM' },
      'Past Dinner': { hour: '9', minute: '00', meridian: 'PM' },
    };

    if (!hasSingleEntryPayload && mealsData.length === 0) {
      return NextResponse.json(
        { error: 'No recall entries provided' },
        { status: 400 }
      );
    }

    const mapMeal = (meal: any) => {
      const normalizedMealType = normalizeMealType(meal?.mealType || '');
      if (!normalizedMealType) {
        return null;
      }

      const defaultTime = defaultTimes[normalizedMealType] || { hour: '12', minute: '00', meridian: 'PM' as const };
      return {
        mealType: normalizedMealType,
        hour: meal?.hour || defaultTime.hour,
        minute: meal?.minute || defaultTime.minute,
        meridian: meal?.meridian || defaultTime.meridian,
        food: meal?.food || ''
      };
    };

    // Ensure all meals have valid meal types/times
    const mealsWithDefaults = mealsData
      .map((meal: any) => mapMeal(meal))
      .filter(Boolean) as Array<{
        mealType: string;
        hour: string;
        minute: string;
        meridian: 'AM' | 'PM';
        food: string;
      }>;

    if (!hasSingleEntryPayload && mealsData.length > 0 && mealsWithDefaults.length === 0) {
      return NextResponse.json(
        { error: 'Invalid meal type in recall entries' },
        { status: 400 }
      );
    }

    // Find existing recall for today or create new one
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let recall: any;

    if (hasSingleEntryPayload) {
      // Single-entry path: update or push one meal into today's recall
      const singleMeal = mapMeal(body);
      if (!singleMeal) {
        return NextResponse.json(
          { error: 'Invalid meal type in recall entry' },
          { status: 400 }
        );
      }
      // Try to update existing meal first; if none matches, push it in
      recall = await DietaryRecall.findOneAndUpdate(
        { userId, date: { $gte: today }, 'meals.mealType': new RegExp(`^${singleMeal.mealType}$`, 'i') },
        { $set: { 'meals.$': singleMeal } },
        { new: true, runValidators: false }
      );
      if (!recall) {
        recall = await DietaryRecall.findOneAndUpdate(
          { userId, date: { $gte: today } },
          { $push: { meals: singleMeal }, $setOnInsert: { userId, date: new Date() } },
          { upsert: true, new: true, runValidators: false }
        );
      }
    } else {
      // Full-array replace path: single upsert, no prior findOne needed
      const mealsToPersist = mealsWithDefaults;
      recall = await DietaryRecall.findOneAndUpdate(
        { userId, date: { $gte: today } },
        { $set: { meals: mealsToPersist }, $setOnInsert: { userId, date: new Date() } },
        { upsert: true, new: true, runValidators: false }
      );
    }

    // Fire-and-forget history log — do not block the response
    logHistoryServer({
      userId,
      action: recall ? 'update' : 'create',
      category: 'diet',
      description: `${session.user.role} saved dietary recall`,
      performedById: session.user.id,
      metadata: { recallId: recall?._id, mealCount: recall?.meals?.length ?? 0, date: recall?.date },
    }).catch(() => { });

    // Clear caches for real-time sync
    await clearCacheByTag('users');
    await clearCacheByTag(`users:id:${userId}`);
    await clearCacheByTag(`users:id:${JSON.stringify(userId)}`);
    await clearCacheByTag(`users:id:recall:${userId}`);
    await clearCacheByTag(`users:id:recall:${JSON.stringify(userId)}`);
    await clearCacheByTag(`users:id:recall:payload:${JSON.stringify(userId)}`);
    await clearCacheByTag('client');
    await clearCacheByTag(`client:dietary-recall:${userId}`);
    await clearCacheByTag(`client:${userId}`);

    return NextResponse.json(
      { success: true, recall, recallId: recall._id },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error saving dietary recall:', error);
    return NextResponse.json(
      { error: 'Failed to save dietary recall', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
