import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db/connection";
import JournalTracking from "@/lib/db/models/JournalTracking";
import User from "@/lib/db/models/User";
import mongoose from "mongoose";
import { withCache } from '@/lib/api/utils';

// Conversion map: stored unit -> milliliters
const UNIT_TO_ML: Record<string, number> = {
  'Glass (250ml)': 250,
  'Bottle (500ml)': 500,
  'Bottle (1L)': 1000,
  'Cup (200ml)': 200,
  'glasses': 250,
  'ml': 1,
};

const toMl = (amount: number, unit: string) => amount * (UNIT_TO_ML[unit] ?? 1);

// Resolve the [start, nextDay) range for a given date param (defaults to today)
function getDateRange(dateParam?: string | null) {
  const targetDate = dateParam ? new Date(dateParam) : new Date();
  targetDate.setHours(0, 0, 0, 0);
  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);
  return { targetDate, nextDay };
}

// Cached lookup of the user's water goal in millilitres (changes rarely).
// `dailyGoals.water` is stored in ml (e.g. 2500). The legacy `goals.water` is
// stored in GLASSES (e.g. 8), so it must be converted (1 glass = 250ml).
async function getWaterGoal(userId: string): Promise<number> {
  const user = await withCache(
    `client:hydration:goal:${userId}`,
    async () => await User.findById(userId).select('goals dailyGoals').lean(),
    { ttl: 120000, tags: ['client'] }
  );
  const dailyMl = (user as any)?.dailyGoals?.water;
  if (dailyMl && dailyMl >= 100) return dailyMl;

  const glasses = (user as any)?.goals?.water;
  if (glasses && glasses > 0) return glasses * 250;

  return 2500;
}

// Build the canonical hydration payload from a journal document
function buildHydrationResponse(journal: any, waterGoal: number, targetDate: Date) {
  const waterList = journal?.water || [];

  const totalToday = waterList.reduce(
    (sum: number, entry: any) => sum + toMl(entry.amount, entry.unit),
    0
  );

  const entries = waterList
    .map((entry: any) => ({
      _id: entry._id.toString(),
      amount: toMl(entry.amount, entry.unit),
      unit: 'ml',
      type: entry.type || 'water',
      time: entry.time,
      createdAt: entry.createdAt,
    }))
    .sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  return {
    totalToday,
    goal: waterGoal,
    entries,
    date: targetDate.toISOString(),
    assignedWater: journal?.assignedWater
      ? {
        amount: journal.assignedWater.amount || 0,
        assignedAt: journal.assignedWater.assignedAt,
        isCompleted: journal.assignedWater.isCompleted || false,
        completedAt: journal.assignedWater.completedAt,
      }
      : null,
    // Change-detection token: updates whenever the journal document changes
    dataHash: journal?.updatedAt
      ? new Date(journal.updatedAt).toISOString()
      : 'no-data',
  };
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const { targetDate, nextDay } = getDateRange(searchParams.get('date'));

    // Fetch journal + goal in parallel; lean() for speed (no Mongoose hydration)
    const [journal, waterGoal] = await Promise.all([
      JournalTracking.findOne({
        client: session.user.id,
        date: { $gte: targetDate, $lt: nextDay },
      })
        .select('water assignedWater updatedAt')
        .lean(),
      getWaterGoal(session.user.id),
    ]);

    return NextResponse.json(buildHydrationResponse(journal, waterGoal, targetDate));
  } catch (error) {
    console.error("Error fetching hydration data:", error);
    return NextResponse.json({ error: "Failed to fetch hydration data" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const data = await request.json();
    const { amount, unit = 'ml', type = 'water', time, date: dateParam } = data;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const { targetDate, nextDay } = getDateRange(dateParam);

    const waterEntry = {
      _id: new mongoose.Types.ObjectId(),
      amount,
      unit,
      type,
      time:
        time ||
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
      createdAt: new Date(),
    };

    // Upsert + return updated doc in one round-trip; goal lookup runs in parallel
    // so we can return full state without a second request.
    const [journal, waterGoal] = await Promise.all([
      JournalTracking.findOneAndUpdate(
        {
          client: session.user.id,
          date: { $gte: targetDate, $lt: nextDay },
        },
        {
          $push: { water: waterEntry },
          $setOnInsert: {
            client: session.user.id,
            date: targetDate,
            targets: {
              steps: 10000,
              water: 2500,
              sleep: 8,
              calories: 2000,
              protein: 150,
              carbs: 250,
              fat: 65,
              activityMinutes: 60,
            },
          },
        },
        { upsert: true, new: true }
      )
        .select('water assignedWater updatedAt')
        .lean(),
      getWaterGoal(session.user.id),
    ]);

    return NextResponse.json({
      success: true,
      ...buildHydrationResponse(journal, waterGoal, targetDate),
    });
  } catch (error) {
    console.error("Error adding water:", error);
    return NextResponse.json({ error: "Failed to add water" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get('id');
    const dateParam = searchParams.get('date');

    if (!entryId) {
      return NextResponse.json({ error: "Entry ID required" }, { status: 400 });
    }

    await dbConnect();
    const { targetDate, nextDay } = getDateRange(dateParam);

    // Pull the entry and return the updated doc in one round-trip
    const [journal, waterGoal] = await Promise.all([
      JournalTracking.findOneAndUpdate(
        {
          client: session.user.id,
          date: { $gte: targetDate, $lt: nextDay },
        },
        { $pull: { water: { _id: entryId } } },
        { new: true }
      )
        .select('water assignedWater updatedAt')
        .lean(),
      getWaterGoal(session.user.id),
    ]);

    if (!journal) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      ...buildHydrationResponse(journal, waterGoal, targetDate),
    });
  } catch (error) {
    console.error("Error deleting water entry:", error);
    return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 });
  }
}

// Mark assigned water as completed
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const data = await request.json();
    const { action, date: dateParam } = data;

    if (action !== 'complete') {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { targetDate, nextDay } = getDateRange(dateParam);

    const [result, waterGoal] = await Promise.all([
      JournalTracking.findOneAndUpdate(
        {
          client: session.user.id,
          date: { $gte: targetDate, $lt: nextDay },
          'assignedWater.amount': { $gt: 0 },
        },
        {
          $set: {
            'assignedWater.isCompleted': true,
            'assignedWater.completedAt': new Date(),
          },
        },
        { new: true }
      )
        .select('water assignedWater updatedAt')
        .lean(),
      getWaterGoal(session.user.id),
    ]);

    if (!result) {
      return NextResponse.json({ error: "No assigned water found for this date" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      ...buildHydrationResponse(result, waterGoal, targetDate),
    });
  } catch (error) {
    console.error("Error completing assigned water:", error);
    return NextResponse.json({ error: "Failed to complete assigned water" }, { status: 500 });
  }
}
