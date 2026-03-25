import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import JournalTracking from '@/lib/db/models/JournalTracking';
import User from '@/lib/db/models/User';
import LifestyleInfo from '@/lib/db/models/LifestyleInfo';
import { format } from 'date-fns';
import { UserRole } from '@/types';
import mongoose from 'mongoose';
import { logHistoryServer } from '@/lib/server/history';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// BMI calculation: weight(kg) / (height(m))^2
function calcBMI(weightKg: number, heightCm: number): number {
  if (heightCm <= 0 || weightKg <= 0) return 0;
  const hm = heightCm / 100;
  return parseFloat((weightKg / (hm * hm)).toFixed(1));
}

// BMR calculation (Mifflin-St Jeor): 
//   Male:   10*weight + 6.25*heightCm - 5*age + 5
//   Female: 10*weight + 6.25*heightCm - 5*age - 161
function calcBMR(weightKg: number, heightCm: number, age: number, gender: string): number {
  if (heightCm <= 0 || weightKg <= 0 || age <= 0) return 0;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return parseFloat((gender === 'female' ? base - 161 : base + 5).toFixed(0));
}

// Convert feet/inches to cm
function feetInchToCm(feet: string | number, inches: string | number): number {
  const f = parseFloat(String(feet)) || 0;
  const i = parseFloat(String(inches)) || 0;
  return (f * 12 + i) * 2.54;
}

// Get age from DOB
function getAge(dob: Date | string | null): number {
  if (!dob) return 0;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age > 0 ? age : 0;
}

// Fetch client profile data (height, gender, age, starting weight)
async function getClientProfile(clientObjectId: mongoose.Types.ObjectId) {
  const [user, lifestyle] = await Promise.all([
    User.findById(clientObjectId).select('heightFeet heightInch heightCm weightKg weight gender dateOfBirth activityLevel').lean(),
    LifestyleInfo.findOne({ userId: clientObjectId }).select('heightFeet heightInch heightCm weightKg activityLevel').lean()
  ]);

  // Merge: prefer LifestyleInfo for measurements, User for demographics
  const heightFeet = lifestyle?.heightFeet || user?.heightFeet || '0';
  const heightInch = lifestyle?.heightInch || user?.heightInch || '0';
  const heightCm = lifestyle?.heightCm ? parseFloat(lifestyle.heightCm) : (user?.heightCm ? parseFloat(user.heightCm as string) : feetInchToCm(heightFeet, heightInch));
  const weightKg = lifestyle?.weightKg ? parseFloat(lifestyle.weightKg) : (user?.weightKg ? parseFloat(user.weightKg as string) : (user?.weight || 0));
  const gender = user?.gender || '';
  const age = getAge(user?.dateOfBirth || null);
  const activityLevel = lifestyle?.activityLevel || user?.activityLevel || '';

  return { heightCm, weightKg, gender, age, activityLevel, heightFeet, heightInch };
}

// Helper to check if user has permission to access client data
const checkPermission = (session: any, clientId?: string): boolean => {
  const userRole = session?.user?.role;
  const allowedRoles = [UserRole.ADMIN, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR, 'health_counselor', 'admin', 'dietitian'];
  if (allowedRoles.includes(userRole)) {
    return true;
  }
  if (userRole === UserRole.CLIENT || userRole === 'client') {
    return !clientId || clientId === session?.user?.id;
  }
  return false;
};

// GET /api/journal/progress - Get all progress entries for a client
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get user ID - handle different possible locations
    const userId = session.user.id || (session.user as any).sub || (session as any).sub;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId') || session.user.id;
    const dateParam = searchParams.get('date');

    if (!checkPermission(session, clientId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await connectDB();

    // Convert clientId to ObjectId
    const clientObjectId = new mongoose.Types.ObjectId(clientId);

    // Fetch client profile and journal entries in parallel
    const [allJournals, clientProfile] = await Promise.all([
      withCache(
        `journal:progress:all:${clientId}`,
        async () => await JournalTracking.find({
          client: clientObjectId,
          'progress.0': { $exists: true }
        }).sort({ date: -1 }),
        { ttl: 120000, tags: ['journal'] }
      ),
      getClientProfile(clientObjectId)
    ]);

    // Pre-compute profile-based metrics for seeding
    const profileWeight = clientProfile.weightKg;
    const profileBmi = calcBMI(profileWeight, clientProfile.heightCm);
    const profileBmr = calcBMR(profileWeight, clientProfile.heightCm, clientProfile.age, clientProfile.gender);

    // Flatten all progress entries with their dates
    const allProgress: any[] = [];
    allJournals.forEach(journal => {
      journal.progress.forEach((entry: any) => {
        allProgress.push({
          ...entry.toObject(),
          journalDate: journal.date
        });
      });
    });

    // Sort by date descending
    allProgress.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Calculate started with (first entry) and currently at (latest entry)
    // If no entries exist, use client profile data as starting point
    const sortedByDateAsc = [...allProgress].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const startedWith = sortedByDateAsc.length > 0 ? {
      weight: sortedByDateAsc[0].weight,
      bmr: sortedByDateAsc[0].bmr,
      bmi: sortedByDateAsc[0].bmi,
      bodyFat: sortedByDateAsc[0].bodyFat
    } : {
      weight: profileWeight,
      bmr: profileBmr,
      bmi: profileBmi,
      bodyFat: 0
    };

    const currentlyAt = allProgress.length > 0 ? {
      weight: allProgress[0].weight,
      bmr: allProgress[0].bmr,
      bmi: allProgress[0].bmi,
      bodyFat: allProgress[0].bodyFat
    } : {
      weight: profileWeight,
      bmr: profileBmr,
      bmi: profileBmi,
      bodyFat: 0
    };

    const difference = {
      weight: currentlyAt.weight - startedWith.weight,
      bmr: currentlyAt.bmr - startedWith.bmr,
      bmi: currentlyAt.bmi - startedWith.bmi,
      bodyFat: currentlyAt.bodyFat - startedWith.bodyFat
    };

    return NextResponse.json({
      success: true,
      progress: allProgress,
      summary: {
        startedWith,
        currentlyAt,
        difference,
        totalEntries: allProgress.length
      },
      clientProfile: {
        heightCm: clientProfile.heightCm,
        weightKg: clientProfile.weightKg,
        gender: clientProfile.gender,
        age: clientProfile.age,
        activityLevel: clientProfile.activityLevel
      }
    });

  } catch (error) {
    console.error('Error fetching progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch progress' },
      { status: 500 }
    );
  }
}

// POST /api/journal/progress - Add new progress entry
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { weight, bmi, bmr, bodyFat, dietPlan, notes, date, clientId } = body;
    const userId = clientId || session.user.id;

    if (!checkPermission(session, userId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await connectDB();

    const progressDate = date ? new Date(date) : new Date();
    progressDate.setHours(0, 0, 0, 0);

    // Convert userId to ObjectId
    const clientObjectId = new mongoose.Types.ObjectId(userId);

    // Auto-calculate BMI and BMR if weight provided but they aren't
    let finalBmi = bmi || 0;
    let finalBmr = bmr || 0;
    const finalWeight = weight || 0;

    if (finalWeight > 0 && (!finalBmi || !finalBmr)) {
      const profile = await getClientProfile(clientObjectId);
      if (profile.heightCm > 0) {
        if (!finalBmi) finalBmi = calcBMI(finalWeight, profile.heightCm);
        if (!finalBmr) finalBmr = calcBMR(finalWeight, profile.heightCm, profile.age, profile.gender);
      }
    }

    // Find or create journal entry for this date
    let journal = await JournalTracking.findOne({
      client: clientObjectId,
      date: progressDate
    });

    if (!journal) {
      journal = new JournalTracking({
        client: clientObjectId,
        date: progressDate,
        activities: [],
        steps: [],
        water: [],
        sleep: [],
        meals: [],
        progress: [],
        bca: [],
        measurements: []
      });
    } else {
      // Ensure arrays exist on existing documents
      if (!journal.progress) journal.progress = [];
      if (!journal.bca) journal.bca = [];
      if (!journal.measurements) journal.measurements = [];
    }

    // Add new progress entry
    const newProgress = {
      weight: finalWeight,
      bmi: finalBmi,
      bmr: finalBmr,
      bodyFat: bodyFat || 0,
      dietPlan: dietPlan || '',
      notes: notes || '',
      date: progressDate,
      createdAt: new Date()
    };

    journal.progress.push(newProgress);
    await journal.save();

    // Log history for progress entry
    await logHistoryServer({
      userId: userId,
      action: 'create',
      category: 'journal',
      description: `Progress logged: Weight ${finalWeight || 0}kg, BMI ${finalBmi || 0}`,
      performedById: session.user.id,
      metadata: {
        entryType: 'progress',
        weight: finalWeight || 0,
        bmi: finalBmi || 0,
        bmr: finalBmr || 0,
        bodyFat: bodyFat || 0,
        date: format(progressDate, 'yyyy-MM-dd')
      }
    });

    return NextResponse.json({
      success: true,
      progress: journal.progress[journal.progress.length - 1]
    });

  } catch (error: any) {
    console.error('Error adding progress:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to add progress', details: error?.message },
      { status: 500 }
    );
  }
}

// DELETE /api/journal/progress - Delete progress entry
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get('entryId');
    const clientId = searchParams.get('clientId') || session.user.id;

    if (!checkPermission(session, clientId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!entryId) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    await connectDB();

    // Convert clientId to ObjectId
    const clientObjectId = new mongoose.Types.ObjectId(clientId);

    const journal = await JournalTracking.findOneAndUpdate(
      { client: clientObjectId, 'progress._id': entryId },
      { $pull: { progress: { _id: entryId } } },
      { new: true }
    );

    if (!journal) {
      return NextResponse.json({ error: 'Progress entry not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Progress entry deleted'
    });

  } catch (error) {
    console.error('Error deleting progress:', error);
    return NextResponse.json(
      { error: 'Failed to delete progress' },
      { status: 500 }
    );
  }
}
