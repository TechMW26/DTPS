import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import connectDB from '@/lib/db/connection';
import ClientSubscription from '@/lib/db/models/ClientSubscription';
import PaymentLink from '@/lib/db/models/PaymentLink';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { PaymentStatus, PaymentType, UserRole } from '@/types';
import { recalculateAndPersistClientStatus } from '@/lib/status/computeClientStatus';
//
import { clearCacheByTag } from '@/lib/api/utils';
import { sendInvoiceOnPayment } from '@/lib/services/invoiceSender';
import { emitPaymentUpdate, emitPaymentLinkUpdate, clearPaymentCaches } from '@/lib/realtime/payment-notify';
//
// Verify Razorpay webhook signature
function verifyRazorpaySignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return hash === signature;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      );
    }

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('RAZORPAY_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook not configured' },
        { status: 500 }
      );
    }

    // Verify webhook signature
    if (!verifyRazorpaySignature(body, signature, webhookSecret)) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    const event = JSON.parse(body);

    await connectDB();

    // Handle different webhook events
    switch (event.event) {
      case 'payment.authorized':
      case 'payment.captured':
        await handlePaymentSuccess(event.payload);
        break;

      case 'payment.failed':
        await handlePaymentFailed(event.payload);
        break;

      case 'payment.link.completed':
        await handlePaymentLinkCompleted(event.payload);
        break;

      case 'payment.link.cancelled':
        await handlePaymentLinkCancelled(event.payload);
        break;

      default:
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// Handle successful payment
async function handlePaymentSuccess(payload: any) {
  try {
    const payment = payload.payment;
    const orderId = payment.order_id;

    if (!orderId) {
      return;
    }

    // Find subscription by Razorpay order ID
    const subscription = await ClientSubscription.findOne({
      razorpayOrderId: orderId
    });

    if (!subscription) {
      return;
    }

    // Update subscription with payment details
    subscription.razorpayPaymentId = payment.id;
    subscription.paymentStatus = 'paid';
    subscription.status = 'active';
    subscription.paidAt = new Date();
    subscription.transactionId = payment.id;

    await subscription.save();

    // Create/Update UnifiedPayment record (UPDATE existing, don't create duplicate)
    try {
      const paidAt = new Date();
      await UnifiedPayment.syncRazorpayPayment(
        { orderId: orderId },
        {
          client: subscription.client,
          dietitian: subscription.dietitian,
          paymentType: 'subscription',
          finalAmount: subscription.amount,
          currency: 'INR',
          status: 'paid',
          paymentStatus: 'paid',
          paymentMethod: 'razorpay',
          razorpayOrderId: orderId,
          razorpayPaymentId: payment.id,
          transactionId: payment.id,
          paidAt,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          expectedStartDate: subscription.startDate,
          expectedEndDate: subscription.endDate,
          description: `Subscription payment - Order: ${orderId}`
        }
      );
    } catch (paymentError) {
      console.error('Error syncing UnifiedPayment record:', paymentError);
    }

    // Update client status on successful payment (date-based: Expected End Date + hold)
    try {
      const clientId = subscription.client?.toString();
      if (clientId) {
        await recalculateAndPersistClientStatus(clientId, {
          trigger: 'payment_success',
          relatedEvent: `razorpay:${orderId}`,
        });
      }
    } catch (statusError) {
      console.error('Error updating client status after payment:', statusError);
    }
    //

    // Clear caches and emit SSE for real-time updates
    clearPaymentCaches();

    // Notify ALL relevant users: admins, client, dietitian, health counselor
    const clientId = subscription.client?.toString();
    await emitPaymentUpdate(clientId, {
      subscriptionId: String(subscription._id),
      status: 'paid',
      paidAt: new Date().toISOString(),
    }, subscription.dietitian ? [String(subscription.dietitian)] : []);

    // Auto-send invoice email (fire-and-forget)
    try {
      const invoicePayment = await UnifiedPayment.findOne({ razorpayOrderId: orderId }).select('_id');
      if (invoicePayment) {
        sendInvoiceOnPayment(String(invoicePayment._id)).catch(() => { });
      }
    } catch (invErr) {
      console.warn('[WEBHOOK] Failed to send auto-invoice:', invErr);
    }
    //
  } catch (error) {
    console.error('Error handling payment success:', error);
  }
}

// Handle failed payment
async function handlePaymentFailed(payload: any) {
  try {
    const payment = payload.payment;
    const orderId = payment.order_id;

    if (!orderId) {
      return;
    }

    // Find subscription by Razorpay order ID
    const subscription = await ClientSubscription.findOne({
      razorpayOrderId: orderId
    });

    if (!subscription) {
      return;
    }

    // Update subscription status
    subscription.paymentStatus = 'failed';
    subscription.status = 'pending';

    await subscription.save();

    // Update UnifiedPayment record with FAILED status (UPDATE existing, don't create duplicate)
    try {
      await UnifiedPayment.syncRazorpayPayment(
        { orderId: orderId },
        {
          client: subscription.client,
          dietitian: subscription.dietitian,
          paymentType: 'subscription',
          finalAmount: subscription.amount,
          currency: 'INR',
          status: 'failed',
          paymentStatus: 'failed',
          paymentMethod: 'razorpay',
          razorpayOrderId: orderId,
          razorpayPaymentId: payment.id,
          transactionId: payment.id,
          description: `Failed payment - Order: ${orderId} - Reason: ${payment.description || 'Unknown'}`
        }
      );
    } catch (paymentError) {
      console.error('Error syncing Failed UnifiedPayment record:', paymentError);
    }


    // TODO: Send email notification to client about failed payment
    // TODO: Send SMS notification to client
  } catch (error) {
    console.error('Error handling payment failure:', error);
  }
}

// Handle payment link completed
async function handlePaymentLinkCompleted(payload: any) {
  try {
    const paymentLinkData = payload.payment_link;
    const notes = paymentLinkData.notes || {};
    const subscriptionId = notes.subscriptionId;
    const clientId = notes.clientId;
    const dietitianId = notes.dietitianId;

    // First, check if this is from our PaymentLink model
    const paymentLink = await PaymentLink.findOne({
      razorpayPaymentLinkId: paymentLinkData.id
    });

    if (paymentLink) {
      // Extract payment details if available
      let paymentMethod = 'razorpay';
      let payerEmail = '';
      let payerPhone = '';
      let razorpayPaymentId = paymentLinkData.id;

      if (payload.payment) {
        razorpayPaymentId = payload.payment.entity?.id || paymentLinkData.id;
        paymentMethod = payload.payment.entity?.method || 'razorpay';
        payerEmail = payload.payment.entity?.email || '';
        payerPhone = payload.payment.entity?.contact || '';
      }

      // Update PaymentLink status
      paymentLink.status = 'paid';
      paymentLink.paidAt = new Date();
      paymentLink.razorpayPaymentId = razorpayPaymentId;
      paymentLink.paymentMethod = paymentMethod;
      paymentLink.payerEmail = payerEmail;
      paymentLink.payerPhone = payerPhone;

      await paymentLink.save();

      // Create/Update UnifiedPayment record (UPDATE existing, don't create duplicate)
      // This is the SINGLE source of truth for all payment data
      try {
        const paidAt = new Date();
        const startDate = new Date(paidAt);
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() + 1);

        let endDate: Date | undefined;
        if (paymentLink.durationDays && paymentLink.durationDays > 0) {
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + paymentLink.durationDays - 1);
        }

        await UnifiedPayment.syncRazorpayPayment(
          { paymentLink: paymentLink._id },
          {
            client: paymentLink.client,
            dietitian: paymentLink.dietitian,
            servicePlan: paymentLink.servicePlanId,
            paymentLink: paymentLink._id,
            paymentType: 'service_plan',
            planName: paymentLink.planName || 'Service Plan',
            planCategory: paymentLink.planCategory || 'general-wellness',
            durationDays: paymentLink.durationDays || 0,
            durationLabel: paymentLink.duration || `${paymentLink.durationDays} Days`,
            baseAmount: paymentLink.amount,
            discountPercent: paymentLink.discount || 0,
            taxPercent: paymentLink.tax || 0,
            finalAmount: paymentLink.finalAmount,
            currency: paymentLink.currency || 'INR',
            status: 'paid',
            paymentStatus: 'paid',
            paymentMethod: paymentMethod,
            razorpayPaymentLinkId: paymentLinkData.id,
            razorpayPaymentId: razorpayPaymentId,
            transactionId: razorpayPaymentId,
            payerEmail: payerEmail,
            payerPhone: payerPhone,
            purchaseDate: paidAt,
            startDate: startDate,
            ...(endDate ? { endDate } : {}),
            expectedStartDate: startDate,
            ...(endDate ? { expectedEndDate: endDate } : {}),
            paidAt,
            mealPlanCreated: false,
            daysUsed: 0,
            description: `Payment for ${paymentLink.planName || 'Service Plan'} - ${paymentLink.duration || paymentLink.durationDays + ' Days'} (${paymentLink.planCategory || 'general-wellness'})`
          }
        );
      } catch (paymentError) {
        console.error('Error syncing UnifiedPayment record:', paymentError);
      }
      //
      // Clear caches for real-time updates
      clearPaymentCaches();

      // Notify ALL relevant users: admins, client, dietitian, health counselor
      await emitPaymentUpdate(
        String(paymentLink.client),
        {
          paymentLinkId: String(paymentLink._id),
          status: 'paid',
          paidAt: new Date().toISOString(),
        },
        paymentLink.dietitian ? [String(paymentLink.dietitian)] : []
      );

      // Auto-send invoice email (fire-and-forget)
      try {
        const invoicePayment = await UnifiedPayment.findOne({ paymentLink: paymentLink._id }).select('_id');
        if (invoicePayment) {
          sendInvoiceOnPayment(String(invoicePayment._id)).catch(() => { });
        }
      } catch (invErr) {
        console.warn('[WEBHOOK] Failed to send auto-invoice:', invErr);
      }
      ///
      return;
    }

    // Legacy handling for ClientSubscription
    if (!subscriptionId) {
      return;
    }

    // Find subscription by ID
    const subscription = await ClientSubscription.findById(subscriptionId);

    if (!subscription) {
      return;
    }

    // Update subscription
    subscription.paymentStatus = 'paid';
    subscription.status = 'active';
    subscription.paidAt = new Date();

    await subscription.save();


    // TODO: Send confirmation email
    // TODO: Send SMS notification
  } catch (error) {
    console.error('Error handling payment link completion:', error);
  }
}

// Handle payment link cancelled
async function handlePaymentLinkCancelled(payload: any) {
  try {
    const paymentLink = payload.payment_link;
    const notes = paymentLink.notes || {};
    const subscriptionId = notes.subscriptionId;

    if (!subscriptionId) {
      return;
    }

    // Find subscription by ID
    const subscription = await ClientSubscription.findById(subscriptionId);

    if (!subscription) {
      return;
    }

    // Update subscription
    subscription.paymentStatus = 'failed';
    subscription.status = 'pending';

    await subscription.save();


    // TODO: Send notification to client
  } catch (error) {
    console.error('Error handling payment link cancellation:', error);
  }
}

