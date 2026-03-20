import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import dbConnect from '@/lib/db/connect';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

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

    const query: any = {
      paymentStatus: 'paid' // Only show paid purchases
    };

    // Filter by client
    if (clientId) {
      query.client = clientId;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter active purchases (not expired)
    if (activeOnly) {
      query.status = { $in: ['paid', 'completed'] };
      query.endDate = { $gte: new Date() };
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

    return NextResponse.json({
      success: true,
      purchases: purchasesWithInfo,
      total: purchases.length
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
    const { purchaseId, action } = body;

    if (action !== 'recalculate') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!purchaseId) {
      return NextResponse.json({ error: 'Purchase ID is required' }, { status: 400 });
    }

    // Get the purchase
    const purchase = await UnifiedPayment.findById(purchaseId);
    if (!purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    // Import ClientMealPlan model
    const { default: ClientMealPlan } = await import('@/lib/db/models/ClientMealPlan');

    // Sum up all active meal plan durations for this purchase
    const mealPlans = await ClientMealPlan.find({
      purchaseId: purchaseId,
      status: { $in: ['active', 'completed'] }
    });

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