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
    method?: string;
    statusCode?: number;
    durationMs?: number;
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

const firstFiniteNumber = (...values: unknown[]): number | undefined => {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        if (typeof value === 'string' && value.trim()) {
            const parsed = Number(value.trim());
            if (Number.isFinite(parsed)) {
                return parsed;
            }
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

const isAdminRole = (role?: string): boolean => {
    return normalizeRole(role) === UserRole.ADMIN || String(role || '').toLowerCase().includes('admin');
};

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || !isAdminRole(session.user.role)) {
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
            type: { $in: ['error', 'critical', 'warning'] }
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

        // Filter by role/section depends on enriched fields, so paginate after enrichment.
        const rawAlerts = await SystemAlert.find(query)
            .sort({ createdAt: -1 })
            .populate('createdBy', 'firstName lastName email role')
            .lean();

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

        const filteredRecords = rawAlerts
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
                    details.clientName,
                    details.userName,
                    details.actorName,
                    details.performedByName,
                    details.targetUserName
                );

                const actorEmailFromDetails = firstNonEmptyString(
                    details.clientEmail,
                    details.userEmail,
                    details.actorEmail,
                    details.performedByEmail,
                    details.targetUserEmail
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

                const method = firstNonEmptyString(details.method, details.httpMethod, details.requestMethod) || 'GET';
                const statusCode = firstFiniteNumber(details.statusCode, details.httpStatus, details.responseStatus);
                const durationMs = firstFiniteNumber(details.durationMs, details.responseTimeMs, details.executionTimeMs);

                return {
                    id: String(alert._id),
                    title: alert.title || 'Runtime Error',
                    message: alert.message || 'Unknown runtime error',
                    type: alert.type || 'error',
                    source: alert.source || 'system',
                    priority: alert.priority || 'medium',
                    category: alert.category || 'other',
                    status: alert.status || 'new',
                    method,
                    statusCode,
                    durationMs,
                    section: sectionValue,
                    apiEndpoint,
                    actor: {
                        id: actorId,
                        name: actorNameFromDb || actorNameFromDetails || 'Unknown user',
                        email: actorDoc?.email || actorEmailFromDetails || undefined,
                        role: actorRole
                    },
                    createdAt: alert.createdAt,
                    errorStack: alert.errorStack,
                    details
                };
            })
            .filter((record) => (role === 'all' ? true : record.actor.role === normalizeRole(role)))
            .filter((record) => (section === 'all' ? true : record.section === normalizeSection(section)))
            .filter((record) => {
                if (!search) return true;
                const searchValue = search.toLowerCase();
                return [
                    record.title,
                    record.message,
                    record.apiEndpoint,
                    record.actor.name,
                    record.actor.email,
                    record.actor.role,
                    record.section,
                    record.method,
                    record.source,
                    record.category,
                    record.statusCode?.toString(),
                    record.durationMs?.toString(),
                ].some((value) => String(value || '').toLowerCase().includes(searchValue));
            });

        const total = filteredRecords.length;
        const records = filteredRecords.slice(skip, skip + limit);
        const critical = filteredRecords.filter((record) => record.priority === 'critical' || record.type === 'critical').length;
        const fresh = filteredRecords.filter((record) => record.status === 'new').length;
        const slow = filteredRecords.filter((record) => record.category === 'performance' || ((record.durationMs || 0) >= 4000)).length;

        const response = NextResponse.json({
            records,
            summary: {
                critical,
                new: fresh,
                slow
            },
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1)
            }
        });
        response.headers.set('Cache-Control', 'no-store');
        return response;
    } catch (error) {
        console.error('Error fetching real-time API runtime errors:', error);
        return NextResponse.json({ error: 'Failed to fetch runtime errors' }, { status: 500 });
    }
}
