import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import JournalTracking from '@/lib/db/models/JournalTracking';
import User from '@/lib/db/models/User';
import LifestyleInfo from '@/lib/db/models/LifestyleInfo';
import ProgressEntry from '@/lib/db/models/ProgressEntry';
import { format } from 'date-fns';
import { UserRole } from '@/types';
import mongoose from 'mongoose';
import { logHistoryServer } from '@/lib/server/history';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { emitClientWeightUpdate } from '@/lib/realtime/weight-notify';

interface ClientProfileData {
  heightFeet?: string | number;
  heightInch?: string | number;
  heightCm?: string | number;
  weightKg?: string | number;
  weight?: number;
  gender?: string;
  dateOfBirth?: string | Date;
  activityLevel?: string;
}

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
  const [userDocument, lifestyleDocument] = await Promise.all([
    User.findById(clientObjectId).select('heightFeet heightInch heightCm weightKg weight gender dateOfBirth activityLevel').lean(),
    LifestyleInfo.findOne({ userId: clientObjectId }).select('heightFeet heightInch heightCm weightKg activityLevel').lean()
  ]);
  const user = userDocument as unknown as ClientProfileData | null;
  const lifestyle = lifestyleDocument as unknown as ClientProfileData | null;

  // Merge: prefer LifestyleInfo for measurements, User for demographics
  const heightFeet = lifestyle?.heightFeet || user?.heightFeet || '0';
  const heightInch = lifestyle?.heightInch || user?.heightInch || '0';
  const heightCm = lifestyle?.heightCm ? parseFloat(String(lifestyle.heightCm)) : (user?.heightCm ? parseFloat(String(user.heightCm)) : feetInchToCm(heightFeet, heightInch));
  const weightKg = lifestyle?.weightKg ? parseFloat(String(lifestyle.weightKg)) : (user?.weightKg ? parseFloat(String(user.weightKg)) : (user?.weight || 0));
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

    if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
      return NextResponse.json({ error: 'Invalid client ID' }, { status: 400 });
    }

    // Convert clientId to ObjectId
    const clientObjectId = new mongoose.Types.ObjectId(clientId);

    // Fetch client profile, journal entries, and weight tracker entries in parallel
    const [allJournals, clientProfile, weightEntries] = await Promise.all([
      withCache(
        `journal:progress:all:${clientId}`,
        async () => await JournalTracking.find({
          client: clientObjectId,
          'progress.0': { $exists: true }
        }).sort({ date: -1 }),
        { ttl: 120000, tags: ['journal'] }
      ),
      getClientProfile(clientObjectId),
      // Fetch weight entries from Weight Tracker (ProgressEntry model)
      ProgressEntry.find({
        user: clientObjectId,
        type: 'weight'
      }).sort({ recordedAt: -1 }).lean()
    ]);

    // Pre-compute profile-based metrics for seeding
    const profileWeight = clientProfile.weightKg;
    const profileBmi = calcBMI(profileWeight, clientProfile.heightCm);
    const profileBmr = calcBMR(profileWeight, clientProfile.heightCm, clientProfile.age, clientProfile.gender);

    // Flatten all journal progress entries with their dates
    const allProgress: any[] = [];
    allJournals.forEach(journal => {
      journal.progress.forEach((entry: any) => {
        allProgress.push({
          ...entry.toObject(),
          journalDate: journal.date,
          source: 'journal'
        });
      });
    });

    // Build weight history rows from Weight Tracker (ProgressEntry model)
    const weightHistoryRows = weightEntries
      .filter((entry: any) => entry?.metadata?.source !== 'progress_form')
      .map((entry: any) => {
        const wt = Number(entry?.value);
        if (!Number.isFinite(wt) || wt <= 0) return null;

        return {
          _id: `wt_${String(entry?._id || '')}`,
          source: 'weight_tracker',
          date: entry.recordedAt,
          createdAt: entry.createdAt || entry.recordedAt, // Use createdAt for sorting tiebreaker
          weight: wt,
          bmi: calcBMI(wt, clientProfile.heightCm),
          bmr: calcBMR(wt, clientProfile.heightCm, clientProfile.age, clientProfile.gender),
          bodyFat: 0,
          dietPlan: '',
          notes: 'Weight Tracker'
        };
      })
      .filter(Boolean) as any[];

    // Merge journal + weight tracker entries for unified history table
    const mergedProgress = [...allProgress, ...weightHistoryRows];

    // Sort by date descending (latest first), using createdAt as tiebreaker for same timestamps
    mergedProgress.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateB !== dateA) return dateB - dateA;
      // If dates are equal, use createdAt as tiebreaker (newest first)
      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : dateA;
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : dateB;
      return createdB - createdA;
    });

    // Get first and current weight from Weight Tracker (ProgressEntry) as primary source
    // Sort by recordedAt timestamp (not just date) to get correct order for same-day entries
    const sortedWeightEntriesAsc = [...weightEntries].sort(
      (a: any, b: any) => {
        const timeA = new Date(a.recordedAt).getTime();
        const timeB = new Date(b.recordedAt).getTime();
        if (timeA !== timeB) return timeA - timeB;
        // Tiebreaker: use createdAt
        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : timeA;
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : timeB;
        return createdA - createdB;
      }
    );

    // Sort weight entries descending (most recent first) for current weight
    const sortedWeightEntriesDesc = [...weightEntries].sort(
      (a: any, b: any) => {
        const timeA = new Date(a.recordedAt).getTime();
        const timeB = new Date(b.recordedAt).getTime();
        if (timeB !== timeA) return timeB - timeA;
        // Tiebreaker: use createdAt
        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : timeA;
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : timeB;
        return createdB - createdA;
      }
    );

    const currentWeightEntry = sortedWeightEntriesDesc.length > 0 ? sortedWeightEntriesDesc[0] : null;

    // Calculate started with - ALWAYS use profile baseline (Basic Info weight) as primary source
    // This is the "first weight" that dietitian sets in Basic Info form
    const sortedByDateAsc = [...allProgress].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // First weight from profile (Basic Info) as primary source - this is the editable baseline
    const firstWeight = profileWeight > 0 ? profileWeight :
      (sortedWeightEntriesAsc.length > 0 ? Number(sortedWeightEntriesAsc[0].value) :
        (sortedByDateAsc.length > 0 ? sortedByDateAsc[0].weight : 0));

    const startedWith = {
      weight: firstWeight,
      bmr: calcBMR(firstWeight, clientProfile.heightCm, clientProfile.age, clientProfile.gender),
      bmi: calcBMI(firstWeight, clientProfile.heightCm),
      bodyFat: sortedByDateAsc.length > 0 ? sortedByDateAsc[0].bodyFat : 0
    };

    // Current weight from weight tracker (most recent) or journal progress or profile
    const currentWeight = currentWeightEntry
      ? Number(currentWeightEntry.value)
      : (allProgress.length > 0 ? allProgress[0].weight : profileWeight);

    const currentlyAt = {
      weight: currentWeight,
      bmr: currentWeightEntry
        ? calcBMR(currentWeight, clientProfile.heightCm, clientProfile.age, clientProfile.gender)
        : (allProgress.length > 0 ? allProgress[0].bmr : calcBMR(currentWeight, clientProfile.heightCm, clientProfile.age, clientProfile.gender)),
      bmi: currentWeightEntry
        ? calcBMI(currentWeight, clientProfile.heightCm)
        : (allProgress.length > 0 ? allProgress[0].bmi : calcBMI(currentWeight, clientProfile.heightCm)),
      bodyFat: currentWeightEntry ? 0 : (allProgress.length > 0 ? allProgress[0].bodyFat : 0)
    };

    const difference = {
      weight: parseFloat((currentlyAt.weight - startedWith.weight).toFixed(2)),
      bmr: parseFloat((currentlyAt.bmr - startedWith.bmr).toFixed(0)),
      bmi: parseFloat((currentlyAt.bmi - startedWith.bmi).toFixed(1)),
      bodyFat: parseFloat((currentlyAt.bodyFat - startedWith.bodyFat).toFixed(1))
    };

    return NextResponse.json({
      success: true,
      progress: mergedProgress,
      summary: {
        startedWith,
        currentlyAt,
        difference,
        totalEntries: mergedProgress.length,
        weightTrackerEntries: weightEntries.length
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

    // Use current timestamp for entries added today, otherwise use the provided date at noon
    const now = new Date();
    const inputDate = date ? new Date(date) : new Date();
    const isToday = inputDate.toDateString() === now.toDateString();

    // For today's entries, use current time. For past dates, use noon to avoid timezone issues.
    const progressDate = isToday ? now : new Date(inputDate.setHours(12, 0, 0, 0));

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

    // Also add to ProgressEntry (Weight Tracker) if weight was provided
    // This ensures it shows up in "Currently At" section and client-side weight tracker
    if (finalWeight > 0) {
      try {
        await ProgressEntry.create({
          user: clientObjectId,
          type: 'weight',
          value: finalWeight,
          unit: 'kg',
          notes: notes || 'Added via Progress Form',
          recordedAt: progressDate,
          metadata: {
            bmi: finalBmi || 0,
            bmr: finalBmr || 0,
            bodyFat: bodyFat || 0,
            source: 'progress_form',
            addedBy: session.user.id
          }
        });

        // Clear cache to ensure fresh data
        clearCacheByTag('journal');
        clearCacheByTag(`client-profile:${userId}`);
        clearCacheByTag('weight');

        // Emit real-time weight update to both client and staff dashboards
        await emitClientWeightUpdate({
          clientId: userId,
          weightKg: finalWeight,
          bmi: finalBmi,
          source: 'staff_update'
        });
      } catch (weightError) {
        console.error('Error adding weight to ProgressEntry:', weightError);
        // Don't fail the request, just log the error
      }
    }

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

    // Check if this is a weight tracker entry (ID starts with 'wt_')
    if (entryId.startsWith('wt_')) {
      // Extract the actual ProgressEntry ID
      const progressEntryId = entryId.replace('wt_', '');

      // Delete from ProgressEntry model
      const deleted = await ProgressEntry.findOneAndDelete({
        _id: progressEntryId,
        user: clientObjectId
      });

      if (!deleted) {
        return NextResponse.json({ error: 'Progress entry not found' }, { status: 404 });
      }

      // Clear caches
      clearCacheByTag('journal');
      clearCacheByTag(`client-profile:${clientId}`);
      clearCacheByTag('weight');

      return NextResponse.json({
        success: true,
        message: 'Weight entry deleted'
      });
    }

    // Otherwise, delete from JournalTracking.progress
    const sourceJournal = await JournalTracking.findOne(
      { client: clientObjectId, 'progress._id': entryId },
      { progress: 1 }
    ).lean() as any;

    const sourceProgress = sourceJournal?.progress?.find((p: any) => String(p?._id) === String(entryId));

    const journal = await JournalTracking.findOneAndUpdate(
      { client: clientObjectId, 'progress._id': entryId },
      { $pull: { progress: { _id: entryId } } },
      { new: true }
    );

    if (!journal) {
      return NextResponse.json({ error: 'Progress entry not found' }, { status: 404 });
    }

    // Also delete the corresponding mirrored ProgressEntry (created from progress form)
    try {
      if (sourceProgress) {
        const sourceDate = new Date(sourceProgress.date || sourceProgress.createdAt || new Date());
        const startWindow = new Date(sourceDate.getTime() - 60_000);
        const endWindow = new Date(sourceDate.getTime() + 60_000);
        await ProgressEntry.deleteOne({
          user: clientObjectId,
          type: 'weight',
          value: Number(sourceProgress.weight || 0),
          'metadata.source': 'progress_form',
          recordedAt: { $gte: startWindow, $lte: endWindow }
        });
      }
    } catch (err) {
      // Ignore errors - this is just cleanup
    }

    // Clear caches
    clearCacheByTag('journal');
    clearCacheByTag(`client-profile:${clientId}`);

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
