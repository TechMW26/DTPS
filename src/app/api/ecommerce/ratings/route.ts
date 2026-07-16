import { NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import EcommerceRating from '@/lib/db/models/EcommerceRating';

export async function GET() {
  try {
    await connectDB();
    const ratings = await EcommerceRating.find({ isActive: true }).sort({ createdAt: -1 });
    return NextResponse.json({ ratings });
  } catch (error) {
    console.error('Error fetching ecommerce ratings:', error);
    return NextResponse.json({ error: 'Failed to fetch ecommerce ratings' }, { status: 500 });
  }
}
