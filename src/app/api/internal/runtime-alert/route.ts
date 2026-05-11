import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db/connection';
import SystemAlert from '@/lib/db/models/SystemAlert';

type RuntimeAlertPayload = {
    type?: 'info' | 'warning' | 'error' | 'success' | 'critical';
    source?: 'database' | 'api' | 'auth' | 'payment' | 'email' | 'file' | 'system' | 'user_action' | 'cron' | 'integration';
    title?: string;
    message?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    category?: 'database_error' | 'api_error' | 'auth_failure' | 'payment_failure' | 'email_failure' | 'validation_error' | 'performance' | 'security' | 'maintenance' | 'other';
    errorStack?: string;
    details?: Record<string, unknown>;
    createdBy?: string;
};

function unauthorizedResponse(): NextResponse {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function readSecret(request: NextRequest): string | null {
    return request.headers.get('x-runtime-monitor-secret');
}

function safeString(value: unknown, fallback = ''): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
}

function safeDetails(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
    try {
        const secret = process.env.RUNTIME_MONITOR_SECRET;
        if (!secret || readSecret(request) !== secret) {
            return unauthorizedResponse();
        }

        const body = await request.json() as RuntimeAlertPayload;
        const details = safeDetails(body.details);
        const createdByCandidate = safeString(body.createdBy) || safeString(details.userId);
        const createdBy = mongoose.Types.ObjectId.isValid(createdByCandidate)
            ? createdByCandidate
            : undefined;

        await connectDB();

        const alert = await SystemAlert.create({
            type: body.type || 'error',
            source: body.source || 'api',
            title: safeString(body.title, 'Runtime Alert'),
            message: safeString(body.message, 'Runtime alert captured'),
            priority: body.priority || 'medium',
            category: body.category || 'other',
            status: 'new',
            details,
            errorStack: safeString(body.errorStack) || undefined,
            createdBy,
            notificationSent: false,
            isRead: false,
        });

        return NextResponse.json({ success: true, id: String(alert._id) }, { status: 201 });
    } catch (error) {
        console.error('Error storing runtime alert:', error);
        return NextResponse.json({ error: 'Failed to store runtime alert' }, { status: 500 });
    }
}