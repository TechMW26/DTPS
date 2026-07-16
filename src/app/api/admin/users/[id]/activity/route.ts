import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import Message from '@/lib/db/models/Message';
import Appointment from '@/lib/db/models/Appointment';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import FoodLog from '@/lib/db/models/FoodLog';
import MealPlan from '@/lib/db/models/MealPlan';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();
    const { id } = await params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const exists = await withCache(
      `admin:users:id:activity:${JSON.stringify(id)}`,
      async () => await User.findById(id).select('_id'),
      { ttl: 120000, tags: ['admin'] }
    );
    if (!exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [messagesSent, messagesReceived, appointments, payments, foodLogs, mealPlans] = await Promise.all([
      Message.find({ sender: id }).sort({ createdAt: -1 }).limit(10).select('receiver type content createdAt').lean(),
      Message.find({ receiver: id }).sort({ createdAt: -1 }).limit(10).select('sender type content createdAt').lean(),
      Appointment.find({ $or: [{ dietitian: id }, { client: id }] }).sort({ createdAt: -1 }).limit(10).select('dietitian client type status scheduledAt createdAt').lean(),
      UnifiedPayment.find({ $or: [{ dietitian: id }, { client: id }] }).sort({ createdAt: -1 }).limit(10).select('dietitian client amount status type createdAt').lean(),
      FoodLog.find({ client: id }).sort({ createdAt: -1 }).limit(10).select('date totalNutrition createdAt').lean(),
      MealPlan.find({ $or: [{ dietitian: id }, { client: id }] }).sort({ createdAt: -1 }).limit(10).select('name client dietitian startDate endDate createdAt').lean(),
    ]);

    const activity = [
      ...messagesSent.map(m => ({ kind: 'message_sent', at: m.createdAt, data: m })),
      ...messagesReceived.map(m => ({ kind: 'message_received', at: m.createdAt, data: m })),
      ...appointments.map(a => ({ kind: 'appointment', at: a.createdAt, data: a })),
      ...payments.map(p => ({ kind: 'payment', at: p.createdAt, data: p })),
      ...foodLogs.map(f => ({ kind: 'food_log', at: f.createdAt, data: f })),
      ...mealPlans.map(mp => ({ kind: 'meal_plan', at: mp.createdAt, data: mp })),
    ]
      .sort((a, b) => new Date(b.at as any).getTime() - new Date(a.at as any).getTime())
      .slice(0, 30);

    return NextResponse.json({ activity });
  } catch (error) {
    console.error('Error fetching activity:', error);
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
  }
}

