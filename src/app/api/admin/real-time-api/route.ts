import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { SystemAlert, User } from '@/lib/db/models';
import { UserRole } from '@/types';

type RuntimeErrorRecord = {
    id: string;
    title: string;
    message: string;
    type: string;
    source: string;
    priority: string;
    category: string;
    status: string;
    section: string;
    apiEndpoint: string;
    actor: {
        id?: string;
        name: string;
        email?: string;
        role: string;
    };
    createdAt: Date;
    errorStack?: string;
    details?: Record<string, unknown>;
};

const normalizeRole = (value?: string): string => {
    if (!value) return 'unknown';

    const normalized = String(value).toLowerCase().trim();
    if (normalized === 'dietician') return UserRole.DIETITIAN;
    if (normalized === 'health-counselor' || normalized === 'health counselor') return UserRole.HEALTH_COUNSELOR;
    return normalized;
};

const normalizeSection = (value?: string): string => {
    if (!value) return 'unknown';
    const normalized = value.toLowerCase().trim();
    if (normalized === 'dietician') return 'dietitian';
    if (normalized === 'health-counselor' || normalized === 'health counselor') return 'health_counselor';
    return normalized;
};

const firstNonEmptyString = (...values: unknown[]): string | undefined => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return undefined;
};

const endpointToSection = (endpoint?: string, role?: string): string => {
    if (endpoint) {
        if (endpoint.startsWith('/api/admin')) return 'admin';
        if (endpoint.startsWith('/api/client')) return 'client';
        if (endpoint.startsWith('/api/dietitian-panel') || endpoint.startsWith('/api/dietician-panel')) return 'dietitian';
        if (endpoint.startsWith('/api/health-counselor')) return 'health_counselor';
        if (endpoint.startsWith('/api/user')) return 'user';
        if (endpoint.startsWith('/api')) return 'internal';
    }

    switch (normalizeRole(role)) {
        case UserRole.ADMIN:
            return 'admin';
        case UserRole.CLIENT:
            return 'client';
        case UserRole.DIETITIAN:
            return 'dietitian';
        case UserRole.HEALTH_COUNSELOR:
            return 'health_counselor';
        default:
            return 'unknown';
    }
};

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || session.user.role !== UserRole.ADMIN) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        const { searchParams } = new URL(request.url);
        const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100);
        const skip = (page - 1) * limit;

        const search = searchParams.get('search')?.trim() || '';
        const source = searchParams.get('source') || 'all';
        const status = searchParams.get('status') || 'all';
        const role = searchParams.get('role') || 'all';
        const section = searchParams.get('section') || 'all';

        const query: Record<string, unknown> = {
            type: { $in: ['error', 'critical'] }
        };

        if (source !== 'all') query.source = source;
        if (status !== 'all') query.status = status;

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { message: { $regex: search, $options: 'i' } },
                { 'details.endpoint': { $regex: search, $options: 'i' } },
                { 'details.path': { $regex: search, $options: 'i' } },
                { 'details.route': { $regex: search, $options: 'i' } },
                { errorStack: { $regex: search, $options: 'i' } }
            ];
        }

        const [rawAlerts, total] = await Promise.all([
            SystemAlert.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('createdBy', 'firstName lastName email role')
                .lean(),
            SystemAlert.countDocuments(query)
        ]);

        const actorIds = Array.from(new Set(
            rawAlerts
                .map((alert: any) => {
                    const details = (alert.details || {}) as Record<string, unknown>;

                    return firstNonEmptyString(
                        typeof alert.createdBy === 'object' && alert.createdBy?._id ? String(alert.createdBy._id) : undefined,
                        details.userId,
                        details.actorId,
                        details.targetUserId,
                        details.clientId,
                        details.dietitianId,
                        details.healthCounselorId,
                        details.performedBy
                    );
                })
                .filter((id): id is string => Boolean(id && mongoose.Types.ObjectId.isValid(id)))
        ));

        const actorDocs = actorIds.length
            ? await User.find({ _id: { $in: actorIds } }).select('firstName lastName email role').lean()
            : [];

        const actorMap = new Map<string, any>(actorDocs.map((doc: any) => [String(doc._id), doc]));

        const records = rawAlerts
            .map((alert: any): RuntimeErrorRecord => {
                const details = (alert.details || {}) as Record<string, unknown>;

                const actorId = firstNonEmptyString(
                    typeof alert.createdBy === 'object' && alert.createdBy?._id ? String(alert.createdBy._id) : undefined,
                    details.userId,
                    details.actorId,
                    details.targetUserId,
                    details.clientId,
                    details.dietitianId,
                    details.healthCounselorId,
                    details.performedBy
                );

                const actorDoc = actorId ? actorMap.get(String(actorId)) : undefined;

                const actorNameFromDetails = firstNonEmptyString(
                    details.userName,
                    details.actorName,
                    details.performedByName,
                    details.targetUserName
                );

                const actorNameFromDb = actorDoc
                    ? `${(actorDoc.firstName || '').trim()} ${(actorDoc.lastName || '').trim()}`.trim()
                    : '';

                const actorRole = normalizeRole(firstNonEmptyString(
                    details.userRole,
                    details.actorRole,
                    details.performedByRole,
                    typeof alert.createdBy === 'object' ? alert.createdBy?.role : undefined,
                    actorDoc?.role
                ));

                const apiEndpoint = firstNonEmptyString(
                    details.endpoint,
                    details.path,
                    details.route,
                    details.api,
                    details.url
                ) || 'unknown';

                const sectionValue = normalizeSection(firstNonEmptyString(
                    details.section,
                    details.module,
                    details.page,
                    endpointToSection(apiEndpoint, actorRole)
                ));

                return {
                    id: String(alert._id),
                    title: alert.title || 'Runtime Error',
                    message: alert.message || 'Unknown runtime error',
                    type: alert.type || 'error',
                    source: alert.source || 'system',
                    priority: alert.priority || 'medium',
                    category: alert.category || 'other',
                    status: alert.status || 'new',
                    section: sectionValue,
                    apiEndpoint,
                    actor: {
                        id: actorId,
                        name: actorNameFromDb || actorNameFromDetails || 'Unknown user',
                        email: actorDoc?.email || undefined,
                        role: actorRole
                    },
                    createdAt: alert.createdAt,
                    errorStack: alert.errorStack,
                    details
                };
            })
            .filter((record) => (role === 'all' ? true : record.actor.role === normalizeRole(role)))
            .filter((record) => (section === 'all' ? true : record.section === normalizeSection(section)));

        return NextResponse.json({
            records,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1)
            }
        });
    } catch (error) {
        console.error('Error fetching real-time API runtime errors:', error);
        return NextResponse.json({ error: 'Failed to fetch runtime errors' }, { status: 500 });
    }
}
