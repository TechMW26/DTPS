import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db/connection";
import LifestyleInfo from "@/lib/db/models/LifestyleInfo";
import { clearCacheByTag } from '@/lib/api/utils';
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    // Fetch directly from DB — never cache /api/client/** (multi-process safe)
    const lifestyleInfo = await LifestyleInfo.findOne({ userId: session.user.id }).lean();

    if (!lifestyleInfo) {
      return NextResponse.json({
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

    return NextResponse.json(lifestyleInfo);
  } catch (error) {
    console.error("Error fetching lifestyle info:", error);
    return NextResponse.json({ error: "Failed to fetch lifestyle info" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
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

    const lifestyleInfo = await LifestyleInfo.findOneAndUpdate(
      { userId: session.user.id },
      {
        ...data,
        foodPreference: normalizedFoodPreference,
        bmi,
        userId: session.user.id
      },
      {
        upsert: true,
        new: true,
        runValidators: true
      }
    );

    clearCacheByTag('client');
    clearCacheByTag(`client:lifestyle-info:${session.user.id}`);

    // Log activity
    logActivity({
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

    return NextResponse.json({ success: true, data: lifestyleInfo });
  } catch (error) {
    console.error("Error saving lifestyle info:", error);
    return NextResponse.json({ error: "Failed to save lifestyle info" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  return POST(request);
}
