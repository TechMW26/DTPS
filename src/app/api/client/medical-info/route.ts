import {nativeResponseJson} from '@/lib/api/native-response';
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {readNativeClientForm,writeNativeClientForm,listNativeRecalls} from '@/lib/db/repository/native-client-forms';
import {ZodError} from 'zod';
import { clearCacheByTag } from '@/lib/cache/memoryCache';
import { logActivity } from '@/lib/utils/activityLogger';
import { notifyClientDataUpdate } from '@/lib/notifications/staffPushService';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
    }



    // Fetch directly from DB — never cache /api/client/** (multi-process safe)
    const [user, medicalInfo] = await Promise.all([
      getNativeDatabase().collection('users').doc(session.user.id).get().then(doc=>doc.data()),
      readNativeClientForm(getNativeDatabase(),'medicalinfos',session.user.id),
    ]);

    const gender = (user as any)?.gender || '';

    if (!medicalInfo) {
      return nativeResponseJson({
        gender: gender,
        medicalConditions: [],
        allergies: [],
        dietaryRestrictions: [],
        bloodGroup: "",
        gutIssues: [],
        isPregnant: false,
        isLactating: false,
        menstrualCycle: "",
        bloodFlow: "",
        diseaseHistory: [],
        reports: [],
        medicalHistory: "",
        familyHistory: "",
        medication: "",
        notes: ""
      });
    }

    return nativeResponseJson({
      ...(medicalInfo as any),
      gender: gender
    });
  } catch (error) {
    console.error("Error fetching medical info:", error);
    return nativeResponseJson({ error: "Failed to fetch medical info" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
    }


    const data = await request.json();

    const medicalInfo=await writeNativeClientForm(getNativeDatabase(),'medicalinfos',session.user.id,data);

    // Clear caches so profile/medical pages show updated data immediately
    clearCacheByTag('client');
    clearCacheByTag(`client:medical-info:${session.user.id}`);
    clearCacheByTag('dietitian_panel');

    // Log activity
    await logActivity({
      userId: session.user.id,
      userRole: 'client',
      userName: session.user.name || '',
      userEmail: session.user.email || '',
      action: 'update_medical_info',
      actionType: 'update',
      category: 'fitness',
      description: 'Updated own medical information',
      targetUserId: session.user.id,
      targetUserName: session.user.name || '',
      details: {
        hasConditions: (data.medicalConditions?.length || 0) > 0,
        hasAllergies: (data.allergies?.length || 0) > 0,
        bloodGroup: data.bloodGroup || 'not set'
      }
    }).catch(console.error);

    try {
      await notifyClientDataUpdate({
        clientId: session.user.id,
        updateType: 'medical_information',
        eventKey: `medical:${Date.now()}`,
      });
    } catch (notificationError) {
      console.error('Error sending medical-info update notification:', notificationError);
    }

    return nativeResponseJson({ success: true, data: medicalInfo });
  } catch (error: any) {
    console.error("Error saving medical info:", error);
    // Return more detailed error for validation failures
    if(error instanceof ZodError)return nativeResponseJson({error:'Invalid medical information',details:error.issues},{status:400});
    return nativeResponseJson({ error: "Failed to save medical info" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  return POST(request);
}
