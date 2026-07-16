import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// WooCommerce API configuration
const WOOCOMMERCE_API_URL = 'https://dtpoonamsagar.com/wp-json/wc/v3/orders';
const CONSUMER_KEY = 'ck_d86b1ffbd2e0cc67b4dcefcb8f4ff39e2ca91845';
const CONSUMER_SECRET = 'cs_8846aba57d6ec3c8c0cc323d89e9b13eb117a985';

interface WooCommerceOrder {
  id: number;
  parent_id: number;
  status: string;
  currency: string;
  date_created: string;
  date_modified: string;
  total: string;
  customer_id: number;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    city: string;
    country: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    city: string;
    country: string;
  };
  payment_method: string;
  payment_method_title: string;
  transaction_id: string;
  date_paid: string | null;
  line_items?: Array<{
    id: number;
    name: string;
    quantity: number;
    total: string;
  }>;
}

// GET /api/woocommerce/orders - Fetch WooCommerce orders
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admins to access WooCommerce data
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'processing'; // Default to processing orders
    const per_page = searchParams.get('per_page') || '50';
    const page = searchParams.get('page') || '1';


    // Build WooCommerce API URL with authentication
    const apiUrl = new URL(WOOCOMMERCE_API_URL);
    apiUrl.searchParams.append('consumer_key', CONSUMER_KEY);
    apiUrl.searchParams.append('consumer_secret', CONSUMER_SECRET);

    // Only add status filter if not 'any'
    if (status !== 'any') {
      apiUrl.searchParams.append('status', status);
    }

    apiUrl.searchParams.append('per_page', per_page);
    apiUrl.searchParams.append('page', page);
    apiUrl.searchParams.append('orderby', 'date');
    apiUrl.searchParams.append('order', 'desc');

    let allOrders: WooCommerceOrder[] = [];
    let totalCount = 0;
    let totalPages = 1;

    // If requesting all orders with high per_page, fetch ALL pages for complete data
    if (status === 'any' && parseInt(per_page) >= 500) {
      let currentPage = 1;
      let hasMorePages = true;
      const maxPages = 1000; // Increased limit to fetch all data

      while (hasMorePages && currentPage <= maxPages) {
        const pageApiUrl = new URL(WOOCOMMERCE_API_URL);
        pageApiUrl.searchParams.append('consumer_key', CONSUMER_KEY);
        pageApiUrl.searchParams.append('consumer_secret', CONSUMER_SECRET);

        // Don't add status filter when fetching all orders
        // if (status !== 'any') {
        //   pageApiUrl.searchParams.append('status', status);
        // }

        pageApiUrl.searchParams.append('per_page', '100'); // WooCommerce max per page
        pageApiUrl.searchParams.append('page', currentPage.toString());
        pageApiUrl.searchParams.append('orderby', 'date');
        pageApiUrl.searchParams.append('order', 'desc');

        const response = await fetch(pageApiUrl.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`WooCommerce API error: ${response.status}`);
        }

        const pageOrders: WooCommerceOrder[] = await response.json();
        allOrders = [...allOrders, ...pageOrders];

        // Get pagination info from headers
        if (currentPage === 1) {
          totalCount = parseInt(response.headers.get('X-WP-Total') || '0');
          totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1');
        }

        hasMorePages = pageOrders.length === 100 && currentPage < totalPages;
        currentPage++;


        // Break if we've reached the limit
        if (currentPage > maxPages) {
          break;
        }
      }

    } else {
      // Regular single page fetch
      const response = await fetch(apiUrl.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`WooCommerce API error: ${response.status}`);
      }

      allOrders = await response.json();
      totalCount = parseInt(response.headers.get('X-WP-Total') || '0');
      totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1');
    }

    const orders = allOrders;

    // Filter and format the orders
    const filteredOrders = orders
      .filter(order => status === 'any' || order.status === status)
      .map(order => ({
        id: order.id,
        orderNumber: order.id.toString(),
        status: order.status,
        total: parseFloat(order.total),
        currency: order.currency,
        dateCreated: order.date_created,
        dateModified: order.date_modified,
        datePaid: order.date_paid,
        customer: {
          name: `${order.billing.first_name} ${order.billing.last_name}`,
          email: order.billing.email,
          phone: order.billing.phone,
          city: order.billing.city,
          country: order.billing.country,
        },
        shipping: {
          name: `${order.shipping.first_name} ${order.shipping.last_name}`,
          city: order.shipping.city,
          country: order.shipping.country,
        },
        payment: {
          method: order.payment_method,
          methodTitle: order.payment_method_title,
          transactionId: order.transaction_id,
        },
        customerId: order.customer_id,
      }));

    // Calculate client statistics
    const paidOrders = orders.filter(order => ['processing', 'completed', 'on-hold'].includes(order.status));
    const processingOrders = orders.filter(order => order.status === 'processing');
    const completedOrders = orders.filter(order => order.status === 'completed');

    // Group orders by customer email to get unique clients
    const clientsMap = new Map();

    paidOrders.forEach(order => {
      const email = order.billing.email;
      const clientName = `${order.billing.first_name} ${order.billing.last_name}`;

      if (!clientsMap.has(email)) {
        clientsMap.set(email, {
          name: clientName,
          email: email,
          phone: order.billing.phone,
          city: order.billing.city,
          country: order.billing.country,
          totalOrders: 0,
          processingOrders: 0,
          completedOrders: 0,
          totalSpent: 0,
          processingAmount: 0,
          completedAmount: 0,
          firstOrderDate: order.date_created,
          lastOrderDate: order.date_created,
        });
      }

      const client = clientsMap.get(email);
      client.totalOrders++;
      client.totalSpent += parseFloat(order.total);

      if (order.status === 'processing') {
        client.processingOrders++;
        client.processingAmount += parseFloat(order.total);
      } else if (order.status === 'completed') {
        client.completedOrders++;
        client.completedAmount += parseFloat(order.total);
      }

      // Update date range
      if (new Date(order.date_created) < new Date(client.firstOrderDate)) {
        client.firstOrderDate = order.date_created;
      }
      if (new Date(order.date_created) > new Date(client.lastOrderDate)) {
        client.lastOrderDate = order.date_created;
      }
    });

    const clients = Array.from(clientsMap.values());

    // Calculate summary statistics
    const totalRevenue = paidOrders.reduce((sum, order) => sum + parseFloat(order.total), 0);
    const processingRevenue = processingOrders.reduce((sum, order) => sum + parseFloat(order.total), 0);
    const completedRevenue = completedOrders.reduce((sum, order) => sum + parseFloat(order.total), 0);

    const summary = {
      totalClients: clients.length,
      totalOrders: paidOrders.length,
      processingOrders: processingOrders.length,
      completedOrders: completedOrders.length,
      totalRevenue,
      processingRevenue,
      completedRevenue,
      averageOrderValue: paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0,
      currency: filteredOrders[0]?.currency || 'INR',
    };

    return NextResponse.json({
      orders: filteredOrders,
      clients,
      summary,
      pagination: {
        page: parseInt(page),
        per_page: parseInt(per_page),
        total: totalCount,
        total_pages: totalPages,
      }
    });

  } catch (error) {
    console.error('Error fetching WooCommerce orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

// POST /api/woocommerce/orders - Update order status (if needed)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admins to update orders
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { orderId, status } = body;

    if (!orderId || !status) {
      return NextResponse.json(
        { error: 'Order ID and status are required' },
        { status: 400 }
      );
    }

    // Update order status in WooCommerce
    const apiUrl = `${WOOCOMMERCE_API_URL}/${orderId}?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
    
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      throw new Error(`WooCommerce API error: ${response.status}`);
    }

    const updatedOrder = await response.json();

    return NextResponse.json({
      message: 'Order status updated successfully',
      order: updatedOrder,
    });

  } catch (error) {
    console.error('Error updating order status:', error);
    return NextResponse.json(
      { error: 'Failed to update order status' },
      { status: 500 }
    );
  }
}
