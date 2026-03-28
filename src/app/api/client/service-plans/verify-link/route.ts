import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import PaymentLink from '@/lib/db/models/PaymentLink';
///
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { socketManager } from '@/lib/realtime/socket-manager';
import { clearCacheByTag } from '@/lib/api/utils';
import { sendInvoiceOnPayment } from '@/lib/services/invoiceSender';
///
// POST /api/client/service-plans/verify-link - Verify payment link and create UnifiedPayment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const data = await request.json();
    const { razorpayPaymentLinkId, razorpayPaymentId, signature } = data;

    if (!razorpayPaymentLinkId) {
      return NextResponse.json({ error: 'Payment link ID is required' }, { status: 400 });
    }

    // First, try to find existing UnifiedPayment
    let existingPayment = await UnifiedPayment.findOne({
      razorpayPaymentLinkId: razorpayPaymentLinkId,
      client: session.user.id
    });

    if (existingPayment) {
      // Update payment status if not already completed
      if (existingPayment.paymentStatus !== 'paid') {
        await UnifiedPayment.syncRazorpayPayment(
          { paymentLinkId: razorpayPaymentLinkId },
          {
            status: 'paid',
            paymentStatus: 'paid',
            razorpayPaymentId: razorpayPaymentId,
            paidAt: new Date(),
            transactionId: razorpayPaymentId
          }
        );
        ////

        // Clear caches and emit SSE event
        clearCacheByTag('payments');
        clearCacheByTag('payment_links');
        clearCacheByTag('client_purchases');

        try {
          const admins = await User.find({ role: UserRole.ADMIN }).select('_id');
          const notifyUserIds = new Set<string>([
            ...admins.map(a => String(a._id)),
            session.user.id,
          ]);
          if (existingPayment.dietitian) {
            notifyUserIds.add(String(existingPayment.dietitian));
          }
          socketManager.sendToUsers(Array.from(notifyUserIds), 'payment_updated', {
            paymentId: String(existingPayment._id),
            status: 'paid',
            paidAt: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('Failed to emit payment SSE event:', e);
        }
        /////

        // Auto-send invoice email (fire-and-forget)
        sendInvoiceOnPayment(String(existingPayment._id)).catch(() => { });
      }

      return NextResponse.json({
        success: true,
        message: 'Payment verified and plan activated',
        payment: existingPayment
      });
    }

    // Try PaymentLink collection (from dietitian-created links)
    const paymentLink = await PaymentLink.findOne({
      razorpayPaymentLinkId: razorpayPaymentLinkId,
      client: session.user.id
    });

    if (paymentLink) {
      // Update payment link status
      if (paymentLink.status !== 'paid') {
        paymentLink.status = 'paid';
        paymentLink.razorpayPaymentId = razorpayPaymentId;
        paymentLink.paidAt = new Date();
        await paymentLink.save();
      }

      const startDate = new Date();
      const endDate = new Date();
      const durationDays = paymentLink.durationDays || 30;
      endDate.setDate(endDate.getDate() + durationDays);

      // Create/Update UnifiedPayment (UPDATE existing, NO DUPLICATES)
      const unifiedPayment = await UnifiedPayment.syncRazorpayPayment(
        { paymentLink: paymentLink._id },
        {
          client: paymentLink.client,
          dietitian: paymentLink.dietitian,
          servicePlan: paymentLink.servicePlanId || paymentLink.servicePlan,
          paymentLink: paymentLink._id,
          paymentType: 'service_plan',
          planName: paymentLink.planName || 'Diet Plan',
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
          razorpayPaymentLinkId: razorpayPaymentLinkId,
          razorpayPaymentId: razorpayPaymentId,
          razorpayOrderId: paymentLink.razorpayOrderId,
          transactionId: razorpayPaymentId,
          purchaseDate: new Date(),
          startDate,
          endDate,
          paidAt: new Date(),
          mealPlanCreated: false,
          daysUsed: 0
        }
      );
      ///////
      // Clear caches and emit SSE event
      clearCacheByTag('payments');
      clearCacheByTag('payment_links');
      clearCacheByTag('client_purchases');

      try {
        const admins = await User.find({ role: UserRole.ADMIN }).select('_id');
        const notifyUserIds = new Set<string>([
          ...admins.map(a => String(a._id)),
          session.user.id,
          String(paymentLink.dietitian),
        ]);
        socketManager.sendToUsers(Array.from(notifyUserIds), 'payment_updated', {
          paymentId: unifiedPayment ? String(unifiedPayment._id) : '',
          paymentLinkId: String(paymentLink._id),
          status: 'paid',
          paidAt: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Failed to emit payment SSE event:', e);
      }
      ////////

      // Auto-send invoice email (fire-and-forget)
      if (unifiedPayment) {
        sendInvoiceOnPayment(String(unifiedPayment._id)).catch(() => { });
      }

      return NextResponse.json({
        success: true,
        message: 'Payment verified and plan activated',
        paymentLink,
        payment: unifiedPayment
      });
    }

    // Fallback: Create a basic UnifiedPayment record
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const fallbackPayment = await UnifiedPayment.syncRazorpayPayment(
      { paymentLinkId: razorpayPaymentLinkId },
      {
        client: session.user.id,
        paymentType: 'service_plan',
        planName: 'Diet Plan',
        planCategory: 'general-wellness',
        durationDays: 30,
        durationLabel: '30 Days',
        baseAmount: 0,
        discountPercent: 0,
        taxPercent: 0,
        finalAmount: 0,
        currency: 'INR',
        status: 'paid',
        paymentStatus: 'paid',
        paymentMethod: 'razorpay',
        razorpayPaymentLinkId: razorpayPaymentLinkId,
        razorpayPaymentId: razorpayPaymentId,
        transactionId: razorpayPaymentId || razorpayPaymentLinkId,
        purchaseDate: new Date(),
        startDate,
        endDate,
        paidAt: new Date(),
        mealPlanCreated: false,
        daysUsed: 0
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Payment recorded',
      payment: fallbackPayment
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify payment' },
      { status: 500 }
    );
  }
}
