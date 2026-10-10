import {nativeResponseJson} from '@/lib/api/native-response';
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {getNativeDatabase} from '@/lib/db/database';
import {readNativeClientForm,writeNativeClientForm,listNativeRecalls} from '@/lib/db/repository/native-client-forms';
import {ZodError} from 'zod';
import { clearCacheByTag } from '@/lib/cache/memoryCache';
import { logActivity } from '@/lib/utils/activityLogger';
import { notifyClientDataUpdate } from '@/lib/notifications/staffPushService';

function normalizeFoodPreference(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  if (raw === 'veg' || raw === 'vegetarian') return 'veg';
  if (raw === 'vegan') return 'vegan';
  if (raw === 'non-veg' || raw === 'non veg' || raw === 'non-vegetarian' || raw === 'non vegetarian') return 'non-veg';
  if (raw === 'eggetarian') return 'eggetarian';

  return raw;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
    }



    // Fetch directly from DB — never cache /api/client/** (multi-process safe)
    const lifestyleInfo = await readNativeClientForm(getNativeDatabase(),'lifestyleinfos',session.user.id);

    if (!lifestyleInfo) {
      return nativeResponseJson({
        heightFeet: "",
        heightInch: "",
        heightCm: "",
        weightKg: "",
        targetWeightKg: "",
        idealWeightKg: "",
        bmi: "",
        foodPreference: "",
        preferredCuisine: [],
        allergiesFood: [],
        fastDays: [],
        nonVegExemptDays: [],
        foodLikes: "",
        foodDislikes: "",
        eatOutFrequency: "",
        smokingFrequency: "",
        alcoholFrequency: "",
        activityRate: "",
        activityLevel: "",
        cookingOil: [],
        monthlyOilConsumption: "",
        cookingSalt: "",
        carbonatedBeverageFrequency: "",
        cravingType: "",
        sleepPattern: "",
        stressLevel: ""
      });
    }

    return nativeResponseJson(lifestyleInfo);
  } catch (error) {
    console.error("Error fetching lifestyle info:", error);
    return nativeResponseJson({ error: "Failed to fetch lifestyle info" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
    }


    const data = await request.json();
    const normalizedFoodPreference = normalizeFoodPreference(data.foodPreference);

    // Calculate BMI if height and weight are provided
    let bmi = data.bmi;
    if (data.heightCm && data.weightKg) {
      const heightM = parseFloat(data.heightCm) / 100;
      const weight = parseFloat(data.weightKg);
      if (heightM > 0 && weight > 0) {
        bmi = (weight / (heightM * heightM)).toFixed(1);
      }
    }

    const lifestyleInfo=await writeNativeClientForm(getNativeDatabase(),'lifestyleinfos',session.user.id,{...data,...(data.foodPreference!==undefined?{foodPreference:normalizedFoodPreference}:{}),...(bmi!==undefined?{bmi}:{})});

    clearCacheByTag('client');
    clearCacheByTag(`client:lifestyle-info:${session.user.id}`);

    // Log activity
    await logActivity({
      userId: session.user.id,
      userRole: 'client',
      userName: session.user.name || '',
      userEmail: session.user.email || '',
      action: 'update_lifestyle_info',
      actionType: 'update',
      category: 'fitness',
      description: 'Updated own lifestyle information',
      targetUserId: session.user.id,
      targetUserName: session.user.name || '',
      details: {
        foodPreference: normalizedFoodPreference || 'not set',
        activityLevel: data.activityLevel || 'not set',
        weightKg: data.weightKg || 'not set'
      }
    }).catch(console.error);

    try {
      await notifyClientDataUpdate({
        clientId: session.user.id,
        updateType: 'lifestyle_data',
        eventKey: `lifestyle:${Date.now()}`,
      });
    } catch (notificationError) {
      console.error('Error sending lifestyle update notification:', notificationError);
    }

    return nativeResponseJson({ success: true, data: lifestyleInfo });
  } catch (error) {
    if(error instanceof ZodError)return nativeResponseJson({error:'Invalid lifestyle information',details:error.issues},{status:400});
    console.error("Error saving lifestyle info:", error);
    return nativeResponseJson({ error: "Failed to save lifestyle info" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  return POST(request);
}
