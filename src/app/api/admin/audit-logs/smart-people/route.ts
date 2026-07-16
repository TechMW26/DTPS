import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import ActivityLog from '@/lib/db/models/ActivityLog';
import User from '@/lib/db/models/User';

export const dynamic = 'force-dynamic';

// GET - Paginated fetch of ActivityLog for all roles
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = (session.user as any).role?.toLowerCase?.() ?? '';
        if (role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await connectDB();

        // Get query parameters
        const { searchParams } = new URL(request.url);
        const roleFilter = searchParams.get('role'); // 'all', 'dietitian', 'health_counselor', 'client', 'admin'
        const actionType = searchParams.get('actionType');
        const category = searchParams.get('category');
        const search = searchParams.get('search');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const limit = Math.min(parseInt(searchParams.get('limit') || '40'), 100);
        const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
        const skip = (page - 1) * limit;

        // Build filter
        const filter: any = {};

        // Role filter
        if (roleFilter && roleFilter !== 'all') {
            filter.userRole = roleFilter;
        }

        // Action type filter
        if (actionType && actionType !== 'all') {
            filter.actionType = actionType;
        }

        // Category filter
        if (category && category !== 'all') {
            filter.category = category;
        }

        // Date range filter
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) {
                filter.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                filter.createdAt.$lte = new Date(endDate);
            }
        }

        // Search filter - search across multiple fields
        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), 'i');
            filter.$or = [
                { userName: searchRegex },
                { userEmail: searchRegex },
                { description: searchRegex },
                { action: searchRegex },
                { targetUserName: searchRegex },
                { category: searchRegex },
            ];
        }

        // Execute queries in parallel
        const [logsRaw, total, roleCounts] = await Promise.all([
            // Paginated logs with user population
            ActivityLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('userId', 'firstName lastName email phone avatar')
                .populate('targetUserId', 'firstName lastName email phone')
                .lean(),

            // Total count for current filter
            ActivityLog.countDocuments(filter),

            // Count by role (always unfiltered for stats)
            ActivityLog.aggregate([
                {
                    $group: {
                        _id: '$userRole',
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        // Enrich logs with populated user data
        const logs = logsRaw.map((log: any) => {
            const populatedUser = log.userId;
            const populatedTarget = log.targetUserId;

            return {
                ...log,
                // If we have populated user data, use it; otherwise fallback to stored values
                userName: populatedUser?.firstName
                    ? `${populatedUser.firstName} ${populatedUser.lastName || ''}`.trim()
                    : log.userName,
                userEmail: populatedUser?.email || log.userEmail,
                userPhone: populatedUser?.phone || log.userPhone || null,
                userAvatar: populatedUser?.avatar || null,
                // userId should be the string ID
                userId: typeof log.userId === 'object' && log.userId?._id
                    ? log.userId._id.toString()
                    : log.userId?.toString?.() || log.userId,
                // Target user enrichment
                targetUserName: populatedTarget?.firstName
                    ? `${populatedTarget.firstName} ${populatedTarget.lastName || ''}`.trim()
                    : log.targetUserName,
                targetUserPhone: populatedTarget?.phone || null,
                targetUserId: typeof log.targetUserId === 'object' && log.targetUserId?._id
                    ? log.targetUserId._id.toString()
                    : log.targetUserId?.toString?.() || log.targetUserId,
            };
        });

        // Transform role counts into object
        const roleCountsObj: Record<string, number> = {
            all: 0,
            admin: 0,
            dietitian: 0,
            health_counselor: 0,
            client: 0,
        };

        for (const rc of roleCounts) {
            if (rc._id && rc._id in roleCountsObj) {
                roleCountsObj[rc._id as string] = rc.count;
                roleCountsObj.all += rc.count;
            }
        }

        // Get unique action types for filter dropdown
        const actionTypes = await ActivityLog.distinct('actionType');

        // Get unique categories for filter dropdown  
        const categories = await ActivityLog.distinct('category');

        return NextResponse.json({
            logs,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
            roleCounts: roleCountsObj,
            actionTypes: actionTypes.filter(Boolean).sort(),
            categories: categories.filter(Boolean).sort(),
        });
    } catch (error) {
        console.error('Error fetching smart people audit logs:', error);
        return NextResponse.json(
            { error: 'Failed to fetch audit logs' },
            { status: 500 }
        );
    }
}
