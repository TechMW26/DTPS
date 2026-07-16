import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import FoodLog from '@/lib/db/models/FoodLog';
import ProgressEntry from '@/lib/db/models/ProgressEntry';
import Appointment from '@/lib/db/models/Appointment';
import User from '@/lib/db/models/User';
import DailyTracking from '@/lib/db/models/DailyTracking';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/dashboard/client-stats - Get client dashboard statistics
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.CLIENT) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const userId = session.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Run all independent queries concurrently to avoid N+1 round-trips
    const [user, todayFoodLog, latestWeight, weekAgoWeight, firstWeight, streak, nextAppointment] = await Promise.all([
      // User profile
      withCache(
        `dashboard:client-stats:user-${userId}`,
        async () => User.findById(userId)
          .select('firstName lastName email goals assignedDietitian')
          .populate('assignedDietitian', 'firstName lastName email avatar bio experience specializations')
          .lean() as Promise<any>,
        { ttl: 120000, tags: ['dashboard'] }
      ) as Promise<any>,
      // Today's food log
      withCache(
        `dashboard:client-stats:foodlog-${userId}-${today.toISOString()}`,
        async () => FoodLog.findOne({ client: userId, date: { $gte: today, $lte: endOfDay } }).lean() as Promise<any>,
        { ttl: 120000, tags: ['dashboard'] }
      ) as Promise<any>,
      // Latest weight
      withCache(
        `dashboard:client-stats:weight-latest-${userId}`,
        async () => ProgressEntry.findOne({ user: userId, type: 'weight' }).sort({ recordedAt: -1 }).lean() as Promise<any>,
        { ttl: 120000, tags: ['dashboard'] }
      ) as Promise<any>,
      // Weight from 7 days ago
      withCache(
        `dashboard:client-stats:weight-week-${userId}`,
        async () => {
          const sevenDaysAgo = new Date(today);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          return ProgressEntry.findOne({ user: userId, type: 'weight', recordedAt: { $lte: sevenDaysAgo } }).sort({ recordedAt: -1 }).lean() as Promise<any>;
        },
        { ttl: 120000, tags: ['dashboard'] }
      ) as Promise<any>,
      // First weight entry
      withCache(
        `dashboard:client-stats:weight-first-${userId}`,
        async () => ProgressEntry.findOne({ user: userId, type: 'weight' }).sort({ recordedAt: 1 }).lean() as Promise<any>,
        { ttl: 120000, tags: ['dashboard'] }
      ) as Promise<any>,
      // Streak
      calculateStreak(userId),
      // Next appointment
      withCache(
        `dashboard:client-stats:next-appointment-${userId}`,
        async () => Appointment.findOne({
          client: userId,
          scheduledAt: { $gte: new Date() },
          status: { $in: ['scheduled', 'confirmed'] }
        })
          .populate('dietitian', 'firstName lastName')
          .sort({ scheduledAt: 1 })
          .lean() as Promise<any>,
        { ttl: 120000, tags: ['dashboard'] }
      ) as Promise<any>
    ]);

    // Derived calculations
    const todayTotals = todayFoodLog?.totalNutrition ? {
      calories: todayFoodLog.totalNutrition.calories || 0,
      protein: todayFoodLog.totalNutrition.protein || 0,
      carbs: todayFoodLog.totalNutrition.carbs || 0,
      fat: todayFoodLog.totalNutrition.fat || 0
    } : { calories: 0, protein: 0, carbs: 0, fat: 0 };

    const weightChange = latestWeight && weekAgoWeight
      ? (latestWeight.value - weekAgoWeight.value).toFixed(1)
      : '0.0';

    // Get user's goals (default values if not set)
    const goals = user?.goals || {
      calories: 1800,
      protein: 120,
      carbs: 200,
      fat: 60,
      water: 8,
      steps: 10000,
      targetWeight: latestWeight ? latestWeight.value - 5 : 65
    };

    // Get today's tracking data (water, steps, and sleep)
    let dailyTracking = await DailyTracking.findOne({
      client: userId,
      date: today
    });

    // If no tracking for today, create one with defaults
    if (!dailyTracking) {
      dailyTracking = await DailyTracking.create({
        client: userId,
        date: today,
        water: { glasses: 0, target: goals.water || 8 },
        steps: { count: 0, target: goals.steps || 10000 },
        sleep: { hours: 0, target: 8 }
      });
    }

    return NextResponse.json({
      user: {
        firstName: user?.firstName || session.user.name?.split(' ')[0] || 'User',
        lastName: user?.lastName || '',
        email: user?.email || session.user.email
      },
      assignedDietitian: user?.assignedDietitian ? {
        _id: (user.assignedDietitian as any)._id,
        firstName: (user.assignedDietitian as any).firstName,
        lastName: (user.assignedDietitian as any).lastName,
        email: (user.assignedDietitian as any).email,
        avatar: (user.assignedDietitian as any).avatar,
        bio: (user.assignedDietitian as any).bio,
        experience: (user.assignedDietitian as any).experience,
        specializations: (user.assignedDietitian as any).specializations
      } : null,
      todayStats: {
        calories: {
          consumed: Math.round(todayTotals.calories),
          target: goals.calories || 1800,
          burned: 0, // This would come from exercise logs
          remaining: Math.max(0, (goals.calories || 1800) - Math.round(todayTotals.calories))
        },
        macros: {
          protein: {
            current: Math.round(todayTotals.protein),
            target: goals.protein || 120,
            percentage: Math.round((todayTotals.protein / (goals.protein || 120)) * 100)
          },
          carbs: {
            current: Math.round(todayTotals.carbs),
            target: goals.carbs || 200,
            percentage: Math.round((todayTotals.carbs / (goals.carbs || 200)) * 100)
          },
          fats: {
            current: Math.round(todayTotals.fat),
            target: goals.fat || 60,
            percentage: Math.round((todayTotals.fat / (goals.fat || 60)) * 100)
          }
        },
        water: {
          current: dailyTracking.water.glasses,
          target: dailyTracking.water.target
        },
        steps: {
          current: dailyTracking.steps.count,
          target: dailyTracking.steps.target
        },
        sleep: {
          current: dailyTracking.sleep?.hours || 0,
          target: dailyTracking.sleep?.target || 8
        }
      },
      weight: {
        current: latestWeight?.value || 0,
        target: goals.targetWeight || 65,
        start: firstWeight?.value || latestWeight?.value || 0,
        change: parseFloat(weightChange),
        unit: latestWeight?.unit || 'kg'
      },
      streak: streak,
      nextAppointment: nextAppointment ? {
        id: nextAppointment._id,
        dietitian: {
          name: `${(nextAppointment.dietitian as any)?.firstName || ''} ${(nextAppointment.dietitian as any)?.lastName || ''}`.trim(),
          firstName: (nextAppointment.dietitian as any)?.firstName
        },
        startTime: nextAppointment.scheduledAt.toISOString(),
        endTime: new Date(nextAppointment.scheduledAt.getTime() + (nextAppointment.duration * 60000)).toISOString(),
        type: nextAppointment.type,
        status: nextAppointment.status
      } : null
    });

  } catch (error) {
    console.error('Error fetching client stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch client statistics' },
      { status: 500 }
    );
  }
}

// Helper function to calculate streak
async function calculateStreak(userId: string): Promise<number> {
  try {
    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    while (true) {
      const startOfDay = new Date(currentDate);
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(23, 59, 59, 999);

      const logsForDay = await FoodLog.countDocuments({
        client: userId,
        date: { $gte: startOfDay, $lte: endOfDay }
      });

      if (logsForDay > 0) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }

      // Limit to prevent infinite loop
      if (streak > 365) break;
    }

    return streak;
  } catch (error) {
    console.error('Error calculating streak:', error);
    return 0;
  }
}

