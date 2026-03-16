import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import PaymentLink from '@/lib/db/models/PaymentLink';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { z } from 'zod';
import Razorpay from 'razorpay';
import { getPaymentCallbackUrl } from '@/lib/config';
import { sendNotificationToUser } from '@/lib/firebase/firebaseNotification';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { SSEManager } from '@/lib/realtime/sse-manager';

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

// Initialize Razorpay
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })
  : null;

const createPaymentLinkSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  amount: z.number().positive('Amount must be positive'),
  tax: z.number().min(0).default(0),
  discount: z.number().min(0).max(100).default(0), // Max 100% discount
  finalAmount: z.number().positive('Final amount must be positive'),
  planCategory: z.string().optional(),
  planName: z.string().optional(),
  duration: z.string().optional(),
  durationDays: z.number().min(1).optional(),
  servicePlanId: z.string().optional(),
  pricingTierId: z.string().optional(),
  catalogue: z.string().optional(),
  expireDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
  showToClient: z.boolean().default(true),
});

// GET /api/payment-links - Get payment links
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = parseInt(searchParams.get('skip') || '0');

    let query: any = {};

    // Clients can only see their own payment links
    if (session.user.role === UserRole.CLIENT) {
      query.client = session.user.id;
      query.showToClient = true;
    }
    // Dietitians can see payment links for their assigned clients
    else if (session.user.role === UserRole.DIETITIAN) {
      // Get all clients assigned to this dietitian
      const assignedClients = await withCache(
        `payment-links:${JSON.stringify({
          role: UserRole.CLIENT,
          $or: [
            { assignedDietitian: session.user.id },
            { assignedDietitians: session.user.id }
          ]
        })}`,
        async () => await User.find({
          role: UserRole.CLIENT,
          $or: [
            { assignedDietitian: session.user.id },
            { assignedDietitians: session.user.id }
          ]
        }).select('_id'),
        { ttl: 120000, tags: ['payment_links'] }
      );
      const assignedClientIds = assignedClients.map(c => c._id);

      // Dietitian can see payment links they created OR for their assigned clients
      query.$or = [
        { dietitian: session.user.id },
        { client: { $in: assignedClientIds } }
      ];
      if (clientId) query.client = clientId;
    }
    // Health counselors can see payment links for their assigned clients
    else if (session.user.role === UserRole.HEALTH_COUNSELOR) {
      // Get all clients assigned to this health counselor
      const assignedClients = await withCache(
        `payment-links:${JSON.stringify({
          role: UserRole.CLIENT,
          assignedHealthCounselor: session.user.id
        })}`,
        async () => await User.find({
          role: UserRole.CLIENT,
          assignedHealthCounselor: session.user.id
        }).select('_id'),
        { ttl: 120000, tags: ['payment_links'] }
      );
      const assignedClientIds = assignedClients.map(c => c._id);

      // Health counselor can see payment links they created OR for their assigned clients
      query.$or = [
        { dietitian: session.user.id },
        { client: { $in: assignedClientIds } }
      ];
      if (clientId) query.client = clientId;
    }
    // Admins can see all
    else if (session.user.role === UserRole.ADMIN) {
      if (clientId) query.client = clientId;
    }

    if (status) query.status = status;

    // Auto-expire payment links that have passed their expiry date (end of day)
    // Note: Only mark as 'expired', not 'cancelled'. Cancelled is for rejected payments.
    // Only expire if the expiry date has fully passed (compare with start of today, not current time)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    await PaymentLink.updateMany(
      {
        expireDate: { $lt: todayStart }, // Only expire if expiry date is before today (not including today)
        status: { $in: ['created', 'pending'] }
      },
      {
        $set: { status: 'expired' }
      }
    );

    const paymentLinks = await withCache(
      `payment-links:${JSON.stringify(query)}:limit=${limit}:skip=${skip}`,
      async () => await PaymentLink.find(query)
        .populate('client', 'firstName lastName email phone')
        .populate('dietitian', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip),
      { ttl: 120000, tags: ['payment_links'] }
    );

    const total = await PaymentLink.countDocuments(query);

    const response = NextResponse.json({
      success: true,
      paymentLinks,
      total,
      limit,
      skip
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;

  } catch (error) {
    console.error('Error fetching payment links:', error);
    const response = NextResponse.json(
      { error: 'Failed to fetch payment links' },
      { status: 500 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

// POST /api/payment-links - Create new payment link
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only dietitians, health counselors, and admins can create payment links
    if (session.user.role !== UserRole.DIETITIAN &&
      session.user.role !== UserRole.HEALTH_COUNSELOR &&
      session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = createPaymentLinkSchema.parse(body);

    await connectDB();

    // Verify client exists
    const client = await withCache(
      `payment-links:${JSON.stringify(validatedData.clientId)}`,
      async () => await User.findById(validatedData.clientId),
      { ttl: 120000, tags: ['payment_links'] }
    );
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Create payment link in database first
    const paymentLinkData: any = {
      client: validatedData.clientId,
      dietitian: session.user.id,
      amount: validatedData.amount,
      tax: validatedData.tax,
      discount: validatedData.discount, // Allow any discount up to 100%
      finalAmount: validatedData.finalAmount,
      planCategory: validatedData.planCategory,
      planName: validatedData.planName,
      duration: validatedData.duration,
      durationDays: validatedData.durationDays,
      servicePlanId: validatedData.servicePlanId,
      pricingTierId: validatedData.pricingTierId,
      catalogue: validatedData.catalogue,
      notes: validatedData.notes,
      showToClient: validatedData.showToClient,
      status: 'pending', // Default status is pending until approved/paid
    };

    if (validatedData.expireDate) {
      paymentLinkData.expireDate = new Date(validatedData.expireDate);
    }

    // Enforce Razorpay-only flow: never create placeholder/manual URLs.
    if (!razorpay) {
      return NextResponse.json(
        {
          error: 'Razorpay is not configured. Payment link cannot be created right now.',
          code: 'RAZORPAY_NOT_CONFIGURED',
        },
        { status: 503 }
      );
    }

    // Create Razorpay payment link (required)
    try {
      const clientName = `${client.firstName} ${client.lastName}`.trim() || 'Customer';
      const description = validatedData.planName
        ? `Payment for ${validatedData.planName}${validatedData.duration ? ` - ${validatedData.duration}` : ''}`
        : 'Payment Link';

      const today = new Date();
      const paymentDate = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;

      const razorpayPaymentLinkOptions: any = {
        amount: Math.round(validatedData.finalAmount * 100), // Amount in paise
        currency: 'INR',
        accept_partial: false,
        description: description,
        customer: {
          name: clientName,
          email: client.email || undefined,
          contact: sanitizePhoneForRazorpay(client.phone),
        },
        notify: {
          sms: !!sanitizePhoneForRazorpay(client.phone),
          email: !!client.email,
        },
        reminder_enable: true,
        notes: {
          clientId: validatedData.clientId,
          clientName: clientName,
          dietitianId: session.user.id,
          planName: validatedData.planName || '',
          planCategory: validatedData.planCategory || '',
          durationDays: validatedData.durationDays?.toString() || '',
          duration: validatedData.duration || '',
          baseAmount: validatedData.amount.toString(),
          tax: validatedData.tax.toString(),
          discount: validatedData.discount.toString(),
          finalAmount: validatedData.finalAmount.toString(),
          paymentDate: paymentDate,
          createdAt: today.toISOString(),
        },
        callback_url: getPaymentCallbackUrl('/user?payment_success=true'),
        callback_method: 'get'
      };

      // Set expiry if provided
      if (validatedData.expireDate) {
        const expireTimestamp = Math.floor(new Date(validatedData.expireDate).getTime() / 1000);
        razorpayPaymentLinkOptions.expire_by = expireTimestamp;
      }

      const razorpayLink = await razorpay.paymentLink.create(razorpayPaymentLinkOptions);

      paymentLinkData.razorpayPaymentLinkId = razorpayLink.id;
      paymentLinkData.razorpayPaymentLinkUrl = razorpayLink.short_url;
      paymentLinkData.razorpayPaymentLinkShortUrl = razorpayLink.short_url;
      paymentLinkData.status = 'pending';

    } catch (razorpayError: any) {
      console.error('Razorpay payment link creation failed:', razorpayError);
      return NextResponse.json(
        {
          error: 'Failed to create Razorpay payment link. Please try again.',
          code: 'RAZORPAY_LINK_CREATE_FAILED',
          details: razorpayError?.error?.description || razorpayError?.message || 'Unknown Razorpay error',
        },
        { status: 502 }
      );
    }

    const paymentLink = await PaymentLink.create(paymentLinkData);

    // Populate and return
    const populatedPaymentLink = await withCache(
      `payment-links:${JSON.stringify(paymentLink._id)}`,
      async () => await PaymentLink.findById(paymentLink._id)
        .populate('client', 'firstName lastName email phone')
        .populate('dietitian', 'firstName lastName email'),
      { ttl: 120000, tags: ['payment_links'] }
    );

    // Ensure list/detail caches reflect the newly created link.
    clearCacheByTag('payment_links');

    // Realtime update for client/dietitian/admin lists
    try {
      const adminUsers = await User.find({ role: UserRole.ADMIN }).select('_id');
      const adminIds = adminUsers.map((u: any) => u._id.toString());

      const sseManager = SSEManager.getInstance();
      const recipientIds = Array.from(
        new Set([
          ...adminIds,
          validatedData.clientId,
          session.user.id,
        ])
      );

      for (const recipientId of recipientIds) {
        sseManager.sendToUser(recipientId, 'payment_link_updated', {
          action: 'created',
          id: paymentLink._id.toString(),
          clientId: validatedData.clientId,
        });
      }
    } catch (sseError) {
      console.error('Failed to emit payment_link_updated SSE:', sseError);
    }

    // Send push notification to client about new payment link
    try {
      const amountFormatted = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0
      }).format(validatedData.finalAmount);

      await sendNotificationToUser(validatedData.clientId, {
        title: '💳 New Payment Request',
        body: validatedData.planName
          ? `Payment of ${amountFormatted} requested for "${validatedData.planName}". Tap to pay now.`
          : `A payment of ${amountFormatted} has been requested. Tap to pay now.`,
        icon: '/icons/icon-192x192.png',
        data: {
          type: 'payment_link',
          paymentLinkId: paymentLink._id.toString(),
          amount: validatedData.finalAmount.toString(),
          url: '/user/payments'
        },
        clickAction: '/user/payments'
      });
    } catch (notificationError) {
      console.error('Failed to send payment link notification:', notificationError);
      // Don't fail the request if notification fails
    }

    return NextResponse.json({
      success: true,
      paymentLink: populatedPaymentLink,
      message: 'Payment link created with Razorpay'
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating payment link:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create payment link' },
      { status: 500 }
    );
  }
}

// DELETE /api/payment-links - Delete/Cancel payment link
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Payment link ID is required' }, { status: 400 });
    }

    await connectDB();

    const paymentLink = await PaymentLink.findById(id);

    if (!paymentLink) {
      return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
    }

    // Check permissions - dietitians and health counselors can only cancel their own payment links
    if ((session.user.role === UserRole.DIETITIAN || session.user.role === UserRole.HEALTH_COUNSELOR) &&
      paymentLink.dietitian.toString() !== session.user.id) {
      return NextResponse.json({ error: 'You can only cancel payment links you created' }, { status: 403 });
    }

    // Cannot delete paid payment links
    if (paymentLink.status === 'paid') {
      return NextResponse.json({ error: 'Cannot delete a paid payment link' }, { status: 400 });
    }

    // Cancel in Razorpay if applicable
    if (razorpay && paymentLink.razorpayPaymentLinkId) {
      try {
        await razorpay.paymentLink.cancel(paymentLink.razorpayPaymentLinkId);
      } catch (razorpayError) {
        console.error('Failed to cancel Razorpay payment link:', razorpayError);
        // Continue with deletion even if Razorpay cancellation fails
      }
    }

    // Mark as cancelled instead of deleting
    paymentLink.status = 'cancelled';
    await paymentLink.save();

    clearCacheByTag('payment_links');

    // Realtime update for client/dietitian/admin lists
    try {
      const adminUsers = await User.find({ role: UserRole.ADMIN }).select('_id');
      const adminIds = adminUsers.map((u: any) => u._id.toString());

      const sseManager = SSEManager.getInstance();
      const recipientIds = Array.from(
        new Set([
          ...adminIds,
          paymentLink.client?.toString?.() || '',
          paymentLink.dietitian?.toString?.() || '',
        ].filter(Boolean))
      );

      for (const recipientId of recipientIds) {
        sseManager.sendToUser(recipientId, 'payment_link_updated', {
          action: 'cancelled',
          id: paymentLink._id.toString(),
        });
      }
    } catch (sseError) {
      console.error('Failed to emit payment_link_updated SSE:', sseError);
    }

    return NextResponse.json({
      success: true,
      message: 'Payment link cancelled successfully'
    });

  } catch (error) {
    console.error('Error deleting payment link:', error);
    return NextResponse.json(
      { error: 'Failed to delete payment link' },
      { status: 500 }
    );
  }
}
