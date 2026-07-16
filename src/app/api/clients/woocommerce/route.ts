import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import WooCommerceClient from '@/lib/db/models/WooCommerceClient';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/clients/woocommerce - Get all WooCommerce clients
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admins and dietitians to access client data
    if (session.user.role !== 'admin' && session.user.role !== 'dietitian') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Connect to MongoDB
    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const per_page = parseInt(searchParams.get('per_page') || '20');
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'totalSpent';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Build search query
    let query: any = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { city: { $regex: search, $options: 'i' } },
          { country: { $regex: search, $options: 'i' } }
        ]
      };
    }

    // Build sort object
    const sort: any = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get clients with pagination
    const skip = (page - 1) * per_page;
    const clients = await withCache(
      `clients:woocommerce:${JSON.stringify(query)}:skip=${skip}:limit=${per_page}`,
      async () => await WooCommerceClient.find(query)
      .sort(sort)
      .skip(skip)
      .limit(per_page)
      ,
      { ttl: 120000, tags: ['clients'] }
    );

    // Get total count
    const totalClients = await WooCommerceClient.countDocuments(query);

    // Calculate summary statistics
    const summary = await withCache(
      `clients:woocommerce:${JSON.stringify([
      { $match: query },
      {
        $group: {
          _id: null,
          totalClients: { $sum: 1 },
          totalOrders: { $sum: '$totalOrders' },
          totalRevenue: { $sum: '$totalSpent' },
          avgOrderValue: { $avg: '$totalSpent' },
          topSpender: { $max: '$totalSpent' }
        }
      }
    ])}`,
      async () => await WooCommerceClient.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalClients: { $sum: 1 },
          totalOrders: { $sum: '$totalOrders' },
          totalRevenue: { $sum: '$totalSpent' },
          avgOrderValue: { $avg: '$totalSpent' },
          topSpender: { $max: '$totalSpent' }
        }
      }
    ]),
      { ttl: 120000, tags: ['clients'] }
    );

    const stats = summary[0] || {
      totalClients: 0,
      totalOrders: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
      topSpender: 0
    };

    return NextResponse.json({
      clients: clients.map(client => ({
        id: client._id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        city: client.city,
        country: client.country,
        totalOrders: client.totalOrders,
        processingOrders: client.processingOrders,
        completedOrders: client.completedOrders,
        totalSpent: client.totalSpent,
        processingAmount: client.processingAmount,
        completedAmount: client.completedAmount,
        currency: client.currency,
        firstOrderDate: client.firstOrderDate,
        lastOrderDate: client.lastOrderDate,
        lastSyncDate: client.lastSyncDate,
        ordersCount: client.orders?.length || 0
      })),
      pagination: {
        page,
        per_page,
        total: totalClients,
        total_pages: Math.ceil(totalClients / per_page),
        has_next: page < Math.ceil(totalClients / per_page),
        has_prev: page > 1
      },
      summary: {
        totalClients: stats.totalClients,
        totalOrders: stats.totalOrders,
        totalRevenue: stats.totalRevenue,
        avgOrderValue: stats.avgOrderValue,
        topSpender: stats.topSpender,
        currency: 'INR'
      }
    });

  } catch (error) {
    console.error('Error fetching WooCommerce clients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch WooCommerce clients' },
      { status: 500 }
    );
  }
}

// GET /api/clients/woocommerce/[id] - Get specific client details
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admins to access detailed client data
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Connect to MongoDB
    await connectDB();

    const body = await request.json();
    const { clientId } = body;

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    const client = await withCache(
      `clients:woocommerce:${JSON.stringify(clientId)}`,
      async () => await WooCommerceClient.findById(clientId),
      { ttl: 120000, tags: ['clients'] }
    );

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json({
      client: {
        id: (client as any)._id,
        name: (client as any).name,
        email: (client as any).email,
        phone: (client as any).phone,
        city: (client as any).city,
        country: (client as any).country,
        totalOrders: (client as any).totalOrders,
        processingOrders: (client as any).processingOrders,
        completedOrders: (client as any).completedOrders,
        totalSpent: (client as any).totalSpent,
        processingAmount: (client as any).processingAmount,
        completedAmount: (client as any).completedAmount,
        currency: (client as any).currency,
        firstOrderDate: (client as any).firstOrderDate,
        lastOrderDate: (client as any).lastOrderDate,
        lastSyncDate: (client as any).lastSyncDate,
        wooCommerceCustomerId: (client as any).wooCommerceCustomerId,
        orders: (client as any).orders || []
      }
    });

  } catch (error) {
    console.error('Error fetching WooCommerce client details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch client details' },
      { status: 500 }
    );
  }
}

// DELETE /api/clients/woocommerce - Delete specific client
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admins to delete clients
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Connect to MongoDB
    await connectDB();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('id');

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    const result = await WooCommerceClient.findByIdAndDelete(clientId);

    if (!result) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'WooCommerce client deleted successfully',
      deletedClient: {
        id: result._id,
        name: result.name,
        email: result.email
      }
    });

  } catch (error) {
    console.error('Error deleting WooCommerce client:', error);
    return NextResponse.json(
      { error: 'Failed to delete client' },
      { status: 500 }
    );
  }
}
