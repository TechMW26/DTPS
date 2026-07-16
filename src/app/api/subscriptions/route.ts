import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import ClientSubscription from '@/lib/db/models/ClientSubscription';
import SubscriptionPlan from '@/lib/db/models/SubscriptionPlan';
import { UserRole } from '@/types';
import { z } from 'zod';
import Razorpay from 'razorpay';
import { getPaymentCallbackUrl } from '@/lib/config';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// Initialize Razorpay
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null;

const subscriptionSchema = z.object({
  clientId: z.string(),
  planId: z.string(),
  paymentMethod: z.enum(['razorpay', 'manual', 'cash', 'bank-transfer']),
  notes: z.string().max(1000).optional(),
  generatePaymentLink: z.boolean().default(false)
});

// GET /api/subscriptions - Get subscriptions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId');

    // Allow public access for payment success page
    if (paymentId) {
      await connectDB();
      const subscription = await withCache(
      `subscriptions:${JSON.stringify({
        razorpayPaymentId: paymentId
      })}`,
      async () => await ClientSubscription.findOne({
        razorpayPaymentId: paymentId
      })
        .populate('client', 'firstName lastName email phone')
        .populate('dietitian', 'firstName lastName email')
        .populate('plan'),
      { ttl: 120000, tags: ['subscriptions'] }
    );

      if (!subscription) {
        return NextResponse.json(
          { error: 'Subscription not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        subscription
      });
    }

    // For other queries, require authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const clientId = searchParams.get('clientId');
    const status = searchParams.get('status');

    let query: any = {};

    // Clients can only see their own subscriptions
    if (session.user.role === UserRole.CLIENT) {
      query.client = session.user.id;
    }
    // Dietitians can see their clients' subscriptions
    else if (session.user.role === UserRole.DIETITIAN) {
      query.dietitian = session.user.id;
      if (clientId) query.client = clientId;
    }
    // Admins can see all
    else if (session.user.role === UserRole.ADMIN) {
      if (clientId) query.client = clientId;
    }

    if (status) query.status = status;

    const subscriptions = await withCache(
      `subscriptions:${JSON.stringify(query)}`,
      async () => await ClientSubscription.find(query)
      .populate('client', 'firstName lastName email phone')
      .populate('dietitian', 'firstName lastName email')
      .populate('plan')
      .sort({ createdAt: -1 }),
      { ttl: 120000, tags: ['subscriptions'] }
    );

    return NextResponse.json({
      success: true,
      subscriptions,
      count: subscriptions.length
    });

  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscriptions' },
      { status: 500 }
    );
  }
}

// POST /api/subscriptions - Create new subscription
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only dietitians and admins can create subscriptions
    if (session.user.role !== UserRole.DIETITIAN && session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = subscriptionSchema.parse(body);

    await connectDB();

    // Get the plan details
    const plan = await withCache(
      `subscriptions:${JSON.stringify(validatedData.planId)}`,
      async () => await SubscriptionPlan.findById(validatedData.planId),
      { ttl: 120000, tags: ['subscriptions'] }
    );
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    if (!plan.isActive) {
      return NextResponse.json({ error: 'Plan is not active' }, { status: 400 });
    }

    // Calculate dates
    const startDate = new Date();
    const endDate = new Date(startDate);
    
    switch (plan.durationType) {
      case 'days':
        endDate.setDate(endDate.getDate() + plan.duration);
        break;
      case 'weeks':
        endDate.setDate(endDate.getDate() + (plan.duration * 7));
        break;
      case 'months':
        endDate.setMonth(endDate.getMonth() + plan.duration);
        break;
    }

    // Create subscription
    const subscription = new ClientSubscription({
      client: validatedData.clientId,
      dietitian: session.user.id,
      plan: validatedData.planId,
      startDate,
      endDate,
      amount: plan.price,
      currency: plan.currency,
      paymentMethod: validatedData.paymentMethod,
      notes: validatedData.notes,
      status: validatedData.paymentMethod === 'manual' ? 'pending' : 'pending',
      paymentStatus: validatedData.paymentMethod === 'manual' ? 'pending' : 'pending'
    });

    // Generate Razorpay payment link if requested
    if (validatedData.generatePaymentLink && validatedData.paymentMethod === 'razorpay') {
      if (!razorpay) {
        return NextResponse.json(
          { error: 'Razorpay not configured' },
          { status: 500 }
        );
      }

      try {
        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
          amount: Math.round(plan.price * 100), // Amount in paise
          currency: plan.currency,
          receipt: `sub_${subscription._id}`,
          notes: {
            subscriptionId: subscription._id.toString(),
            clientId: validatedData.clientId,
            dietitianId: session.user.id,
            planName: plan.name
          }
        });

        subscription.razorpayOrderId = razorpayOrder.id;

        // Generate payment link
        const paymentLink = await razorpay.paymentLink.create({
          amount: Math.round(plan.price * 100),
          currency: plan.currency,
          description: `${plan.name} - ${plan.duration} ${plan.durationType}`,
          customer: {
            name: '', // Will be populated from client data
            email: '', // Will be populated from client data
          },
          notify: {
            sms: true,
            email: true
          },
          reminder_enable: true,
          notes: {
            subscriptionId: subscription._id.toString(),
            planName: plan.name
          },
          callback_url: getPaymentCallbackUrl('/subscriptions/payment-success'),
          callback_method: 'get'
        });

        subscription.paymentLink = paymentLink.short_url;

      } catch (razorpayError) {
        console.error('Razorpay error:', razorpayError);
        // Continue without payment link
      }
    }

    await subscription.save();

    // Populate the subscription
    await subscription.populate([
      { path: 'client', select: 'firstName lastName email phone' },
      { path: 'dietitian', select: 'firstName lastName email' },
      { path: 'plan' }
    ]);

    return NextResponse.json({
      success: true,
      message: 'Subscription created successfully',
      subscription
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating subscription:', error);
    return NextResponse.json(
      { error: 'Failed to create subscription' },
      { status: 500 }
    );
  }
}

