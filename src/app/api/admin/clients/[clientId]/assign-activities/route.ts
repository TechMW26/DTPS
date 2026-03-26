import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db/connection";
import JournalTracking from "@/lib/db/models/JournalTracking";
import User from "@/lib/db/models/User";
import ClientMealPlan from "@/lib/db/models/ClientMealPlan";
import { sendTaskAssignedNotification } from "@/lib/notifications/notificationService";
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// Helper to check if client has active meal plan for a given date
async function hasActiveMealPlan(clientId: string, targetDate: Date): Promise<boolean> {
    const planStartOfDay = new Date(targetDate);
    planStartOfDay.setHours(0, 0, 0, 0);
    const planEndOfDay = new Date(targetDate);
    planEndOfDay.setHours(23, 59, 59, 999);

    const activePlan = await withCache(
        `admin:clients:clientId:assign-activities:${JSON.stringify({
            clientId: clientId,
            status: 'active',
            startDate: { $lte: planEndOfDay },
            endDate: { $gte: planStartOfDay }
        })}`,
        async () => await ClientMealPlan.findOne({
            clientId: clientId,
            status: 'active',
            startDate: { $lte: planEndOfDay },
            endDate: { $gte: planStartOfDay }
        }),
        { ttl: 120000, tags: ['admin'] }
    );

    return !!activePlan;
}

// GET - Get assigned activities for a client
export async function GET(
    request: Request,
    { params }: { params: Promise<{ clientId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { clientId } = await params;
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');

        await dbConnect();

        // Verify the user is a dietitian/admin/health_counselor
        const currentUser = await withCache(
            `admin:clients:clientId:assign-activities:${JSON.stringify(session.user.id)}`,
            async () => await User.findById(session.user.id),
            { ttl: 120000, tags: ['admin'] }
        );
        if (!currentUser || !['admin', 'dietitian', 'health_counselor'].includes(currentUser.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Verify the client exists
        const client = await withCache(
            `admin:clients:clientId:assign-activities:${JSON.stringify(clientId)}`,
            async () => await User.findById(clientId),
            { ttl: 120000, tags: ['admin'] }
        );
        if (!client) {
            return NextResponse.json({ error: "Client not found" }, { status: 404 });
        }

        // Get date range
        const targetDate = dateParam ? new Date(dateParam) : new Date();
        targetDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);

        // Find journal for the date
        const journal = await withCache(
            `admin:clients:clientId:assign-activities:${JSON.stringify({
                client: clientId,
                date: { $gte: targetDate, $lt: nextDay }
            })}`,
            async () => await JournalTracking.findOne({
                client: clientId,
                date: { $gte: targetDate, $lt: nextDay }
            }),
            { ttl: 120000, tags: ['admin'] }
        );

        // Get assigned activities
        const assignedActivities = journal?.assignedActivities?.activities || [];
        const allCompleted = assignedActivities.length > 0 && assignedActivities.every((a: any) => a.completed);

        // Only return assignedActivities if there are actual activities assigned
        const hasActivities = journal?.assignedActivities && assignedActivities.length > 0;

        return NextResponse.json({
            assignedActivities: hasActivities ? {
                activities: assignedActivities,
                assignedAt: journal.assignedActivities.assignedAt,
                isCompleted: journal.assignedActivities.isCompleted || allCompleted,
                completedAt: journal.assignedActivities.completedAt
            } : null,
            clientName: client.name,
            date: targetDate.toISOString(),
            lastUpdated: journal?.updatedAt || null
        });
    } catch (error) {
        console.error("Error fetching assigned activities:", error);
        return NextResponse.json({ error: "Failed to fetch assigned activities" }, { status: 500 });
    }
}

// POST - Assign activities to a client
export async function POST(
    request: Request,
    { params }: { params: Promise<{ clientId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { clientId } = await params;

        await dbConnect();
        const data = await request.json();

        // Verify the user is a dietitian/admin/health_counselor
        const currentUser = await withCache(
            `admin:clients:clientId:assign-activities:${JSON.stringify(session.user.id)}`,
            async () => await User.findById(session.user.id),
            { ttl: 120000, tags: ['admin'] }
        );
        if (!currentUser || !['admin', 'dietitian', 'health_counselor'].includes(currentUser.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Verify the client exists
        const client = await withCache(
            `admin:clients:clientId:assign-activities:${JSON.stringify(clientId)}`,
            async () => await User.findById(clientId),
            { ttl: 120000, tags: ['admin'] }
        );
        if (!client) {
            return NextResponse.json({ error: "Client not found" }, { status: 404 });
        }

        const { activities, date: dateParam } = data;

        if (!activities || !Array.isArray(activities) || activities.length === 0) {
            return NextResponse.json({ error: "At least one activity is required" }, { status: 400 });
        }

        // Format activities
        const formattedActivities = activities.map((activity: any) => ({
            name: activity.name || 'Activity',
            sets: activity.sets || 0,
            reps: activity.reps || 0,
            duration: activity.duration || 0,
            videoLink: activity.videoLink || '',
            completed: false
        }));

        // Get date range
        const targetDate = dateParam ? new Date(dateParam) : new Date();
        targetDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);

        // Note: Activity assignment is allowed even without a meal plan
        // This allows dietitians to assign activities independently

        // Find or create journal entry
        let journal = await JournalTracking.findOne({
            client: clientId,
            date: { $gte: targetDate, $lt: nextDay }
        });

        if (!journal) {
            journal = new JournalTracking({
                client: clientId,
                date: targetDate,
                water: [],
                activities: [],
                steps: [],
                sleep: [],
                meals: [],
                progress: [],
                bca: [],
                measurements: [],
                assignedActivities: {
                    activities: formattedActivities,
                    assignedBy: session.user.id,
                    assignedAt: new Date(),
                    isCompleted: false
                }
            });
        } else {
            journal.assignedActivities = {
                activities: formattedActivities,
                assignedBy: session.user.id,
                assignedAt: new Date(),
                isCompleted: false,
                completedAt: undefined
            };
            journal.markModified('assignedActivities');
        }

        await journal.save();

        // Send push notification to client about assigned task
        try {
            const dateStr = targetDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
            await sendTaskAssignedNotification(clientId, {
                taskType: 'activity',
                target: `${activities.length} exercise${activities.length > 1 ? 's' : ''}`,
                date: dateStr
            });
        } catch (notifError) {
            console.error('Failed to send task notification:', notifError);
        }

        return NextResponse.json({
            success: true,
            assignedActivities: {
                activities: formattedActivities,
                assignedAt: journal.assignedActivities?.assignedAt,
                isCompleted: false
            },
            message: `Successfully assigned ${activities.length} activities to ${client.name}`
        });
    } catch (error) {
        console.error("Error assigning activities:", error);
        return NextResponse.json({ error: "Failed to assign activities" }, { status: 500 });
    }
}

// DELETE - Remove assigned activities
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ clientId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { clientId } = await params;
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');

        await dbConnect();

        // Verify the user is a dietitian/admin/health_counselor
        const currentUser = await withCache(
            `admin:clients:clientId:assign-activities:${JSON.stringify(session.user.id)}`,
            async () => await User.findById(session.user.id),
            { ttl: 120000, tags: ['admin'] }
        );
        if (!currentUser || !['admin', 'dietitian', 'health_counselor'].includes(currentUser.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Get date range
        const targetDate = dateParam ? new Date(dateParam) : new Date();
        targetDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);

        await JournalTracking.findOneAndUpdate(
            {
                client: clientId,
                date: { $gte: targetDate, $lt: nextDay }
            },
            {
                $unset: { assignedActivities: 1 }
            },
            { new: true }
        );

        return NextResponse.json({
            success: true,
            message: "Assigned activities removed successfully"
        });
    } catch (error) {
        console.error("Error removing assigned activities:", error);
        return NextResponse.json({ error: "Failed to remove assigned activities" }, { status: 500 });
    }
}
