import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import EcommercePayment from '@/lib/db/models/EcommercePayment';

const isAdmin = (session: any) => session?.user?.role === 'admin';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const baseUrl = process.env.ECOMMERCE_API_BASE;
    const paymentsPath = process.env.ECOMMERCE_API_PAYMENTS_PATH || '/payments';
    if (!baseUrl) {
      return NextResponse.json({ error: 'ECOMMERCE_API_BASE is not configured' }, { status: 400 });
    }

    await connectDB();

    const response = await fetch(`${baseUrl}${paymentsPath}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.ECOMMERCE_API_KEY || '',
        'X-API-SECRET': process.env.ECOMMERCE_API_SECRET || ''
      }
    });

    if (!response.ok) {
      return NextResponse.json({ error: `External API error: ${response.status}` }, { status: 502 });
    }

    const payload = await response.json();
    const payments = Array.isArray(payload) ? payload : payload?.payments || [];

    const upserted = [] as any[];
    for (const p of payments) {
      const paymentId = String(p.paymentId || p.id || p.payment_id || '');
      if (!paymentId) continue;

      const doc = {
        paymentId,
        transactionId: p.transactionId || p.transaction_id || '',
        orderId: String(p.orderId || p.order_id || ''),
        externalOrderId: String(p.externalOrderId || p.external_order_id || ''),
        status: p.status || 'pending',
        paymentType: p.paymentType || p.type || '',
        paymentMethod: p.paymentMethod || p.method || '',
        currency: p.currency || 'INR',
        amount: Number(p.amount || p.total || 0),
        paymentDate: p.paymentDate || p.paid_at || p.created_at || null,
        payer: {
          name: p.payer?.name || p.billing?.name || '',
          email: p.payer?.email || p.billing?.email || '',
          phone: p.payer?.phone || p.billing?.phone || ''
        },
        origin: 'external',
        source: p.source || 'api',
        raw: p
      };

      const saved = await EcommercePayment.findOneAndUpdate(
        { paymentId },
        { $set: doc },
        { upsert: true, new: true }
      );
      upserted.push(saved);
    }

    return NextResponse.json({ count: upserted.length });
  } catch (error) {
    console.error('Error syncing ecommerce payments:', error);
    return NextResponse.json({ error: 'Failed to sync ecommerce payments' }, { status: 500 });
  }
}
