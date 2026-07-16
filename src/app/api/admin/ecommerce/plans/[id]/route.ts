import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import EcommercePlan from '@/lib/db/models/EcommercePlan';

const isAdmin = (session: any) => session?.user?.role === 'admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();

    const plan = await EcommercePlan.findById(id);
    if (!plan) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error('Error fetching ecommerce plan:', error);
    return NextResponse.json({ error: 'Failed to fetch ecommerce plan' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    await connectDB();

    const plan = await EcommercePlan.findByIdAndUpdate(id, { $set: body }, { new: true });
    if (!plan) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error('Error updating ecommerce plan:', error);
    return NextResponse.json({ error: 'Failed to update ecommerce plan' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();

    const plan = await EcommercePlan.findByIdAndDelete(id);
    if (!plan) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting ecommerce plan:', error);
    return NextResponse.json({ error: 'Failed to delete ecommerce plan' }, { status: 500 });
  }
}
