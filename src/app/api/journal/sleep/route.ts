import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import JournalTracking from '@/lib/db/models/JournalTracking';
import { format } from 'date-fns';
import { logHistoryServer } from '@/lib/server/history';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import {
  buildJournalCacheKey,
  canAccessClientData,
  getDateOnly,
  summarizeSleep,
} from '../_utils';

// GET /api/journal/sleep - Get sleep entries for a date
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const clientId = searchParams.get('clientId') || session.user.id;

    // Check access permission
    if (!canAccessClientData(session as { user: { id: string; role: string } }, clientId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const date = dateParam ? getDateOnly(dateParam) : getDateOnly(new Date());

    await connectDB();

    const journal = await withCache(
      buildJournalCacheKey('sleep', clientId, date),
      async () => await JournalTracking.findOne({
        client: clientId,
        date,
      }),
      { ttl: 120000, tags: ['journal'] }
    );

    const sleep = journal?.sleep || [];
    const summary = summarizeSleep(sleep, journal?.targets?.sleep || 8);

    return NextResponse.json({
      success: true,
      entries: sleep,
      summary,
    });

  } catch (error) {
    console.error('Error fetching sleep:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sleep data' },
      { status: 500 }
    );
  }
}

// POST /api/journal/sleep - Add new sleep entry
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { hours, minutes, quality, date, clientId } = await request.json();
    const userId = clientId || session.user.id;

    // Check access permission
    if (!canAccessClientData(session as { user: { id: string; role: string } }, userId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (hours === undefined && minutes === undefined) {
      return NextResponse.json({ error: 'Hours or minutes are required' }, { status: 400 });
    }

    await connectDB();

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
        progress: [],
        bca: [],
        measurements: []
      });
    } else {
      // Ensure arrays exist on existing documents
      if (!journal.sleep) journal.sleep = [];
      if (!journal.progress) journal.progress = [];
      if (!journal.bca) journal.bca = [];
      if (!journal.measurements) journal.measurements = [];
    }

    // Add new sleep entry
    const newEntry = {
      hours: hours || 0,
      minutes: minutes || 0,
      quality: quality || 'Fair',
      time: format(new Date(), 'hh:mm a'),
      createdAt: new Date()
    };

    journal.sleep.push(newEntry);

    // Check if assigned sleep target is met and mark as completed
    const totalMinutesAfterAdd = journal.sleep.reduce((sum: number, e: { hours: number; minutes: number }) => {
      return sum + (e.hours * 60) + e.minutes;
    }, 0);

    if (journal.assignedSleep && !journal.assignedSleep.isCompleted) {
      const targetMinutes = (journal.assignedSleep.targetHours || 0) * 60 + (journal.assignedSleep.targetMinutes || 0);
      if (totalMinutesAfterAdd >= targetMinutes) {
        journal.assignedSleep.isCompleted = true;
        journal.assignedSleep.completedAt = new Date();
      }
    }

    await journal.save();

    // Log history for sleep entry
    await logHistoryServer({
      userId: userId,
      action: 'create',
      category: 'journal',
      description: `Sleep logged: ${hours || 0}h ${minutes || 0}m - ${quality || 'Fair'}`,
      performedById: session.user.id,
      metadata: {
        entryType: 'sleep',
        hours: hours || 0,
        minutes: minutes || 0,
        quality: quality || 'Fair',
        date: format(journalDate, 'yyyy-MM-dd')
      }
    });

    // Calculate totals for response
    const totalMinutes = journal.sleep.reduce((sum: number, e: { hours: number; minutes: number }) => {
      return sum + (e.hours * 60) + e.minutes;
    }, 0);
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    return NextResponse.json({
      success: true,
      entry: journal.sleep[journal.sleep.length - 1],
      entries: journal.sleep,
      summary: {
        totalMinutes,
        totalHours,
        remainingMinutes,
        displayTime: `${totalHours}h ${remainingMinutes}m`,
        target: journal.targets?.sleep || 8,
        percentage: Math.min(Math.round((totalMinutes / ((journal.targets?.sleep || 8) * 60)) * 100), 100)
      }
    });

  } catch (error: any) {
    console.error('Error adding sleep:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to add sleep entry', details: error?.message },
      { status: 500 }
    );
  }
}

// DELETE /api/journal/sleep - Delete sleep entry
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get('entryId');
    const dateParam = searchParams.get('date');
    const clientId = searchParams.get('clientId') || session.user.id;

    // Check access permission
    if (!canAccessClientData(session as { user: { id: string; role: string } }, clientId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!entryId) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    await connectDB();

    const journalDate = dateParam ? getDateOnly(dateParam) : getDateOnly(new Date());

    const journal = await JournalTracking.findOneAndUpdate(
      { client: clientId, date: journalDate },
      { $pull: { sleep: { _id: entryId } } },
      { new: true }
    );

    if (!journal) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    // Calculate totals for response
    const totalMinutes = journal.sleep.reduce((sum: number, e: { hours: number; minutes: number }) => {
      return sum + (e.hours * 60) + e.minutes;
    }, 0);
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    return NextResponse.json({
      success: true,
      entries: journal.sleep,
      summary: {
        totalMinutes,
        totalHours,
        remainingMinutes,
        displayTime: `${totalHours}h ${remainingMinutes}m`,
        target: journal.targets?.sleep || 8,
        percentage: Math.min(Math.round((totalMinutes / ((journal.targets?.sleep || 8) * 60)) * 100), 100)
      }
    });

  } catch (error) {
    console.error('Error deleting sleep entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete sleep entry' },
      { status: 500 }
    );
  }
}

// PATCH /api/journal/sleep - Update sleep entry
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { entryId, hours, minutes, quality, date, clientId } = await request.json();
    const userId = clientId || session.user.id;

    if (!canAccessClientData(session as { user: { id: string; role: string } }, userId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!entryId) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    await connectDB();

    const journalDate = date ? getDateOnly(date) : getDateOnly(new Date());
    const setUpdates: Record<string, any> = {};

    if (hours !== undefined) setUpdates['sleep.$.hours'] = hours;
    if (minutes !== undefined) setUpdates['sleep.$.minutes'] = minutes;
    if (quality !== undefined) setUpdates['sleep.$.quality'] = quality;

    const journal = await JournalTracking.findOneAndUpdate(
      { client: userId, date: journalDate, 'sleep._id': entryId },
      { $set: setUpdates },
      { new: true }
    );

    if (!journal) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    const summary = summarizeSleep(journal.sleep, journal.targets?.sleep || 8);

    return NextResponse.json({
      success: true,
      entries: journal.sleep,
      summary,
    });

  } catch (error) {
    console.error('Error updating sleep:', error);
    return NextResponse.json(
      { error: 'Failed to update sleep entry' },
      { status: 500 }
    );
  }
}
