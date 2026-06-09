import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import LifestyleInfo from '@/lib/db/models/LifestyleInfo';
import MedicalInfo from '@/lib/db/models/MedicalInfo';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';

export const dynamic = 'force-dynamic';

function normalizeFoodPreferenceFromDietType(dietType: unknown): 'veg' | 'vegan' | 'non-veg' | '' {
  const raw = String(dietType || '').trim().toLowerCase();
  if (!raw) return '';

  if (raw === 'veg' || raw === 'vegetarian') return 'veg';
  if (raw === 'vegan') return 'vegan';
  if (raw === 'non-veg' || raw === 'non veg' || raw === 'non-vegetarian' || raw === 'non vegetarian') return 'non-veg';

  // For other diet types (keto, gluten-free, etc.) keep food preference unset
  // instead of incorrectly forcing non-veg.
  return '';
}

export async function POST(request: NextRequest) {
  try {
    // AGGRESSIVE OPTIMIZATION: Run auth + DB + parse + existing check ALL in parallel
    const bodyPromise = request.json();
    const sessionPromise = getServerSession(authOptions);
    const dbPromise = connectDB();

    const [session, , data] = await Promise.all([sessionPromise, dbPromise, bodyPromise]);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'client') {
      return NextResponse.json({ error: 'Only clients can complete onboarding' }, { status: 403 });
    }

    const userId = session.user.id;

    // FAST PATH: Use findOneAndUpdate with condition to atomically check + update
    // This is faster than separate find + update and prevents race conditions

    // Calculate BMI from height and weight
    let bmi = '';
    let bmiCategory = '';
    const weightKg = parseFloat(data.weightKg);
    const heightCm = parseFloat(data.heightCm);

    if (weightKg > 0 && heightCm > 0) {
      const heightM = heightCm / 100;
      const bmiValue = weightKg / (heightM * heightM);
      bmi = bmiValue.toFixed(1);

      // Determine BMI category
      if (bmiValue < 18.5) {
        bmiCategory = 'Underweight';
      } else if (bmiValue < 25) {
        bmiCategory = 'Normal';
      } else if (bmiValue < 30) {
        bmiCategory = 'Overweight';
      } else {
        bmiCategory = 'Obese';
      }
    }

    // Update user profile with onboarding data
    const updateData: any = {
      gender: data.gender,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      weight: weightKg || undefined,
      height: heightCm || undefined,
      bmi: bmi,
      bmiCategory: bmiCategory,
      activityLevel: data.activityLevel,
      generalGoal: data.generalGoal, // weight-loss, weight-gain, disease-management, weight-loss-disease-management
      dietType: data.dietType, // Vegetarian, Vegan, Gluten-Free, Non-Vegetarian, etc.
      allergies: data.allergies || [],
      specificExclusions: data.specificExclusions || {},
      dailyGoals: {
        calories: data.dailyGoals?.calories || 2000,
        steps: data.dailyGoals?.steps || 8000,
        water: data.dailyGoals?.water || 2500,
        targetWeight: data.targetWeightKg || undefined,
      },
      goals: {
        calories: data.dailyGoals?.calories || 2000,
        protein: Math.round((data.dailyGoals?.calories || 2000) * 0.3 / 4),
        carbs: Math.round((data.dailyGoals?.calories || 2000) * 0.4 / 4),
        fat: Math.round((data.dailyGoals?.calories || 2000) * 0.3 / 9),
        water: Math.round((data.dailyGoals?.water || 2500) / 250), // Convert ml to glasses
        steps: data.dailyGoals?.steps || 8000,
      },
      onboardingCompleted: true,
      onboardingStep: 5,
    };

    // AGGRESSIVE OPTIMIZATION: Atomic update with condition check
    // This combines the "is onboarding completed?" check with the update in ONE query
    const user = await User.findOneAndUpdate(
      { _id: userId, onboardingCompleted: { $ne: true } }, // Only update if NOT completed
      { $set: updateData },
      { new: true, lean: true } // lean: true = faster, returns plain object
    ).select('_id firstName lastName email onboardingCompleted') as unknown as { _id: string; firstName?: string; lastName?: string; email?: string; onboardingCompleted?: boolean } | null;

    // If user is null, either not found OR already onboarded
    if (!user) {
      // Check if it's because already onboarded (fast path for repeat calls)
      const exists = await User.exists({ _id: userId });
      if (exists) {
        return NextResponse.json({
          success: true,
          message: 'Onboarding already completed',
          alreadyCompleted: true,
          onboardingCompleted: true,
          user: { id: userId, onboardingCompleted: true }
        });
      }
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // BACKGROUND: Run secondary DB updates in parallel, don't wait
    // These are non-critical and can complete after response is sent
    const foodPref = normalizeFoodPreferenceFromDietType(data.dietType);

    // Fire-and-forget for secondary data
    Promise.all([
      LifestyleInfo.findOneAndUpdate(
        { userId },
        {
          $set: {
            userId,
            heightCm: data.heightCm,
            weightKg: data.weightKg,
            targetWeightKg: data.targetWeightKg,
            activityLevel: data.activityLevel,
            ...(foodPref ? { foodPreference: foodPref } : {}),
            allergiesFood: data.allergies || []
          }
        },
        { upsert: true }
      ),
      data.allergies?.length > 0
        ? MedicalInfo.findOneAndUpdate({ userId }, { $set: { userId, allergies: data.allergies } }, { upsert: true })
        : null
    ]).catch(() => { }); // Ignore errors in background tasks

    // OPTIMIZATION: Clear cache synchronously (fast operation)
    try {
      clearCacheByTag('client');
    } catch { /* ignore cache errors */ }

    // Extract user data with proper typing
    const userData = user as { _id: string; firstName?: string; lastName?: string; email?: string };

    // Log activity (fire-and-forget) - use session data for speed
    logActivity({
      userId: userId,
      userRole: 'client',
      userName: session.user.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Unknown',
      userEmail: session.user.email || userData.email || '',
      action: 'Completed Onboarding',
      actionType: 'update',
      category: 'profile',
      description: `Client completed onboarding with goal: ${data.generalGoal || 'not specified'}, diet type: ${data.dietType || 'not specified'}.`,
      details: {
        generalGoal: data.generalGoal,
        dietType: data.dietType,
        activityLevel: data.activityLevel,
        bmi: bmi,
        bmiCategory: bmiCategory,
      },
    }).catch(() => { });

    return NextResponse.json({
      success: true,
      message: 'Onboarding completed successfully',
      onboardingCompleted: true,
      requireSessionRefresh: true,
      user: {
        id: userData._id,
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        onboardingCompleted: true,
      }
    });

  } catch (error) {
    console.error('Error completing onboarding:', error);
    return NextResponse.json(
      { error: 'Failed to complete onboarding' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // CRITICAL: Always fetch fresh from database to prevent stale cached data
    // Don't use withCache here as onboarding status must be accurate
    const user = await User.findById(session.user.id)
      .select('onboardingCompleted onboardingStep')
      .lean() as { onboardingCompleted?: boolean; onboardingStep?: number } | null;

    const onboardingCompleted = user?.onboardingCompleted ?? false;
    const onboardingStep = user?.onboardingStep ?? 0;

    // Set cache-control headers to prevent browser caching
    const response = NextResponse.json({
      onboardingCompleted,
      onboardingStep,
    });

    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');

    return response;

  } catch (error) {
    console.error('Error checking onboarding status:', error);
    return NextResponse.json(
      { error: 'Failed to check onboarding status' },
      { status: 500 }
    );
  }
}
