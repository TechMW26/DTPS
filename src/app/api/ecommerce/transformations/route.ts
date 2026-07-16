import { NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import EcommerceTransformation from '@/lib/db/models/EcommerceTransformation';

export async function GET() {
  try {
    await connectDB();
    const transformations = await EcommerceTransformation.find({ isActive: true }).sort({ createdAt: -1 });
    return NextResponse.json({ transformations });
  } catch (error) {
    console.error('Error fetching ecommerce transformations:', error);
    return NextResponse.json({ error: 'Failed to fetch ecommerce transformations' }, { status: 500 });
  }
}
