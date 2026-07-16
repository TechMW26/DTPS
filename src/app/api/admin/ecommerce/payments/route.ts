import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import EcommercePayment from '@/lib/db/models/EcommercePayment';

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
    const orderId = searchParams.get('orderId');
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
    if (orderId) query.orderId = orderId;
    if (search) {
      query.$or = [
        { paymentId: { $regex: search, $options: 'i' } },
        { transactionId: { $regex: search, $options: 'i' } },
        { orderId: { $regex: search, $options: 'i' } },
        { 'payer.email': { $regex: search, $options: 'i' } }
      ];
    }

    const [payments, total] = await Promise.all([
      EcommercePayment.find(query)
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      EcommercePayment.countDocuments(query)
    ]);

    return NextResponse.json({
      payments,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (error) {
    console.error('Error fetching ecommerce payments:', error);
    return NextResponse.json({ error: 'Failed to fetch ecommerce payments' }, { status: 500 });
  }
}
