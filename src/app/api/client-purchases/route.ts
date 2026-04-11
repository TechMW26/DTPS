import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import dbConnect from '@/lib/db/connect';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import PaymentLink from '@/lib/db/models/PaymentLink';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

const getPaidPurchaseQuery = () => ({
  $or: [
    { paymentStatus: 'paid' },
    { status: { $in: ['paid', 'completed', 'active'] } }
  ]
});

const isPurchaseActiveForPlanning = (purchase: any, now: Date): boolean => {
  const remainingDays = Math.max(0, (purchase.durationDays || 0) - (purchase.daysUsed || 0));
  if (remainingDays <= 0) return false;

  // If expected end date is explicitly set, honor it for active-window checks.
  if (purchase.expectedEndDate) {
    const end = new Date(purchase.expectedEndDate);
    end.setHours(23, 59, 59, 999);
    return end >= now;
  }

  // If expected dates are not set yet, treat the paid purchase as active for planning
  // as long as allocation remains.
  return true;
};

// GET - Fetch client purchases (now from UnifiedPayment)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const status = searchParams.get('status');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const query: any = getPaidPurchaseQuery();

    // Filter by client
    if (clientId) {
      query.client = clientId;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Backfill any missing UnifiedPayment records for paid payment links (client-specific)
    if (clientId) {
      const paidLinks = await PaymentLink.find({
        client: clientId,
        status: 'paid',
        durationDays: { $exists: true, $gt: 0 }
      })
        .select('_id client dietitian servicePlanId amount tax discount finalAmount currency planName planCategory duration durationDays paidAt paymentMethod transactionId payerEmail payerPhone razorpayPaymentLinkId razorpayPaymentId razorpayOrderId')
        .sort({ paidAt: -1, createdAt: -1 });

      if (paidLinks.length > 0) {
        const linkIds = paidLinks.map((l: any) => l._id);
        const existing = await UnifiedPayment.find({
          client: clientId,
          paymentLink: { $in: linkIds }
        }).select('paymentLink');

        const existingLinkIds = new Set(existing.map((p: any) => String(p.paymentLink)));

        for (const link of paidLinks) {
          if (existingLinkIds.has(String(link._id))) continue;

          const startDate = link.paidAt ? new Date(link.paidAt) : new Date();
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + (link.durationDays || 0));

          try {
            await UnifiedPayment.syncRazorpayPayment(
              {
                paymentLink: link._id,
                paymentLinkId: link.razorpayPaymentLinkId || undefined,
                paymentId: link.razorpayPaymentId || undefined,
                orderId: link.razorpayOrderId || undefined,
                transactionId: link.transactionId || undefined,
                client: link.client
              },
              {
                client: link.client,
                dietitian: link.dietitian,
                servicePlan: link.servicePlanId,
                paymentLink: link._id,
                paymentType: 'service_plan',
                planName: link.planName || 'Service Plan',
                planCategory: link.planCategory || 'general-wellness',
                durationDays: link.durationDays || 0,
                durationLabel: link.duration || `${link.durationDays || 0} Days`,
                baseAmount: link.amount,
                discountPercent: link.discount || 0,
                taxPercent: link.tax || 0,
                finalAmount: link.finalAmount,
                currency: link.currency || 'INR',
                status: 'paid',
                paymentStatus: 'paid',
                paymentMethod: link.paymentMethod || 'razorpay',
                razorpayPaymentLinkId: link.razorpayPaymentLinkId,
                razorpayPaymentId: link.razorpayPaymentId,
                razorpayOrderId: link.razorpayOrderId,
                transactionId: link.transactionId || link.razorpayPaymentId || link.razorpayPaymentLinkId,
                payerEmail: link.payerEmail,
                payerPhone: link.payerPhone,
                purchaseDate: startDate,
                startDate,
                endDate,
                expectedStartDate: startDate,
                expectedEndDate: endDate,
                paidAt: link.paidAt || startDate,
                mealPlanCreated: false,
                daysUsed: 0
              }
            );
          } catch (syncErr) {
            console.error('Failed to backfill UnifiedPayment for paid link:', link._id, syncErr);
          }
        }
      }
    }

    const purchases = await withCache(
      `client-purchases:${JSON.stringify(query)}`,
      async () => await UnifiedPayment.find(query)
        .populate('client', 'firstName lastName email phone')
        .populate('dietitian', 'firstName lastName')
        .populate('servicePlan', 'name category')
        .populate('paymentLink', 'razorpayPaymentLinkId status paidAt')
        .sort({ purchaseDate: -1 }),
      { ttl: 120000, tags: ['client_purchases'] }
    );

    // Add remaining days to each purchase
    // remainingDays = durationDays - daysUsed (plan allocation remaining)
    // calendarDaysUntilEnd = days until endDate/expectedEndDate (for expiration tracking)
    const purchasesWithInfo = purchases.map(purchase => {
      const purchaseObj = purchase.toObject();
      const now = new Date();

      // Calculate plan-based remaining days (allocation)
      const durationDays = purchaseObj.durationDays || 0;
      const daysUsed = purchaseObj.daysUsed || 0;
      const remainingDays = Math.max(0, durationDays - daysUsed);

      // Calculate calendar days until end date (for expiration)
      const endDate = purchaseObj.expectedEndDate || purchaseObj.endDate;
      const calendarDaysUntilEnd = endDate
        ? Math.max(0, Math.ceil((new Date(endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : remainingDays;

      // A purchase is expired if endDate has passed OR all days are used
      const isExpired = calendarDaysUntilEnd === 0 || remainingDays === 0;

      return {
        ...purchaseObj,
        remainingDays,  // Plan allocation remaining (durationDays - daysUsed)
        calendarDaysUntilEnd, // Days until expectedEndDate/endDate
        isExpired
      };
    });

    const now = new Date();
    const filteredPurchases = activeOnly
      ? purchasesWithInfo.filter((purchase: any) => isPurchaseActiveForPlanning(purchase, now))
      : purchasesWithInfo;

    return NextResponse.json({
      success: true,
      purchases: filteredPurchases,
      total: filteredPurchases.length
    });
  } catch (error) {
    console.error('Error fetching client purchases:', error);
    return NextResponse.json({ error: 'Failed to fetch client purchases' }, { status: 500 });
  }
}

// POST - Create a client purchase (after payment is confirmed)
// Uses syncRazorpayPayment to UPDATE existing or CREATE new (NO DUPLICATES)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const body = await request.json();
    const {
      clientId,
      servicePlanId,
      paymentLinkId,
      pricingTierId,
      planName,
      planCategory,
      durationDays,
      durationLabel,
      baseAmount,
      discountPercent,
      taxPercent,
      finalAmount,
      startDate
    } = body;

    // Validate required fields
    if (!clientId || !servicePlanId || !paymentLinkId || !durationDays) {
      return NextResponse.json({
        error: 'Client ID, service plan ID, payment link ID, and duration are required'
      }, { status: 400 });
    }

    // Calculate dates
    const purchaseStartDate = startDate ? new Date(startDate) : new Date();
    const purchaseEndDate = new Date(purchaseStartDate);
    purchaseEndDate.setDate(purchaseEndDate.getDate() + durationDays);

    // Use syncRazorpayPayment to UPDATE existing or CREATE new (NO DUPLICATES)
    const purchase = await UnifiedPayment.syncRazorpayPayment(
      { paymentLink: paymentLinkId },
      {
        client: clientId,
        dietitian: session.user.id,
        servicePlan: servicePlanId,
        paymentLink: paymentLinkId,
        paymentType: 'service_plan',
        planName,
        planCategory,
        durationDays,
        durationLabel,
        baseAmount,
        discountPercent: Math.min(discountPercent || 0, 40), // Max 40%
        taxPercent: taxPercent || 0,
        finalAmount,
        currency: 'INR',
        status: 'paid',
        paymentStatus: 'paid',
        purchaseDate: new Date(),
        startDate: purchaseStartDate,
        endDate: purchaseEndDate,
        mealPlanCreated: false,
        daysUsed: 0
      }
    );

    return NextResponse.json({
      success: true,
      purchase,
      message: 'Client purchase recorded successfully'
    });
  } catch (error) {
    console.error('Error creating client purchase:', error);
    return NextResponse.json({ error: 'Failed to create client purchase' }, { status: 500 });
  }
}

// PUT - Update client purchase (e.g., mark meal plan created, add days used)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const body = await request.json();
    const { purchaseId, mealPlanId, mealPlanCreated, daysUsed, addDaysUsed, status, expectedStartDate, expectedEndDate, parentPurchaseId } = body;

    if (!purchaseId) {
      return NextResponse.json({ error: 'Purchase ID is required' }, { status: 400 });
    }

    // Get current purchase to check existing daysUsed
    const currentPurchase = await withCache(
      `client-purchases:${JSON.stringify(purchaseId)}`,
      async () => await UnifiedPayment.findById(purchaseId),
      { ttl: 120000, tags: ['client_purchases'] }
    );
    if (!currentPurchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    // ======== EXPECTED END DATE VALIDATION ========
    // Only dietitian can edit expected dates
    // Edits allowed only up to one day before the current expected end date
    // No edits allowed on or after the expected end date
    if (expectedEndDate !== undefined) {
      // Check if user is dietitian (only dietitians can edit expected end date)
      if (session.user.role !== 'dietitian') {
        return NextResponse.json({
          error: 'Only dietitians are permitted to modify the expected end date',
          code: 'ROLE_UNAUTHORIZED'
        }, { status: 403 });
      }

      // Check if purchase already has an expected end date set
      if (currentPurchase.expectedEndDate) {
        const existingEndDate = new Date(currentPurchase.expectedEndDate);
        existingEndDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Calculate one day before the expected end date
        const oneDayBeforeEnd = new Date(existingEndDate);
        oneDayBeforeEnd.setDate(oneDayBeforeEnd.getDate() - 1);

        // Check if today is on or after the expected end date (not allowed)
        if (today >= existingEndDate) {
          return NextResponse.json({
            error: 'Cannot modify expected end date: The expected end date has already passed or is today. Modifications are not allowed.',
            code: 'DATE_EXPIRED'
          }, { status: 400 });
        }

        // Check if today is after one day before the expected end date (not allowed)
        if (today > oneDayBeforeEnd) {
          return NextResponse.json({
            error: 'Cannot modify expected end date: Changes are only allowed up to one day before the current expected end date.',
            code: 'DATE_TOO_CLOSE'
          }, { status: 400 });
        }
      }
    }
    // ======== END EXPECTED END DATE VALIDATION ========

    const updateData: any = {};
    if (mealPlanId) updateData.mealPlan = mealPlanId;
    if (mealPlanCreated !== undefined) updateData.mealPlanCreated = mealPlanCreated;

    // Update expected dates
    if (expectedStartDate !== undefined) {
      updateData.expectedStartDate = expectedStartDate ? new Date(expectedStartDate) : null;
    }
    if (expectedEndDate !== undefined) {
      updateData.expectedEndDate = expectedEndDate ? new Date(expectedEndDate) : null;
    }

    // Update parent purchase reference (for multi-phase plans)
    if (parentPurchaseId !== undefined) {
      updateData.parentPaymentId = parentPurchaseId || null;
    }

    // If addDaysUsed is provided, ADD to existing daysUsed (for multiple meal plans)
    if (addDaysUsed !== undefined && addDaysUsed > 0) {
      updateData.daysUsed = (currentPurchase.daysUsed || 0) + addDaysUsed;
    } else if (daysUsed !== undefined) {
      // Legacy: direct set (for backwards compatibility)
      updateData.daysUsed = daysUsed;
    }

    if (status) updateData.status = status;

    const updatedPurchase = await UnifiedPayment.findByIdAndUpdate(
      purchaseId,
      updateData,
      { new: true }
    );

    if (!updatedPurchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    // Clear cache to ensure real-time updates across all platforms
    clearCacheByTag('client_purchases');
    clearCacheByTag(`client-purchases:${JSON.stringify(purchaseId)}`);

    return NextResponse.json({
      success: true,
      purchase: updatedPurchase,
      totalDaysUsed: updatedPurchase.daysUsed || 0,
      remainingDays: Math.max(0, (updatedPurchase.durationDays || 0) - (updatedPurchase.daysUsed || 0)),
      message: 'Purchase updated successfully'
    });
  } catch (error) {
    console.error('Error updating client purchase:', error);
    return NextResponse.json({ error: 'Failed to update client purchase' }, { status: 500 });
  }
}

// PATCH - Recalculate daysUsed for a purchase based on actual meal plans
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const body = await request.json();
    const { purchaseId, clientId, action } = body;

    if (action !== 'recalculate') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Import ClientMealPlan model
    const { default: ClientMealPlan } = await import('@/lib/db/models/ClientMealPlan');

    // If clientId is provided (no active purchase), recalculate all purchases for this client
    if (clientId && !purchaseId) {
      // Get all purchases for this client
      const allPurchases = await UnifiedPayment.find({
        client: clientId,
        $or: [
          { paymentStatus: 'paid' },
          { status: { $in: ['paid', 'completed', 'active'] } }
        ]
      });

      // Get ALL active/completed meal plans for this client
      const allMealPlans = await ClientMealPlan.find({
        clientId: clientId,
        status: { $in: ['active', 'completed'] }
      });

      const totalDaysUsed = allMealPlans.reduce((sum, plan) => sum + (plan.duration || 0), 0);

      // Update all purchases proportionally or set total on the main one
      let updatedCount = 0;
      for (const purchase of allPurchases) {
        const oldDaysUsed = purchase.daysUsed || 0;
        // Distribute days used across purchases
        purchase.daysUsed = totalDaysUsed;
        await purchase.save();
        updatedCount++;
      }

      // Clear cache
      clearCacheByTag('client_purchases');

      return NextResponse.json({
        success: true,
        message: `Days recalculated for ${updatedCount} purchases. Total days used: ${totalDaysUsed}`,
        oldDaysUsed: 0,
        newDaysUsed: totalDaysUsed,
        mealPlansCount: allMealPlans.length,
        purchasesUpdated: updatedCount,
        remainingDays: allPurchases.reduce((sum, p) => sum + Math.max(0, (p.durationDays || 0) - totalDaysUsed), 0)
      });
    }

    if (!purchaseId) {
      return NextResponse.json({ error: 'Purchase ID or Client ID is required' }, { status: 400 });
    }

    // Get the purchase
    const purchase = await UnifiedPayment.findById(purchaseId);
    if (!purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    // First, try to find meal plans linked to this specific purchaseId
    let mealPlans = await ClientMealPlan.find({
      purchaseId: purchaseId,
      status: { $in: ['active', 'completed'] }
    });

    // If no purchaseId-linked meal plans found, get ALL active/completed meal plans for this client
    // This handles legacy plans that don't have purchaseId set
    if (mealPlans.length === 0 && purchase.client) {
      mealPlans = await ClientMealPlan.find({
        clientId: purchase.client,
        status: { $in: ['active', 'completed'] }
      });
    }

    const totalDaysUsed = mealPlans.reduce((sum, plan) => sum + (plan.duration || 0), 0);
    const oldDaysUsed = purchase.daysUsed || 0;

    // Update the purchase
    purchase.daysUsed = totalDaysUsed;
    await purchase.save();

    // Clear cache
    clearCacheByTag('client_purchases');

    return NextResponse.json({
      success: true,
      message: `Days used recalculated: ${oldDaysUsed} → ${totalDaysUsed}`,
      oldDaysUsed,
      newDaysUsed: totalDaysUsed,
      mealPlansCount: mealPlans.length,
      remainingDays: Math.max(0, (purchase.durationDays || 0) - totalDaysUsed)
    });
  } catch (error) {
    console.error('Error recalculating days used:', error);
    return NextResponse.json({ error: 'Failed to recalculate days used' }, { status: 500 });
  }
}