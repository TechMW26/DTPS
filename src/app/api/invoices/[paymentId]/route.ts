import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { sendEmail } from '@/lib/services/email';
import { UserRole } from '@/types';
import {
    generatePrintableInvoiceHTML,
    generateEmailInvoiceHTML,
    buildInvoiceDataFromPayment,
} from '@/lib/services/invoiceTemplate';

function normalizeId(value: any): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value?.toString === 'function') return value.toString();
    return null;
}

function normalizeIdArray(value: any): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((v) => normalizeId(v?._id ?? v))
        .filter((v): v is string => !!v);
}

// GET /api/invoices/[paymentId] - Get printable invoice HTML
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ paymentId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { paymentId } = await params;

        if (!paymentId) {
            return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 });
        }

        await connectDB();

        const payment = await UnifiedPayment.findById(paymentId)
            .populate('client', 'firstName lastName email phone assignedDietitian assignedDietitians assignedHealthCounselor assignedHealthCounselors')
            .lean() as any;

        if (!payment) {
            return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
        }

        // Security: Only allow access to own invoices (client), assigned staff, or admin
        const userId = session.user.id;
        const role = session.user.role as UserRole | string;
        const roleValue = String(role).toLowerCase() as UserRole | string;
        const clientId = normalizeId(payment.client?._id ?? payment.client);
        const paymentDietitianId = normalizeId(payment.dietitian);

        const assignedDietitianId = normalizeId(payment.client?.assignedDietitian?._id ?? payment.client?.assignedDietitian);
        const assignedDietitianIds = normalizeIdArray(payment.client?.assignedDietitians);
        const assignedHealthCounselorId = normalizeId(payment.client?.assignedHealthCounselor?._id ?? payment.client?.assignedHealthCounselor);
        const assignedHealthCounselorIds = normalizeIdArray(payment.client?.assignedHealthCounselors);

        const isAdmin = roleValue === UserRole.ADMIN || roleValue === 'admin';
        const isClient = !!clientId && userId === clientId;
        const isPaymentDietitian = !!paymentDietitianId && userId === paymentDietitianId;

        const isAssignedDietitian =
            (!!assignedDietitianId && userId === assignedDietitianId) || assignedDietitianIds.includes(userId);
        const isAssignedHealthCounselor =
            (!!assignedHealthCounselorId && userId === assignedHealthCounselorId) || assignedHealthCounselorIds.includes(userId);

        const allowedByRole =
            isAdmin ||
            isClient ||
            isPaymentDietitian ||
            (roleValue === UserRole.DIETITIAN && isAssignedDietitian) ||
            (roleValue === UserRole.HEALTH_COUNSELOR && isAssignedHealthCounselor);

        if (!allowedByRole) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const invoiceData = buildInvoiceDataFromPayment(payment);
        const invoiceHtml = generatePrintableInvoiceHTML(invoiceData);

        return new NextResponse(invoiceHtml, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('[INVOICE] Error generating invoice:', error);
        return NextResponse.json(
            { error: 'Failed to generate invoice', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// POST /api/invoices/[paymentId] - Send invoice via email
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ paymentId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { paymentId } = await params;

        if (!paymentId) {
            return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 });
        }

        await connectDB();

        const payment = await UnifiedPayment.findById(paymentId)
            .populate('client', 'firstName lastName email phone assignedDietitian assignedDietitians assignedHealthCounselor assignedHealthCounselors')
            .lean() as any;

        if (!payment) {
            return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
        }

        // Security: admin, assigned dietitian, or assigned health counselor can send invoices
        const userId = session.user.id;
        const role = session.user.role as UserRole | string;
        const roleValue = String(role).toLowerCase() as UserRole | string;
        const paymentDietitianId = normalizeId(payment.dietitian);
        const assignedDietitianId = normalizeId(payment.client?.assignedDietitian?._id ?? payment.client?.assignedDietitian);
        const assignedDietitianIds = normalizeIdArray(payment.client?.assignedDietitians);
        const assignedHealthCounselorId = normalizeId(payment.client?.assignedHealthCounselor?._id ?? payment.client?.assignedHealthCounselor);
        const assignedHealthCounselorIds = normalizeIdArray(payment.client?.assignedHealthCounselors);

        const isAdmin = roleValue === UserRole.ADMIN || roleValue === 'admin';
        const isPaymentDietitian = !!paymentDietitianId && userId === paymentDietitianId;
        const isAssignedDietitian =
            (!!assignedDietitianId && userId === assignedDietitianId) || assignedDietitianIds.includes(userId);
        const isAssignedHealthCounselor =
            (!!assignedHealthCounselorId && userId === assignedHealthCounselorId) || assignedHealthCounselorIds.includes(userId);

        const canSendInvoice =
            isAdmin ||
            (roleValue === UserRole.DIETITIAN && (isPaymentDietitian || isAssignedDietitian)) ||
            (roleValue === UserRole.HEALTH_COUNSELOR && isAssignedHealthCounselor);

        if (!canSendInvoice) {
            return NextResponse.json({ error: 'Only admin, assigned dietitian, or assigned health counselor can send invoices' }, { status: 403 });
        }

        // Get client email
        const clientEmail = payment.client?.email || payment.payerEmail;
        if (!clientEmail) {
            return NextResponse.json({ error: 'Client email not found' }, { status: 400 });
        }

        const invoiceData = buildInvoiceDataFromPayment(payment);
        const emailTemplate = generateEmailInvoiceHTML(invoiceData);

        console.log('[INVOICE] Sending invoice email to:', clientEmail);
        const sent = await sendEmail({
            to: clientEmail,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            text: emailTemplate.text,
        });

        if (!sent) {
            console.error('[INVOICE] Failed to send invoice email');
            return NextResponse.json(
                { error: 'Failed to send invoice email. Check SMTP configuration.' },
                { status: 500 }
            );
        }

        console.log('[INVOICE] Invoice sent successfully to:', clientEmail);
        return NextResponse.json({
            success: true,
            message: `Invoice sent to ${clientEmail}`,
            invoiceNumber: invoiceData.invoiceNumber,
            sentTo: clientEmail,
        });
    } catch (error) {
        console.error('[INVOICE] Error sending invoice email:', error);
        return NextResponse.json(
            { error: 'Failed to send invoice', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
