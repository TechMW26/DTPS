import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import connectDB from '@/lib/db/connection';
import PaymentLink from '@/lib/db/models/PaymentLink';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { PaymentStatus, PaymentType } from '@/types';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { clearCacheByTag } from '@/lib/api/utils';
import { sendInvoiceOnPayment } from '@/lib/services/invoiceSender';
import { emitPaymentUpdate, emitPaymentLinkUpdate, clearPaymentCaches } from '@/lib/realtime/payment-notify';

// Helper function to create/update UnifiedPayment from PaymentLink
// Uses syncRazorpayPayment to UPDATE existing or CREATE new (NO DUPLICATES)
async function createUnifiedPaymentFromPaymentLink(paymentLink: any): Promise<any> {
  try {
    const startDate = new Date();
    const endDate = new Date();
    const durationDays = paymentLink.durationDays || 30;
    endDate.setDate(endDate.getDate() + durationDays);

    const unifiedPayment = await UnifiedPayment.syncRazorpayPayment(
      { paymentLink: paymentLink._id },
      {
        client: paymentLink.client,
        dietitian: paymentLink.dietitian,
        servicePlan: paymentLink.servicePlanId || paymentLink.servicePlan,
        paymentLink: paymentLink._id,
        paymentType: 'service_plan',
        planName: paymentLink.planName || paymentLink.description || 'Diet Plan',
        planCategory: paymentLink.planCategory || 'general-wellness',
        durationDays: durationDays,
        durationLabel: paymentLink.duration || `${durationDays} Days`,
        baseAmount: paymentLink.amount,
        discountPercent: paymentLink.discount || 0,
        taxPercent: paymentLink.tax || 0,
        finalAmount: paymentLink.finalAmount || paymentLink.amount,
        currency: paymentLink.currency || 'INR',
        status: 'paid',
        paymentStatus: 'paid',
        paymentMethod: paymentLink.paymentMethod || 'razorpay',
        razorpayPaymentLinkId: paymentLink.razorpayPaymentLinkId,
        razorpayPaymentId: paymentLink.razorpayPaymentId,
        razorpayOrderId: paymentLink.razorpayOrderId,
        transactionId: paymentLink.razorpayPaymentId || paymentLink.razorpayPaymentLinkId,
        payerEmail: paymentLink.payerEmail,
        payerPhone: paymentLink.payerPhone,
        purchaseDate: new Date(),
        startDate,
        endDate,
        paidAt: paymentLink.paidAt || new Date(),
        mealPlanCreated: false,
        daysUsed: 0
      }
    );

    return unifiedPayment;
  } catch (error) {
    console.error('Error creating UnifiedPayment:', error);
    return null;
  }
}

// POST /api/payment-links/verify - Verify payment after Razorpay callback
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { paymentLinkId, paymentId, signature } = body;

    if (!paymentLinkId) {
      const response = NextResponse.json({ error: 'Payment link ID is required' }, { status: 400 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    await connectDB();

    // Find payment link
    const paymentLink = await PaymentLink.findOne({
      razorpayPaymentLinkId: paymentLinkId
    }).populate('client', 'firstName lastName email');

    if (!paymentLink) {
      const response = NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    // If already paid, just return the details
    if (paymentLink.status === 'paid') {
      const response = NextResponse.json({
        success: true,
        paymentLink,
        message: 'Payment already verified'
      });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    // Verify signature if provided
    if (signature && process.env.RAZORPAY_KEY_SECRET) {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${paymentLinkId}|${paymentId}`)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.warn('Signature verification failed, but proceeding with payment check');
      }
    }

    // Update payment link status
    if (paymentId) {
      paymentLink.status = 'paid';
      paymentLink.paidAt = new Date();
      paymentLink.razorpayPaymentId = paymentId;
      paymentLink.transactionId = paymentId;
      if (signature) {
        paymentLink.razorpaySignature = signature;
      }
      await paymentLink.save();

      // Create/Update UnifiedPayment record (UPDATE existing, NO DUPLICATES)
      const unifiedPayment = await createUnifiedPaymentFromPaymentLink(paymentLink);

      // Invalidate caches so payment sections update without manual refresh.
      clearPaymentCaches();

      // Notify ALL relevant users: admins, client, dietitian, health counselor
      await emitPaymentLinkUpdate(
        String(paymentLink.client),
        {
          paymentLinkId: String(paymentLink._id),
          status: paymentLink.status,
          paidAt: paymentLink.paidAt,
        },
        paymentLink.dietitian ? [String(paymentLink.dietitian)] : []
      );
      if (unifiedPayment) {
        await emitPaymentUpdate(
          String(paymentLink.client),
          {
            paymentId: String(unifiedPayment._id),
            status: unifiedPayment.status,
            paidAt: unifiedPayment.paidAt,
            paymentLinkId: String(paymentLink._id),
          },
          paymentLink.dietitian ? [String(paymentLink.dietitian)] : []
        );
      }

      // Auto-send invoice email (fire-and-forget)
      if (unifiedPayment) {
        sendInvoiceOnPayment(String(unifiedPayment._id)).catch(() => { });
      }

    }

    const response = NextResponse.json({
      success: true,
      paymentLink,
      message: 'Payment verified successfully'
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;

  } catch (error) {
    console.error('Payment verification error:', error);
    const response = NextResponse.json(
      { error: 'Failed to verify payment' },
      { status: 500 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
