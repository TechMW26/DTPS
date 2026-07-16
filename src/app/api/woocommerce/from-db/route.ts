import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import WooCommerceClient from '@/lib/db/models/WooCommerceClient';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admins to access data
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Connect to MongoDB
    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const per_page = parseInt(searchParams.get('per_page') || '50');
    const type = searchParams.get('type') || 'all'; // 'orders', 'clients', 'summary', or 'all'

    let result: any = {};

    if (type === 'clients' || type === 'all') {
      // Get clients with pagination
      const skip = (page - 1) * per_page;
      const clients = await withCache(
      `woocommerce:from-db:clients:page=${page}:limit=${per_page}`,
      async () => await WooCommerceClient.find({})
        .sort({ totalSpent: -1 })
        .skip(skip)
        .limit(per_page)
        ,
      { ttl: 120000, tags: ['woocommerce'] }
    );

      // Get total count
      const totalClients = await WooCommerceClient.countDocuments({});

      result.clients = clients.map(client => ({
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
        firstOrderDate: client.firstOrderDate,
        lastOrderDate: client.lastOrderDate,
      }));

      if (type === 'clients') {
        result.pagination = {
          page,
          per_page,
          total: totalClients,
          total_pages: Math.ceil(totalClients / per_page),
        };
      }
    }

    if (type === 'orders' || type === 'all') {
      // Get orders from all clients
      const skip = (page - 1) * per_page;
      const clientsWithOrders = await withCache(
      `woocommerce:from-db:${JSON.stringify({})}`,
      async () => await WooCommerceClient.find({})
        .sort({ lastOrderDate: -1 })
        ,
      { ttl: 120000, tags: ['woocommerce'] }
    );

      // Flatten all orders from all clients
      let allOrders: any[] = [];
      clientsWithOrders.forEach(client => {
        if (client.orders && client.orders.length > 0) {
          client.orders.forEach((order: any) => {
            allOrders.push({
              id: order.orderId,
              orderNumber: order.orderNumber,
              status: order.status,
              total: order.total,
              currency: order.currency,
              dateCreated: order.dateCreated,
              dateModified: order.dateModified,
              datePaid: order.datePaid,
              customer: {
                name: client.name,
                email: client.email,
                phone: client.phone,
                city: client.city,
                country: client.country,
              },
              payment: {
                method: order.paymentMethod,
                methodTitle: order.paymentMethodTitle,
                transactionId: order.transactionId,
              },
              customerId: order.customerId,
            });
          });
        }
      });

      // Sort orders by date and paginate
      allOrders.sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime());
      const paginatedOrders = allOrders.slice(skip, skip + per_page);

      result.orders = paginatedOrders;

      if (type === 'orders') {
        result.pagination = {
          page,
          per_page,
          total: allOrders.length,
          total_pages: Math.ceil(allOrders.length / per_page),
        };
      }
    }

    if (type === 'summary' || type === 'all') {
      // Calculate summary from MongoDB data
      const totalClients = await WooCommerceClient.countDocuments({});

      // Aggregate data
      const aggregation = await withCache(
      `woocommerce:from-db:${JSON.stringify([
        {
          $group: {
            _id: null,
            totalOrders: { $sum: '$totalOrders' },
            processingOrders: { $sum: '$processingOrders' },
            completedOrders: { $sum: '$completedOrders' },
            totalRevenue: { $sum: '$totalSpent' },
            processingRevenue: { $sum: '$processingAmount' },
            completedRevenue: { $sum: '$completedAmount' },
            lastSync: { $max: '$lastSyncDate' }
          }
        }
      ])}`,
      async () => await WooCommerceClient.aggregate([
        {
          $group: {
            _id: null,
            totalOrders: { $sum: '$totalOrders' },
            processingOrders: { $sum: '$processingOrders' },
            completedOrders: { $sum: '$completedOrders' },
            totalRevenue: { $sum: '$totalSpent' },
            processingRevenue: { $sum: '$processingAmount' },
            completedRevenue: { $sum: '$completedAmount' },
            lastSync: { $max: '$lastSyncDate' }
          }
        }
      ]),
      { ttl: 120000, tags: ['woocommerce'] }
    );

      const stats = aggregation[0] || {};

      result.summary = {
        totalClients,
        totalOrders: stats.totalOrders || 0,
        processingOrders: stats.processingOrders || 0,
        completedOrders: stats.completedOrders || 0,
        totalRevenue: stats.totalRevenue || 0,
        processingRevenue: stats.processingRevenue || 0,
        completedRevenue: stats.completedRevenue || 0,
        averageOrderValue: stats.totalOrders > 0 ? (stats.totalRevenue / stats.totalOrders) : 0,
        currency: 'INR',
        lastSync: stats.lastSync || new Date(),
      };
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error fetching WooCommerce data from MongoDB:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data from MongoDB' },
      { status: 500 }
    );
  }
}

// DELETE endpoint to clear database
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admins to delete data
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Connect to MongoDB
    await connectDB();

    // Clear all WooCommerce data
    const result = await WooCommerceClient.deleteMany({});

    return NextResponse.json({
      message: 'All WooCommerce data cleared from MongoDB',
      deletedCount: result.deletedCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error clearing WooCommerce data from MongoDB:', error);
    return NextResponse.json(
      { error: 'Failed to clear data from MongoDB' },
      { status: 500 }
    );
  }
}
