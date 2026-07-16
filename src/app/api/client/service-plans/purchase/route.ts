import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
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

// POST /api/client/service-plans/purchase - Purchase a service plan
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const data = await request.json();
    const { planId, tierId, amount, durationDays, durationLabel, planName, planCategory } = data;

    if (!planId || !amount) {
      return NextResponse.json(
        { error: 'Plan ID and amount are required' },
        { status: 400 }
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

    // Get dietitian if assigned (optional now)
    let dietitianId = client.assignedDietitian || null;

    // Create payment record using UnifiedPayment (dietitian is optional)
    const payment = new UnifiedPayment({
      client: session.user.id,
      ...(dietitianId && { dietitian: dietitianId }),
      paymentType: 'service_plan',
      baseAmount: amount,
      finalAmount: amount,
      currency: 'INR',
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'razorpay',
      planName: planName || 'Service Plan',
      planCategory: planCategory || 'general-wellness',
      durationDays: durationDays || 30,
      durationLabel: durationLabel || '1 Month',
      payerEmail: client.email,
      payerPhone: client.phone
    });

    await payment.save();

    const razorpay = getRazorpay();

    try {
      // Create Razorpay payment link
      const paymentLink = await razorpay.paymentLink.create({
        amount: amount * 100, // Razorpay expects amount in paise
        currency: 'INR',
        accept_partial: false,
        description: `${planName} - ${durationLabel}`,
        customer: {
          name: `${client.firstName} ${client.lastName}`.trim(),
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
          plan_id: planId,
          tier_id: tierId || '',
          client_id: session.user.id
        },
        callback_url: getPaymentCallbackUrl('/user?payment_success=true'),
        callback_method: 'get'
      }) as any;

      // Update payment with Razorpay details
      payment.razorpayPaymentLinkId = paymentLink.id;
      payment.razorpayPaymentLinkUrl = paymentLink.long_url;
      (payment as any).razorpayPaymentLinkShortUrl = paymentLink.short_url;
      await payment.save();

      return NextResponse.json({
        success: true,
        paymentLink: paymentLink.short_url,
        paymentId: payment._id.toString()
      });

    } catch (razorpayError: any) {
      console.error('Razorpay error:', razorpayError);

      // Try to create Razorpay order instead for checkout modal
      try {
        const order = await razorpay.orders.create({
          amount: amount * 100,
          currency: 'INR',
          receipt: payment._id.toString(),
          notes: {
            payment_id: payment._id.toString(),
            plan_id: planId
          }
        });

        payment.razorpayOrderId = order.id;
        await payment.save();

        return NextResponse.json({
          success: true,
          orderId: order.id,
          paymentId: payment._id.toString()
        });
      } catch (orderError) {
        console.error('Order creation error:', orderError);

        // If both fail, return payment ID for manual processing
        return NextResponse.json({
          success: true,
          paymentId: payment._id.toString(),
          message: 'Order created. You will be contacted for payment.'
        });
      }
    }

  } catch (error) {
    console.error('Error creating service plan purchase:', error);
    return NextResponse.json(
      { error: 'Failed to process purchase' },
      { status: 500 }
    );
  }
}
