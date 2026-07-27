import { NextRequest, NextResponse } from 'next/server';

const WOOCOMMERCE_API_URL = 'https://dtpoonamsagar.com/wp-json/wc/v3/orders';
const CONSUMER_KEY = 'ck_d86b1ffbd2e0cc67b4dcefcb8f4ff39e2ca91845';
const CONSUMER_SECRET = 'cs_8846aba57d6ec3c8c0cc323d89e9b13eb117a985';

function safeString(value: any) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeProduct(item: any) {
  return {
    name: safeString(item.name) || 'Unknown',
    quantity: Number(item.quantity || 1)
  };
}

function getCouponCode(order: any) {
  if (Array.isArray(order.coupon_lines) && order.coupon_lines.length > 0) {
    return safeString(order.coupon_lines[0].code);
  }
  if (Array.isArray(order.coupons) && order.coupons.length > 0) {
    return safeString(order.coupons[0].code);
  }
  return '';
}

function buildOrderRow(order: any) {
  const billing = order.billing || {};
  const city = safeString(billing.city) || safeString(order.shipping?.city);
  const customerName = `${safeString(billing.first_name)} ${safeString(billing.last_name)}`.trim() || 'Guest';
  const subtotal = Number(order.subtotal || order.total || 0);
  const total = Number(order.total || subtotal || 0);
  const discount = Number(order.discount_total || 0);

  return {
    orderId: safeString(order.id || order.order_number || order.number),
    paymentStatus: safeString(order.status || order.payment_status || 'pending').toLowerCase(),
    customerName,
    customerEmail: safeString(billing.email),
    customerPhone: safeString(billing.phone),
    city,
    products: Array.isArray(order.line_items) ? order.line_items.map(normalizeProduct) : [],
    subtotal,
    discount,
    total,
    createdAt: safeString(order.date_created || order.created_at || order.date_created_gmt),
    coupon: { code: getCouponCode(order) }
  };
}

async function fetchWooCommerceOrders(status: string, perPage: number) {
  const orders: any[] = [];
  const apiUrl = new URL(WOOCOMMERCE_API_URL);
  apiUrl.searchParams.append('consumer_key', CONSUMER_KEY);
  apiUrl.searchParams.append('consumer_secret', CONSUMER_SECRET);
  apiUrl.searchParams.append('per_page', String(perPage));
  apiUrl.searchParams.append('orderby', 'date');
  apiUrl.searchParams.append('order', 'desc');

  if (status !== 'any') {
    apiUrl.searchParams.append('status', status);
  }

  let page = 1;
  let totalPages = 1;
  let hasMore = true;

  while (hasMore) {
    const pageUrl = new URL(apiUrl.toString());
    pageUrl.searchParams.set('page', String(page));

    const response = await fetch(pageUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`WooCommerce API error: ${response.status}`);
    }

    const pageOrders = await response.json();
    if (!Array.isArray(pageOrders)) {
      throw new Error('Unexpected WooCommerce response format');
    }

    orders.push(...pageOrders);

    if (page === 1) {
      totalPages = Number(response.headers.get('X-WP-TotalPages') || '1');
    }

    page += 1;
    hasMore = page <= totalPages;
  }

  return orders;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'any';
    const perPage = Math.min(Math.max(parseInt(url.searchParams.get('per_page') || '100', 10), 1), 100);

    const orders = await fetchWooCommerceOrders(status, perPage);
    const transformed = orders.map(buildOrderRow);

    return NextResponse.json({ success: true, orders: transformed });
  } catch (error: any) {
    console.error('Error fetching public orders:', error);
    return NextResponse.json({ success: false, error: safeString(error.message || error.toString()) }, { status: 500 });
  }
}
