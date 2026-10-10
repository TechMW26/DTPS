import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getNativeDatabase } from '@/lib/db/database';
import { nativeClientReceipt } from '@/lib/db/repository/native-client-payments';

// GET /api/client/payment-receipt - Get payment receipt details
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return nativeResponseJson({ error: 'Unauthorized' }, { status: 401 });
    }


    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('payment_id') || searchParams.get('paymentId');
    const orderId = searchParams.get('order_id');
    const razorpayPaymentId = searchParams.get('razorpay_payment_id');

    const payment = await nativeClientReceipt(getNativeDatabase(),session.user.id,{paymentId,orderId,razorpayPaymentId});

    if (!payment) {
      return nativeResponseJson(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }

    const client = payment.client as any;
    const dietitian = payment.dietitian as any;
    const userName = `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || payment.payerName || 'User';
    const userEmail = client?.email || payment.payerEmail || '';

    return nativeResponseJson({
      receipt: {
        paymentId: payment._id.toString(),
        planName: payment.planName || payment.description || 'Service Plan',
        planCategory: payment.planCategory || 'general-wellness',
        amount: payment.amount,
        currency: payment.currency || 'INR',
        status: payment.status,
        durationDays: payment.durationDays || 30,
        durationLabel: payment.durationLabel || '1 Month',
        razorpayPaymentId: payment.razorpayPaymentId,
        razorpayOrderId: payment.razorpayOrderId,
        transactionId: payment.transactionId,
        paidAt: payment.paidAt || payment.createdAt,
        userName,
        userEmail,
        dietitian: dietitian ? {
          firstName: dietitian.firstName,
          lastName: dietitian.lastName
        } : null
      },
      // Also include payment for backward compatibility
      payment: {
        _id: payment._id.toString(),
        planName: payment.planName || payment.description || 'Service Plan',
        planCategory: payment.planCategory || 'general-wellness',
        amount: payment.amount,
        currency: payment.currency || 'INR',
        status: payment.status,
        durationDays: payment.durationDays || 30,
        durationLabel: payment.durationLabel || '1 Month',
        payerEmail: payment.payerEmail || client?.email,
        payerName: userName,
        razorpayPaymentId: payment.razorpayPaymentId,
        razorpayOrderId: payment.razorpayOrderId,
        transactionId: payment.transactionId,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
        dietitian: dietitian ? {
          firstName: dietitian.firstName,
          lastName: dietitian.lastName
        } : null
      }
    });

  } catch (error) {
    console.error('Error fetching payment receipt:', error);
    return nativeResponseJson(
      { error: 'Failed to fetch payment details' },
      { status: 500 }
    );
  }
}
