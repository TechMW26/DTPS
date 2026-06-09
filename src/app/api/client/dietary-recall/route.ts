import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db/connection";
import DietaryRecall from "@/lib/db/models/DietaryRecall";
import { clearCacheByTag } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';
import { MEAL_TYPES, MEAL_TYPE_KEYS } from '@/lib/mealConfig';
import { notifyClientDataUpdate } from '@/lib/notifications/staffPushService';

const VALID_MEAL_TYPES = MEAL_TYPE_KEYS.map((key) => MEAL_TYPES[key].label);

const normalizeMealType = (mealType: string): string | null => {
  if (!mealType) return null;
  const normalized = mealType.trim().toLowerCase();
  const match = VALID_MEAL_TYPES.find((value) => value.toLowerCase() === normalized);
  return match || null;
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    // Fetch directly from DB — never cache /api/client/** (multi-process safe)
    const recalls = await DietaryRecall.find({ userId: session.user.id })
      .sort({ date: -1 })
      .limit(30);

    return NextResponse.json({ recalls });
  } catch (error) {
    console.error("Error fetching dietary recall:", error);
    return NextResponse.json({ error: "Failed to fetch dietary recall" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // OPTIMIZATION: Run auth + DB + body parsing in PARALLEL
    const [session, , data] = await Promise.all([
      getServerSession(authOptions),
      dbConnect(),
      request.json()
    ]);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const mealsInput = Array.isArray(data.meals) ? data.meals : null;

    if (!mealsInput) {
      return NextResponse.json({ error: "Meals array is required" }, { status: 400 });
    }

    const validMeals: Array<{
      mealType: string;
      hour: string;
      minute: string;
      meridian: 'AM' | 'PM';
      food: string;
    }> = [];

    let hasInvalidMealType = false;
    for (const raw of mealsInput as any[]) {
      const normalizedMealType = normalizeMealType(String(raw?.mealType || ''));
      if (!normalizedMealType) {
        hasInvalidMealType = true;
        break;
      }

      validMeals.push({
        mealType: normalizedMealType,
        hour: String(raw?.hour || ''),
        minute: String(raw?.minute || ''),
        meridian: raw?.meridian === 'PM' ? 'PM' : 'AM',
        food: String(raw?.food || ''),
      });
    }

    if (hasInvalidMealType) {
      return NextResponse.json({ error: "One or more meal types are invalid" }, { status: 400 });
    }

    // If date is provided, use it, otherwise use today
    const date = data.date ? new Date(data.date) : new Date();
    date.setHours(0, 0, 0, 0);

    // OPTIMIZED: Use findOneAndUpdate with upsert for atomic operation
    const dietaryRecall = await DietaryRecall.findOneAndUpdate(
      {
        userId: session.user.id,
        date: {
          $gte: date,
          $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000)
        }
      },
      {
        $set: { meals: validMeals },
        $setOnInsert: { userId: session.user.id, date }
      },
      { upsert: true, new: true }
    );

    // Clear cache synchronously before returning so next fetch sees fresh data
    clearCacheByTag('client');

    // Log activity and notify (fire-and-forget non-critical side effects)
    Promise.resolve().then(() => {
      logActivity({
        userId: session.user.id,
        userRole: 'client',
        userName: session.user.name || '',
        userEmail: session.user.email || '',
        action: 'save_dietary_recall',
        actionType: 'create',
        category: 'fitness',
        description: `Recorded dietary recall for ${date.toDateString()}`,
        targetUserId: session.user.id,
        targetUserName: session.user.name || '',
        details: {
          date: date.toISOString(),
          mealsCount: validMeals.length
        }
      }).catch(() => { });

      notifyClientDataUpdate({
        clientId: session.user.id,
        updateType: 'recall_form',
        eventKey: `recall:${date.toISOString()}`,
      }).catch(() => { });
    });

    return NextResponse.json({ success: true, data: dietaryRecall });
  } catch (error) {
    console.error("Error saving dietary recall:", error);
    return NextResponse.json({ error: "Failed to save dietary recall" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  return POST(request);
}
