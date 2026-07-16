import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import EcommerceOrder from '@/lib/db/models/EcommerceOrder';

const isAdmin = (session: any) => session?.user?.role === 'admin';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const baseUrl = process.env.ECOMMERCE_API_BASE;
    const ordersPath = process.env.ECOMMERCE_API_ORDERS_PATH || '/orders';
    if (!baseUrl) {
      return NextResponse.json({ error: 'ECOMMERCE_API_BASE is not configured' }, { status: 400 });
    }

    await connectDB();

    const response = await fetch(`${baseUrl}${ordersPath}`, {
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
    const orders = Array.isArray(payload) ? payload : payload?.orders || [];

    const upserted = [] as any[];
    for (const o of orders) {
      const orderId = String(o.orderId || o.id || o.order_id || '');
      if (!orderId) continue;

      const doc = {
        orderId,
        externalOrderId: String(o.externalOrderId || o.external_id || ''),
        status: o.status || 'pending',
        paymentStatus: o.paymentStatus || o.payment_status || 'pending',
        orderDate: o.orderDate || o.date_created || o.created_at || null,
        updatedDate: o.updatedDate || o.date_modified || o.updated_at || null,
        currency: o.currency || 'INR',
        totalAmount: Number(o.totalAmount || o.total || 0),
        taxAmount: Number(o.taxAmount || o.tax_total || 0),
        discountAmount: Number(o.discountAmount || o.discount_total || 0),
        shippingAmount: Number(o.shippingAmount || o.shipping_total || 0),
        customer: {
          customerId: String(o.customerId || o.customer_id || ''),
          firstName: o.customer?.firstName || o.billing?.first_name || '',
          lastName: o.customer?.lastName || o.billing?.last_name || '',
          email: o.customer?.email || o.billing?.email || '',
          phone: o.customer?.phone || o.billing?.phone || ''
        },
        billingAddress: {
          firstName: o.billing?.first_name || '',
          lastName: o.billing?.last_name || '',
          email: o.billing?.email || '',
          phone: o.billing?.phone || '',
          address1: o.billing?.address_1 || '',
          address2: o.billing?.address_2 || '',
          city: o.billing?.city || '',
          state: o.billing?.state || '',
          postalCode: o.billing?.postcode || '',
          country: o.billing?.country || ''
        },
        shippingAddress: {
          firstName: o.shipping?.first_name || '',
          lastName: o.shipping?.last_name || '',
          address1: o.shipping?.address_1 || '',
          address2: o.shipping?.address_2 || '',
          city: o.shipping?.city || '',
          state: o.shipping?.state || '',
          postalCode: o.shipping?.postcode || '',
          country: o.shipping?.country || ''
        },
        items: (o.items || o.line_items || []).map((item: any) => ({
          itemId: String(item.itemId || item.id || ''),
          sku: item.sku || '',
          name: item.name || '',
          quantity: Number(item.quantity || 1),
          price: Number(item.price || item.total || 0),
          total: Number(item.total || 0)
        })),
        origin: 'external',
        source: o.source || 'api',
        notes: o.notes || o.customer_note || '',
        raw: o
      };

      const saved = await EcommerceOrder.findOneAndUpdate(
        { orderId },
        { $set: doc },
        { upsert: true, new: true }
      );
      upserted.push(saved);
    }

    return NextResponse.json({ count: upserted.length });
  } catch (error) {
    console.error('Error syncing ecommerce orders:', error);
    return NextResponse.json({ error: 'Failed to sync ecommerce orders' }, { status: 500 });
  }
}
