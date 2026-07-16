import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { clearCacheByTag } from '@/lib/cache/memoryCache';
import { sendInvoiceOnPayment } from '@/lib/services/invoiceSender';
import { emitPaymentUpdate, clearPaymentCaches } from '@/lib/realtime/payment-notify';
import crypto from 'crypto';

// POST /api/client/service-plans/verify - Verify Razorpay payment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const data = await request.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentId } = data;

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

    // Use syncRazorpayPayment to find or create the payment record
    // This prevents duplicate records
    const payment = await UnifiedPayment.syncRazorpayPayment(
      { orderId: razorpay_order_id },
      {
        client: session.user.id,
        status: 'paid',
        paymentStatus: 'paid',
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        transactionId: razorpay_payment_id,
        paidAt: new Date()
      }
    );

    // Invalidate caches so payment lists return fresh data
    clearPaymentCaches();

    // Notify ALL relevant users: admins, client, dietitian, health counselor
    await emitPaymentUpdate(
      session.user.id,
      {
        paymentId: payment ? String(payment._id) : undefined,
        status: 'paid',
        paidAt: new Date(),
      },
      payment?.dietitian ? [String(payment.dietitian)] : []
    );

    // Auto-send invoice email (fire-and-forget)
    if (payment) {
      sendInvoiceOnPayment(String(payment._id)).catch(() => { });
    }

    return NextResponse.json({
      success: true,
      message: 'Payment verified and plan activated',
      payment
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    return NextResponse.json(
      { error: 'Failed to verify payment' },
      { status: 500 }
    );
  }
}
