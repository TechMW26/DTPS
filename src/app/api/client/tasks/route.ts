import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db/connection";
import JournalTracking from "@/lib/db/models/JournalTracking";
import User from "@/lib/db/models/User";
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET - Get all assigned tasks for a date
export async function GET(request: Request) {
    try {
        // Run auth + DB connection in PARALLEL
        const [session] = await Promise.all([
            getServerSession(authOptions),
            dbConnect()
        ]);

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get date from query params
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');

        // Get date range
        const targetDate = dateParam ? new Date(dateParam) : new Date();
        targetDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);

        // Get today's journal
        const journal = await withCache(
      `client:tasks:${JSON.stringify({
            client: session.user.id,
            date: { $gte: targetDate, $lt: nextDay }
        })}`,
      async () => await JournalTracking.findOne({
            client: session.user.id,
            date: { $gte: targetDate, $lt: nextDay }
        }),
      { ttl: 60000, tags: ['client'] }
    );

        if (journal) {
        }

        // Calculate current steps
        const currentSteps = journal?.steps?.reduce((sum: number, entry: any) => sum + entry.steps, 0) || 0;

        // Calculate current sleep
        const currentSleepMinutes = journal?.sleep?.reduce((sum: number, entry: any) =>
            sum + (entry.hours * 60) + (entry.minutes || 0), 0) || 0;
        const currentSleepHours = Math.floor(currentSleepMinutes / 60);
        const currentSleepMins = currentSleepMinutes % 60;

        // Calculate current water intake
        const currentWater = journal?.water?.reduce((sum: number, entry: any) => {
            const unitToMl: Record<string, number> = {
                'Glass (250ml)': 250,
                'Bottle (500ml)': 500,
                'Bottle (1L)': 1000,
                'Cup (200ml)': 200,
                'glasses': 250,
                'ml': 1
            };
            return sum + (entry.amount * (unitToMl[entry.unit] || 1));
        }, 0) || 0;

        // Calculate current activity minutes
        const currentActivityMinutes = journal?.activities?.reduce((sum: number, entry: any) =>
            sum + (entry.duration || 0), 0) || 0;

        // Format assigned activities
        const assignedActivities = journal?.assignedActivities?.activities?.map((activity: any, index: number) => ({
            _id: `activity-${index}`,
            name: activity.name,
            sets: activity.sets || 0,
            reps: activity.reps || 0,
            duration: activity.duration || 0,
            videoLink: activity.videoLink || '',
            completed: activity.completed || false,
            completedAt: activity.completedAt
        })) || [];

        // Generate data hash for change detection (based on updatedAt)
        const dataHash = journal?.updatedAt?.toISOString() || 'no-data';

        return NextResponse.json({
            // Assigned Water
            water: journal?.assignedWater?.amount ? {
                amount: journal.assignedWater.amount,
                assignedAt: journal.assignedWater.assignedAt,
                isCompleted: journal.assignedWater.isCompleted || currentWater >= journal.assignedWater.amount,
                completedAt: journal.assignedWater.completedAt,
                currentIntake: currentWater
            } : null,

            // Assigned Steps
            steps: journal?.assignedSteps?.target ? {
                target: journal.assignedSteps.target,
                current: currentSteps,
                assignedAt: journal.assignedSteps.assignedAt,
                isCompleted: journal.assignedSteps.isCompleted || currentSteps >= journal.assignedSteps.target,
                completedAt: journal.assignedSteps.completedAt
            } : null,

            // Assigned Sleep
            sleep: journal?.assignedSleep?.targetHours ? {
                targetHours: journal.assignedSleep.targetHours,
                targetMinutes: journal.assignedSleep.targetMinutes || 0,
                currentHours: currentSleepHours,
                currentMinutes: currentSleepMins,
                assignedAt: journal.assignedSleep.assignedAt,
                isCompleted: journal.assignedSleep.isCompleted || (currentSleepMinutes >= (journal.assignedSleep.targetHours * 60 + (journal.assignedSleep.targetMinutes || 0))),
                completedAt: journal.assignedSleep.completedAt
            } : null,

            // Assigned Activities
            activities: assignedActivities,
            activitiesAssignedAt: journal?.assignedActivities?.assignedAt || null,
            allActivitiesCompleted: assignedActivities.length > 0 ? assignedActivities.every((a: any) => a.completed) : false,

            // Current logged data (for display)
            currentData: {
                water: currentWater,
                steps: currentSteps,
                sleepHours: currentSleepHours,
                sleepMinutes: currentSleepMins,
                activityMinutes: currentActivityMinutes
            },

            date: targetDate.toISOString(),
            dataHash
        });
    } catch (error) {
        console.error("Error fetching tasks:", error);
        return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
    }
}

// PATCH - Complete a task
export async function PATCH(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await dbConnect();
        const data = await request.json();
        const { taskType, taskIndex, date: dateParam, action } = data;

        if (action !== 'complete') {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        // Get date range
        const targetDate = dateParam ? new Date(dateParam) : new Date();
        targetDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);

        let result;

        switch (taskType) {
            case 'water':
                // Mark assigned water as completed
                result = await JournalTracking.findOneAndUpdate(
                    {
                        client: session.user.id,
                        date: { $gte: targetDate, $lt: nextDay },
                        'assignedWater.amount': { $gt: 0 }
                    },
                    {
                        $set: {
                            'assignedWater.isCompleted': true,
                            'assignedWater.completedAt': new Date()
                        }
                    },
                    { new: true }
                );

                if (!result) {
                    return NextResponse.json({ error: "No assigned water found" }, { status: 404 });
                }
                break;

            case 'steps':
                // Mark assigned steps as completed
                result = await JournalTracking.findOneAndUpdate(
                    {
                        client: session.user.id,
                        date: { $gte: targetDate, $lt: nextDay },
                        'assignedSteps.target': { $gt: 0 }
                    },
                    {
                        $set: {
                            'assignedSteps.isCompleted': true,
                            'assignedSteps.completedAt': new Date()
                        }
                    },
                    { new: true }
                );

                if (!result) {
                    return NextResponse.json({ error: "No assigned steps found" }, { status: 404 });
                }
                break;

            case 'sleep':
                // Mark assigned sleep as completed
                result = await JournalTracking.findOneAndUpdate(
                    {
                        client: session.user.id,
                        date: { $gte: targetDate, $lt: nextDay },
                        'assignedSleep.targetHours': { $gt: 0 }
                    },
                    {
                        $set: {
                            'assignedSleep.isCompleted': true,
                            'assignedSleep.completedAt': new Date()
                        }
                    },
                    { new: true }
                );

                if (!result) {
                    return NextResponse.json({ error: "No assigned sleep found" }, { status: 404 });
                }
                break;

            case 'activity':
                // Mark specific activity in assignedActivities as completed
                // taskId is in format "activity-{index}"
                const { taskId } = data;
                let activityIndex = taskIndex;

                // Extract index from taskId if provided
                if (taskId && typeof taskId === 'string' && taskId.startsWith('activity-')) {
                    activityIndex = parseInt(taskId.replace('activity-', ''));
                }

                if (activityIndex === undefined || activityIndex === null || isNaN(activityIndex)) {
                    return NextResponse.json({ error: "Activity index required" }, { status: 400 });
                }

                // First get the journal to update the specific activity
                const journal = await withCache(
      `client:tasks:${JSON.stringify({
                    client: session.user.id,
                    date: { $gte: targetDate, $lt: nextDay }
                })}`,
      async () => await JournalTracking.findOne({
                    client: session.user.id,
                    date: { $gte: targetDate, $lt: nextDay }
                }),
      { ttl: 60000, tags: ['client'] }
    );

                if (!journal || !journal.assignedActivities?.activities?.[activityIndex]) {
                    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
                }

                // Mark the specific activity as completed
                journal.assignedActivities.activities[activityIndex].completed = true;
                journal.assignedActivities.activities[activityIndex].completedAt = new Date();

                // Check if all activities are completed
                const allCompleted = journal.assignedActivities.activities.every((a: any) => a.completed);
                if (allCompleted) {
                    journal.assignedActivities.isCompleted = true;
                    journal.assignedActivities.completedAt = new Date();
                }

                await journal.save();
                result = journal;
                break;

            default:
                return NextResponse.json({ error: "Invalid task type" }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: `${taskType} task marked as complete`
        });
    } catch (error) {
        console.error("Error completing task:", error);
        return NextResponse.json({ error: "Failed to complete task" }, { status: 500 });
    }
}
