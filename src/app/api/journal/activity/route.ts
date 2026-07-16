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
  summarizeActivities,
} from '../_utils';

// GET /api/journal/activity - Get activity entries for a date
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
      buildJournalCacheKey('activity', clientId, date),
      async () => await JournalTracking.findOne({
        client: clientId,
        date,
      }),
      { ttl: 120000, tags: ['journal'] }
    );

    const activities = journal?.activities || [];
    const summary = summarizeActivities(activities, journal?.targets?.activityMinutes || 60);

    return NextResponse.json({
      success: true,
      activities,
      summary,
    });

  } catch (error) {
    console.error('Error fetching activities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activities' },
      { status: 500 }
    );
  }
}

// POST /api/journal/activity - Add new activity entry
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, sets, reps, duration, date, clientId, videoLink } = await request.json();
    const userId = clientId || session.user.id;

    // Check access permission
    if (!canAccessClientData(session as { user: { id: string; role: string } }, userId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!name) {
      return NextResponse.json({ error: 'Activity name is required' }, { status: 400 });
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
        meals: []
      });
    }

    // Add new activity entry
    const newActivity = {
      name,
      sets: sets || 0,
      reps: reps || 0,
      duration: duration || 0,
      videoLink: videoLink || '',
      completed: false,
      time: format(new Date(), 'hh:mm a'),
      createdAt: new Date()
    };

    journal.activities.push(newActivity);
    await journal.save();

    // Log history for activity entry
    await logHistoryServer({
      userId: userId,
      action: 'create',
      category: 'journal',
      description: `Activity logged: ${name} - ${duration || 0} mins`,
      performedById: session.user.id,
      metadata: {
        entryType: 'activity',
        name,
        sets: sets || 0,
        reps: reps || 0,
        duration: duration || 0,
        date: format(journalDate, 'yyyy-MM-dd')
      }
    });

    return NextResponse.json({
      success: true,
      activity: journal.activities[journal.activities.length - 1],
      activities: journal.activities
    });

  } catch (error) {
    console.error('Error adding activity:', error);
    return NextResponse.json(
      { error: 'Failed to add activity' },
      { status: 500 }
    );
  }
}

// DELETE /api/journal/activity - Delete activity entry
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
      { $pull: { activities: { _id: entryId } } },
      { new: true }
    );

    if (!journal) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      activities: journal.activities
    });

  } catch (error) {
    console.error('Error deleting activity:', error);
    return NextResponse.json(
      { error: 'Failed to delete activity' },
      { status: 500 }
    );
  }
}

// PATCH /api/journal/activity - Mark activity as complete
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { entryId, completed, date, clientId, name, sets, reps, duration, videoLink } = await request.json();
    const userId = clientId || session.user.id;

    // Check access permission
    if (!canAccessClientData(session as { user: { id: string; role: string } }, userId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!entryId) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    await connectDB();

    const journalDate = date ? getDateOnly(date) : getDateOnly(new Date());

    const setUpdates: Record<string, any> = {};

    if (name !== undefined) setUpdates['activities.$.name'] = name;
    if (sets !== undefined) setUpdates['activities.$.sets'] = sets;
    if (reps !== undefined) setUpdates['activities.$.reps'] = reps;
    if (duration !== undefined) setUpdates['activities.$.duration'] = duration;
    if (videoLink !== undefined) setUpdates['activities.$.videoLink'] = videoLink;

    if (completed !== undefined) {
      setUpdates['activities.$.completed'] = completed !== false;
      if (completed !== false) {
        setUpdates['activities.$.completedAt'] = new Date();
      }
    }

    const updateQuery: Record<string, any> = {};
    if (Object.keys(setUpdates).length > 0) {
      updateQuery.$set = setUpdates;
    }
    if (completed === false) {
      updateQuery.$unset = { 'activities.$.completedAt': '' };
    }

    const journal = await JournalTracking.findOneAndUpdate(
      {
        client: userId,
        date: journalDate,
        'activities._id': entryId
      },
      updateQuery,
      { new: true }
    );

    if (!journal) {
      return NextResponse.json({ error: 'Activity entry not found' }, { status: 404 });
    }

    // Check if all assigned activities are completed
    if (journal.assignedActivities && journal.assignedActivities.activities?.length > 0) {
      const allCompleted = journal.activities.every((a: any) => a.completed === true);
      if (allCompleted && !journal.assignedActivities.isCompleted) {
        journal.assignedActivities.isCompleted = true;
        journal.assignedActivities.completedAt = new Date();
        await journal.save();
      }
    }

    return NextResponse.json({
      success: true,
      activities: journal.activities
    });

  } catch (error) {
    console.error('Error updating activity:', error);
    return NextResponse.json(
      { error: 'Failed to update activity' },
      { status: 500 }
    );
  }
}
