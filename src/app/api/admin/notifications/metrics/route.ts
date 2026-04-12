import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import NotificationDeliveryAudit from '@/lib/db/models/NotificationDeliveryAudit';

const ALLOWED_ACTION_TYPES = ['assigned', 'message', 'meal', 'update', 'custom'];
const ALLOWED_ROLES = ['admin', 'dietitian', 'health_counselor', 'client'];

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function toDateRange(days: number): { from: Date; to: Date } {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);
    return { from, to };
}

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role || '').toLowerCase();
        if (role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }

        await connectDB();

        const { searchParams } = new URL(request.url);
        const requestedDays = Number(searchParams.get('days') || 7);
        const days = clampNumber(Number.isFinite(requestedDays) ? requestedDays : 7, 1, 90);

        const roleFilter = String(searchParams.get('role') || '').toLowerCase();
        const actionTypeFilter = String(searchParams.get('actionType') || '').toLowerCase();

        const { from, to } = toDateRange(days);

        const matchStage: Record<string, unknown> = {
            createdAt: { $gte: from, $lte: to },
        };

        if (ALLOWED_ROLES.includes(roleFilter)) {
            matchStage.recipientRole = roleFilter;
        }

        if (ALLOWED_ACTION_TYPES.includes(actionTypeFilter)) {
            matchStage.actionType = actionTypeFilter;
        }

        const [summaryRows, byAction, byRole, timeline, recentFailures] = await Promise.all([
            NotificationDeliveryAudit.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                    },
                },
            ]),
            NotificationDeliveryAudit.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: '$actionType',
                        total: { $sum: 1 },
                        sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
                        deduped: { $sum: { $cond: [{ $eq: ['$status', 'deduped'] }, 1, 0] } },
                        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
                    },
                },
                { $sort: { total: -1 } },
            ]),
            NotificationDeliveryAudit.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: '$recipientRole',
                        total: { $sum: 1 },
                        sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
                        deduped: { $sum: { $cond: [{ $eq: ['$status', 'deduped'] }, 1, 0] } },
                        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
                    },
                },
                { $sort: { total: -1 } },
            ]),
            NotificationDeliveryAudit.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: '$createdAt',
                                timezone: 'Asia/Kolkata',
                            },
                        },
                        total: { $sum: 1 },
                        sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
                        deduped: { $sum: { $cond: [{ $eq: ['$status', 'deduped'] }, 1, 0] } },
                        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
            NotificationDeliveryAudit.find({
                ...matchStage,
                status: 'failed',
            })
                .select('recipientRole actionType title clientName error createdAt')
                .sort({ createdAt: -1 })
                .limit(20)
                .lean(),
        ]);

        const totals = { sent: 0, deduped: 0, failed: 0, total: 0 };

        summaryRows.forEach((row: any) => {
            const status = String(row._id || '');
            const count = Number(row.count || 0);
            if (status === 'sent') totals.sent = count;
            if (status === 'deduped') totals.deduped = count;
            if (status === 'failed') totals.failed = count;
            totals.total += count;
        });

        const failureRate = totals.total > 0 ? Number(((totals.failed / totals.total) * 100).toFixed(2)) : 0;
        const dedupeRate = totals.total > 0 ? Number(((totals.deduped / totals.total) * 100).toFixed(2)) : 0;

        return NextResponse.json({
            success: true,
            window: {
                from: from.toISOString(),
                to: to.toISOString(),
                days,
            },
            filters: {
                role: ALLOWED_ROLES.includes(roleFilter) ? roleFilter : null,
                actionType: ALLOWED_ACTION_TYPES.includes(actionTypeFilter) ? actionTypeFilter : null,
            },
            totals,
            rates: {
                failureRate,
                dedupeRate,
            },
            breakdown: {
                byAction: byAction.map((item: any) => ({
                    actionType: item._id,
                    total: Number(item.total || 0),
                    sent: Number(item.sent || 0),
                    deduped: Number(item.deduped || 0),
                    failed: Number(item.failed || 0),
                })),
                byRole: byRole.map((item: any) => ({
                    recipientRole: item._id,
                    total: Number(item.total || 0),
                    sent: Number(item.sent || 0),
                    deduped: Number(item.deduped || 0),
                    failed: Number(item.failed || 0),
                })),
            },
            timeline: timeline.map((item: any) => ({
                date: item._id,
                total: Number(item.total || 0),
                sent: Number(item.sent || 0),
                deduped: Number(item.deduped || 0),
                failed: Number(item.failed || 0),
            })),
            recentFailures,
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching notification delivery metrics:', error);
        return NextResponse.json(
            { error: 'Failed to fetch notification delivery metrics' },
            { status: 500 }
        );
    }
}
