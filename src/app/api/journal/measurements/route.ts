import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import JournalTracking from '@/lib/db/models/JournalTracking';
import { UserRole } from '@/types';
import mongoose from 'mongoose';
import { logHistoryServer } from '@/lib/server/history';
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

// GET /api/journal/measurements - Get all measurements entries for a client
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

    // Always fetch ALL measurements entries for this client (for summary + graph)
    const allJournals = await withCache(
      `journal:measurements:all:${clientId}`,
      async () => await JournalTracking.find({
        client: clientObjectId,
        'measurements.0': { $exists: true }
      }).sort({ date: -1 }),
      { ttl: 120000, tags: ['journal'] }
    );

    // Flatten all measurement entries with their dates
    const allMeasurements: any[] = [];
    allJournals.forEach(journal => {
      journal.measurements.forEach((entry: any) => {
        allMeasurements.push({
          ...entry.toObject(),
          journalDate: journal.date
        });
      });
    });

    // Sort by date descending
    allMeasurements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Calculate started with (first entry) and currently at (latest entry) — always across ALL entries
    const sortedByDateAsc = [...allMeasurements].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const startedWith = sortedByDateAsc.length > 0 ? {
      arm: sortedByDateAsc[0].arm,
      waist: sortedByDateAsc[0].waist,
      abd: sortedByDateAsc[0].abd,
      chest: sortedByDateAsc[0].chest,
      hips: sortedByDateAsc[0].hips,
      thigh: sortedByDateAsc[0].thigh
    } : { arm: 0, waist: 0, abd: 0, chest: 0, hips: 0, thigh: 0 };

    const currentlyAt = allMeasurements.length > 0 ? {
      arm: allMeasurements[0].arm,
      waist: allMeasurements[0].waist,
      abd: allMeasurements[0].abd,
      chest: allMeasurements[0].chest,
      hips: allMeasurements[0].hips,
      thigh: allMeasurements[0].thigh
    } : { arm: 0, waist: 0, abd: 0, chest: 0, hips: 0, thigh: 0 };

    const difference = {
      arm: currentlyAt.arm - startedWith.arm,
      waist: currentlyAt.waist - startedWith.waist,
      abd: currentlyAt.abd - startedWith.abd,
      chest: currentlyAt.chest - startedWith.chest,
      hips: currentlyAt.hips - startedWith.hips,
      thigh: currentlyAt.thigh - startedWith.thigh
    };

    return NextResponse.json({
      success: true,
      measurements: allMeasurements,
      summary: {
        startedWith,
        currentlyAt,
        difference,
        totalEntries: allMeasurements.length
      }
    });

  } catch (error) {
    console.error('Error fetching measurements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch measurements' },
      { status: 500 }
    );
  }
}

// POST /api/journal/measurements - Add new measurement entry
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { arm, waist, abd, chest, hips, thigh, date, clientId } = body;
    const userId = clientId || session.user.id;

    if (!checkPermission(session, userId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await connectDB();

    const measurementDate = date ? new Date(date) : new Date();
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

    // Add new measurement entry
    const newMeasurement = {
      arm: arm || 0,
      waist: waist || 0,
      abd: abd || 0,
      chest: chest || 0,
      hips: hips || 0,
      thigh: thigh || 0,
      date: measurementDate,
      createdAt: new Date()
    };

    journal.measurements.push(newMeasurement);
    await journal.save();

    await logHistoryServer({
      userId,
      action: 'create',
      category: 'journal',
      description: `${session.user.role} logged measurements for ${measurementDate.toDateString()}`,
      performedById: session.user.id,
      metadata: {
        measurementDate,
        arm: newMeasurement.arm,
        waist: newMeasurement.waist,
        abd: newMeasurement.abd,
        chest: newMeasurement.chest,
        hips: newMeasurement.hips,
        thigh: newMeasurement.thigh,
        clientId: userId,
        journalId: journal._id,
      },
    });

    return NextResponse.json({
      success: true,
      measurement: journal.measurements[journal.measurements.length - 1]
    });

  } catch (error: any) {
    console.error('Error adding measurement:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to add measurement', details: error?.message },
      { status: 500 }
    );
  }
}

// DELETE /api/journal/measurements - Delete measurement entry
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
      { client: clientObjectId, 'measurements._id': entryId },
      { $pull: { measurements: { _id: entryId } } },
      { new: true }
    );

    if (!journal) {
      return NextResponse.json({ error: 'Measurement entry not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Measurement entry deleted'
    });

  } catch (error) {
    console.error('Error deleting measurement:', error);
    return NextResponse.json(
      { error: 'Failed to delete measurement entry' },
      { status: 500 }
    );
  }
}
