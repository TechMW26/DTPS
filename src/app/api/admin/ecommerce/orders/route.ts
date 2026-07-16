import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import EcommerceOrder from '@/lib/db/models/EcommerceOrder';

const isAdmin = (session: any) => session?.user?.role === 'admin';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const paymentStatus = searchParams.get('paymentStatus');
    const search = searchParams.get('search');
    const limit = Math.max(parseInt(searchParams.get('limit') || '20', 10), 1);
    const skipParam = searchParams.get('skip');
    const pageParam = searchParams.get('page');
    const skip = skipParam !== null
      ? Math.max(parseInt(skipParam, 10), 0)
      : Math.max((parseInt(pageParam || '1', 10) - 1) * limit, 0);
    const page = Math.floor(skip / limit) + 1;

    const query: any = {};
    if (status && status !== 'all') query.status = status;
    if (paymentStatus && paymentStatus !== 'all') query.paymentStatus = paymentStatus;
    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'customer.email': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } }
      ];
    }

    const [orders, total] = await Promise.all([
      EcommerceOrder.find(query)
        .sort({ orderDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      EcommerceOrder.countDocuments(query)
    ]);

    return NextResponse.json({
      orders,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (error) {
    console.error('Error fetching ecommerce orders:', error);
    return NextResponse.json({ error: 'Failed to fetch ecommerce orders' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    if (!body.orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const order = await EcommerceOrder.create(body);
    return NextResponse.json({ order });
  } catch (error) {
    console.error('Error creating ecommerce order:', error);
    return NextResponse.json({ error: 'Failed to create ecommerce order' }, { status: 500 });
  }
}
