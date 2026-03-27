import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import dbConnect from '@/lib/db/connect';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import PaymentLink from '@/lib/db/models/PaymentLink';
import User from '@/lib/db/models/User';
import MealPlan from '@/lib/db/models/MealPlan';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import Razorpay from 'razorpay';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { computeClientStatus } from '@/lib/status/computeClientStatus';

// Initialize Razorpay for syncing payment status
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })
  : null;

// Helper function to update client status based on payments + plans
async function updateClientStatusBasedOnMealPlan(clientId: string): Promise<string> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check for any successful payment (UnifiedPayment uses 'client' field, not 'clientId')
    const hasSuccessfulPayment = await UnifiedPayment.exists({
      client: clientId,
      $or: [
        { status: { $in: ['paid', 'completed', 'active'] } },
        { paymentStatus: 'paid' }
      ]
    });

    // Check both MealPlan and ClientMealPlan for active plans
    // A plan is valid if status is 'active' AND endDate is in the future (regardless of startDate)
    const activeMealPlan = await MealPlan.findOne({
      client: clientId,
      status: 'active',
      endDate: { $gte: today }
    });

    const activeClientMealPlan = !activeMealPlan ? await ClientMealPlan.findOne({
      clientId,
      status: 'active',
      endDate: { $gte: today }
    }) : null;

    const currentActivePlan = activeMealPlan || activeClientMealPlan;

    const newStatus = computeClientStatus({
      hasSuccessfulPayment: !!hasSuccessfulPayment,
      activePlan: currentActivePlan ? {
        startDate: currentActivePlan.startDate,
        endDate: currentActivePlan.endDate,
        status: currentActivePlan.status
      } : null
    });

    const client = await User.findById(clientId).select('clientStatus');
    if (client && client.clientStatus !== newStatus) {
      await User.findByIdAndUpdate(clientId, { clientStatus: newStatus });
    }

    return newStatus;
  } catch (error) {
    console.error('Error updating client status:', error);
    return 'lead';
  }
}

// Helper function to create/update UnifiedPayment record from PaymentLink
async function createUnifiedPaymentFromLink(paymentLink: any): Promise<string | null> {
  try {
    const startDate = paymentLink.paidAt || new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (paymentLink.durationDays || 0));

    const unifiedPayment = await UnifiedPayment.syncRazorpayPayment(
      { paymentLink: paymentLink._id },
      {
        client: paymentLink.client,
        dietitian: paymentLink.dietitian,
        servicePlan: paymentLink.servicePlanId,
        paymentLink: paymentLink._id,
        paymentType: 'service_plan',
        planName: paymentLink.planName || 'Service Plan',
        planCategory: paymentLink.planCategory || 'general-wellness',
        durationDays: paymentLink.durationDays || 0,
        durationLabel: paymentLink.duration || `${paymentLink.durationDays} Days`,
        baseAmount: paymentLink.amount,
        discountPercent: paymentLink.discount || 0,
        taxPercent: paymentLink.tax || 0,
        finalAmount: paymentLink.finalAmount,
        currency: paymentLink.currency || 'INR',
        status: 'paid',
        paymentStatus: 'paid',
        paymentMethod: paymentLink.paymentMethod || 'razorpay',
        razorpayPaymentLinkId: paymentLink.razorpayPaymentLinkId,
        razorpayPaymentId: paymentLink.razorpayPaymentId,
        transactionId: paymentLink.razorpayPaymentId || paymentLink.razorpayPaymentLinkId,
        payerEmail: paymentLink.payerEmail,
        payerPhone: paymentLink.payerPhone,
        purchaseDate: startDate,
        startDate: startDate,
        endDate: endDate,
        paidAt: paymentLink.paidAt,
        mealPlanCreated: false,
        daysUsed: 0
      }
    );

    return unifiedPayment._id.toString();
  } catch (error) {
    console.error('Error creating UnifiedPayment record:', error);
    return null;
  }
}

// Helper function to sync a single payment link with Razorpay
async function syncPaymentLinkWithRazorpay(paymentLink: any): Promise<boolean> {
  if (!razorpay || !paymentLink.razorpayPaymentLinkId) return false;
  if (paymentLink.status === 'paid') return true;

  try {
    const razorpayLink: any = await razorpay.paymentLink.fetch(paymentLink.razorpayPaymentLinkId);

    if (razorpayLink.status === 'paid') {
      paymentLink.status = 'paid';
      paymentLink.paidAt = razorpayLink.paid_at
        ? new Date(razorpayLink.paid_at * 1000)
        : new Date();

      if (razorpayLink.payments?.length > 0) {
        const latestPayment = razorpayLink.payments[razorpayLink.payments.length - 1];
        paymentLink.razorpayPaymentId = latestPayment.payment_id;
      }

      await paymentLink.save();
      await createUnifiedPaymentFromLink(paymentLink);

      return true;
    }
  } catch (error) {
    console.error(`Error syncing payment link ${paymentLink._id}:`, error);
  }
  return false;
}

function isPurchaseEligibleForPlanning(purchase: any, now: Date): boolean {
  const remainingDays = Math.max(0, (purchase.durationDays || 0) - (purchase.daysUsed || 0));
  if (remainingDays <= 0) return false;

  // If expected end date exists, enforce date-window validation.
  if (purchase.expectedEndDate) {
    const expectedEnd = new Date(purchase.expectedEndDate);
    expectedEnd.setHours(23, 59, 59, 999);
    return expectedEnd >= now;
  }

  // If expected dates are not set yet, keep purchase eligible for planning
  // as long as remaining allocation exists.
  return true;
}

// GET - Check if client has active paid plan and can create meal plan
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const requestedDays = parseInt(searchParams.get('requestedDays') || '0');
    const forceSync = searchParams.get('forceSync') === 'true';

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    // Sync payment links if needed
    if (forceSync) {
      const allPaymentLinks = await PaymentLink.find({
        client: clientId,
        servicePlanId: { $exists: true, $ne: null },
        durationDays: { $exists: true, $gt: 0 }
      }).sort({ createdAt: -1 }).limit(10);

      for (const paymentLink of allPaymentLinks) {
        if (paymentLink.status !== 'paid') {
          await syncPaymentLinkWithRazorpay(paymentLink);
        }
      }
    } else {
      const pendingPaymentLinks = await PaymentLink.find({
        client: clientId,
        status: { $in: ['pending', 'created'] },
        servicePlanId: { $exists: true, $ne: null },
        durationDays: { $exists: true, $gt: 0 }
      }).sort({ createdAt: -1 }).limit(5);

      for (const pendingLink of pendingPaymentLinks) {
        await syncPaymentLinkWithRazorpay(pendingLink);
      }
    }

    // Find ALL paid purchases for this client, then compute active eligibility in-memory
    const allPaidPurchases = await UnifiedPayment.find({
      client: clientId,
      $or: [
        { paymentStatus: 'paid' },
        { status: { $in: ['paid', 'completed', 'active'] } }
      ]
    })
      .populate('servicePlan', 'name category')
      .sort({ createdAt: 1 });

    const now = new Date();
    const allActivePurchases = allPaidPurchases.filter((purchase: any) =>
      isPurchaseEligibleForPlanning(purchase, now)
    );

    // Find partially used purchase
    const partiallyUsedPurchase = allActivePurchases.find(p =>
      (p.daysUsed || 0) > 0 && (p.durationDays - (p.daysUsed || 0)) > 0
    ) || null;

    // Find unstarted purchases
    const unstartedPurchases = allActivePurchases
      .filter(p => (p.daysUsed || 0) === 0 && (p.durationDays - (p.daysUsed || 0)) > 0)
      .sort((a, b) => {
        if (a.expectedStartDate && b.expectedStartDate) {
          return new Date(a.expectedStartDate).getTime() - new Date(b.expectedStartDate).getTime();
        }
        if (a.expectedStartDate && !b.expectedStartDate) return -1;
        if (!a.expectedStartDate && b.expectedStartDate) return 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    let activePurchase: any = partiallyUsedPurchase || (unstartedPurchases.length > 0 ? unstartedPurchases[0] : null);

    if (!activePurchase) {
      activePurchase = allActivePurchases.find(p =>
        (p.durationDays - (p.daysUsed || 0)) > 0
      ) || null;
    }

    const purchasesNeedingPlan = [
      ...(partiallyUsedPurchase ? [partiallyUsedPurchase] : []),
      ...unstartedPurchases.filter(p => p._id.toString() !== partiallyUsedPurchase?._id?.toString())
    ];

    if (!activePurchase && allActivePurchases.length > 0) {
      activePurchase = allActivePurchases[0];
    }

    // Check for paid payment links without UnifiedPayment
    if (!activePurchase) {
      const paidPaymentLink = await PaymentLink.findOne({
        client: clientId,
        status: 'paid',
        servicePlanId: { $exists: true, $ne: null },
        durationDays: { $exists: true, $gt: 0 }
      }).sort({ paidAt: -1 });

      if (paidPaymentLink) {
        await createUnifiedPaymentFromLink(paidPaymentLink);

        const existingPayment = await UnifiedPayment.findOne({
          paymentLink: paidPaymentLink._id
        }).populate('servicePlan', 'name category');

        if (existingPayment && isPurchaseEligibleForPlanning(existingPayment, now)) {
          activePurchase = existingPayment;
        }
      }
    }

    if (!activePurchase) {
      const updatedClientStatus = await updateClientStatusBasedOnMealPlan(clientId);

      return NextResponse.json({
        success: true,
        hasPaidPlan: false,
        canCreateMealPlan: false,
        clientStatus: updatedClientStatus,
        message: 'No active paid plan found. Client needs to purchase a plan first.',
        remainingDays: 0,
        maxDays: 0,
        totalDaysUsed: 0,
        allPurchases: []
      });
    }

    const aggregatedTotalPurchasedDays = allActivePurchases.reduce((sum, p) => sum + (p.durationDays || 0), 0);
    const aggregatedTotalDaysUsed = allActivePurchases.reduce((sum, p) => sum + (p.daysUsed || 0), 0);
    const aggregatedRemainingDays = Math.max(0, aggregatedTotalPurchasedDays - aggregatedTotalDaysUsed);

    const totalPurchasedDays = activePurchase?.durationDays || 0;
    const totalDaysUsed = activePurchase?.daysUsed || 0;
    const remainingDays = Math.max(0, totalPurchasedDays - totalDaysUsed);

    const canCreate = remainingDays > 0 && (requestedDays === 0 || requestedDays <= remainingDays);

    const paymentDetails = {
      _id: activePurchase?._id,
      amount: activePurchase?.finalAmount,
      currency: activePurchase?.currency,
      status: activePurchase?.paymentStatus,
      paymentMethod: activePurchase?.paymentMethod,
      transactionId: activePurchase?.transactionId,
      paidAt: activePurchase?.paidAt ? new Date(activePurchase.paidAt) : null,
      mealPlanCreated: activePurchase?.mealPlanCreated || false,
      mealPlanId: activePurchase?.mealPlan || null,
    };

    const updatedClientStatus = await updateClientStatusBasedOnMealPlan(clientId);

    return NextResponse.json({
      success: true,
      hasPaidPlan: true,
      canCreateMealPlan: canCreate,
      clientStatus: updatedClientStatus,
      purchase: {
        _id: activePurchase?._id,
        planName: activePurchase?.planName,
        planCategory: activePurchase?.planCategory,
        durationDays: activePurchase?.durationDays,
        durationLabel: activePurchase?.durationLabel,
        startDate: activePurchase?.startDate,
        endDate: activePurchase?.endDate,
        expectedStartDate: activePurchase?.expectedStartDate || null,
        expectedEndDate: activePurchase?.expectedEndDate || null,
        parentPurchaseId: activePurchase?.parentPaymentId || null,
        mealPlanCreated: activePurchase?.mealPlanCreated,
        daysUsed: activePurchase?.daysUsed,
        baseAmount: activePurchase?.baseAmount,
        discountPercent: activePurchase?.discountPercent,
        taxPercent: activePurchase?.taxPercent,
        finalAmount: activePurchase?.finalAmount
      },
      payment: paymentDetails,
      remainingDays,
      maxDays: remainingDays,
      totalDaysUsed,
      totalPurchasedDays,
      aggregated: {
        totalPurchases: allActivePurchases.length,
        totalPurchasedDays: aggregatedTotalPurchasedDays,
        totalDaysUsed: aggregatedTotalDaysUsed,
        totalRemainingDays: aggregatedRemainingDays,
        purchasesNeedingMealPlan: purchasesNeedingPlan.length
      },
      allPurchasesNeedingMealPlan: purchasesNeedingPlan.map(p => ({
        _id: p._id,
        planName: p.planName,
        planCategory: p.planCategory,
        durationDays: p.durationDays,
        durationLabel: p.durationLabel,
        daysUsed: p.daysUsed || 0,
        remainingDays: (p.durationDays || 0) - (p.daysUsed || 0),
        mealPlanCreated: p.mealPlanCreated,
        startDate: p.startDate,
        endDate: p.endDate,
        expectedStartDate: p.expectedStartDate || null,
        expectedEndDate: p.expectedEndDate || null,
        parentPurchaseId: p.parentPaymentId || null,
        createdAt: p.createdAt
      })),
      message: canCreate
        ? `Client has ${remainingDays} days remaining (${totalDaysUsed}/${totalPurchasedDays} days used) in their ${activePurchase.planName} plan.${purchasesNeedingPlan.length > 1 ? ` (${purchasesNeedingPlan.length} purchases need meal plans)` : ''}`
        : remainingDays === 0
          ? `All ${totalPurchasedDays} days have been used. Client needs to purchase a new plan.`
          : `Requested ${requestedDays} days but only ${remainingDays} days remaining in plan.`
    });
  } catch (error) {
    console.error('Error checking client paid plan:', error);
    return NextResponse.json({ error: 'Failed to check client paid plan' }, { status: 500 });
  }
}
