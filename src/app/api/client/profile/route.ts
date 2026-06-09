import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db/connection";
import User from "@/lib/db/models/User";
import { socketManager } from "@/lib/realtime/socket-manager";
import { clearCacheByTag } from '@/lib/api/utils';
import { getClientStatusInfo } from '@/lib/status/computeClientStatus';
import { logActivity } from '@/lib/utils/activityLogger';
import { emitClientWeightUpdate } from '@/lib/realtime/weight-notify';
import { notifyClientDataUpdate } from '@/lib/notifications/staffPushService';

// BMI Calculation Helper
function calculateBMI(weightKg: number, heightCm: number): { bmi: string; bmiCategory: string } {
  if (weightKg <= 0 || heightCm <= 0) {
    return { bmi: '', bmiCategory: '' };
  }

  const heightM = heightCm / 100;
  const bmiValue = weightKg / (heightM * heightM);
  const bmi = bmiValue.toFixed(1);

  let bmiCategory: string;
  if (bmiValue < 18.5) {
    bmiCategory = 'Underweight';
  } else if (bmiValue < 25) {
    bmiCategory = 'Normal';
  } else if (bmiValue < 30) {
    bmiCategory = 'Overweight';
  } else {
    bmiCategory = 'Obese';
  }

  return { bmi, bmiCategory };
}

export async function GET() {
  try {
    // Run auth + DB connection in PARALLEL (saves ~50-100ms)
    const [session] = await Promise.all([
      getServerSession(authOptions),
      dbConnect()
    ]);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch directly from DB — never cache /api/client/** (multi-process safe)
    const [userData, statusInfo] = await Promise.all([
      User.findById(session.user.id)
        .select(
          "name firstName lastName email phone dateOfBirth gender address city state pincode profileImage avatar createdAt heightCm weightKg firstWeight targetWeightKg activityLevel generalGoal dietType alternativeEmail alternativePhone anniversary source referralSource assignedDietitian bmi bmiCategory height weight clientStatus"
        )
        .populate('assignedDietitian', 'firstName lastName email phone')
        .lean() as Promise<any>,
      getClientStatusInfo(session.user.id).catch(() => null)
    ]);

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Calculate BMI if not stored but weight and height available
    let bmi = userData.bmi;
    let bmiCategory = userData.bmiCategory;
    if (!bmi && userData.weightKg && userData.heightCm) {
      const weightKg = parseFloat(userData.weightKg);
      const heightCm = parseFloat(userData.heightCm);
      if (weightKg > 0 && heightCm > 0) {
        const heightM = heightCm / 100;
        const bmiValue = weightKg / (heightM * heightM);
        bmi = bmiValue.toFixed(1);
        if (bmiValue < 18.5) bmiCategory = 'Underweight';
        else if (bmiValue < 25) bmiCategory = 'Normal';
        else if (bmiValue < 30) bmiCategory = 'Overweight';
        else bmiCategory = 'Obese';
      }
    }

    return NextResponse.json({
      ...userData,
      bmi,
      bmiCategory,
      clientStatus: statusInfo?.clientStatus || userData.clientStatus,
      hasActivePlan: statusInfo?.hasActivePlan || false,
      mealPlanStartDate: statusInfo?.activePlanStartDate,
      mealPlanEndDate: statusInfo?.activePlanEndDate
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const data = await request.json();

    // Only allow certain fields to be updated
    const allowedFields = [
      "name", "firstName", "lastName", "dateOfBirth", "gender",
      "address", "city", "state", "pincode", "profileImage", "avatar",
      "heightCm", "weightKg", "targetWeightKg", "activityLevel", "generalGoal", "dietType",
      "alternativeEmail", "alternativePhone", "anniversary", "source", "referralSource"
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    // Sync profileImage to avatar field so session can pick it up
    if (data.profileImage) {
      updateData.avatar = data.profileImage;
    }

    // Check if weight or height is being updated - recalculate BMI
    const isWeightOrHeightUpdated = data.weightKg !== undefined || data.heightCm !== undefined;

    let currentUserForValidation: any = null;

    if (isWeightOrHeightUpdated || data.weightKg !== undefined) {
      currentUserForValidation = await User.findById(session.user.id)
        .select('weightKg heightCm firstWeight')
        .lean() as any;
    }

    // Client can set first weight once; after that it's locked for client
    if (data.weightKg !== undefined) {
      const incomingWeight = parseFloat(String(data.weightKg));
      if (!Number.isFinite(incomingWeight) || incomingWeight <= 0) {
        return NextResponse.json({ error: 'Weight must be a positive number' }, { status: 400 });
      }

      const firstWeightValue = Number(currentUserForValidation?.firstWeight?.value || 0);
      const legacyWeightValue = parseFloat(String(currentUserForValidation?.weightKg || '0'));
      const hasBaseline = (Number.isFinite(firstWeightValue) && firstWeightValue > 0)
        || (Number.isFinite(legacyWeightValue) && legacyWeightValue > 0);

      if (hasBaseline) {
        const baseline = (Number.isFinite(firstWeightValue) && firstWeightValue > 0)
          ? firstWeightValue
          : legacyWeightValue;

        if (Math.abs(incomingWeight - baseline) > 0.0001) {
          return NextResponse.json(
            { error: 'Your starting weight is locked. Please contact your dietitian to update it.' },
            { status: 403 }
          );
        }

        // Backfill metadata when legacy weight exists but firstWeight object is missing
        if (!(Number.isFinite(firstWeightValue) && firstWeightValue > 0) && Number.isFinite(legacyWeightValue) && legacyWeightValue > 0) {
          updateData.firstWeight = {
            value: legacyWeightValue,
            setBy: 'client',
            setDate: new Date(),
            isLocked: true,
            lastUpdatedBy: 'client',
            lastUpdateDate: new Date(),
          };
        }
      } else {
        // First time set by client
        updateData.firstWeight = {
          value: incomingWeight,
          setBy: 'client',
          setDate: new Date(),
          isLocked: true,
          lastUpdatedBy: 'client',
          lastUpdateDate: new Date(),
        };
      }

      updateData.weightKg = String(incomingWeight);
      updateData.weight = incomingWeight;
    }

    if (isWeightOrHeightUpdated) {
      const finalWeightKg = parseFloat(
        data.weightKg !== undefined
          ? String(updateData.weightKg ?? data.weightKg)
          : currentUserForValidation?.weightKg || '0'
      );
      const finalHeightCm = parseFloat(data.heightCm !== undefined ? String(data.heightCm) : currentUserForValidation?.heightCm || '0');

      // Calculate BMI if both weight and height are available
      if (finalWeightKg > 0 && finalHeightCm > 0) {
        const bmiData = calculateBMI(finalWeightKg, finalHeightCm);
        updateData.bmi = bmiData.bmi;
        updateData.bmiCategory = bmiData.bmiCategory;
      }
    }

    const user = await User.findByIdAndUpdate(
      session.user.id,
      updateData,
      { new: true, runValidators: true }
    ).select("name firstName lastName email phone dateOfBirth gender address city state pincode profileImage avatar createdAt heightCm weightKg firstWeight targetWeightKg activityLevel generalGoal dietType alternativeEmail alternativePhone anniversary source referralSource bmi bmiCategory");

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Clear client profile cache after update
    clearCacheByTag(`client-profile:${session.user.id}`);
    clearCacheByTag('client-profile');
    clearCacheByTag('client');
    // Also clear dashboard cache to reflect name/avatar changes immediately
    clearCacheByTag(`dashboard:${session.user.id}`);

    // Log activity
    const changedFields = Object.keys(updateData);
    logActivity({
      userId: session.user.id,
      userRole: 'client',
      userName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.name || '',
      userEmail: user.email || session.user.email || '',
      action: 'Updated Profile',
      actionType: 'update',
      category: 'profile',
      description: `Client updated their profile. Fields: ${changedFields.join(', ')}`,
      changeDetails: changedFields.map(f => ({
        fieldName: f,
        oldValue: null,
        newValue: updateData[f] ?? null,
      })),
    }).catch(() => { });

    // Send SSE update if BMI was recalculated
    if (isWeightOrHeightUpdated && user.bmi) {
      try {
        socketManager.sendToUser(session.user.id, 'bmi_update', {
          weightKg: user.weightKg || '',
          heightCm: user.heightCm || '',
          bmi: user.bmi || '',
          bmiCategory: user.bmiCategory || '',
          timestamp: Date.now()
        });
      } catch (sseError) {
        console.warn('SSE notification failed:', sseError);
      }
    }

    // Realtime: push current weight to assigned staff dashboards
    if (data.weightKg !== undefined) {
      const numericWeight = parseFloat(String(user.weightKg || '0'));
      if (numericWeight > 0) {
        await emitClientWeightUpdate({
          clientId: session.user.id,
          weightKg: numericWeight,
          bmi: user.bmi || undefined,
          source: 'client_profile'
        });
      }
    }

    // Push notification triggers for assigned staff
    try {
      const basicDetailFields = new Set([
        'name', 'firstName', 'lastName', 'dateOfBirth', 'gender', 'address', 'city',
        'state', 'pincode', 'profileImage', 'avatar', 'heightCm', 'targetWeightKg', 'activityLevel',
        'generalGoal', 'dietType', 'alternativeEmail', 'alternativePhone', 'anniversary',
        'source', 'referralSource'
      ]);

      const hasBasicDetailsUpdate = changedFields.some((field) => basicDetailFields.has(field));
      const hasWeightUpdate = changedFields.includes('weightKg') || changedFields.includes('weight');

      if (hasBasicDetailsUpdate) {
        await notifyClientDataUpdate({
          clientId: session.user.id,
          updateType: 'basic_details',
          eventKey: `profile-basic:${Date.now()}`,
        });
      }

      if (hasWeightUpdate) {
        await notifyClientDataUpdate({
          clientId: session.user.id,
          updateType: 'weight_update',
          eventKey: `profile-weight:${Date.now()}`,
        });
      }
    } catch (notificationError) {
      console.error('Error sending client profile update notifications:', notificationError);
    }

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    console.error("Error updating profile:", error);
    // Return more detailed error for validation failures
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e: any) => e.message);
      return NextResponse.json({ error: messages.join(', ') }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
