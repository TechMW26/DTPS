import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import connectDB from '@/lib/db/connection';
import JournalTracking from '@/lib/db/models/JournalTracking';
import { authOptions } from '@/lib/auth';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import mongoose from 'mongoose';
import { logActivity } from '@/lib/utils/activityLogger';

// Build the canonical activity payload from a journal document
function buildActivityResponse(journal: any, targetDate: Date) {
    const activityEntries = journal?.activities || [];
    const totalMinutes = activityEntries.reduce(
        (sum: number, entry: any) => sum + (entry.duration || 0),
        0
    );

    const assignedActivitiesList = journal?.assignedActivities?.activities || [];
    const transformedAssignedActivity = journal?.assignedActivities
        ? {
            amount: assignedActivitiesList.reduce(
                (sum: number, act: any) => sum + (act.duration || 0),
                0
            ) || 0,
            activityCount: assignedActivitiesList.length,
            unit: 'minutes',
            assignedAt: journal.assignedActivities.assignedAt,
            isCompleted: journal.assignedActivities.isCompleted || false,
            completedAt: journal.assignedActivities.completedAt,
            activities: assignedActivitiesList,
        }
        : null;

    return {
        totalToday: totalMinutes,
        goal: journal?.targets?.activityMinutes || 30,
        entries: activityEntries
            .map((entry: any) => ({
                _id: entry._id?.toString(),
                name: entry.name,
                duration: entry.duration,
                sets: entry.sets,
                reps: entry.reps,
                intensity: entry.intensity || 'moderate',
                videoLink: entry.videoLink,
                completed: entry.completed,
                completedAt: entry.completedAt,
                time: entry.createdAt ? format(new Date(entry.createdAt), 'h:mm a') : '',
                createdAt: entry.createdAt,
            }))
            .sort(
                (a: any, b: any) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            ),
        assignedActivity: transformedAssignedActivity,
        date: format(targetDate, 'yyyy-MM-dd'),
        // Change-detection token: updates whenever the journal document changes
        dataHash: journal?.updatedAt
            ? new Date(journal.updatedAt).toISOString()
            : 'empty',
    };
}

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        const dateParam = request.nextUrl.searchParams.get('date');
        const targetDate = dateParam ? parseISO(dateParam) : new Date();
        const dayStart = startOfDay(targetDate);
        const dayEnd = endOfDay(targetDate);

        // Fresh lean read — this collection changes frequently, so caching the
        // whole journal caused new entries to not show up for up to 2 minutes.
        const journal = await JournalTracking.findOne({
            client: session.user.id,
            date: { $gte: dayStart, $lt: dayEnd },
        })
            .select('activities assignedActivities targets updatedAt')
            .lean();

        return NextResponse.json(buildActivityResponse(journal, targetDate));
    } catch (error) {
        console.error('Activity GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch activity data' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const { name, duration, intensity = 'moderate', sets = 0, reps = 0, date } = await request.json();

        const targetDate = date ? parseISO(date) : new Date();
        const dayStart = startOfDay(targetDate);
        const dayEnd = endOfDay(targetDate);

        const entry = {
            _id: new mongoose.Types.ObjectId(),
            name: name || 'Exercise',
            duration: Number(duration) || 0,
            intensity: intensity || 'moderate',
            sets: Number(sets) || 0,
            reps: Number(reps) || 0,
            completed: false,
            time: format(new Date(), 'h:mm a'),
            createdAt: new Date()
        };

        const journal = await JournalTracking.findOneAndUpdate(
            {
                client: session.user.id,
                date: { $gte: dayStart, $lt: dayEnd }
            },
            {
                $push: { activities: entry },
                $setOnInsert: {
                    client: session.user.id,
                    date: dayStart,
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
                }
            },
            { upsert: true, new: true }
        )
            .select('activities assignedActivities targets updatedAt')
            .lean();

        // Log activity
        logActivity({
            userId: session.user.id,
            userRole: 'client',
            userName: session.user.name || '',
            userEmail: session.user.email || '',
            action: 'log_activity',
            actionType: 'create',
            category: 'fitness',
            description: `Logged activity: ${entry.name} for ${entry.duration} minutes`,
            targetUserId: session.user.id,
            targetUserName: session.user.name || '',
            details: {
                activityName: entry.name,
                duration: entry.duration,
                intensity: entry.intensity,
                sets: entry.sets,
                reps: entry.reps
            }
        }).catch(console.error);

        // Return the full updated state so the client needs no second request
        return NextResponse.json({
            success: true,
            ...buildActivityResponse(journal, targetDate),
        });
    } catch (error) {
        console.error('Activity POST error:', error);
        return NextResponse.json({ error: 'Failed to add activity entry' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const { action, entryId, date } = await request.json();

        const targetDate = date ? parseISO(date) : new Date();
        const dayStart = startOfDay(targetDate);
        const dayEnd = endOfDay(targetDate);

        if (action === 'complete') {
            // Mark all assigned activities as complete
            const journal = await JournalTracking.findOneAndUpdate(
                {
                    client: session.user.id,
                    date: { $gte: dayStart, $lt: dayEnd }
                },
                {
                    $set: {
                        'assignedActivities.isCompleted': true,
                        'assignedActivities.completedAt': new Date()
                    }
                },
                { new: true }
            )
                .select('activities assignedActivities targets updatedAt')
                .lean();

            if (!journal) {
                return NextResponse.json({ error: 'No journal found for this date' }, { status: 404 });
            }

            return NextResponse.json({
                success: true,
                ...buildActivityResponse(journal, targetDate),
            });
        }

        if (action === 'complete-entry' && entryId) {
            // Mark a specific activity entry as complete
            const journal = await JournalTracking.findOneAndUpdate(
                {
                    client: session.user.id,
                    date: { $gte: dayStart, $lt: dayEnd },
                    'activities._id': new mongoose.Types.ObjectId(entryId)
                },
                {
                    $set: {
                        'activities.$.completed': true,
                        'activities.$.completedAt': new Date()
                    }
                },
                { new: true }
            )
                .select('activities assignedActivities targets updatedAt')
                .lean();

            if (!journal) {
                return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
            }

            return NextResponse.json({
                success: true,
                ...buildActivityResponse(journal, targetDate),
            });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Activity PATCH error:', error);
        return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        const entryId = request.nextUrl.searchParams.get('id');
        const date = request.nextUrl.searchParams.get('date');

        if (!entryId || !date) {
            return NextResponse.json({ error: 'Missing entryId or date' }, { status: 400 });
        }

        const targetDate = parseISO(date);
        const dayStart = startOfDay(targetDate);
        const dayEnd = endOfDay(targetDate);

        const journal = await JournalTracking.findOneAndUpdate(
            {
                client: session.user.id,
                date: { $gte: dayStart, $lt: dayEnd }
            },
            {
                $pull: { activities: { _id: new mongoose.Types.ObjectId(entryId) } }
            },
            { new: true }
        )
            .select('activities assignedActivities targets updatedAt')
            .lean();

        if (!journal) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            ...buildActivityResponse(journal, targetDate),
        });
    } catch (error) {
        console.error('Activity DELETE error:', error);
        return NextResponse.json({ error: 'Failed to delete activity entry' }, { status: 500 });
    }
}
