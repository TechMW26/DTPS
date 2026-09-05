import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import ServicePlan from '@/lib/db/models/ServicePlan';
import User from '@/lib/db/models/User';
import Razorpay from 'razorpay';
import mongoose from 'mongoose';

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

interface CheckoutTier {
  _id?: { toString(): string };
  durationDays: number;
  durationLabel: string;
  amount: number;
  isActive: boolean;
}

function selectPricingTier(tiers: CheckoutTier[], tierId: unknown): CheckoutTier | null {
  const requestedTier = typeof tierId === 'string' || typeof tierId === 'number'
    ? String(tierId)
    : '';
  const tierById = tiers.find((tier) => tier.isActive && tier._id?.toString() === requestedTier);
  if (tierById) return tierById;

  // Older service-detail builds sent the array index instead of the subdocument ID.
  if (/^\d+$/.test(requestedTier)) {
    const tierByIndex = tiers[Number(requestedTier)];
    if (tierByIndex?.isActive) return tierByIndex;
  }

  return null;
}

// POST /api/client/service-plans/purchase - Create an in-app Razorpay Checkout order
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const data = await request.json();
    const { planId, tierId } = data;

    if (!planId || tierId === undefined || !mongoose.isValidObjectId(planId)) {
      return NextResponse.json(
        { error: 'A valid plan and pricing tier are required' },
        { status: 400 }
      );
    }

    const plan = await ServicePlan.findOne({
      _id: planId,
      isActive: true,
      showToClients: true,
    });
    if (!plan) {
      return NextResponse.json({ error: 'This plan is not available' }, { status: 404 });
    }

    const tier = selectPricingTier(plan.pricingTiers as unknown as CheckoutTier[], tierId);
    if (!tier || !Number.isFinite(tier.amount) || tier.amount <= 0) {
      return NextResponse.json({ error: 'This pricing option is not available' }, { status: 400 });
    }

    // Pricing and plan details are always resolved from the database. Never trust
    // the browser-supplied amount for a payment order.
    const amount = tier.amount;
    const amountInPaise = Math.round(amount * 100);

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
    const dietitianId = client.assignedDietitian || null;

    // Create payment record using UnifiedPayment (dietitian is optional)
    const payment = new UnifiedPayment({
      client: session.user.id,
      ...(dietitianId && { dietitian: dietitianId }),
      servicePlan: plan._id,
      paymentType: 'service_plan',
      baseAmount: amount,
      finalAmount: amount,
      currency: 'INR',
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'razorpay',
      planName: plan.name,
      planCategory: plan.category,
      durationDays: tier.durationDays,
      durationLabel: tier.durationLabel,
      payerEmail: client.email,
      payerPhone: client.phone,
      payerName: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
      metadata: {
        servicePlanId: plan._id.toString(),
        pricingTierId: tier._id?.toString() || String(tierId),
      },
    });

    await payment.save();

    const razorpay = getRazorpay();

    try {
      // Orders open Razorpay Checkout inside DTPS. Payment Links intentionally
      // send/redirect customers to a separate link-based flow.
      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `sp_${payment._id.toString()}`,
        notes: {
          payment_id: payment._id.toString(),
          plan_id: plan._id.toString(),
          tier_id: tier._id?.toString() || String(tierId),
          client_id: session.user.id,
        },
      });

      payment.razorpayOrderId = order.id;
      await payment.save();

      return NextResponse.json({
        success: true,
        provider: 'razorpay_checkout',
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: order.id,
        paymentId: payment._id.toString(),
        amount: amountInPaise,
        currency: 'INR',
        name: 'DTPS',
        description: `${plan.name} - ${tier.durationLabel}`,
        prefill: {
          name: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
          email: client.email || '',
          contact: sanitizePhoneForRazorpay(client.phone) || '',
        },
      });

    } catch (razorpayError: unknown) {
      console.error('Razorpay error:', razorpayError);
      payment.status = 'failed';
      payment.paymentStatus = 'failed';
      await payment.save().catch(() => undefined);
      return NextResponse.json(
        { error: 'Razorpay Checkout is temporarily unavailable. Please try again.' },
        { status: 502 }
      );
    }

  } catch (error) {
    console.error('Error creating service plan purchase:', error);
    return NextResponse.json(
      { error: 'Failed to process purchase' },
      { status: 500 }
    );
  }
}
