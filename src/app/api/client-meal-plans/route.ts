import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import MealPlanTemplate from '@/lib/db/models/MealPlanTemplate';
import DietTemplate from '@/lib/db/models/DietTemplate';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { z } from 'zod';
import { logHistoryServer } from '@/lib/server/history';
import { sendNotificationToUser } from '@/lib/firebase/firebaseNotification';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { updateClientStatusFromMealPlan } from '@/lib/status/computeClientStatus';
import { logActivity } from '@/lib/utils/activityLogger';

// Validation schema for client meal plan assignment
const clientMealPlanSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  templateId: z.string().optional(), // Optional - can create plan without template
  purchaseId: z.string().optional(), // Optional - purchase ID for shared freeze tracking
  name: z.string().min(1, 'Plan name is required').max(200),
  description: z.string().max(10000).optional(),
  startDate: z.string().refine(date => !isNaN(Date.parse(date)), 'Invalid start date'),
  endDate: z.string().refine(date => !isNaN(Date.parse(date)), 'Invalid end date'),
  duration: z.number().min(1).max(365).optional(),
  meals: z.array(z.any()).optional(), // Flexible meal data
  mealTypes: z.array(z.object({
    name: z.string(),
    time: z.string()
  })).optional(),
  customizations: z.object({
    targetCalories: z.number().min(800).max(5000).optional(),
    targetMacros: z.object({
      protein: z.number().min(0).max(500).optional(),
      carbs: z.number().min(0).max(1000).optional(),
      fat: z.number().min(0).max(300).optional()
    }).optional(),
    dietaryRestrictions: z.array(z.string()).optional(),
    notes: z.string().max(1000).optional()
  }).optional(),
  goals: z.object({
    weightGoal: z.number().min(20).max(500).optional(),
    bodyFatGoal: z.number().min(3).max(50).optional(),
    targetDate: z.string().refine(date => !isNaN(Date.parse(date)), 'Invalid target date').optional(),
    primaryGoal: z.enum(['weight-loss', 'weight-gain', 'maintenance', 'muscle-gain', 'health-improvement']).optional(),
    secondaryGoals: z.array(z.string()).optional()
  }).optional(),
  reminders: z.object({
    mealReminders: z.boolean().default(true),
    progressReminders: z.boolean().default(true),
    checkInReminders: z.boolean().default(true)
  }).optional(),
  status: z.enum(['draft', 'active', 'completed', 'paused', 'cancelled']).optional()
});

// Robustly detect publishable meal content across supported meal data shapes
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

// GET /api/client-meal-plans - Get client meal plans
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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Build query based on user role
    let query: any = {};

    if (session.user.role === UserRole.CLIENT) {
      // Clients can only see their own published meal plans (not drafts)
      query.clientId = session.user.id;
      query.status = { $ne: 'draft' };
    } else if (session.user.role === UserRole.DIETITIAN) {
      // If clientId is specified, filter by that client
      if (clientId) {
        // Check if dietitian has access to this client
        const client = await withCache(
          `client-access:${clientId}`,
          async () => await User.findById(clientId).select('assignedDietitian assignedDietitians').lean(),
          { ttl: 120000, tags: ['client_meal_plans'] }
        ) as { assignedDietitian?: any; assignedDietitians?: any[] } | null;
        if (!client) {
          return NextResponse.json({
            success: true,
            mealPlans: [],
            pagination: { page: 1, limit: 20, total: 0, pages: 0 }
          });
        }

        const isAssigned =
          client.assignedDietitian?.toString() === session.user.id ||
          client.assignedDietitians?.some((d: any) => d.toString() === session.user.id);

        // Check if dietitian created any plans for this client
        const hasCreatedPlans = await ClientMealPlan.exists({
          clientId: clientId,
          dietitianId: session.user.id
        });

        if (!isAssigned && !hasCreatedPlans) {
          return NextResponse.json({
            success: true,
            mealPlans: [],
            pagination: { page: 1, limit: 20, total: 0, pages: 0 }
          });
        }

        // Dietitian has access - just filter by clientId
        query.clientId = clientId;
      } else {
        // No clientId specified - get all clients assigned to this dietitian
        const assignedClients = await withCache(
          `dietitian-clients:${session.user.id}`,
          async () => await User.find({
            role: UserRole.CLIENT,
            $or: [
              { assignedDietitian: session.user.id },
              { assignedDietitians: session.user.id }
            ]
          }).select('_id').lean(),
          { ttl: 120000, tags: ['client_meal_plans'] }
        );
        const assignedClientIds = assignedClients.map(c => c._id);

        // Dietitian can see meal plans they created OR for their assigned clients
        query.$or = [
          { dietitianId: session.user.id },
          { clientId: { $in: assignedClientIds } }
        ];
      }
    } else if (session.user.role === UserRole.ADMIN) {
      // Admins can see all meal plans
      if (clientId) {
        query.clientId = clientId;
      }
    } else if ((session.user.role as string) === UserRole.HEALTH_COUNSELOR || (session.user.role as string) === 'health_counselor') {
      // Health counselors can see meal plans for their assigned clients
      if (clientId) {
        // Check if HC has access to this client
        const client = await withCache(
          `client-hc-access:${clientId}`,
          async () => await User.findById(clientId).select('assignedHealthCounselor').lean(),
          { ttl: 120000, tags: ['client_meal_plans'] }
        ) as { assignedHealthCounselor?: any } | null;
        if (!client) {
          return NextResponse.json({
            success: true,
            mealPlans: [],
            pagination: { page: 1, limit: 20, total: 0, pages: 0 }
          });
        }

        const isAssigned = client.assignedHealthCounselor?.toString() === session.user.id;

        if (!isAssigned) {
          return NextResponse.json({
            success: true,
            mealPlans: [],
            pagination: { page: 1, limit: 20, total: 0, pages: 0 }
          });
        }

        query.clientId = clientId;
      } else {
        // No clientId specified - get all clients assigned to this HC
        const assignedClients = await withCache(
          `hc-clients:${session.user.id}`,
          async () => await User.find({
            role: UserRole.CLIENT,
            assignedHealthCounselor: session.user.id
          }).select('_id').lean(),
          { ttl: 120000, tags: ['client_meal_plans'] }
        );
        const assignedClientIds = assignedClients.map(c => c._id);

        query.clientId = { $in: assignedClientIds };
      }
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const [mealPlans, total] = await Promise.all([
      ClientMealPlan.find(query)
        .populate('clientId', 'firstName lastName email')
        .populate('dietitianId', 'firstName lastName')
        .populate('templateId', 'name category duration')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ClientMealPlan.countDocuments(query)
    ]);

    return NextResponse.json({
      success: true,
      mealPlans,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching client meal plans:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: 'Failed to fetch client meal plans'
    }, { status: 500 });
  }
}

// POST /api/client-meal-plans - Assign meal plan to client
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({
        error: 'Unauthorized',
        message: 'Please log in to assign meal plans'
      }, { status: 401 });
    }

    // Only dietitians, health counselors, and admins can assign meal plans
    const userRole = session.user.role?.toString().toLowerCase();
    const allowedRoles = ['dietitian', 'health_counselor', 'admin'];
    if (!userRole || !allowedRoles.includes(userRole)) {
      return NextResponse.json({
        error: 'Forbidden',
        message: 'Only dietitians, health counselors, and admins can assign meal plans to clients'
      }, { status: 403 });
    }

    const body = await request.json();

    // Validate input
    let validatedData;
    try {
      validatedData = clientMealPlanSchema.parse(body);
    } catch (validationError) {
      console.error('Validation error:', validationError);
      if (validationError instanceof z.ZodError) {
        return NextResponse.json({
          error: 'Validation failed',
          message: 'Please check your input data',
          details: validationError.issues.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message
          }))
        }, { status: 400 });
      }
      throw validationError;
    }

    await connectDB();

    // Validate that the client exists and is a client (no cache for write operations)
    const client = await User.findById(validatedData.clientId);
    if (!client || client.role !== UserRole.CLIENT) {
      return NextResponse.json({
        error: 'Invalid client',
        message: 'The specified client does not exist or is not a client user'
      }, { status: 400 });
    }

    // Validate template if provided - check both DietTemplate and MealPlanTemplate
    let template = null;
    let templateType = null;
    if (validatedData.templateId) {
      // First try DietTemplate
      template = await DietTemplate.findById(validatedData.templateId);
      if (template) {
        templateType = 'diet';
      } else {
        // Fallback to MealPlanTemplate
        template = await MealPlanTemplate.findById(validatedData.templateId);
        if (template) {
          templateType = 'meal';
        }
      }

      // If neither found, it's an error only if templateId was provided
      if (!template) {
        return NextResponse.json({
          error: 'Invalid template',
          message: 'The specified template does not exist'
        }, { status: 400 });
      }
    }

    // Validate date range
    const startDate = new Date(validatedData.startDate);
    const endDate = new Date(validatedData.endDate);

    if (startDate > endDate) {
      return NextResponse.json({
        error: 'Invalid date range',
        message: 'Start date must be before or equal to end date'
      }, { status: 400 });
    }

    const isDraft = validatedData.status === 'draft';

    // Check if client has a valid (paid) payment record (skip for drafts)
    // This ensures plans are always linked to payments in the payment section
    let paymentWarning: string | null = null;
    let linkedPaymentId: string | null = validatedData.purchaseId || null;

    if (!isDraft && !linkedPaymentId) {
      // Try to find a recent paid payment for this client that doesn't have a meal plan yet
      const recentPaidPayment = await UnifiedPayment.findOne({
        client: validatedData.clientId,
        $or: [
          { status: 'paid' },
          { paymentStatus: 'paid' },
          { status: 'completed' }
        ],
        mealPlanCreated: { $ne: true }
      }).sort({ paidAt: -1, createdAt: -1 }).lean() as any;

      if (recentPaidPayment) {
        linkedPaymentId = String(recentPaidPayment._id);
      } else {
        // Check if ANY payment exists for this client at all
        const anyPayment = await UnifiedPayment.findOne({
          client: validatedData.clientId,
          $or: [
            { status: 'paid' },
            { paymentStatus: 'paid' },
            { status: 'completed' }
          ]
        }).lean();

        if (!anyPayment) {
          paymentWarning = 'No paid payment record found for this client. The plan has been created but is not linked to any payment. Please ensure a payment is created for proper billing tracking.';
        }
      }
    }

    // Check for overlapping active meal plans for the same client (skip for drafts)
    if (!isDraft) {
      const resolvedMeals = validatedData.meals || (template && templateType === 'diet' ? template.meals : []);
      if (!hasPublishableMealData(resolvedMeals)) {
        return NextResponse.json({
          error: 'Invalid meal data',
          message: 'Cannot publish plan without at least one meal slot containing food items'
        }, { status: 400 });
      }

      const overlappingPlan = await ClientMealPlan.findOne({
        clientId: validatedData.clientId,
        status: 'active',
        $or: [
          {
            startDate: { $lte: endDate },
            endDate: { $gte: startDate }
          }
        ]
      });

      if (overlappingPlan) {
        return NextResponse.json({
          error: 'Overlapping meal plan',
          message: 'The client already has an active meal plan during this period'
        }, { status: 409 });
      }
    }

    // Create client meal plan - use template data if provided
    const mealPlanData: any = {
      clientId: validatedData.clientId,
      dietitianId: session.user.id,
      purchaseId: linkedPaymentId || validatedData.purchaseId || undefined, // Link to payment for tracking
      name: validatedData.name,
      description: validatedData.description,
      startDate: startDate,
      endDate: endDate,
      duration: validatedData.duration, // Store original plan duration
      meals: validatedData.meals || (template && templateType === 'diet' ? template.meals : []),
      mealTypes: validatedData.mealTypes || (template && templateType === 'diet' ? template.mealTypes : []),
      customizations: validatedData.customizations || (template ? {
        targetCalories: template.targetCalories?.max || template.dailyCalorieTarget,
        targetMacros: template.targetMacros ? {
          protein: template.targetMacros.protein?.max,
          carbs: template.targetMacros.carbs?.max,
          fat: template.targetMacros.fat?.max
        } : template.dailyMacros
      } : undefined),
      goals: validatedData.goals || { primaryGoal: 'health-improvement' },
      status: validatedData.status || 'active',
      reminders: validatedData.reminders || {
        mealReminders: true,
        progressReminders: true,
        checkInReminders: true
      },
      analytics: {
        totalDaysCompleted: 0
      }
    };

    // Only add templateId if provided
    if (validatedData.templateId) {
      mealPlanData.templateId = validatedData.templateId;
    }

    const clientMealPlan = new ClientMealPlan(mealPlanData);

    await clientMealPlan.save();

    // Mark the linked payment as having a meal plan created (skip for drafts)
    if (!isDraft && linkedPaymentId) {
      try {
        await UnifiedPayment.findByIdAndUpdate(linkedPaymentId, {
          mealPlanCreated: true,
          $addToSet: { linkedMealPlanIds: clientMealPlan._id }
        });
      } catch (linkErr) {
        console.warn('[ClientMealPlan] Failed to link payment to meal plan:', linkErr);
      }
    }

    // Populate the created meal plan
    await clientMealPlan.populate([
      { path: 'clientId', select: 'firstName lastName email' },
      { path: 'dietitianId', select: 'firstName lastName' },
      { path: 'templateId', select: 'name category duration' }
    ]);

    // Update template usage count if template was used
    if (!isDraft && validatedData.templateId && templateType) {
      if (templateType === 'diet') {
        await DietTemplate.findByIdAndUpdate(
          validatedData.templateId,
          { $inc: { usageCount: 1 } }
        );
      } else {
        await MealPlanTemplate.findByIdAndUpdate(
          validatedData.templateId,
          { $inc: { usageCount: 1 } }
        );
      }
    }

    // Skip history logging, notifications, and client status update for drafts
    if (!isDraft) {
      // Log history for meal plan assignment
      await logHistoryServer({
        userId: validatedData.clientId,
        action: 'assign',
        category: 'diet',
        description: `Meal plan assigned: ${validatedData.name} (${startDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} - ${endDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })})`,
        performedById: session.user.id,
        metadata: {
          mealPlanId: clientMealPlan._id,
          name: validatedData.name,
          templateId: validatedData.templateId,
          startDate: validatedData.startDate,
          endDate: validatedData.endDate,
          status: clientMealPlan.status
        }
      });

      // Log activity for audit trail
      const roleMap: Record<string, 'admin' | 'dietitian' | 'health_counselor' | 'client'> = {
        admin: 'admin',
        dietitian: 'dietitian',
        health_counselor: 'health_counselor',
      };
      logActivity({
        userId: session.user.id,
        userRole: roleMap[userRole as string] || 'admin',
        userName: session.user.name || session.user.email || '',
        userEmail: session.user.email || '',
        action: 'Assigned Meal Plan',
        actionType: 'create',
        category: 'meal_plan',
        description: `Assigned meal plan "${validatedData.name}" to client ${client.firstName || ''} ${client.lastName || ''} (${client.email}).`,
        targetUserId: validatedData.clientId,
        targetUserName: `${client.firstName || ''} ${client.lastName || ''} (${client.email})`,
        resourceId: clientMealPlan._id?.toString(),
        resourceType: 'ClientMealPlan',
        resourceName: validatedData.name,
        details: {
          startDate: validatedData.startDate,
          endDate: validatedData.endDate,
          templateId: validatedData.templateId,
        },
      }).catch(() => { });

      // Send push notification to client about new meal plan
      try {
        await sendNotificationToUser(validatedData.clientId, {
          title: '📋 New Meal Plan Assigned',
          body: `You have a new meal plan: "${validatedData.name}". Check your plan now!`,
          data: {
            type: 'meal_plan',
            mealPlanId: clientMealPlan._id?.toString(),
            url: '/my-plan'
          }
        });
      } catch (notificationError) {
        console.error('Failed to send meal plan notification:', notificationError);
      }

      // Update client status based on the new meal plan
      try {
        const newStatus = await updateClientStatusFromMealPlan(validatedData.clientId);
        console.log(`[ClientMealPlan] Client ${validatedData.clientId} status updated to: ${newStatus}`);
      } catch (statusError) {
        console.error('Failed to update client status:', statusError);
        // Don't fail the request - meal plan was created successfully
      }
    } // end !isDraft block

    return NextResponse.json({
      success: true,
      message: isDraft
        ? 'Draft saved successfully'
        : paymentWarning
          ? 'Meal plan assigned successfully (Warning: No payment linked)'
          : 'Meal plan assigned successfully',
      mealPlan: clientMealPlan,
      paymentWarning: isDraft ? undefined : (paymentWarning || undefined),
      linkedPaymentId: isDraft ? undefined : (linkedPaymentId || undefined),
    }, { status: 201 });

  } catch (error) {
    console.error('Error assigning meal plan:', error);

    // Handle specific MongoDB errors
    if (error instanceof Error && error.name === 'ValidationError') {
      return NextResponse.json({
        error: 'Database validation failed',
        message: 'The meal plan data does not meet the required format',
        details: Object.values((error as any).errors).map((err: any) => ({
          field: err.path,
          message: err.message
        }))
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Internal server error',
      message: 'Failed to assign meal plan. Please try again later.'
    }, { status: 500 });
  }
}
