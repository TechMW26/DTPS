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
import { format } from 'date-fns';

interface ClientMeasurements {
  heightFeet?: string | number;
  heightInch?: string | number;
  heightCm?: string | number;
  gender?: string;
  dateOfBirth?: string | Date;
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

// GET /api/journal/bca - Get all BCA entries for a client
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return nativeResponseJson({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId') || session.user.id;
    await taskClientAccess(getNativeDatabase(),session.user.id,clientId);
    const dateParam = searchParams.get('date');

    if (!checkPermission(session, clientId)) {
      return nativeResponseJson({ error: 'Access denied' }, { status: 403 });
    }

    const db=getNativeDatabase();

    // Convert clientId to ObjectId
    const clientObjectId = clientId;

    // Always fetch all BCA entries for summary/trend (ignore dateParam for summary)
    const query: any = {
      client: clientObjectId,
      'bca.0': { $exists: true }
    };

    // Get all journal entries for this client with BCA data
    const journals=await journalHistory(db,clientId,'bca');

    // Flatten all BCA entries with their dates
    const allBCA: any[] = [];
    journals.forEach(journal => {
      journal.bca.forEach((entry: any) => {
        allBCA.push({
          ...entry,
          journalDate: journal.date
        });
      });
    });

    // Sort by measurementDate descending
    allBCA.sort((a, b) => new Date(b.measurementDate).getTime() - new Date(a.measurementDate).getTime());

    return nativeResponseJson({
      success: true,
      bca: allBCA,
      latestEntry: allBCA.length > 0 ? allBCA[0] : null,
      totalEntries: allBCA.length
    });

  } catch (error) {
    console.error('Error fetching BCA:', error);
    return nativeResponseJson(
      { error: 'Failed to fetch BCA data' },
      { status: 500 }
    );
  }
}

// POST /api/journal/bca - Add new BCA entry
const mutation=nativeJournalRoute('bca');
export const POST=mutation;
export const DELETE=mutation;
