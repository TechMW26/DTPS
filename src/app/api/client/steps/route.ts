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
            `client:steps:${JSON.stringify({
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
                goal: 10000,
                entries: [],
                assignedSteps: null,
                date: format(targetDate, 'yyyy-MM-dd'),
                dataHash: 'empty'
            });
        }

        const stepsEntries = journal.steps || [];
        const totalSteps = stepsEntries.reduce((sum: number, entry: any) => sum + (entry.steps || 0), 0);

        // Generate data hash for change detection
        const dataHash = JSON.stringify(stepsEntries).split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0).toString();

        // Transform assignedSteps to match frontend interface
        const transformedAssignedSteps = journal.assignedSteps ? {
            amount: journal.assignedSteps.target || 0,
            assignedAt: journal.assignedSteps.assignedAt,
            isCompleted: journal.assignedSteps.isCompleted || false,
            completedAt: journal.assignedSteps.completedAt
        } : null;

        return NextResponse.json({
            totalToday: totalSteps,
            goal: journal.targets?.steps || 10000,
            entries: stepsEntries.map((entry: any) => ({
                _id: entry._id?.toString(),
                steps: entry.steps,
                distance: entry.distance,
                calories: entry.calories,
                time: entry.createdAt ? format(new Date(entry.createdAt), 'h:mm a') : '',
                createdAt: entry.createdAt
            })),
            assignedSteps: transformedAssignedSteps,
            date: format(targetDate, 'yyyy-MM-dd'),
            dataHash
        });
    } catch (error) {
        console.error('Steps GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch steps data' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const { steps, date } = await request.json();

        const targetDate = date ? parseISO(date) : new Date();
        const dayStart = startOfDay(targetDate);
        const dayEnd = endOfDay(targetDate);

        // Calculate distance and calories
        const distance = Number((steps / 1315).toFixed(2)); // ~1315 steps per km
        const calories = Math.round(steps * 0.04); // ~0.04 calories per step

        const entry = {
            _id: new mongoose.Types.ObjectId(),
            steps: Number(steps) || 0,
            distance,
            calories,
            time: format(new Date(), 'h:mm a'),
            createdAt: new Date()
        };

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
        );

        // Log activity
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

        return NextResponse.json({
            success: true,
            entry: {
                ...entry,
                _id: entry._id.toString()
            }
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

            await JournalTracking.findOneAndUpdate(
                {
                    client: session.user.id,
                    date: { $gte: dayStart, $lt: dayEnd }
                },
                {
                    $set: {
                        'assignedSteps.isCompleted': true,
                        'assignedSteps.completedAt': new Date()
                    }
                }
            );

            return NextResponse.json({ success: true });
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

        await JournalTracking.findOneAndUpdate(
            {
                client: session.user.id,
                date: { $gte: dayStart, $lt: dayEnd }
            },
            {
                $pull: { steps: { _id: new mongoose.Types.ObjectId(entryId) } }
            }
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Steps DELETE error:', error);
        return NextResponse.json({ error: 'Failed to delete steps entry' }, { status: 500 });
    }
}
