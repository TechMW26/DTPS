import {nativeResponseJson} from '@/lib/api/native-response';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeAuthorizedPaymentLink} from '@/lib/db/repository/native-payment-link-admin';
import {NativeCheckoutError} from '@/lib/db/repository/native-checkout';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { sendEmail, getPaymentReminderTemplate } from '@/lib/services/email';

// POST /api/payment-links/reminder - Send payment reminder email
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return nativeResponseJson({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { paymentLinkId } = body;

    if (!paymentLinkId) {
      return nativeResponseJson({ error: 'Payment link ID is required' }, { status: 400 });
    }



    // Find the payment link with populated data
    const paymentLink = await nativeAuthorizedPaymentLink(getNativeDatabase(), session.user.id, paymentLinkId, request.method === 'POST');

    if (!paymentLink) {
      return nativeResponseJson({ error: 'Payment link not found' }, { status: 404 });
    }

    // Check if payment is already paid
    if (paymentLink.status === 'paid') {
      return nativeResponseJson({ error: 'Payment is already completed' }, { status: 400 });
    }

    // Check if payment is expired or cancelled
    if (paymentLink.status === 'expired' || paymentLink.status === 'cancelled') {
      return nativeResponseJson({ error: `Cannot send reminder for ${paymentLink.status} payment` }, { status: 400 });
    }

    // Get client email
    const clientEmail = paymentLink.client?.email;
    if (!clientEmail) {
      return nativeResponseJson({ error: 'Client email not found' }, { status: 400 });
    }

    // Get payment link URL
    const paymentUrl = paymentLink.razorpayPaymentLinkShortUrl || paymentLink.razorpayPaymentLinkUrl;
    if (!paymentUrl) {
      return nativeResponseJson({ error: 'Payment link URL not found' }, { status: 400 });
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
    if (process.env.NODE_ENV !== 'production') return nativeResponseJson({ error: 'Email delivery is disabled during local migration testing' }, { status: 409 });
    const sent = await sendEmail({
      to: clientEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text,
    });

    if (!sent) {
        return nativeResponseJson({
        error: 'Failed to send email. Please check SMTP configuration.',
        hint: 'Ensure SMTP_HOST, SMTP_USER, SMTP_PASS are configured in .env',
        code: 'DELIVERY_FAILED'
      }, { status: 500 });
    }

    return nativeResponseJson({
      success: true,
      message: `Reminder sent to ${clientEmail}`,
      sentTo: clientEmail,
    });

  } catch (error) {
    if(error instanceof NativeCheckoutError)return nativeResponseJson({error:error.message},{status:error.status});
    return nativeResponseJson({
      error: 'Failed to send payment reminder',
      code: 'INVOICE_UNAVAILABLE'
    }, { status: 500 });
  }
}
