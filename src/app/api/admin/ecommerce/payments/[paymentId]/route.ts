import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import EcommercePayment from '@/lib/db/models/EcommercePayment';

const isAdmin = (session: any) => session?.user?.role === 'admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { paymentId } = await params;

    await connectDB();

    const payment = await EcommercePayment.findOne({ paymentId });
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    return NextResponse.json({ payment });
  } catch (error) {
    console.error('Error fetching ecommerce payment:', error);
    return NextResponse.json({ error: 'Failed to fetch ecommerce payment' }, { status: 500 });
  }
}
