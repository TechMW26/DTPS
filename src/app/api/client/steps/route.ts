import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import connectDB from '@/lib/db/connection';
import JournalTracking from '@/lib/db/models/JournalTracking';
import { authOptions } from '@/lib/auth';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import mongoose from 'mongoose';
import { logActivity } from '@/lib/utils/activityLogger';

// Build the canonical steps payload from a journal document
function buildStepsResponse(journal: any, targetDate: Date) {
    const stepsEntries = journal?.steps || [];
    const totalSteps = stepsEntries.reduce(
        (sum: number, entry: any) => sum + (entry.steps || 0),
        0
    );

    const transformedAssignedSteps = journal?.assignedSteps
        ? {
            amount: journal.assignedSteps.target || 0,
            assignedAt: journal.assignedSteps.assignedAt,
            isCompleted: journal.assignedSteps.isCompleted || false,
            completedAt: journal.assignedSteps.completedAt,
        }
        : null;

    return {
        totalToday: totalSteps,
        goal: journal?.targets?.steps || 10000,
        entries: stepsEntries
            .map((entry: any) => ({
                _id: entry._id?.toString(),
                steps: entry.steps,
                distance: entry.distance,
                calories: entry.calories,
                time: entry.createdAt ? format(new Date(entry.createdAt), 'h:mm a') : '',
                createdAt: entry.createdAt,
            }))
            .sort(
                (a: any, b: any) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            ),
        assignedSteps: transformedAssignedSteps,
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
            .select('steps assignedSteps targets updatedAt')
            .lean();

        return NextResponse.json(buildStepsResponse(journal, targetDate));
    } catch (error) {
        console.error('Steps GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch steps data' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        // OPTIMIZATION: Run auth + DB + body parsing in PARALLEL
        const [session, , body] = await Promise.all([
            getServerSession(authOptions),
            connectDB(),
            request.json()
        ]);

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { steps, date } = body;

        const targetDate = date ? parseISO(date) : new Date();
        const dayStart = startOfDay(targetDate);
        const dayEnd = endOfDay(targetDate);

        // Calculate distance and calories
        const distance = Number((steps / 1315).toFixed(2)); // ~1315 steps per km
        const calories = Math.round(steps * 0.04); // ~0.04 calories per step

        // Pre-generate ObjectId for immediate response
        const entryId = new mongoose.Types.ObjectId();
        const createdAt = new Date();

        const entry = {
            _id: entryId,
            steps: Number(steps) || 0,
            distance,
            calories,
            time: format(createdAt, 'h:mm a'),
            createdAt
        };

        // Await the write so we can return the full, persisted state. The previous
        // fire-and-forget approach meant the row often wasn't saved before the next
        // read, causing steps to silently not show up.
        const journal = await JournalTracking.findOneAndUpdate(
            {
                client: session.user.id,
                date: { $gte: dayStart, $lt: dayEnd }
            },
            {
                $push: { steps: entry },
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
            .select('steps assignedSteps targets updatedAt')
            .lean();

        // FIRE-AND-FORGET: Log activity in background
        logActivity({
            userId: session.user.id,
            userRole: 'client',
            userName: session.user.name || session.user.email || '',
            userEmail: session.user.email || '',
            action: 'Logged Steps',
            actionType: 'create',
            category: 'fitness',
            description: `Client logged ${steps} steps.`,
            details: { steps, distance, calories, date: format(targetDate, 'yyyy-MM-dd') },
        }).catch(() => { });

        // Return the full updated state so the client needs no second request
        return NextResponse.json({
            success: true,
            ...buildStepsResponse(journal, targetDate),
        });
    } catch (error) {
        console.error('Steps POST error:', error);
        return NextResponse.json({ error: 'Failed to add steps entry' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const { action, date } = await request.json();

        if (action === 'complete') {
            const targetDate = date ? parseISO(date) : new Date();
            const dayStart = startOfDay(targetDate);
            const dayEnd = endOfDay(targetDate);

            const journal = await JournalTracking.findOneAndUpdate(
                {
                    client: session.user.id,
                    date: { $gte: dayStart, $lt: dayEnd }
                },
                {
                    $set: {
                        'assignedSteps.isCompleted': true,
                        'assignedSteps.completedAt': new Date()
                    }
                },
                { new: true }
            )
                .select('steps assignedSteps targets updatedAt')
                .lean();

            if (!journal) {
                return NextResponse.json({ error: 'No journal found for this date' }, { status: 404 });
            }

            return NextResponse.json({
                success: true,
                ...buildStepsResponse(journal, targetDate),
            });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Steps PATCH error:', error);
        return NextResponse.json({ error: 'Failed to update steps' }, { status: 500 });
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
                $pull: { steps: { _id: new mongoose.Types.ObjectId(entryId) } }
            },
            { new: true }
        )
            .select('steps assignedSteps targets updatedAt')
            .lean();

        if (!journal) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            ...buildStepsResponse(journal, targetDate),
        });
    } catch (error) {
        console.error('Steps DELETE error:', error);
        return NextResponse.json({ error: 'Failed to delete steps entry' }, { status: 500 });
    }
}
