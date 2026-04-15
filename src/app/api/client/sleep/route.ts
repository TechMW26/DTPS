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

        // Get date range for the day
        const dayStart = startOfDay(targetDate);
        const dayEnd = endOfDay(targetDate);

        const journal = await withCache(
            `client:sleep:${JSON.stringify({
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
                goal: 8,
                entries: [],
                assignedSleep: null,
                date: format(targetDate, 'yyyy-MM-dd'),
                dataHash: 'empty'
            });
        }

        const sleepEntries = journal.sleep || [];
        const totalHours = sleepEntries.reduce((sum: number, entry: any) => sum + (entry.hours + entry.minutes / 60), 0);

        // Generate data hash for change detection
        const dataHash = JSON.stringify(sleepEntries).split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0).toString();

        // Transform assignedSleep to match frontend interface
        const transformedAssignedSleep = journal.assignedSleep ? {
            amount: (journal.assignedSleep.targetHours || 0) + ((journal.assignedSleep.targetMinutes || 0) / 60),
            assignedAt: journal.assignedSleep.assignedAt,
            isCompleted: journal.assignedSleep.isCompleted || false,
            completedAt: journal.assignedSleep.completedAt
        } : null;

        return NextResponse.json({
            totalToday: totalHours,
            goal: journal.targets?.sleep || 8,
            entries: sleepEntries.map((entry: any) => ({
                _id: entry._id?.toString(),
                hours: entry.hours,
                minutes: entry.minutes,
                quality: entry.quality,
                time: entry.createdAt ? format(new Date(entry.createdAt), 'h:mm a') : '',
                createdAt: entry.createdAt
            })),
            assignedSleep: transformedAssignedSleep,
            date: format(targetDate, 'yyyy-MM-dd'),
            dataHash
        });
    } catch (error) {
        console.error('Sleep GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch sleep data' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const { hours, minutes = 0, quality = 'Good', date } = await request.json();

        const targetDate = date ? parseISO(date) : new Date();
        const dayStart = startOfDay(targetDate);
        const dayEnd = endOfDay(targetDate);

        const entry = {
            _id: new mongoose.Types.ObjectId(),
            hours: Number(hours) || 0,
            minutes: Number(minutes) || 0,
            quality: quality || 'Good',
            time: format(new Date(), 'h:mm a'),
            createdAt: new Date()
        };

        const journal = await JournalTracking.findOneAndUpdate(
            {
                client: session.user.id,
                date: { $gte: dayStart, $lt: dayEnd }
            },
            {
                $push: { sleep: entry },
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
            action: 'Logged Sleep',
            actionType: 'create',
            category: 'fitness',
            description: `Client logged ${hours}h ${minutes}m of sleep.`,
            details: { hours, minutes, quality, date: format(targetDate, 'yyyy-MM-dd') },
        }).catch(() => { });

        return NextResponse.json({
            success: true,
            entry: {
                ...entry,
                _id: entry._id.toString()
            }
        });
    } catch (error) {
        console.error('Sleep POST error:', error);
        return NextResponse.json({ error: 'Failed to add sleep entry' }, { status: 500 });
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
                        'assignedSleep.isCompleted': true,
                        'assignedSleep.completedAt': new Date()
                    }
                }
            );

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Sleep PATCH error:', error);
        return NextResponse.json({ error: 'Failed to update sleep' }, { status: 500 });
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
                $pull: { sleep: { _id: new mongoose.Types.ObjectId(entryId) } }
            }
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Sleep DELETE error:', error);
        return NextResponse.json({ error: 'Failed to delete sleep entry' }, { status: 500 });
    }
}
