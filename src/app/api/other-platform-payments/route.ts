import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db/connect';
import OtherPlatformPayment from '@/lib/db/models/OtherPlatformPayment';
import { UserRole } from '@/types';
import User from '@/lib/db/models/User';
import { getImageKit } from '@/lib/imagekit';
import { compressImageServer } from '@/lib/imageCompressionServer';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { socketManager } from '@/lib/realtime/socket-manager';

// GET - List other platform payments
export async function GET(request: NextRequest) {
  try {
    const sessionPromise = getServerSession(authOptions);
    const dbPromise = dbConnect();
    const session = await sessionPromise;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbPromise;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const clientId = searchParams.get('clientId');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any = {};

    // Role-based filtering
    if (session.user.role === UserRole.CLIENT) {
      filter.client = session.user.id;
    } else if (session.user.role === UserRole.DIETITIAN || session.user.role === UserRole.HEALTH_COUNSELOR) {
      filter.dietitian = session.user.id;
      if (clientId) {
        filter.client = clientId;
      }
    }
    // Admin can see all

    if (status) {
      filter.status = status;
    }

    const cacheScope = `${session.user.role}:${session.user.id || 'unknown'}`;
    const payments = await withCache(
      `other-platform-payments:${cacheScope}:${JSON.stringify(filter)}`,
      async () => await OtherPlatformPayment.find(filter)
        .populate('client', 'firstName lastName email phone profilePicture')
        .populate('dietitian', 'firstName lastName email phone')
        .populate('paymentLink', 'planName planCategory durationDays amount finalAmount')
        .populate('reviewedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .lean(),
      { ttl: 120000, tags: ['other_platform_payments'] }
    );

    return NextResponse.json({ payments });
  } catch (error) {
    console.error('Error fetching other platform payments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}

// POST - Create new other platform payment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== UserRole.DIETITIAN && session.user.role !== UserRole.HEALTH_COUNSELOR && session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Only dietitians can create other platform payments' }, { status: 403 });
    }

    await dbConnect();

    const formData = await request.formData();

    const clientId = formData.get('clientId') as string;
    const platform = formData.get('platform') as string;
    const customPlatform = formData.get('customPlatform') as string;
    const transactionId = formData.get('transactionId') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const paymentLinkId = formData.get('paymentLinkId') as string;
    const planName = formData.get('planName') as string;
    const planCategory = formData.get('planCategory') as string;
    const durationDays = formData.get('durationDays') as string;
    const durationLabel = formData.get('durationLabel') as string;
    const paymentDate = formData.get('paymentDate') as string;
    const notes = formData.get('notes') as string;
    const receiptImage = formData.get('receiptImage') as File | null;

    if (!clientId || !platform || !transactionId || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    let receiptImagePath = '';
    let receiptImageUrl = '';

    // Handle receipt image upload - compress and upload to ImageKit
    if (receiptImage && receiptImage.size > 0) {
      try {
        const bytes = await receiptImage.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Compress image before uploading (server-side compression)
        const compressedBase64 = await compressImageServer(buffer, {
          quality: 75,
          maxWidth: 1200,
          maxHeight: 1200,
          format: 'webp'
        });

        // Generate unique filename
        const filename = `receipt_${crypto.randomUUID()}`;

        // Upload to ImageKit in the otherplatform folder
        const imageKit = getImageKit();
        const uploadResponse = await imageKit.upload({
          file: compressedBase64,
          fileName: `${filename}.webp`,
          folder: '/otherplatform',
          useUniqueFileName: true,
        });

        receiptImagePath = uploadResponse.filePath;
        receiptImageUrl = uploadResponse.url;
      } catch (uploadError) {
        console.error('Error uploading receipt image to ImageKit:', uploadError);
        // Continue without image if upload fails
      }
    }

    const otherPlatformPayment = new OtherPlatformPayment({
      client: clientId,
      dietitian: session.user.id,
      platform,
      customPlatform: platform === 'other' ? customPlatform : undefined,
      transactionId,
      amount,
      paymentLink: paymentLinkId || undefined,
      planName: planName || undefined,
      planCategory: planCategory || undefined,
      durationDays: durationDays ? parseInt(durationDays) : undefined,
      durationLabel: durationLabel || undefined,
      receiptImage: receiptImagePath,
      receiptImageUrl,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      notes,
      status: 'pending',
    });

    await otherPlatformPayment.save();

    // Invalidate list caches so it appears immediately.
    clearCacheByTag('other_platform_payments');

    const populatedPayment = await withCache(
      `other-platform-payments:${JSON.stringify(otherPlatformPayment._id)}`,
      async () => await OtherPlatformPayment.findById(otherPlatformPayment._id)
        .populate('client', 'firstName lastName email phone')
        .populate('paymentLink', 'planName planCategory durationDays amount finalAmount'),
      { ttl: 120000, tags: ['other_platform_payments'] }
    );

    // Notify admins (and creator) for real-time list updates.
    try {
      const admins = await User.find({ role: UserRole.ADMIN }).select('_id');
      const notifyUserIds = new Set<string>([
        ...admins.map(a => String(a._id)),
        String(session.user.id),
      ]);
      socketManager.sendToUsers(Array.from(notifyUserIds), 'other_platform_payment_updated', {
        paymentId: String(otherPlatformPayment._id),
        status: otherPlatformPayment.status,
        createdAt: otherPlatformPayment.createdAt,
      });
    } catch (e) {
      console.warn('Failed to emit SSE other_platform_payment_updated (create):', e);
    }

    return NextResponse.json({
      success: true,
      payment: populatedPayment,
      message: 'Payment submitted for admin approval'
    });
  } catch (error) {
    console.error('Error creating other platform payment:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}
