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
    `admin:clients:clientId:assign-water:${JSON.stringify({
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

// GET - Get assigned water status for a client
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
      `admin:clients:clientId:assign-water:${JSON.stringify(session.user.id)}`,
      async () => await User.findById(session.user.id),
      { ttl: 120000, tags: ['admin'] }
    );
    if (!currentUser || !['admin', 'dietitian', 'health_counselor'].includes(currentUser.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Verify the client exists and is assigned to this dietitian
    const client = await withCache(
      `admin:clients:clientId:assign-water:${JSON.stringify(clientId)}`,
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
      `admin:clients:clientId:assign-water:${JSON.stringify({
        client: clientId,
        date: { $gte: targetDate, $lt: nextDay }
      })}`,
      async () => await JournalTracking.findOne({
        client: clientId,
        date: { $gte: targetDate, $lt: nextDay }
      }),
      { ttl: 120000, tags: ['admin'] }
    );

    // Calculate total water intake
    const totalWaterIntake = journal?.water?.reduce((sum: number, entry: any) => {
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

    return NextResponse.json({
      assignedWater: journal?.assignedWater ? {
        amount: journal.assignedWater.amount || 0,
        assignedAt: journal.assignedWater.assignedAt,
        isCompleted: journal.assignedWater.isCompleted || false,
        completedAt: journal.assignedWater.completedAt
      } : null,
      totalWaterIntake,
      clientName: client.name,
      date: targetDate.toISOString(),
      lastUpdated: journal?.updatedAt || null
    });
  } catch (error) {
    console.error("Error fetching assigned water:", error);
    return NextResponse.json({ error: "Failed to fetch assigned water" }, { status: 500 });
  }
}

// POST - Assign water intake goal to a client
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
      `admin:clients:clientId:assign-water:${JSON.stringify(session.user.id)}`,
      async () => await User.findById(session.user.id),
      { ttl: 120000, tags: ['admin'] }
    );
    if (!currentUser || !['admin', 'dietitian', 'health_counselor'].includes(currentUser.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Verify the client exists
    const client = await withCache(
      `admin:clients:clientId:assign-water:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['admin'] }
    );
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const { amount, date: dateParam } = data;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid water amount" }, { status: 400 });
    }

    // Get date range
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Note: Task assignment is allowed even without a meal plan
    // This allows dietitians/health counselors to assign tasks independently

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
        assignedWater: {
          amount: amount,
          assignedBy: session.user.id,
          assignedAt: new Date(),
          isCompleted: false
        }
      });
    } else {
      // Update existing journal with assigned water
      journal.assignedWater = {
        amount: amount,
        assignedBy: session.user.id,
        assignedAt: new Date(),
        isCompleted: false,
        completedAt: undefined
      };
    }

    await journal.save();

    // Send push notification to client about assigned task
    try {
      const dateStr = targetDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
      await sendTaskAssignedNotification(clientId, {
        taskType: 'water',
        target: `${amount}ml`,
        date: dateStr
      });
    } catch (notifError) {
      console.error('Failed to send task notification:', notifError);
    }

    return NextResponse.json({
      success: true,
      assignedWater: {
        amount: amount,
        assignedAt: journal.assignedWater?.assignedAt,
        isCompleted: false
      },
      message: `Successfully assigned ${amount}ml water intake to ${client.name}`
    });
  } catch (error) {
    console.error("Error assigning water:", error);
    return NextResponse.json({ error: "Failed to assign water" }, { status: 500 });
  }
}

// DELETE - Remove assigned water
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
      `admin:clients:clientId:assign-water:${JSON.stringify(session.user.id)}`,
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

    // Find journal and remove assigned water
    const result = await JournalTracking.findOneAndUpdate(
      {
        client: clientId,
        date: { $gte: targetDate, $lt: nextDay }
      },
      {
        $unset: { assignedWater: 1 }
      },
      { new: true }
    );

    return NextResponse.json({
      success: true,
      message: "Assigned water removed successfully"
    });
  } catch (error) {
    console.error("Error removing assigned water:", error);
    return NextResponse.json({ error: "Failed to remove assigned water" }, { status: 500 });
  }
}
