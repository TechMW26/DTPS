import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import MealPlan from '@/lib/db/models/MealPlan';
import { UserRole } from '@/types';
import { z } from 'zod';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// Meal plan validation schema
const mealPlanSchema = z.object({
  name: z.string().min(1, 'Meal plan name is required').max(200, 'Name too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  client: z.string().min(1, 'Client ID is required'),
  startDate: z.string().refine((date) => !isNaN(Date.parse(date)), 'Invalid start date'),
  endDate: z.string().refine((date) => !isNaN(Date.parse(date)), 'Invalid end date'),
  dailyCalorieTarget: z.number().min(800, 'Target calories too low').max(5000, 'Target calories too high'),
  dailyMacros: z.object({
    protein: z.number().min(0, 'Protein must be positive'),
    carbs: z.number().min(0, 'Carbs must be positive'),
    fat: z.number().min(0, 'Fat must be positive')
  }),
  meals: z.array(z.object({
    day: z.number().min(1).max(7, 'Day must be between 1-7'),
    breakfast: z.array(z.string()).optional(),
    lunch: z.array(z.string()).optional(),
    dinner: z.array(z.string()).optional(),
    snacks: z.array(z.string()).optional()
  })).length(7, 'Must have meals for all 7 days'),
  isActive: z.boolean().optional()
});

// GET /api/meals - Get meal plans
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const active = searchParams.get('active');
    const limit = parseInt(searchParams.get('limit') || '10');
    const page = parseInt(searchParams.get('page') || '1');

    // Build query based on user role
    let query: any = {};
    
    if (session.user.role === UserRole.DIETITIAN || session.user.role === UserRole.HEALTH_COUNSELOR) {
      query.dietitian = session.user.id;
      if (clientId) {
        query.client = clientId;
      }
    } else if (session.user.role === UserRole.CLIENT) {
      query.client = session.user.id;
    } else {
      // Admin can see all meal plans
      if (clientId) {
        query.client = clientId;
      }
    }

    // Filter for active meal plans
    if (active === 'true') {
      query.isActive = true;
    }

    const mealPlans = await withCache(
      `meals:${JSON.stringify(query)}:page=${page}:limit=${limit}`,
      async () => await MealPlan.find(query)
      .populate('dietitian', 'firstName lastName email avatar')
      .populate('client', 'firstName lastName email avatar')
      .populate('meals.breakfast', 'name description nutrition')
      .populate('meals.lunch', 'name description nutrition')
      .populate('meals.dinner', 'name description nutrition')
      .populate('meals.snacks', 'name description nutrition')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit),
      { ttl: 120000, tags: ['meals'] }
    );

    const total = await MealPlan.countDocuments(query);

    return NextResponse.json({
      mealPlans,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching meal plans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch meal plans' },
      { status: 500 }
    );
  }
}

// POST /api/meals - Create new meal plan
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only dietitians and admins can create meal plans
    if (session.user.role !== UserRole.DIETITIAN && session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Validate input
    const validatedData = mealPlanSchema.parse(body);

    await connectDB();

    // Validate date range
    const startDate = new Date(validatedData.startDate);
    const endDate = new Date(validatedData.endDate);

    if (endDate <= startDate) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      );
    }

    // Create meal plan
    const mealPlan = new MealPlan({
      dietitian: session.user.id,
      client: validatedData.client,
      name: validatedData.name,
      description: validatedData.description,
      startDate,
      endDate,
      dailyCalorieTarget: validatedData.dailyCalorieTarget,
      dailyMacros: validatedData.dailyMacros,
      meals: validatedData.meals,
      isActive: validatedData.isActive ?? true
    });

    await mealPlan.save();

    // Populate the created meal plan
    await mealPlan.populate('dietitian', 'firstName lastName email avatar');
    await mealPlan.populate('client', 'firstName lastName email avatar');
    await mealPlan.populate('meals.breakfast', 'name description nutrition');
    await mealPlan.populate('meals.lunch', 'name description nutrition');
    await mealPlan.populate('meals.dinner', 'name description nutrition');
    await mealPlan.populate('meals.snacks', 'name description nutrition');

    return NextResponse.json(mealPlan, { status: 201 });

  } catch (error) {
    console.error('Error creating meal plan:', error);
    return NextResponse.json(
      { error: 'Failed to create meal plan' },
      { status: 500 }
    );
  }
}
