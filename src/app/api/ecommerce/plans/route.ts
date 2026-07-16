import { NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import EcommercePlan from '@/lib/db/models/EcommercePlan';

export async function GET() {
  try {
    await connectDB();
    const plans = await EcommercePlan.find({ isActive: true }).sort({ createdAt: -1 });
    return NextResponse.json({ plans });
  } catch (error) {
    console.error('Error fetching ecommerce plans:', error);
    return NextResponse.json({ error: 'Failed to fetch ecommerce plans' }, { status: 500 });
  }
}
