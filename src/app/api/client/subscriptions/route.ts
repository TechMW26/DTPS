import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeClientPayments} from '@/lib/db/repository/native-client-payments';
import {resolveEntitlementEndDate} from '@/lib/payments/entitlement-dates';
import { isPaidOrCompleted, resolvePaymentStatus } from '@/lib/payments/payment-status';

// GET /api/client/subscriptions - Get client's subscriptions
export async function GET(request: NextRequest) {
  try {
    // Run auth + DB connection in PARALLEL
    const session=await getServerSession(authOptions);
    if (!session?.user?.id) {
      return nativeResponseJson({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all payments for this client that are subscription-related
    const payments=(await nativeClientPayments(getNativeDatabase(),session.user.id)).filter(payment=>['service_plan','subscription','consultation'].includes(payment.paymentType||payment.type));

    // Transform payments to subscription format
    const subscriptions = payments.map((payment: any) => {
      const startDate = payment.paidAt || payment.createdAt;
      const durationDays = payment.durationDays || 30;
      const endDate=resolveEntitlementEndDate({...payment,expectedStartDate:payment.expectedStartDate||payment.startDate||startDate,durationDays});

      const now = new Date();
      const paymentCompleted = isPaidOrCompleted({
        status: payment.status,
        paymentStatus: payment.paymentStatus,
        paidAt: payment.paidAt
      });

      const normalizedPaymentStatus = paymentCompleted
        ? 'paid'
        : (payment.paymentStatus === 'failed' || payment.status === 'failed' ? 'failed' : 'pending');

      const status = resolvePaymentStatus({
        status: payment.status,
        paymentStatus: payment.paymentStatus,
        paidAt: payment.paidAt,
        expiryDate: endDate,
        now
      });

      return {
        _id: payment._id.toString(),
        planName: payment.planName || payment.description || 'Subscription Plan',
        planCategory: payment.planCategory || 'general-wellness',
        amount: payment.finalAmount ?? payment.amount ?? payment.baseAmount,
        currency: payment.currency || 'INR',
        status,
        startDate: paymentCompleted ? startDate : null,
        endDate: paymentCompleted ? endDate : null,
        durationDays,
        durationLabel: payment.durationLabel || `${durationDays} days`,
        features: payment.features || [],
        paymentStatus: normalizedPaymentStatus,
        razorpayPaymentLinkUrl: payment.razorpayPaymentLinkUrl,
        razorpayPaymentLinkShortUrl: payment.razorpayPaymentLinkShortUrl,
        paidAt: payment.paidAt || null,
        dietitian: payment.dietitian ? {
          name: `${payment.dietitian.firstName} ${payment.dietitian.lastName}`
        } : null
      };
    });

    return nativeResponseJson({ subscriptions });

  } catch (error) {
    console.error('Error fetching client subscriptions:', error);
    return nativeResponseJson(
      { error: 'Failed to fetch subscriptions' },
      { status: 500 }
    );
  }
}
