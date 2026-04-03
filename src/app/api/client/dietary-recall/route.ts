import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db/connection";
import DietaryRecall from "@/lib/db/models/DietaryRecall";
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    // Get all dietary recalls for the user, sorted by date descending
    const recalls = await withCache(
      `client:dietary-recall:${JSON.stringify({ userId: session.user.id })}`,
      async () => await DietaryRecall.find({ userId: session.user.id })
        .sort({ date: -1 })
        .limit(30),
      { ttl: 120000, tags: ['client'] }
    ); // Get last 30 recalls

    return NextResponse.json({ recalls });
  } catch (error) {
    console.error("Error fetching dietary recall:", error);
    return NextResponse.json({ error: "Failed to fetch dietary recall" }, { status: 500 });
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

    // If date is provided, use it, otherwise use today
    const date = data.date ? new Date(data.date) : new Date();
    date.setHours(0, 0, 0, 0);

    // Check if a recall already exists for this date
    const existingRecall = await withCache(
      `client:dietary-recall:${JSON.stringify({
        userId: session.user.id,
        date: {
          $gte: date,
          $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000)
        }
      })}`,
      async () => await DietaryRecall.findOne({
        userId: session.user.id,
        date: {
          $gte: date,
          $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000)
        }
      }),
      { ttl: 120000, tags: ['client'] }
    );

    let dietaryRecall;

    if (existingRecall) {
      // Update existing recall
      existingRecall.meals = data.meals || [];
      dietaryRecall = await existingRecall.save();
    } else {
      // Create new recall
      dietaryRecall = await DietaryRecall.create({
        userId: session.user.id,
        date,
        meals: data.meals || []
      });
    }

    // Log activity
    logActivity({
      userId: session.user.id,
      userRole: 'client',
      userName: session.user.name || '',
      userEmail: session.user.email || '',
      action: existingRecall ? 'update_dietary_recall' : 'create_dietary_recall',
      actionType: existingRecall ? 'update' : 'create',
      category: 'fitness',
      description: `${existingRecall ? 'Updated' : 'Recorded'} dietary recall for ${date.toDateString()}`,
      targetUserId: session.user.id,
      targetUserName: session.user.name || '',
      details: {
        date: date.toISOString(),
        mealsCount: data.meals?.length || 0
      }
    }).catch(console.error);

    return NextResponse.json({ success: true, data: dietaryRecall });
  } catch (error) {
    console.error("Error saving dietary recall:", error);
    return NextResponse.json({ error: "Failed to save dietary recall" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  return POST(request);
}
