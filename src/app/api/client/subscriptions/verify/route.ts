import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { clearCacheByTag } from '@/lib/api/utils';
import { sendInvoiceOnPayment } from '@/lib/services/invoiceSender';
import { emitPaymentUpdate, clearPaymentCaches } from '@/lib/realtime/payment-notify';
import crypto from 'crypto';

// POST /api/client/subscriptions/verify - Verify Razorpay payment for subscriptions
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const data = await request.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = data;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: 'Missing payment verification data' },
        { status: 400 }
      );
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body.toString())
      .digest('hex');

    const isValid = expectedSignature === razorpay_signature;

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid payment signature' },
        { status: 400 }
      );
    }

    // Find and update UnifiedPayment record (UPDATE existing, NO DUPLICATES)
    const payment = await UnifiedPayment.syncRazorpayPayment(
      { orderId: razorpay_order_id },
      {
        client: session.user.id,
        status: 'paid',
        paymentStatus: 'paid',
        razorpayPaymentId: razorpay_payment_id,
        paidAt: new Date(),
        transactionId: razorpay_payment_id
      }
    );

    if (!payment) {
      return NextResponse.json(
        { error: 'Payment record not found' },
        { status: 404 }
      );
    }

    // Clear caches so UI updates immediately
    clearPaymentCaches();

    // Notify ALL relevant users: admins, client, dietitian, health counselor
    await emitPaymentUpdate(
      session.user.id,
      {
        paymentId: String(payment._id),
        status: 'paid',
        paidAt: new Date().toISOString(),
      },
      payment.dietitian ? [String(payment.dietitian)] : []
    );

    // Auto-send invoice email (fire-and-forget)
    sendInvoiceOnPayment(String(payment._id)).catch(() => { });

    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully',
      paymentId: payment._id.toString(),
      status: 'completed'
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    return NextResponse.json(
      { error: 'Failed to verify payment' },
      { status: 500 }
    );
  }
}
