import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import JournalTracking from '@/lib/db/models/JournalTracking';
import User from '@/lib/db/models/User';
import LifestyleInfo from '@/lib/db/models/LifestyleInfo';
import { UserRole } from '@/types';
import mongoose from 'mongoose';
import { logHistoryServer } from '@/lib/server/history';
import { format } from 'date-fns';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

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

// GET /api/journal/bca - Get all BCA entries for a client
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId') || session.user.id;
    const dateParam = searchParams.get('date');

    if (!checkPermission(session, clientId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await connectDB();

    // Convert clientId to ObjectId
    const clientObjectId = new mongoose.Types.ObjectId(clientId);

    // Always fetch all BCA entries for summary/trend (ignore dateParam for summary)
    const query: any = {
      client: clientObjectId,
      'bca.0': { $exists: true }
    };

    // Get all journal entries for this client with BCA data
    const journals = await withCache(
      `journal:bca:all:${clientId}`,
      async () => await JournalTracking.find(query).sort({ date: -1 }),
      { ttl: 120000, tags: ['journal'] }
    );

    // Flatten all BCA entries with their dates
    const allBCA: any[] = [];
    journals.forEach(journal => {
      journal.bca.forEach((entry: any) => {
        allBCA.push({
          ...entry.toObject(),
          journalDate: journal.date
        });
      });
    });

    // Sort by measurementDate descending
    allBCA.sort((a, b) => new Date(b.measurementDate).getTime() - new Date(a.measurementDate).getTime());

    return NextResponse.json({
      success: true,
      bca: allBCA,
      latestEntry: allBCA.length > 0 ? allBCA[0] : null,
      totalEntries: allBCA.length
    });

  } catch (error) {
    console.error('Error fetching BCA:', error);
    return NextResponse.json(
      { error: 'Failed to fetch BCA data' },
      { status: 500 }
    );
  }
}

// POST /api/journal/bca - Add new BCA entry
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clientId, ...bcaData } = body;
    const userId = clientId || session.user.id;

    if (!checkPermission(session, userId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await connectDB();

    const measurementDate = bcaData.measurementDate ? new Date(bcaData.measurementDate) : new Date();
    measurementDate.setHours(0, 0, 0, 0);

    // Convert userId to ObjectId
    const clientObjectId = new mongoose.Types.ObjectId(userId);

    // Find or create journal entry for this date
    let journal = await JournalTracking.findOne({
      client: clientObjectId,
      date: measurementDate
    });

    if (!journal) {
      journal = new JournalTracking({
        client: clientObjectId,
        date: measurementDate,
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

    // Calculate BMI if height and weight provided
    let calculatedBMI = bcaData.bmi || 0;
    let bcaHeight = bcaData.height || 0; // height in inches for BCA
    let restingMetabolism = bcaData.restingMetabolism || 0;

    // If height not provided in BCA, fetch from client profile
    if (!bcaHeight && bcaData.weight) {
      const [user, lifestyle] = await Promise.all([
        User.findById(clientObjectId).select('heightFeet heightInch heightCm gender dateOfBirth').lean(),
        LifestyleInfo.findOne({ userId: clientObjectId }).select('heightFeet heightInch heightCm').lean()
      ]);
      const hFeet = parseFloat(lifestyle?.heightFeet || user?.heightFeet || '0');
      const hInch = parseFloat(lifestyle?.heightInch || user?.heightInch || '0');
      const hCm = lifestyle?.heightCm ? parseFloat(lifestyle.heightCm) : (user?.heightCm ? parseFloat(user.heightCm as string) : (hFeet * 12 + hInch) * 2.54);
      if (hCm > 0) {
        bcaHeight = hCm / 2.54; // convert cm to inches for BCA storage
      }
      // Auto-calc BMI
      if (!calculatedBMI && bcaData.weight && hCm > 0) {
        const hm = hCm / 100;
        calculatedBMI = bcaData.weight / (hm * hm);
      }
      // Auto-calc resting metabolism (BMR) using Mifflin-St Jeor
      if (!restingMetabolism && bcaData.weight && hCm > 0 && user?.dateOfBirth) {
        const dob = new Date(user.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        if (age > 0) {
          const base = 10 * bcaData.weight + 6.25 * hCm - 5 * age;
          restingMetabolism = user.gender === 'female' ? base - 161 : base + 5;
        }
      }
    } else if (bcaHeight && bcaData.weight && !calculatedBMI) {
      const heightInMeters = bcaHeight * 0.0254; // Convert inches to meters
      calculatedBMI = bcaData.weight / (heightInMeters * heightInMeters);
    }

    // Add new BCA entry
    const newBCA = {
      bcaType: bcaData.bcaType || 'karada',
      measurementDate: measurementDate,
      height: bcaHeight,
      weight: bcaData.weight || 0,
      bmi: calculatedBMI,
      fatPercentage: bcaData.fatPercentage || 0,
      visceralFat: bcaData.visceralFat || 0,
      restingMetabolism: restingMetabolism,
      bodyAge: bcaData.bodyAge || 0,
      fatMass: bcaData.fatMass || 0,
      totalSubcutFat: bcaData.totalSubcutFat || 0,
      subcutFatTrunk: bcaData.subcutFatTrunk || 0,
      subcutFatArms: bcaData.subcutFatArms || 0,
      subcutFatLegs: bcaData.subcutFatLegs || 0,
      totalSkeletalMuscle: bcaData.totalSkeletalMuscle || 0,
      skeletalMuscleTrunk: bcaData.skeletalMuscleTrunk || 0,
      skeletalMuscleArms: bcaData.skeletalMuscleArms || 0,
      skeletalMuscleLegs: bcaData.skeletalMuscleLegs || 0,
      waist: bcaData.waist || 0,
      hip: bcaData.hip || 0,
      neck: bcaData.neck || 0,
      waterContent: bcaData.waterContent || 0,
      boneWeight: bcaData.boneWeight || 0,
      createdAt: new Date()
    };

    journal.bca.push(newBCA);
    await journal.save();

    // Log history for BCA entry
    await logHistoryServer({
      userId: userId,
      action: 'create',
      category: 'journal',
      description: `BCA recorded: Weight ${bcaData.weight || 0}kg, BMI ${calculatedBMI.toFixed(1)}`,
      performedById: session.user.id,
      metadata: {
        entryType: 'bca',
        bcaType: bcaData.bcaType || 'karada',
        weight: bcaData.weight || 0,
        bmi: calculatedBMI,
        fatPercentage: bcaData.fatPercentage || 0,
        date: format(measurementDate, 'yyyy-MM-dd')
      }
    });

    return NextResponse.json({
      success: true,
      bca: journal.bca[journal.bca.length - 1],
      message: 'BCA data saved successfully'
    });

  } catch (error: any) {
    console.error('Error adding BCA:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to add BCA data', details: error?.message },
      { status: 500 }
    );
  }
}

// DELETE /api/journal/bca - Delete BCA entry
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
      { client: clientObjectId, 'bca._id': entryId },
      { $pull: { bca: { _id: entryId } } },
      { new: true }
    );

    if (!journal) {
      return NextResponse.json({ error: 'BCA entry not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'BCA entry deleted'
    });

  } catch (error) {
    console.error('Error deleting BCA:', error);
    return NextResponse.json(
      { error: 'Failed to delete BCA entry' },
      { status: 500 }
    );
  }
}
