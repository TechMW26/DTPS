import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import FoodLog from '@/lib/db/models/FoodLog';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/food-logs - Get food logs
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const clientId = searchParams.get('clientId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');

    // Build query based on user role
    let query: any = {};

    if (session.user.role === UserRole.CLIENT) {
      query.client = session.user.id;
    } else if (session.user.role === UserRole.DIETITIAN) {
      if (clientId) {
        // Verify the dietitian is assigned to this client
        const client = await withCache(
          `food-logs:${JSON.stringify(clientId)}`,
          async () => await User.findById(clientId).select('assignedDietitian assignedDietitians'),
          { ttl: 120000, tags: ['food_logs'] }
        );
        const isAssigned =
          client?.assignedDietitian?.toString() === session.user.id ||
          client?.assignedDietitians?.some((d: any) => d.toString() === session.user.id);

        if (!isAssigned) {
          return NextResponse.json(
            { error: 'You are not assigned to this client' },
            { status: 403 }
          );
        }
        query.client = clientId;
      } else {
        // Get all clients assigned to this dietitian
        // This would require a separate query to get client IDs
        return NextResponse.json(
          { error: 'Client ID required for dietitian' },
          { status: 400 }
        );
      }
    } else {
      // Admin can see all logs
      if (clientId) {
        query.client = clientId;
      }
    }

    // Date filtering
    if (date) {
      const logDate = new Date(date);
      logDate.setHours(0, 0, 0, 0);
      query.date = logDate;
    } else if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const foodLogs = await withCache(
      `food-logs:${JSON.stringify(query)}:page=${page}:limit=${limit}`,
      async () => await FoodLog.find(query)
        .populate('client', 'firstName lastName')
        .sort({ date: -1 })
        .limit(limit)
        .skip((page - 1) * limit),
      { ttl: 120000, tags: ['food_logs'] }
    );

    const total = await FoodLog.countDocuments(query);

    // Calculate daily totals and flatten meals for the response
    let dailyTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    let flattenedFoodLogs: any[] = [];

    if (date && foodLogs.length > 0) {
      const log = foodLogs[0];
      dailyTotals = {
        calories: log.totalNutrition?.calories || 0,
        protein: log.totalNutrition?.protein || 0,
        carbs: log.totalNutrition?.carbs || 0,
        fat: log.totalNutrition?.fat || 0,
      };

      // Flatten meals into individual food items for the UI
      log.meals.forEach((meal: any) => {
        meal.foods.forEach((food: any) => {
          flattenedFoodLogs.push({
            _id: food._id,
            foodName: food.name,
            quantity: food.quantity,
            unit: food.unit,
            calories: food.calories,
            macros: {
              protein: food.nutrition?.protein || 0,
              carbs: food.nutrition?.carbs || 0,
              fat: food.nutrition?.fat || 0,
            },
            mealType: meal.type,
            loggedAt: log.date,
          });
        });
      });
    }

    return NextResponse.json({
      foodLogs: flattenedFoodLogs,
      dailyTotals,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching food logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch food logs' },
      { status: 500 }
    );
  }
}

// POST /api/food-logs - Create new food log entry or add meal to existing log
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      foodName,
      quantity,
      unit = 'g',
      calories,
      macros,
      mealType,
      recipe,
      loggedAt
    } = body;

    await connectDB();

    // Validate required fields
    if (!foodName || !quantity || !mealType) {
      return NextResponse.json(
        { error: 'Missing required fields: foodName, quantity, mealType' },
        { status: 400 }
      );
    }

    // Get the date for the food log (start of day)
    const logDate = loggedAt ? new Date(loggedAt) : new Date();
    logDate.setHours(0, 0, 0, 0);

    // Create the food item
    const foodItem = {
      name: foodName,
      quantity: parseFloat(quantity.toString()),
      unit: unit || 'g',
      calories: parseFloat(calories?.toString() || '0'),
      nutrition: {
        protein: parseFloat(macros?.protein?.toString() || '0'),
        carbs: parseFloat(macros?.carbs?.toString() || '0'),
        fat: parseFloat(macros?.fat?.toString() || '0'),
        sugar: parseFloat(macros?.sugar?.toString() || '0'),
        sodium: parseFloat(macros?.sodium?.toString() || '0'),
      }
    };

    // Check if a food log already exists for this client and date
    let foodLog = await FoodLog.findOne({
      client: session.user.id,
      date: logDate
    });

    if (foodLog) {
      // Add meal to existing log using the addMeal method
      await foodLog.addMeal(mealType, [foodItem]);
    } else {
      // Create new food log with the meal
      foodLog = new FoodLog({
        client: session.user.id,
        date: logDate,
        meals: [{
          type: mealType,
          foods: [foodItem]
        }],
        totalNutrition: {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          sugar: 0,
          sodium: 0
        }
      });
      await foodLog.save();
    }

    // Reload to get updated totals
    await foodLog.populate('client', 'firstName lastName');

    return NextResponse.json(foodLog, { status: 201 });

  } catch (error) {
    console.error('Error creating food log:', error);
    return NextResponse.json(
      { error: 'Failed to create food log' },
      { status: 500 }
    );
  }
}
