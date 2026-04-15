import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import connectDB from '@/lib/db/connection';
import JournalTracking from '@/lib/db/models/JournalTracking';
import { authOptions } from '@/lib/auth';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import mongoose from 'mongoose';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';

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

        const journal = await withCache(
            `client:activity:${JSON.stringify({
                client: session.user.id,
                date: { $gte: dayStart, $lt: dayEnd }
            })}`,
            async () => await JournalTracking.findOne({
                client: session.user.id,
                date: { $gte: dayStart, $lt: dayEnd }
            }),
            { ttl: 120000, tags: ['client'] }
        );

        if (!journal) {
            return NextResponse.json({
                totalToday: 0,
                goal: 30,
                entries: [],
                assignedActivity: null,
                date: format(targetDate, 'yyyy-MM-dd'),
                dataHash: 'empty'
            });
        }

        const activityEntries = journal.activities || [];
        const totalMinutes = activityEntries.reduce((sum: number, entry: any) => sum + (entry.duration || 0), 0);

        // Generate data hash for change detection
        const dataHash = JSON.stringify(activityEntries).split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0).toString();

        // Transform assignedActivities to match frontend interface
        const assignedActivitiesList = journal.assignedActivities?.activities || [];
        const transformedAssignedActivity = journal.assignedActivities ? {
            amount: assignedActivitiesList.reduce((sum: number, act: any) => sum + (act.duration || 0), 0) || 0,
            activityCount: assignedActivitiesList.length,
            unit: 'minutes',
            assignedAt: journal.assignedActivities.assignedAt,
            isCompleted: journal.assignedActivities.isCompleted || false,
            completedAt: journal.assignedActivities.completedAt,
            activities: assignedActivitiesList
        } : null;

        return NextResponse.json({
            totalToday: totalMinutes,
            goal: journal.targets?.activityMinutes || 30,
            entries: activityEntries.map((entry: any) => ({
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
                createdAt: entry.createdAt
            })),
            assignedActivity: transformedAssignedActivity,
            date: format(targetDate, 'yyyy-MM-dd'),
            dataHash
        });
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
        );

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

        return NextResponse.json({
            success: true,
            entry: {
                ...entry,
                _id: entry._id.toString()
            }
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
            await JournalTracking.findOneAndUpdate(
                {
                    client: session.user.id,
                    date: { $gte: dayStart, $lt: dayEnd }
                },
                {
                    $set: {
                        'assignedActivities.isCompleted': true,
                        'assignedActivities.completedAt': new Date()
                    }
                }
            );

            return NextResponse.json({ success: true });
        }

        if (action === 'complete-entry' && entryId) {
            // Mark a specific activity entry as complete
            await JournalTracking.findOneAndUpdate(
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
                }
            );

            return NextResponse.json({ success: true });
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

        await JournalTracking.findOneAndUpdate(
            {
                client: session.user.id,
                date: { $gte: dayStart, $lt: dayEnd }
            },
            {
                $pull: { activities: { _id: new mongoose.Types.ObjectId(entryId) } }
            }
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Activity DELETE error:', error);
        return NextResponse.json({ error: 'Failed to delete activity entry' }, { status: 500 });
    }
}
