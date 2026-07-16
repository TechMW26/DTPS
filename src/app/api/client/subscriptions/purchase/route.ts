import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import SubscriptionPlan from '@/lib/db/models/SubscriptionPlan';
import User from '@/lib/db/models/User';
import Razorpay from 'razorpay';
import { getPaymentCallbackUrl } from '@/lib/config';

// Helper function to sanitize phone number for Razorpay (must be 8-14 chars)
function sanitizePhoneForRazorpay(phone: string | undefined | null): string | undefined {
  if (!phone) return undefined;

  // Remove all non-digit characters (spaces, dashes, plus signs, brackets, etc.)
  let digits = phone.replace(/\D/g, '');

  // Handle empty result
  if (!digits || digits.length === 0) return undefined;

  // If it starts with country code 91 (India) and total length > 10, remove it
  if (digits.startsWith('91') && digits.length > 10) {
    digits = digits.slice(2);
  }

  // If it starts with 0 (trunk prefix in India), remove it
  if (digits.startsWith('0') && digits.length > 10) {
    digits = digits.slice(1);
  }

  // If still too long, take last 10 digits (standard Indian mobile number)
  if (digits.length > 14) {
    digits = digits.slice(-10);
  }

  // Razorpay requires 8-14 characters
  if (digits.length >= 8 && digits.length <= 14) {
    return digits;
  }

  // If phone is too short or invalid, return undefined (will skip SMS notification)
  return undefined;
}

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

// POST /api/client/subscriptions/purchase - Purchase a subscription plan
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const data = await request.json();
    const { planId, amount, currency = 'INR' } = data;

    if (!planId) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    // Get the subscription plan
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return NextResponse.json(
        { error: 'Plan not found' },
        { status: 404 }
      );
    }

    // Get client info
    const client = await User.findById(session.user.id)
      .select('firstName lastName email phone assignedDietitian');

    if (!client) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    // Calculate duration in days
    let durationDays = plan.duration;
    if (plan.durationType === 'weeks') {
      durationDays = plan.duration * 7;
    } else if (plan.durationType === 'months') {
      durationDays = plan.duration * 30;
    }

    // Create payment record using UnifiedPayment
    const payment = new UnifiedPayment({
      client: session.user.id,
      dietitian: client.assignedDietitian || plan.createdBy,
      paymentType: 'subscription',
      baseAmount: plan.price,
      finalAmount: plan.price,
      currency: plan.currency || 'INR',
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'razorpay',
      planName: plan.name,
      planCategory: plan.category,
      durationDays,
      durationLabel: `${plan.duration} ${plan.durationType}`,
      payerEmail: client.email,
      payerPhone: client.phone
    });

    await payment.save();

    const razorpay = getRazorpay();

    try {
      // Create Razorpay payment link
      const paymentLink = await razorpay.paymentLink.create({
        amount: plan.price * 100, // Razorpay expects amount in paise
        currency: plan.currency || 'INR',
        accept_partial: false,
        description: `${plan.name} - ${plan.duration} ${plan.durationType}`,
        customer: {
          name: `${client.firstName} ${client.lastName}`,
          email: client.email,
          contact: sanitizePhoneForRazorpay(client.phone)
        },
        notify: {
          sms: !!sanitizePhoneForRazorpay(client.phone),
          email: true
        },
        reminder_enable: true,
        notes: {
          payment_id: payment._id.toString(),
          plan_id: plan._id.toString(),
          client_id: session.user.id
        },
        callback_url: getPaymentCallbackUrl('/user/subscriptions?payment_success=true'),
        callback_method: 'get'
      }) as any;

      // Update payment with Razorpay details
      payment.razorpayPaymentLinkId = paymentLink.id;
      payment.razorpayPaymentLinkUrl = (paymentLink as any).short_url || (paymentLink as any).long_url;
      await payment.save();

      return NextResponse.json({
        success: true,
        paymentLink: paymentLink.short_url,
        paymentId: payment._id.toString()
      });

    } catch (razorpayError: any) {
      console.error('Razorpay error:', razorpayError);

      // If Razorpay fails, still create the order for manual processing
      return NextResponse.json({
        success: true,
        paymentId: payment._id.toString(),
        message: 'Order created. You will be contacted for payment.'
      });
    }

  } catch (error) {
    console.error('Error creating subscription purchase:', error);
    return NextResponse.json(
      { error: 'Failed to process purchase' },
      { status: 500 }
    );
  }
}
