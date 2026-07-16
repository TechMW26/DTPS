import { NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import EcommerceBlog from '@/lib/db/models/EcommerceBlog';

export async function GET() {
  try {
    await connectDB();
    const blogs = await EcommerceBlog.find({ isActive: true }).sort({ createdAt: -1 });
    return NextResponse.json({ blogs });
  } catch (error) {
    console.error('Error fetching ecommerce blogs:', error);
    return NextResponse.json({ error: 'Failed to fetch ecommerce blogs' }, { status: 500 });
  }
}
