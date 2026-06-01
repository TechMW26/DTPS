import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import Message from '@/lib/db/models/Message';
import User from '@/lib/db/models/User';
import { Notification } from '@/lib/db/models';
import { UserRole } from '@/types';
import { parseISO, startOfDay, isToday, isValid } from 'date-fns';
import { getImageKit } from '@/lib/imagekit';
import { compressImageServer } from '@/lib/imageCompressionServer';
import { MEAL_TYPE_KEYS, type MealTypeKey } from '@/lib/mealConfig';
import { socketManager } from '@/lib/realtime/socket-manager';
import { broadcastUnreadCounts, broadcastStaffUnreadCounts } from '@/lib/realtime/broadcast-counts';
import { clearCacheByTag } from '@/lib/api/utils';
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

const normalizeTypeForCompare = (type: string | undefined | null): string =>
  (type || '').toLowerCase().replace(/[\s_-]+/g, '');

function resolveBuiltInMealTypeKey(input: string): MealTypeKey | null {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const canonicalCandidate = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (MEAL_TYPE_KEYS.includes(canonicalCandidate as MealTypeKey)) {
    return canonicalCandidate as MealTypeKey;
  }

  if (CAMELCASE_TO_CANONICAL[raw]) {
    return CAMELCASE_TO_CANONICAL[raw];
  }

  // Legacy compatibility only; do not coerce arbitrary custom names.
  const legacyMap: Record<string, MealTypeKey> = {
    morningSnack: 'MID_MORNING',
    afternoonSnack: 'MID_EVENING',
    eveningSnack: 'EVENING',
  };

  return legacyMap[raw] || null;
}

const toSafeMealTypeFileSegment = (value: string): string =>
  String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase() || 'MEAL';

type MealCompletionSideEffectArgs = {
  clientId: string;
  mealPlanId: string;
  mealPlanName: string;
  mealType: MealTypeKey;
  mealTypeLabel?: string;
  requestedDate: Date;
  notes: string;
  imagePath?: string;
  imageFile?: File | null;
  primaryDietitianId?: string | null;
  userName: string;
  userEmail: string;
};

function queueMealCompletionSideEffects(args: MealCompletionSideEffectArgs): void {
  setImmediate(() => {
    void (async () => {
      try {
        const {
          clientId,
          mealPlanId,
          mealPlanName,
          mealType,
          mealTypeLabel,
          requestedDate,
          notes,
          imagePath,
          imageFile,
          primaryDietitianId,
          userName,
          userEmail,
        } = args;

        let resolvedDietitianId = primaryDietitianId;
        if (imagePath && !resolvedDietitianId) {
          const currentUser = await User.findById(clientId)
            .select('assignedDietitian')
            .lean();
          resolvedDietitianId = (currentUser as any)?.assignedDietitian?.toString() || null;
        }

        if (imagePath && resolvedDietitianId) {
          const mealLabel = mealTypeLabel?.trim() || mealType
            .toLowerCase()
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
          const noteText = notes.trim();
          const chatContent = noteText
            ? `Meal Picture • ${mealLabel}\n${noteText}`
            : `Meal Picture • ${mealLabel}`;

          const mealPictureMessage = new Message({
            sender: clientId,
            receiver: resolvedDietitianId,
            content: chatContent,
            type: 'image',
            attachments: [{
              url: imagePath,
              filename: imageFile?.name || `meal-picture-${Date.now()}.jpg`,
              size: Math.max(imageFile?.size || 0, 1),
              mimeType: imageFile?.type || 'image/jpeg'
            }],
            status: 'sent',
            isRead: false
          });

          await mealPictureMessage.save();
          clearCacheByTag('messages');
          await mealPictureMessage.populate('sender', 'firstName lastName avatar role');
          await mealPictureMessage.populate('receiver', 'firstName lastName avatar role');

          const msgJson = mealPictureMessage.toJSON();
          const ts = Date.now();

          socketManager.sendToUser(resolvedDietitianId, 'new_message', {
            message: msgJson,
            conversationWith: clientId,
            timestamp: ts
          });

          socketManager.sendToUser(clientId, 'new_message', {
            message: msgJson,
            conversationWith: resolvedDietitianId,
            timestamp: ts
          });

          const [clientNotificationCount, clientMessageCount, staffMessageCount] = await Promise.all([
            Notification.countDocuments({ userId: clientId, read: false }),
            Message.countDocuments({ receiver: clientId, isRead: false }),
            Message.countDocuments({ receiver: resolvedDietitianId, isRead: false })
          ]);

          broadcastUnreadCounts(clientId, {
            notifications: clientNotificationCount,
            messages: clientMessageCount
          });

          broadcastStaffUnreadCounts(resolvedDietitianId, {
            messages: staffMessageCount
          });
        }

        logActivity({
          userId: clientId,
          userRole: 'client',
          userName,
          userEmail,
          action: 'Completed Meal',
          actionType: 'complete',
          category: 'meal_plan',
          description: `Client completed ${mealType.toLowerCase().replace('_', ' ')} meal.`,
          resourceId: mealPlanId,
          resourceType: 'ClientMealPlan',
          resourceName: mealPlanName,
          details: { mealType, mealTypeLabel, date: requestedDate.toISOString(), hasImage: !!imagePath },
        }).catch(() => { });

        try {
          socketManager.sendToUser(clientId, 'meal_completion_updated', {
            type: 'meal_completion_updated',
            mealPlanId,
            date: requestedDate,
            mealType,
            completed: true,
            imagePath: imagePath,
            timestamp: Date.now()
          });
        } catch (sseError) {
          console.error('SSE notification error:', sseError);
        }
      } catch (error) {
        console.error('Error in meal completion side effects:', error);
      }
    })();
  });
}

// POST /api/client/meal-plan/complete - Mark a meal as completed with image
export async function POST(request: NextRequest) {
  try {
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB()
    ]);
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

    if (!isValid(requestedDate)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }

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
    })
      .select('mealCompletions analytics name')
      .lean() as any;

    if (!mealPlan) {
      return NextResponse.json({
        error: 'Meal plan not found or not active'
      }, { status: 404 });
    }

    // Determine meal type from mealId if not provided
    const mealIdParts = mealId.split('-');
    const mealIndex = parseInt(mealIdParts[2] || '0');

    const requestedMealTypeRaw = String(mealType || '').trim();
    const builtInRequestedType = requestedMealTypeRaw
      ? resolveBuiltInMealTypeKey(requestedMealTypeRaw)
      : null;

    // Normalize meal type: handle camelCase from frontend, use canonical UPPERCASE keys for DB
    let determinedMealType: MealTypeKey;
    if (requestedMealTypeRaw) {
      determinedMealType = builtInRequestedType || MEAL_TYPE_KEYS[mealIndex % MEAL_TYPE_KEYS.length];
    } else {
      // Fallback to index-based meal type
      determinedMealType = MEAL_TYPE_KEYS[mealIndex % MEAL_TYPE_KEYS.length];
    }

    const isCustomMealType = Boolean(requestedMealTypeRaw) && !builtInRequestedType;

    const mealCompletions = Array.isArray(mealPlan.mealCompletions)
      ? [...mealPlan.mealCompletions]
      : [];

    // Handle image upload - save to ImageKit
    let imagePath: string | undefined;
    if (imageFile) {
      try {
        // Generate unique filename
        const timestamp = Date.now();
        const clientId = session.user.id;
        const determinedExt = 'jpg'; // Will be jpg after compression
        const fileMealTypeSegment = isCustomMealType
          ? toSafeMealTypeFileSegment(requestedMealTypeRaw)
          : determinedMealType;
        const filename = `${clientId}-${timestamp}-${fileMealTypeSegment}.${determinedExt}`;

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
    const requestedCanonicalKey = normalizeTypeForCompare(determinedMealType);
    const requestedOriginalKey = normalizeTypeForCompare(requestedMealTypeRaw);

    const existingCompletionIndex = mealCompletions.findIndex((c: any) => {
      const completionDate = new Date(c.date);
      const targetDate = startOfDay(requestedDate);
      if (startOfDay(completionDate).getTime() !== targetDate.getTime()) {
        return false;
      }

      const completionCanonicalKey = normalizeTypeForCompare(c.mealType);
      const completionOriginalKey = normalizeTypeForCompare(c.mealTypeOriginal);

      if (isCustomMealType && requestedOriginalKey) {
        if (completionOriginalKey && completionOriginalKey === requestedOriginalKey) {
          return true;
        }
      }

      return completionCanonicalKey === requestedCanonicalKey;
    });

    if (existingCompletionIndex >= 0) {
      // Update existing completion
      mealCompletions[existingCompletionIndex].completed = true;
      mealCompletions[existingCompletionIndex].notes = notes || undefined;
      mealCompletions[existingCompletionIndex].mealTypeOriginal = isCustomMealType ? requestedMealTypeRaw : undefined;
      if (imagePath) {
        mealCompletions[existingCompletionIndex].imagePath = imagePath;
      }
    } else {
      // Add new completion
      mealCompletions.push({
        date: startOfDay(requestedDate),
        mealType: determinedMealType,
        mealTypeOriginal: isCustomMealType ? requestedMealTypeRaw : undefined,
        completed: true,
        notes: notes || undefined,
        imagePath: imagePath || undefined
      });
    }

    // Update analytics
    const analytics = { ...(mealPlan.analytics || {}) };

    // Calculate total days completed
    const uniqueDates = new Set(
      mealCompletions
        .filter((c: any) => c.completed)
        .map((c: any) => startOfDay(new Date(c.date)).toISOString())
    );
    analytics.totalDaysCompleted = uniqueDates.size;

    // Calculate average adherence
    const totalMeals = mealCompletions.length;
    const completedMeals = mealCompletions.filter((c: any) => c.completed).length;
    analytics.averageAdherence = totalMeals > 0 ? Math.round((completedMeals / totalMeals) * 100) : 0;

    await ClientMealPlan.updateOne(
      { _id: mealPlan._id, clientId: session.user.id, status: 'active' },
      {
        $set: {
          mealCompletions,
          analytics
        }
      }
    );

    clearCacheByTag('dietitian_panel');
    clearCacheByTag('client');

    queueMealCompletionSideEffects({
      clientId: session.user.id,
      mealPlanId: mealPlan._id?.toString(),
      mealPlanName: mealPlan.name,
      mealType: determinedMealType,
      mealTypeLabel: requestedMealTypeRaw || undefined,
      requestedDate,
      notes,
      imagePath,
      imageFile,
      primaryDietitianId: null,
      userName: session.user.name || session.user.email || '',
      userEmail: session.user.email || '',
    });

    return NextResponse.json({
      success: true,
      message: 'Meal marked as completed',
      completion: {
        date: requestedDate,
        mealType: determinedMealType,
        mealTypeOriginal: isCustomMealType ? requestedMealTypeRaw : undefined,
        completed: true,
        imagePath: imagePath
      },
      analytics
    });

  } catch (error) {
    console.error('Error completing meal:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: 'Failed to complete meal'
    }, { status: 500 });
  }
}
