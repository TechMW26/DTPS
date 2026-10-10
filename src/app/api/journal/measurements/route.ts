import {nativeResponseJson} from '@/lib/api/native-response';
import {getNativeDatabase} from '@/lib/db/database';
import {journalHistory,journalProgressEntries,journalProfile} from '@/lib/db/repository/native-journal';
import {taskClientAccess} from '@/lib/db/repository/native-staff-tasks';
import {nativeJournalRoute} from '@/lib/api/native-journal-route';
import {nativeJson} from '@/lib/db/repository/native-history';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { UserRole } from '@/types';
import { logHistoryServer } from '@/lib/server/history';

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
      return nativeResponseJson({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId') || session.user.id;
    await taskClientAccess(getNativeDatabase(),session.user.id,clientId);

    if (!checkPermission(session, clientId)) {
      return nativeResponseJson({ error: 'Access denied' }, { status: 403 });
    }

    const db=getNativeDatabase();

    // Convert clientId to ObjectId
    const clientObjectId = clientId;

    // Measurement types in ProgressEntry model (client app)
    const measurementTypes = ['waist', 'abdomen', 'hips', 'chest', 'arms', 'thighs'];

    // Fetch from BOTH sources in parallel:
    // 1. JournalTracking.measurements (added by dietitian via journal)
    // 2. ProgressEntry (added by client via progress page)
    const [allJournals,progressMeasurements]=await Promise.all([journalHistory(db,clientId,'measurements'),journalProgressEntries(db,clientId,measurementTypes)]);

    // Flatten all measurement entries from JournalTracking with their dates
    const allMeasurements: any[] = [];
    allJournals.forEach(journal => {
      journal.measurements.forEach((entry: any) => {
        allMeasurements.push({
          ...entry,
          journalDate: journal.date,
          source: 'journal'
        });
      });
    });

    // Build a set of minute-buckets already present in JournalTracking
    const journalMinuteBuckets = new Set<number>();
    allMeasurements.forEach((m: any) => {
      const t = new Date(m.date || m.journalDate || new Date()).getTime();
      journalMinuteBuckets.add(Math.floor(t / 60000));
    });

    // Group ProgressEntry measurements by minute (keeps multiple entries per day)
    const progressByDate = new Map<string, any>();
    for (const entry of progressMeasurements) {
      const recordedAt = new Date(entry.recordedAt);
      const minuteBucket = new Date(Math.floor(recordedAt.getTime() / 60000) * 60000);
      const minuteBucketKey = Math.floor(minuteBucket.getTime() / 60000);

      // Skip mirrored entries when JournalTracking already has this timestamp bucket
      if (journalMinuteBuckets.has(minuteBucketKey)) {
        continue;
      }

      const dateKey = String(minuteBucket.getTime());
      if (!progressByDate.has(dateKey)) {
        progressByDate.set(dateKey, {
          _id: `pe_${dateKey}`,
          date: minuteBucket,
          journalDate: minuteBucket,
          source: 'progress_entry',
          arm: 0,
          waist: 0,
          abd: 0,
          chest: 0,
          hips: 0,
          thigh: 0
        });
      }
      const record = progressByDate.get(dateKey)!;
      // Map field names: arms -> arm, thighs -> thigh
      const fieldMap: Record<string, string> = {
        arms: 'arm',
        thighs: 'thigh',
        abdomen: 'abd',
        waist: 'waist',
        hips: 'hips',
        chest: 'chest'
      };
      const fieldName = fieldMap[entry.type] || entry.type;
      record[fieldName] = Number(entry.value) || 0;
    }

    // Add progress entries to allMeasurements
    progressByDate.forEach(entry => {
      allMeasurements.push(entry);
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

    return nativeResponseJson({
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
    return nativeResponseJson(
      { error: 'Failed to fetch measurements' },
      { status: 500 }
    );
  }
}

// POST /api/journal/measurements - Add new measurement entry
const mutation=nativeJournalRoute('measurements');
export const POST=mutation;
export const DELETE=mutation;
