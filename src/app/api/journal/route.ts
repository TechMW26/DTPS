import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import JournalTracking from '@/lib/db/models/JournalTracking';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// Helper to get date without time
const getDateOnly = (date: Date | string): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper to check if user can access client data
const canAccessClientData = (session: { user: { id: string; role: string } }, clientId: string): boolean => {
  // User can access their own data
  if (session.user.id === clientId) return true;
  // Admins, dietitians, and health counselors can access client data
  const allowedRoles = [UserRole.ADMIN, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR, 'health_counselor', 'admin', 'dietitian'];
  if (allowedRoles.includes(session.user.role as any)) return true;
  return false;
};

// GET /api/journal - Get journal data for a specific date
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const clientId = searchParams.get('clientId') || session.user.id;
    
    // Check access permission
    if (!canAccessClientData(session as { user: { id: string; role: string } }, clientId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Parse date or use today
    const date = dateParam ? getDateOnly(dateParam) : getDateOnly(new Date());

    // Find or create journal entry for the date
    let journal = await JournalTracking.findOne({
      client: clientId,
      date: date
    });

    if (!journal) {
      // Create new journal entry with default values
      journal = await JournalTracking.create({
        client: clientId,
        date: date,
        activities: [],
        steps: [],
        water: [],
        sleep: [],
        meals: [],
        targets: {
          steps: 10000,
          water: 2500,
          sleep: 8,
          calories: 2000,
          protein: 150,
          carbs: 250,
          fat: 65,
          activityMinutes: 60
        }
      });
    }

    return NextResponse.json({
      success: true,
      journal
    });

  } catch (error) {
    console.error('Error fetching journal:', error);
    return NextResponse.json(
      { error: 'Failed to fetch journal data' },
      { status: 500 }
    );
  }
}

// POST /api/journal - Create or update journal entry
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { date, targets, clientId } = body;
    const userId = clientId || session.user.id;
    
    // Check access permission
    if (!canAccessClientData(session as { user: { id: string; role: string } }, userId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    const journalDate = date ? getDateOnly(date) : getDateOnly(new Date());

    // Find or create journal entry
    let journal = await JournalTracking.findOne({
      client: userId,
      date: journalDate
    });

    if (!journal) {
      journal = new JournalTracking({
        client: userId,
        date: journalDate,
        activities: [],
        steps: [],
        water: [],
        sleep: [],
        meals: [],
        targets: targets || {
          steps: 10000,
          water: 2500,
          sleep: 8,
          calories: 2000,
          protein: 150,
          carbs: 250,
          fat: 65,
          activityMinutes: 60
        }
      });
    } else if (targets) {
      // Update targets if provided
      journal.targets = { ...journal.targets, ...targets };
    }

    await journal.save();

    return NextResponse.json({
      success: true,
      journal
    });

  } catch (error) {
    console.error('Error creating/updating journal:', error);
    return NextResponse.json(
      { error: 'Failed to save journal data' },
      { status: 500 }
    );
  }
}

// PUT /api/journal - Update targets only
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { date, targets, clientId } = await request.json();
    const userId = clientId || session.user.id;
    
    // Check access permission
    if (!canAccessClientData(session as { user: { id: string; role: string } }, userId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    const journalDate = date ? getDateOnly(date) : getDateOnly(new Date());

    const journal = await JournalTracking.findOneAndUpdate(
      { client: userId, date: journalDate },
      { $set: { targets } },
      { new: true, upsert: true }
    );

    return NextResponse.json({
      success: true,
      journal
    });

  } catch (error) {
    console.error('Error updating journal targets:', error);
    return NextResponse.json(
      { error: 'Failed to update targets' },
      { status: 500 }
    );
  }
}
