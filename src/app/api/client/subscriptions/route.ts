import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { isPaidOrCompleted, resolvePaymentStatus } from '@/lib/payments/payment-status';

// GET /api/client/subscriptions - Get client's subscriptions
export async function GET(request: NextRequest) {
  try {
    // Run auth + DB connection in PARALLEL
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB()
    ]);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all payments for this client that are subscription-related
    const payments = await withCache(
      `client-subscriptions:${session.user.id}`,
      async () => await UnifiedPayment.find({
        client: session.user.id,
        type: { $in: ['service_plan', 'subscription', 'consultation'] }
      })
        .populate('dietitian', 'firstName lastName')
        .sort({ createdAt: -1 })
        .lean(),
      { ttl: 120000, tags: ['client'] }
    );

    // Transform payments to subscription format
    const subscriptions = payments.map((payment: any) => {
      const startDate = payment.paidAt || payment.createdAt;
      const durationDays = payment.durationDays || 30;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + durationDays);

      const now = new Date();
      const paymentCompleted = isPaidOrCompleted({
        status: payment.status,
        paymentStatus: payment.paymentStatus,
        paidAt: payment.paidAt
      });

      const normalizedPaymentStatus = paymentCompleted
        ? 'paid'
        : (payment.paymentStatus === 'failed' || payment.status === 'failed' ? 'failed' : 'pending');

      const status = resolvePaymentStatus({
        status: payment.status,
        paymentStatus: payment.paymentStatus,
        paidAt: payment.paidAt,
        expiryDate: endDate,
        now
      });

      return {
        _id: payment._id.toString(),
        planName: payment.planName || payment.description || 'Subscription Plan',
        planCategory: payment.planCategory || 'general-wellness',
        amount: payment.amount,
        currency: payment.currency || 'INR',
        status,
        startDate: paymentCompleted ? startDate : null,
        endDate: paymentCompleted ? endDate : null,
        durationDays,
        durationLabel: payment.durationLabel || `${durationDays} days`,
        features: payment.features || [],
        paymentStatus: normalizedPaymentStatus,
        razorpayPaymentLinkUrl: payment.razorpayPaymentLinkUrl,
        razorpayPaymentLinkShortUrl: payment.razorpayPaymentLinkShortUrl,
        paidAt: payment.paidAt || null,
        dietitian: payment.dietitian ? {
          name: `${payment.dietitian.firstName} ${payment.dietitian.lastName}`
        } : null
      };
    });

    return NextResponse.json({ subscriptions });

  } catch (error) {
    console.error('Error fetching client subscriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscriptions' },
      { status: 500 }
    );
  }
}
