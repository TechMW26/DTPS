import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { updateClientStatusFromMealPlan } from '@/lib/status/computeClientStatus';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sendNotificationToUser } from '@/lib/firebase/firebaseNotification';
import { logHistoryServer } from '@/lib/server/history';
import { logActivity } from '@/lib/utils/activityLogger';

const hasPublishableMealData = (meals: any[] | undefined | null): boolean => {
  if (!Array.isArray(meals) || meals.length === 0) return false;

  return meals.some((day: any) => {
    const dayMeals = day?.meals;
    if (!dayMeals || typeof dayMeals !== 'object') return false;

    return Object.values(dayMeals).some((meal: any) => {
      if (!meal) return false;
      const foodOptions = Array.isArray(meal.foodOptions) ? meal.foodOptions : [];
      if (foodOptions.length === 0) return false;

      return foodOptions.some((option: any) => {
        if (!option) return false;

        if (typeof option.food === 'string' && option.food.trim().length > 0) return true;

        if (Array.isArray(option.foods)) {
          return option.foods.some((f: any) =>
            !!f &&
            ((typeof f.food === 'string' && f.food.trim().length > 0) ||
              (typeof f.name === 'string' && f.name.trim().length > 0))
          );
        }

        return false;
      });
    });
  });
};

// GET single meal plan by ID
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const { id } = await context.params;

    const mealPlan = await withCache(
      `client-meal-plans:id:${JSON.stringify(id)}`,
      async () => await ClientMealPlan.findById(id)
        .populate('templateId', 'name category duration')
      ,
      { ttl: 120000, tags: ['client_meal_plans'] }
    );

    if (!mealPlan) {
      return NextResponse.json(
        { success: false, error: 'Meal plan not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      mealPlan
    });
  } catch (error) {
    console.error('Error fetching meal plan:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch meal plan' },
      { status: 500 }
    );
  }
}

// PUT - Update meal plan
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    await connectDB();

    const { id } = await context.params;
    const body = await request.json();

    const {
      name,
      description,
      startDate,
      endDate,
      duration,
      meals,
      mealTypes,
      customizations,
      goals,
      status
    } = body;

    // Validate date range
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        return NextResponse.json(
          { success: false, error: 'Start date cannot be after end date' },
          { status: 400 }
        );
      }
    }

    // Fetch existing plan first to allow partial/merge updates
    const existingPlan = await ClientMealPlan.findById(id);
    if (!existingPlan) {
      return NextResponse.json(
        { success: false, error: 'Meal plan not found' },
        { status: 404 }
      );
    }

    // Build update object — only include fields explicitly provided
    const updateData: Record<string, any> = {};
    const resultingStatus = status !== undefined ? status : existingPlan.status;
    const resultingMeals = Array.isArray(meals) ? meals : existingPlan.meals;

    if (resultingStatus === 'active' && !hasPublishableMealData(resultingMeals)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot publish plan without at least one meal slot containing food items'
        },
        { status: 400 }
      );
    }

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = new Date(endDate);
    if (duration !== undefined) updateData.duration = duration;

    // For meals: accept the full structured array as-is (preserves nested meal data)
    if (meals !== undefined && Array.isArray(meals)) {
      updateData.meals = meals;
    }

    // For mealTypes: accept the array of { name, time } configs
    if (mealTypes !== undefined && Array.isArray(mealTypes)) {
      updateData.mealTypes = mealTypes;
    }

    if (customizations !== undefined) updateData.customizations = customizations;
    if (goals !== undefined) updateData.goals = goals;
    if (status !== undefined) updateData.status = status;

    const updatedPlan = await ClientMealPlan.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('templateId', 'name category duration');

    if (!updatedPlan) {
      return NextResponse.json(
        { success: false, error: 'Meal plan not found' },
        { status: 404 }
      );
    }

    // Clear cached responses so subsequent GETs return fresh data
    clearCacheByTag('client_meal_plans');

    // Detect if this is a publish action (draft → active)
    const isPublishing = existingPlan.status === 'draft' && status === 'active';

    // Update client status if status or dates changed (could affect active status)
    if ((status && status !== 'draft') || startDate || endDate) {
      try {
        const clientId = updatedPlan.clientId?.toString();
        if (clientId) {
          const newStatus = await updateClientStatusFromMealPlan(clientId);
          console.log(`[ClientMealPlan] Client ${clientId} status updated to: ${newStatus}`);
        }
      } catch (statusError) {
        console.error('Failed to update client status:', statusError);
      }
    }

    // When publishing (draft → active), send notification and log history
    if (isPublishing) {
      const clientId = updatedPlan.clientId?.toString();
      const planName = updatedPlan.name || 'Diet Plan';

      // Send push notification
      try {
        if (clientId) {
          await sendNotificationToUser(clientId, {
            title: '📋 New Meal Plan Assigned',
            body: `You have a new meal plan: "${planName}". Check your plan now!`,
            data: {
              type: 'meal_plan',
              mealPlanId: updatedPlan._id?.toString(),
              url: '/my-plan'
            }
          });
        }
      } catch (notificationError) {
        console.error('Failed to send meal plan notification:', notificationError);
      }

      // Log history
      try {
        if (clientId) {
          await logHistoryServer({
            userId: clientId,
            action: 'assign',
            category: 'diet',
            description: `Meal plan published: ${planName}`,
            performedById: session.user.id,
            metadata: {
              mealPlanId: updatedPlan._id,
              name: planName,
              status: 'active'
            }
          });
        }
      } catch (historyError) {
        console.error('Failed to log history:', historyError);
      }
    }

    return NextResponse.json({
      success: true,
      message: isPublishing ? 'Meal plan published successfully' : 'Meal plan updated successfully',
      mealPlan: updatedPlan
    });
  } catch (error) {
    console.error('Error updating meal plan:', error);
    // Handle validation errors
    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        { success: false, error: 'Invalid data provided. Please check your inputs.' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update meal plan' },
      { status: 500 }
    );
  }
}

// DELETE - Remove meal plan
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const { id } = await context.params;

    // First, get the meal plan to know the clientId and duration before deleting
    const mealPlan = await ClientMealPlan.findById(id);

    if (!mealPlan) {
      return NextResponse.json(
        { success: false, error: 'Meal plan not found' },
        { status: 404 }
      );
    }

    const clientId = mealPlan.clientId?.toString();
    const purchaseId = mealPlan.purchaseId;
    const planDuration = mealPlan.duration || 0;

    // Now delete the meal plan
    await ClientMealPlan.findByIdAndDelete(id);

    // Reduce daysUsed in the associated purchase if purchaseId exists
    if (purchaseId && planDuration > 0) {
      try {
        const { default: UnifiedPayment } = await import('@/lib/db/models/UnifiedPayment');
        const purchase = await UnifiedPayment.findById(purchaseId);
        if (purchase) {
          // Subtract the plan duration from daysUsed, but don't go below 0
          purchase.daysUsed = Math.max(0, (purchase.daysUsed || 0) - planDuration);
          await purchase.save();
          console.log(`[ClientMealPlan] Reduced daysUsed by ${planDuration} for purchase ${purchaseId}. New daysUsed: ${purchase.daysUsed}`);
        }
      } catch (purchaseError) {
        console.error('Failed to update purchase daysUsed after deletion:', purchaseError);
        // Don't fail the request - meal plan was deleted successfully
      }
    }

    // Update client status after deletion
    if (clientId) {
      try {
        const newStatus = await updateClientStatusFromMealPlan(clientId);
        console.log(`[ClientMealPlan] Client ${clientId} status updated to: ${newStatus} after meal plan deletion`);
      } catch (statusError) {
        console.error('Failed to update client status after deletion:', statusError);
        // Don't fail the request - meal plan was deleted successfully
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Meal plan deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting meal plan:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete meal plan' },
      { status: 500 }
    );
  }
}
