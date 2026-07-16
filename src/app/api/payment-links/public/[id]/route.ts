import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import PaymentLink from '@/lib/db/models/PaymentLink';
import mongoose from 'mongoose';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/payment-links/public/[id] - Get public payment link details (no auth required)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Payment link ID is required' }, { status: 400 });
    }

    await connectDB();

    let paymentLink;

    // Check if id is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      paymentLink = await PaymentLink.findById(id)
        .populate('client', 'firstName lastName email')
        .populate('dietitian', 'firstName lastName');
    }

    // If not found, try finding by Razorpay payment link ID
    if (!paymentLink) {
      paymentLink = await PaymentLink.findOne({ razorpayPaymentLinkId: id })
        .populate('client', 'firstName lastName email')
        .populate('dietitian', 'firstName lastName');
    }

    // Try with plink_ prefix
    if (!paymentLink && !id.startsWith('plink_')) {
      paymentLink = await PaymentLink.findOne({ razorpayPaymentLinkId: `plink_${id}` })
        .populate('client', 'firstName lastName email')
        .populate('dietitian', 'firstName lastName');
    }

    if (!paymentLink) {
      return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
    }

    if (!paymentLink.showToClient) {
      return NextResponse.json({ error: 'Payment link not available' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      paymentLink: {
        _id: paymentLink._id,
        amount: paymentLink.amount,
        tax: paymentLink.tax || 0,
        discount: paymentLink.discount || 0,
        finalAmount: paymentLink.finalAmount,
        currency: paymentLink.currency,
        planName: paymentLink.planName,
        planCategory: paymentLink.planCategory,
        duration: paymentLink.duration,
        status: paymentLink.status,
        expireDate: paymentLink.expireDate,
        paidAt: paymentLink.paidAt,
        razorpayPaymentLinkUrl: paymentLink.razorpayPaymentLinkUrl,
        razorpayPaymentLinkShortUrl: paymentLink.razorpayPaymentLinkShortUrl,
        createdAt: paymentLink.createdAt,
        client: paymentLink.client ? {
          firstName: paymentLink.client.firstName,
          lastName: paymentLink.client.lastName,
        } : undefined,
        dietitian: paymentLink.dietitian ? {
          firstName: paymentLink.dietitian.firstName,
          lastName: paymentLink.dietitian.lastName,
        } : undefined,
      }
    });

  } catch (error) {
    console.error('Error fetching public payment link:', error);
    return NextResponse.json({ error: 'Failed to fetch payment details' }, { status: 500 });
  }
}
