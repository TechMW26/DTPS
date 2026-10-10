import {nativeResponseJson} from '@/lib/api/native-response';
import { after, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {getNativeDatabase} from '@/lib/db/database';
import {readNativeClientForm,writeNativeClientForm,listNativeRecalls} from '@/lib/db/repository/native-client-forms';
import {ZodError} from 'zod';
import { clearCacheByTag } from '@/lib/cache/memoryCache';
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
      return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
    }



    // Fetch directly from DB — never cache /api/client/** (multi-process safe)
    const recalls=await listNativeRecalls(getNativeDatabase(),session.user.id);

    return nativeResponseJson({ recalls });
  } catch (error) {
    console.error("Error fetching dietary recall:", error);
    return nativeResponseJson({ error: "Failed to fetch dietary recall" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // OPTIMIZATION: Run auth + DB + body parsing in PARALLEL
    const [session, data] = await Promise.all([
      getServerSession(authOptions),
      request.json()
    ]);

    if (!session?.user?.id) {
      return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
    }

    const mealsInput = Array.isArray(data.meals) ? data.meals : null;

    if (!mealsInput) {
      return nativeResponseJson({ error: "Meals array is required" }, { status: 400 });
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
      return nativeResponseJson({ error: "One or more meal types are invalid" }, { status: 400 });
    }

    // If date is provided, use it, otherwise use today
    const date = data.date ? new Date(data.date) : new Date();
    date.setHours(0, 0, 0, 0);

    if(!Number.isFinite(date.getTime()))return nativeResponseJson({error:'Invalid date'},{status:400});
    const dietaryRecall=await writeNativeClientForm(getNativeDatabase(),'dietaryrecalls',session.user.id,{meals:validMeals},date);

    // Clear cache synchronously before returning so next fetch sees fresh data
    clearCacheByTag('client');

    // Log activity and notify (fire-and-forget non-critical side effects)
    after(async () => {
      await logActivity({
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

      await notifyClientDataUpdate({
        clientId: session.user.id,
        updateType: 'recall_form',
        eventKey: `recall:${date.toISOString()}`,
      }).catch(() => { });
    });

    return nativeResponseJson({ success: true, data: dietaryRecall });
  } catch (error) {
    if(error instanceof ZodError)return nativeResponseJson({error:'Invalid dietary recall',details:error.issues},{status:400});
    console.error("Error saving dietary recall:", error);
    return nativeResponseJson({ error: "Failed to save dietary recall" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  return POST(request);
}
