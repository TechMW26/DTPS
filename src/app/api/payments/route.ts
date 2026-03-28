import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import Stripe from 'stripe';
import { logHistoryServer } from '@/lib/server/history';
import { logActivity, logPaymentFailure } from '@/lib/utils/activityLogger';
import { clearCacheByTag } from '@/lib/api/utils';
import { socketManager } from '@/lib/realtime/socket-manager';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
}) : null;

// GET /api/payments - Get payments for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '10');
    const page = parseInt(searchParams.get('page') || '1');

    // Build query based on user role
    let query: any = {};
    if (session.user.role === UserRole.CLIENT) {
      query.client = session.user.id;
    } else if (session.user.role === UserRole.DIETITIAN) {
      query.dietitian = session.user.id;
    } else {
      // Admin can see all payments
    }

    // Add status filter
    if (status) {
      query.paymentStatus = status;
    }

    const payments = await UnifiedPayment.find(query)
      .populate('client', 'firstName lastName email')
      .populate('dietitian', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit);

    const total = await UnifiedPayment.countDocuments(query);

    const response = NextResponse.json({
      payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;

  } catch (error) {
    console.error('Error fetching payments:', error);
    const response = NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

// POST /api/payments - Create payment intent
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { amount, currency = 'USD', description, appointmentId, dietitianId } = body;

    await connectDB();

    // Validate required fields
    if (!amount || !description) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create payment record using UnifiedPayment
    const payment = await UnifiedPayment.syncRazorpayPayment(
      { transactionId: `stripe_${Date.now()}_${session.user.id}` },
      {
        client: session.user.id,
        dietitian: dietitianId,
        paymentType: 'consultation',
        finalAmount: amount,
        baseAmount: amount,
        discountPercent: 0,
        taxPercent: 0,
        currency: currency,
        description: description,
        status: 'pending',
        paymentStatus: 'pending',
        paymentMethod: 'stripe',
        planName: description,
        planCategory: 'consultation',
        durationDays: 0,
        durationLabel: 'One-time'
      }
    );

    // Newly created payments should show up immediately in payment lists.
    clearCacheByTag('payments');

    // Record payment creation in history
    await logHistoryServer({
      userId: session.user.id,
      action: 'create',
      category: 'payment',
      description: `Payment of ${amount} ${currency.toUpperCase()} initiated: ${description}`,
      performedById: session.user.id,
      metadata: {
        paymentId: payment._id,
        appointmentId,
        dietitianId,
        amount,
        currency,
        status: payment.status,
      },
    });

    // Log activity
    await logActivity({
      userId: session.user.id,
      userRole: session.user.role as any,
      userName: session.user.name || 'Unknown',
      userEmail: session.user.email || '',
      action: 'Created Payment',
      actionType: 'payment',
      category: 'payment',
      description: `Created payment of ${amount} ${currency.toUpperCase()}: ${description}`,
      resourceId: payment._id.toString(),
      resourceType: 'Payment',
      details: { amount, currency, description }
    });

    // Create Stripe payment intent
    if (!stripe) {
      return NextResponse.json({ error: 'Payment service not configured' }, { status: 500 });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe uses cents
      currency: currency.toLowerCase(),
      description,
      metadata: {
        appointmentId: appointmentId || '',
        dietitianId: dietitianId || '',
        clientId: session.user.id
      }
    });

    // Update payment with Stripe payment intent ID
    (payment as any).stripePaymentIntentId = paymentIntent.id;
    await payment.save();

    clearCacheByTag('payments');

    // Best-effort realtime notify involved users.
    try {
      const notifyUserIds = new Set<string>([
        String(payment.client),
        payment.dietitian ? String(payment.dietitian) : '',
      ].filter(Boolean));
      socketManager.sendToUsers(Array.from(notifyUserIds), 'payment_updated', {
        paymentId: String(payment._id),
        status: payment.status,
        createdAt: payment.createdAt,
      });
    } catch {}

    return NextResponse.json({
      payment,
      paymentIntent
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating payment:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}

// PUT /api/payments - Update payment status (webhook handler)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { paymentIntentId, status, metadata } = body;

    await connectDB();

    // Find and update payment using syncRazorpayPayment
    const payment = await UnifiedPayment.findOneAndUpdate(
      { transactionId: { $regex: paymentIntentId } },
      {
        status: status === 'completed' ? 'paid' : status,
        paymentStatus: status === 'completed' ? 'paid' : status,
        paidAt: status === 'completed' ? new Date() : undefined
      },
      { new: true }
    );
    
    if (!payment) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }

    clearCacheByTag('payments');

    // Best-effort realtime notify involved users.
    try {
      const notifyUserIds = new Set<string>([
        payment.client ? String(payment.client) : '',
        payment.dietitian ? String(payment.dietitian) : '',
      ].filter(Boolean));
      socketManager.sendToUsers(Array.from(notifyUserIds), 'payment_updated', {
        paymentId: String(payment._id),
        status: payment.status,
        paidAt: payment.paidAt,
      });
    } catch {}

    // Record status update in history for the client
    await logHistoryServer({
      userId: payment.client?.toString() || '',
      action: 'update',
      category: 'payment',
      description: `Payment status updated to ${status}`,
      metadata: {
        paymentId: payment._id,
        status,
      },
    });

    return NextResponse.json({ message: 'Payment updated successfully' });

  } catch (error) {
    console.error('Error updating payment:', error);
    return NextResponse.json(
      { error: 'Failed to update payment' },
      { status: 500 }
    );
  }
}

// PATCH /api/payments - Update meal plan created status
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { paymentId, mealPlanCreated, mealPlanId } = body;

    if (!paymentId) {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 });
    }

    const updateData: any = {};
    if (mealPlanCreated !== undefined) updateData.mealPlanCreated = mealPlanCreated;
    if (mealPlanId) updateData.mealPlan = mealPlanId;

    const payment = await UnifiedPayment.findByIdAndUpdate(
      paymentId,
      updateData,
      { new: true }
    );

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      payment,
      message: 'Payment updated successfully' 
    });

  } catch (error) {
    console.error('Error updating payment:', error);
    return NextResponse.json(
      { error: 'Failed to update payment' },
      { status: 500 }
    );
  }
}
