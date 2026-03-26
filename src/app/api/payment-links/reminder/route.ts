import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import PaymentLink from '@/lib/db/models/PaymentLink';
import { sendEmail, getPaymentReminderTemplate } from '@/lib/services/email';

// POST /api/payment-links/reminder - Send payment reminder email
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { paymentLinkId } = body;

    if (!paymentLinkId) {
      return NextResponse.json({ error: 'Payment link ID is required' }, { status: 400 });
    }

    await connectDB();

    // Find the payment link with populated data
    const paymentLink = await PaymentLink.findById(paymentLinkId)
      .populate('client', 'firstName lastName email phone')
      .populate('dietitian', 'firstName lastName email');

    if (!paymentLink) {
      return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
    }

    // Check if payment is already paid
    if (paymentLink.status === 'paid') {
      return NextResponse.json({ error: 'Payment is already completed' }, { status: 400 });
    }

    // Check if payment is expired or cancelled
    if (paymentLink.status === 'expired' || paymentLink.status === 'cancelled') {
      return NextResponse.json({ error: `Cannot send reminder for ${paymentLink.status} payment` }, { status: 400 });
    }

    // Get client email
    const clientEmail = paymentLink.client?.email;
    if (!clientEmail) {
      return NextResponse.json({ error: 'Client email not found' }, { status: 400 });
    }

    // Get payment link URL
    const paymentUrl = paymentLink.razorpayPaymentLinkShortUrl || paymentLink.razorpayPaymentLinkUrl;
    if (!paymentUrl) {
      return NextResponse.json({ error: 'Payment link URL not found' }, { status: 400 });
    }

    // Prepare client name
    const clientName = `${paymentLink.client?.firstName || ''} ${paymentLink.client?.lastName || ''}`.trim() || 'Valued Client';

    // Prepare dietitian name
    const dietitianName = paymentLink.dietitian
      ? `${paymentLink.dietitian.firstName || ''} ${paymentLink.dietitian.lastName || ''}`.trim()
      : undefined;

    // Format expire date
    const expireDate = paymentLink.expireDate
      ? new Date(paymentLink.expireDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata'
      })
      : undefined;

    // Generate email template
    const emailTemplate = getPaymentReminderTemplate({
      clientName,
      amount: paymentLink.amount,
      finalAmount: paymentLink.finalAmount,
      planName: paymentLink.planName,
      duration: paymentLink.duration,
      paymentLink: paymentUrl,
      expireDate,
      dietitianName,
    });

    // Send email
    console.log('[PAYMENT_REMINDER] Sending reminder to:', clientEmail);
    const sent = await sendEmail({
      to: clientEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text,
    });

    if (!sent) {
      console.error('[PAYMENT_REMINDER] Failed to send reminder email');
      return NextResponse.json({
        error: 'Failed to send email. Please check SMTP configuration.',
        hint: 'Ensure SMTP_HOST, SMTP_USER, SMTP_PASS are configured in .env',
        debug: {
          smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
          smtpHost: process.env.SMTP_HOST || 'NOT SET',
          smtpUser: process.env.SMTP_USER || 'NOT SET'
        }
      }, { status: 500 });
    }

    console.log('[PAYMENT_REMINDER] Reminder sent successfully to:', clientEmail);
    return NextResponse.json({
      success: true,
      message: `Reminder sent to ${clientEmail}`,
      sentTo: clientEmail,
    });

  } catch (error) {
    console.error('Error sending payment reminder:', error);
    return NextResponse.json({
      error: 'Failed to send payment reminder',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
