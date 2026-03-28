import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import { UserRole } from '@/types';
import { parseISO, startOfDay, isToday } from 'date-fns';
import { getImageKit } from '@/lib/imagekit';
import { compressImageServer } from '@/lib/imageCompressionServer';
import { MEAL_TYPE_KEYS, normalizeMealType, type MealTypeKey } from '@/lib/mealConfig';
import { socketManager } from '@/lib/realtime/socket-manager';
import { logActivity } from '@/lib/utils/activityLogger';

// Map camelCase meal types to canonical UPPERCASE keys
const CAMELCASE_TO_CANONICAL: Record<string, MealTypeKey> = {
  'earlyMorning': 'EARLY_MORNING',
  'breakfast': 'BREAKFAST',
  'midMorning': 'MID_MORNING',
  'lunch': 'LUNCH',
  'midEvening': 'MID_EVENING',
  'evening': 'EVENING',
  'dinner': 'DINNER',
  'pastDinner': 'PAST_DINNER',
};

// POST /api/client/meal-plan/complete - Mark a meal as completed with image
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== UserRole.CLIENT) {
      return NextResponse.json({ error: 'Only clients can complete meals' }, { status: 403 });
    }

    await connectDB();

    // Handle both FormData and JSON requests
    const contentType = request.headers.get('content-type') || '';
    let mealId: string = '';
    let date: string = '';
    let mealType: string = '';
    let notes: string = '';
    let imageFile: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      // FormData request (with image)
      const formData = await request.formData();
      mealId = formData.get('mealId') as string || '';
      date = formData.get('date') as string || '';
      mealType = formData.get('mealType') as string || '';
      notes = formData.get('notes') as string || '';
      imageFile = formData.get('image') as File | null;
    } else {
      // JSON request (without image - for backwards compatibility)
      const body = await request.json();
      mealId = body.mealId || '';
      date = body.date || '';
      mealType = body.mealType || '';
      notes = body.notes || '';
    }

    // Parse the meal ID to extract plan ID and meal info
    // Format: planId-dayIndex-mealIndex
    const [planId] = mealId.split('-');
    const requestedDate = date ? parseISO(date) : new Date();

    // *** IMPORTANT: Only allow completion for today's date ***
    if (!isToday(requestedDate)) {
      return NextResponse.json({
        error: 'You can only mark meals as complete for today\'s plan. Past and future meals cannot be modified.'
      }, { status: 400 });
    }

    // Find the active meal plan
    const mealPlan = await ClientMealPlan.findOne({
      _id: planId,
      clientId: session.user.id,
      status: 'active'
    });

    if (!mealPlan) {
      return NextResponse.json({
        error: 'Meal plan not found or not active'
      }, { status: 404 });
    }

    // Determine meal type from mealId if not provided
    const mealIdParts = mealId.split('-');
    const mealIndex = parseInt(mealIdParts[2] || '0');

    // Normalize meal type: handle camelCase from frontend, use canonical UPPERCASE keys for DB
    let determinedMealType: MealTypeKey;
    if (mealType) {
      // Check if it's a camelCase type from frontend
      if (CAMELCASE_TO_CANONICAL[mealType]) {
        determinedMealType = CAMELCASE_TO_CANONICAL[mealType];
      } else {
        // Try to normalize using the mealConfig function
        const normalized = normalizeMealType(mealType);
        determinedMealType = normalized || MEAL_TYPE_KEYS[mealIndex % MEAL_TYPE_KEYS.length];
      }
    } else {
      // Fallback to index-based meal type
      determinedMealType = MEAL_TYPE_KEYS[mealIndex % MEAL_TYPE_KEYS.length];
    }

    // Handle image upload - save to ImageKit
    let imagePath: string | undefined;
    if (imageFile) {
      try {
        // Generate unique filename
        const timestamp = Date.now();
        const clientId = session.user.id;
        const determinedExt = 'jpg'; // Will be jpg after compression
        const filename = `${clientId}-${timestamp}-${determinedMealType}.${determinedExt}`;

        // Convert File to buffer and compress
        const bytes = await imageFile.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Skip server-side compression for already-small images to reduce latency
        // (client already compresses image before upload)
        let uploadData: string;
        if (imageFile.size <= 1.2 * 1024 * 1024) {
          uploadData = buffer.toString('base64');
        } else {
          uploadData = await compressImageServer(buffer, {
            quality: 85,
            maxWidth: 1200,
            maxHeight: 1200,
            format: 'jpeg'
          });
        }

        // Upload to ImageKit in complete-meal folder
        const ik = getImageKit();
        const uploadResponse = await ik.upload({
          file: uploadData,
          fileName: filename,
          folder: '/complete-meal',
        });

        // Store the ImageKit URL
        imagePath = uploadResponse.url;
      } catch (uploadError) {
        console.error('Error uploading meal image to ImageKit:', uploadError);
        return NextResponse.json({
          error: 'Failed to upload meal image'
        }, { status: 500 });
      }
    }

    // Check if meal is already completed for this date
    const existingCompletionIndex = mealPlan.mealCompletions?.findIndex((c: any) => {
      const completionDate = new Date(c.date);
      const targetDate = startOfDay(requestedDate);
      return startOfDay(completionDate).getTime() === targetDate.getTime() &&
        c.mealType === determinedMealType;
    }) ?? -1;

    if (existingCompletionIndex >= 0) {
      // Update existing completion
      mealPlan.mealCompletions[existingCompletionIndex].completed = true;
      mealPlan.mealCompletions[existingCompletionIndex].notes = notes || undefined;
      if (imagePath) {
        mealPlan.mealCompletions[existingCompletionIndex].imagePath = imagePath;
      }
    } else {
      // Add new completion
      if (!mealPlan.mealCompletions) {
        mealPlan.mealCompletions = [];
      }

      mealPlan.mealCompletions.push({
        date: startOfDay(requestedDate),
        mealType: determinedMealType,
        completed: true,
        notes: notes || undefined,
        imagePath: imagePath || undefined
      });
    }

    // Update analytics
    if (!mealPlan.analytics) {
      mealPlan.analytics = {};
    }

    // Calculate total days completed
    const uniqueDates = new Set(
      mealPlan.mealCompletions
        .filter((c: any) => c.completed)
        .map((c: any) => startOfDay(new Date(c.date)).toISOString())
    );
    mealPlan.analytics.totalDaysCompleted = uniqueDates.size;

    // Calculate average adherence
    const totalMeals = mealPlan.mealCompletions.length;
    const completedMeals = mealPlan.mealCompletions.filter((c: any) => c.completed).length;
    mealPlan.analytics.averageAdherence = Math.round((completedMeals / totalMeals) * 100);

    await mealPlan.save();

    // Log activity
    logActivity({
      userId: session.user.id,
      userRole: 'client',
      userName: session.user.name || session.user.email || '',
      userEmail: session.user.email || '',
      action: 'Completed Meal',
      actionType: 'complete',
      category: 'meal_plan',
      description: `Client completed ${determinedMealType.toLowerCase().replace('_', ' ')} meal.`,
      resourceId: mealPlan._id?.toString(),
      resourceType: 'ClientMealPlan',
      resourceName: mealPlan.name,
      details: { mealType: determinedMealType, date: requestedDate.toISOString(), hasImage: !!imagePath },
    }).catch(() => { });

    // Emit real-time event to notify the client (and other tabs/devices)
    try {
      socketManager.sendToUser(session.user.id, 'meal_completion_updated', {
        type: 'meal_completion_updated',
        mealPlanId: mealPlan._id,
        date: requestedDate,
        mealType: determinedMealType,
        completed: true,
        imagePath: imagePath,
        timestamp: Date.now()
      });
    } catch (sseError) {
      console.error('SSE notification error:', sseError);
      // Don't fail the request if SSE fails
    }

    return NextResponse.json({
      success: true,
      message: 'Meal marked as completed',
      completion: {
        date: requestedDate,
        mealType: determinedMealType,
        completed: true,
        imagePath: imagePath
      },
      analytics: mealPlan.analytics
    });

  } catch (error) {
    console.error('Error completing meal:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: 'Failed to complete meal'
    }, { status: 500 });
  }
}
