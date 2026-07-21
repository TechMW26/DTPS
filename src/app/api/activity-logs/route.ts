import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import connectDB from "@/lib/db/connection";
import ActivityLog from "@/lib/db/models/ActivityLog";
import { UserRole } from "@/types";
import { withCache, clearCacheByTag } from "@/lib/api/utils";
import { startOfTodayIST } from "@/lib/utils/ist";

// GET /api/activity-logs - Get activity logs
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const userRole = searchParams.get("userRole");
    const category = searchParams.get("category");
    const actionType = searchParams.get("actionType");
    const userId = searchParams.get("userId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");

    // Build query
    const query: any = {};

    // Role-based access control
    if (session.user.role === UserRole.CLIENT) {
      // Clients can only see their own activities
      query.$or = [
        { userId: session.user.id },
        { targetUserId: session.user.id },
      ];
    } else if (
      session.user.role === UserRole.DIETITIAN ||
      session.user.role === UserRole.HEALTH_COUNSELOR
    ) {
      // Dietitians/Health Counselors can see their own activities and activities involving their clients
      if (userId) {
        query.$or = [{ userId }, { targetUserId: userId }];
      }
    }
    // Admins can see all activities

    // Apply filters
    if (userRole && session.user.role === UserRole.ADMIN) {
      query.userRole = userRole;
    }

    if (category) {
      query.category = category;
    }

    if (actionType) {
      query.actionType = actionType;
    }

    if (userId && session.user.role === UserRole.ADMIN) {
      query.$or = [{ userId }, { targetUserId: userId }];
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    if (search) {
      query.$or = [
        { action: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { userName: { $regex: search, $options: "i" } },
        { targetUserName: { $regex: search, $options: "i" } },
        { resourceName: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [activities, total] = await Promise.all([
      ActivityLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(query),
    ]);

    // Get activity stats
    const stats = await withCache(
      `activity-logs:${JSON.stringify([
        { $match: session.user.role === UserRole.ADMIN ? {} : query },
        {
          $facet: {
            byCategory: [{ $group: { _id: "$category", count: { $sum: 1 } } }],
            byActionType: [
              { $group: { _id: "$actionType", count: { $sum: 1 } } },
            ],
            byUserRole: [{ $group: { _id: "$userRole", count: { $sum: 1 } } }],
            todayCount: [
              { $match: { createdAt: { $gte: startOfTodayIST() } } },
              { $count: "count" },
            ],
          },
        },
      ])}`,
      async () =>
        await ActivityLog.aggregate([
          { $match: session.user.role === UserRole.ADMIN ? {} : query },
          {
            $facet: {
              byCategory: [
                { $group: { _id: "$category", count: { $sum: 1 } } },
              ],
              byActionType: [
                { $group: { _id: "$actionType", count: { $sum: 1 } } },
              ],
              byUserRole: [
                { $group: { _id: "$userRole", count: { $sum: 1 } } },
              ],
              todayCount: [
                { $match: { createdAt: { $gte: startOfTodayIST() } } },
                { $count: "count" },
              ],
            },
          },
        ]),
      { ttl: 120000, tags: ["activity_logs"] },
    );

    return NextResponse.json({
      activities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        byCategory: stats[0]?.byCategory || [],
        byActionType: stats[0]?.byActionType || [],
        byUserRole: stats[0]?.byUserRole || [],
        todayCount: stats[0]?.todayCount[0]?.count || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching activity logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity logs" },
      { status: 500 },
    );
  }
}

// POST /api/activity-logs - Create activity log (for manual logging)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();

    const activity = await ActivityLog.create({
      userId: session.user.id,
      userRole: session.user.role,
      userName: session.user.name,
      userEmail: session.user.email,
      ...body,
      isRead: false,
    });

    clearCacheByTag("activity_logs");

    return NextResponse.json({ activity }, { status: 201 });
  } catch (error) {
    console.error("Error creating activity log:", error);
    return NextResponse.json(
      { error: "Failed to create activity log" },
      { status: 500 },
    );
  }
}

// DELETE /api/activity-logs - Clear old activity logs (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const daysOld = parseInt(searchParams.get("daysOld") || "90");

    await connectDB();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await ActivityLog.deleteMany({
      createdAt: { $lt: cutoffDate },
    });

    clearCacheByTag("activity_logs");

    return NextResponse.json({
      message: `Deleted ${result.deletedCount} activity logs older than ${daysOld} days`,
    });
  } catch (error) {
    console.error("Error deleting activity logs:", error);
    return NextResponse.json(
      { error: "Failed to delete activity logs" },
      { status: 500 },
    );
  }
}
