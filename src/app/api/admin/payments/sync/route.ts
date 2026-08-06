import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import PaymentLink from '@/lib/db/models/PaymentLink';
import Razorpay from 'razorpay';

// Lazy initialization to avoid build-time errors
const getRazorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay credentials not configured');
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

// Helper function to create UnifiedPayment from PaymentLink using syncRazorpayPayment
async function createUnifiedPaymentFromPaymentLink(paymentLink: any): Promise<any> {
  try {
    const startDate = paymentLink.paidAt || new Date();
    const endDate = new Date(startDate);
    const durationDays = paymentLink.durationDays || 30;
    endDate.setDate(endDate.getDate() + durationDays);

    // Use syncRazorpayPayment to find or create - prevents duplicates
    const payment = await UnifiedPayment.syncRazorpayPayment(
      { paymentLinkId: paymentLink.razorpayPaymentLinkId },
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
        transactionId: paymentLink.transactionId || paymentLink.razorpayPaymentId || paymentLink.razorpayPaymentLinkId,
        payerEmail: paymentLink.payerEmail,
        payerPhone: paymentLink.payerPhone,
        purchaseDate: startDate,
        startDate: startDate,
        endDate: endDate,
        paidAt: paymentLink.paidAt || new Date(),
        mealPlanCreated: false,
        daysUsed: 0
      }
    );

    return payment;
  } catch (error) {
    console.error('Error creating UnifiedPayment from PaymentLink:', error);
    return null;
  }
}

// POST /api/admin/payments/sync - Sync payments with Razorpay
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    let syncedCount = 0;
    let paymentsCreated = 0;
    const errors: string[] = [];

    // ============================================
    // STEP 1: Sync PaymentLinks with Razorpay
    // ============================================
    const pendingPaymentLinks = await PaymentLink.find({
      status: { $nin: ['paid', 'cancelled', 'expired'] },
      razorpayPaymentLinkId: { $exists: true, $ne: null }
    });


    const razorpay = getRazorpay();

    for (const paymentLink of pendingPaymentLinks) {
      try {
        const razorpayLink = await razorpay.paymentLink.fetch(paymentLink.razorpayPaymentLinkId) as any;
        
        if (razorpayLink.status === 'paid') {
          paymentLink.status = 'paid';
          paymentLink.paidAt = razorpayLink.paid_at ? new Date(razorpayLink.paid_at * 1000) : new Date();
          
          // Get payment details
          if (razorpayLink.payments?.length > 0) {
            const latestPayment = razorpayLink.payments[razorpayLink.payments.length - 1];
            paymentLink.razorpayPaymentId = latestPayment.payment_id;
            paymentLink.transactionId = latestPayment.payment_id;
          }
          
          await paymentLink.save();
          
          // Create UnifiedPayment record - replaces both ClientPurchase and Payment
          const purchase = await createUnifiedPaymentFromPaymentLink(paymentLink);
          if (purchase) {
            paymentsCreated++;
          }
          
          syncedCount++;
        } else if (razorpayLink.status === 'cancelled' || razorpayLink.status === 'expired') {
          paymentLink.status = razorpayLink.status;
          await paymentLink.save();
          syncedCount++;
        }
      } catch (error: any) {
        console.error(`Error syncing payment link ${paymentLink._id}:`, error);
        errors.push(`PaymentLink ${paymentLink._id}: ${error.message}`);
      }
    }

    // ============================================
    // STEP 2: Check paid PaymentLinks that might not have UnifiedPayment
    // ============================================
    const paidPaymentLinksWithoutPayment = await PaymentLink.find({
      status: 'paid'
    });

    for (const paymentLink of paidPaymentLinksWithoutPayment) {
      // Check if UnifiedPayment exists
      const existingPayment = await UnifiedPayment.findOne({
        $or: [
          { paymentLink: paymentLink._id },
          { razorpayPaymentLinkId: paymentLink.razorpayPaymentLinkId },
          { razorpayPaymentId: paymentLink.razorpayPaymentId }
        ]
      });

      if (!existingPayment) {
        const purchase = await createUnifiedPaymentFromPaymentLink(paymentLink);
        if (purchase) {
          paymentsCreated++;
        }
      }
    }

    // ============================================
    // STEP 3: Sync pending UnifiedPayment records
    // ============================================
    const pendingPayments = await UnifiedPayment.find({
      paymentStatus: 'pending',
      $or: [
        { razorpayOrderId: { $exists: true, $ne: null } },
        { razorpayPaymentLinkId: { $exists: true, $ne: null } }
      ]
    });


    for (const payment of pendingPayments) {
      try {
        let paymentUpdated = false;
        
        // Try to fetch order status
        if (payment.razorpayOrderId) {
          const order = await razorpay.orders.fetch(payment.razorpayOrderId) as any;
          
          if (order.status === 'paid' || order.status === 'attempted') {
            const payments = await razorpay.orders.fetchPayments(payment.razorpayOrderId) as any;
            const successfulPayment = payments.items?.find((p: any) => p.status === 'captured');
            
            if (successfulPayment) {
              payment.status = 'paid';
              payment.paymentStatus = 'paid';
              payment.razorpayPaymentId = successfulPayment.id;
              payment.paidAt = new Date(successfulPayment.created_at * 1000);
              payment.transactionId = successfulPayment.id;
              await payment.save();
              paymentUpdated = true;
              syncedCount++;
            }
          }
        }

        // Try to fetch payment link status
        if (payment.razorpayPaymentLinkId && payment.paymentStatus === 'pending') {
          try {
            const razorpayLink = await razorpay.paymentLink.fetch(payment.razorpayPaymentLinkId) as any;
            
            if (razorpayLink.status === 'paid') {
              payment.status = 'paid';
              payment.paymentStatus = 'paid';
              payment.paidAt = razorpayLink.paid_at ? new Date(razorpayLink.paid_at * 1000) : new Date();
              
              if (razorpayLink.payments?.length > 0) {
                const latestPayment = razorpayLink.payments[razorpayLink.payments.length - 1];
                payment.razorpayPaymentId = latestPayment.payment_id;
                payment.transactionId = latestPayment.payment_id;
              }
              
              await payment.save();
              paymentUpdated = true;
              syncedCount++;
            } else if (razorpayLink.status === 'cancelled' || razorpayLink.status === 'expired') {
              payment.status = 'cancelled';
              payment.paymentStatus = 'failed';
              await payment.save();
              syncedCount++;
            }
          } catch (linkError) {
            console.error(`Error fetching payment link ${payment.razorpayPaymentLinkId}:`, linkError);
          }
        }
      } catch (error: any) {
        console.error(`Error syncing payment ${payment._id}:`, error);
        errors.push(`Payment ${payment._id}: ${error.message}`);
      }
    }

    // ============================================
    // STEP 4: Fetch recent Razorpay payments
    // ============================================
    try {
      const recentPayments = await razorpay.payments.all({
        from: Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000),
        to: Math.floor(Date.now() / 1000),
        count: 100
      }) as any;

      for (const razorpayPayment of recentPayments.items || []) {
        if (razorpayPayment.status === 'captured' && razorpayPayment.order_id) {
          const existingPayment = await UnifiedPayment.findOne({
            $or: [
              { razorpayOrderId: razorpayPayment.order_id },
              { razorpayPaymentId: razorpayPayment.id }
            ]
          });

          if (existingPayment && existingPayment.paymentStatus === 'pending') {
            existingPayment.status = 'paid';
            existingPayment.paymentStatus = 'paid';
            existingPayment.razorpayPaymentId = razorpayPayment.id;
            existingPayment.paidAt = new Date(razorpayPayment.created_at * 1000);
            existingPayment.transactionId = razorpayPayment.id;
            await existingPayment.save();
            syncedCount++;
          }
        }
      }
    } catch (error) {
      console.error('Error fetching recent Razorpay payments:', error);
    }

    return NextResponse.json({
      success: true,
      synced: syncedCount,
      paymentsCreated,
      errors: errors.length > 0 ? errors : undefined,
      message: `Synced ${syncedCount} payment(s), created ${paymentsCreated} unified payment(s)`
    });

  } catch (error) {
    console.error('Error syncing with Razorpay:', error);
    return NextResponse.json(
      { error: 'Failed to sync with Razorpay' },
      { status: 500 }
    );
  }
}
