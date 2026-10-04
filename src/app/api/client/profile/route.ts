import {nativeResponseJson} from '@/lib/api/native-response';
import { getNativeDatabase } from '@/lib/db/firestore-native';
import { nativeClientProfile, updateNativeClientProfile, ProfileInputError } from '@/lib/db/repository/native-client-profile';
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { socketManager } from "@/lib/realtime/socket-manager";
import { clearCacheByTag } from '@/lib/cache/memoryCache';
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
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch directly from DB — never cache /api/client/** (multi-process safe)
    const [userData, statusInfo] = await Promise.all([
      nativeClientProfile(getNativeDatabase(), session.user.id),
      getClientStatusInfo(session.user.id).catch(() => null)
    ]);

    if (!userData) {
      return nativeResponseJson({ error: "User not found" }, { status: 404 });
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

    return nativeResponseJson({
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
    return nativeResponseJson({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await request.json();
    const result = await updateNativeClientProfile(getNativeDatabase(), session.user.id, data);
    if (!result) return nativeResponseJson({error:'User not found'},{status:404});
    const {user,updateData} = result;
    const isWeightOrHeightUpdated = data.weightKg !== undefined || data.heightCm !== undefined;

    // Clear client profile cache after update
    clearCacheByTag(`client-profile:${session.user.id}`);
    clearCacheByTag('client-profile');
    clearCacheByTag('client');
    // Also clear dashboard cache to reflect name/avatar changes immediately
    clearCacheByTag(`dashboard:${session.user.id}`);

    // Log activity
    const changedFields = Object.keys(updateData);
    await logActivity({
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

    return nativeResponseJson({ success: true, user });
  } catch (error: any) {
    console.error("Error updating profile:", error);
    if (error instanceof ProfileInputError) return nativeResponseJson({error:error.message},{status:error.status});
    // Return more detailed error for validation failures
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e: any) => e.message);
      return nativeResponseJson({ error: messages.join(', ') }, { status: 400 });
    }
    return nativeResponseJson({ error: "Failed to update profile" }, { status: 500 });
  }
}
