import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { sendEmail } from '@/lib/services/email';
import {
    generatePrintableInvoiceHTML,
    generateEmailInvoiceHTML,
    buildInvoiceDataFromPayment,
} from '@/lib/services/invoiceTemplate';

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
            .populate('client', 'firstName lastName email phone')
            .lean() as any;

        if (!payment) {
            return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
        }

        // Security: Only allow access to own invoices (client), assigned dietitian, or admin
        const userId = session.user.id;
        const role = session.user.role;
        const clientId = payment.client?._id?.toString() || payment.client?.toString();
        const dietitianId = payment.dietitian?.toString();

        if (role !== 'admin' && userId !== clientId && userId !== dietitianId) {
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
            .populate('client', 'firstName lastName email phone')
            .lean() as any;

        if (!payment) {
            return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
        }

        // Security: only admin or assigned dietitian can send invoices
        const userId = session.user.id;
        const role = session.user.role;
        const dietitianId = payment.dietitian?.toString();

        if (role !== 'admin' && userId !== dietitianId) {
            return NextResponse.json({ error: 'Only admin or assigned dietitian can send invoices' }, { status: 403 });
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
