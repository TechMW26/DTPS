import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import WooCommerceClient from '@/lib/db/models/WooCommerceClient';

interface WooCommerceOrder {
  id: number;
  orderNumber: string;
  status: string;
  total: number;
  currency: string;
  dateCreated: string;
  dateModified: string;
  datePaid: string | null;
  customer: {
    name: string;
    email: string;
    phone: string;
    city: string;
    country: string;
  };
  shipping: {
    name: string;
    city: string;
    country: string;
  };
  payment: {
    method: string;
    methodTitle: string;
    transactionId: string;
  };
  customerId: number;
}

interface WooCommerceClient {
  name: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  totalOrders: number;
  processingOrders: number;
  completedOrders: number;
  totalSpent: number;
  processingAmount: number;
  completedAmount: number;
  firstOrderDate: string;
  lastOrderDate: string;
}

interface WooCommerceSummary {
  totalClients: number;
  totalOrders: number;
  processingOrders: number;
  completedOrders: number;
  totalRevenue: number;
  processingRevenue: number;
  completedRevenue: number;
  averageOrderValue: number;
  currency: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admins to save data
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Connect to MongoDB
    await connectDB();

    const body = await request.json();
    const { orders, clients, summary }: {
      orders: WooCommerceOrder[];
      clients: WooCommerceClient[];
      summary: WooCommerceSummary;
    } = body;



    let savedClientsCount = 0;
    let updatedClientsCount = 0;

    if (clients && Array.isArray(clients)) {
      // Process each client
      for (const clientData of clients) {
        try {
          // Find existing client or create new one
          let client = await WooCommerceClient.findOne({ email: clientData.email });

          if (client) {
            // Update existing client
            client.name = clientData.name;
            client.phone = clientData.phone;
            client.city = clientData.city;
            client.country = clientData.country;
            client.totalOrders = clientData.totalOrders;
            client.processingOrders = clientData.processingOrders;
            client.completedOrders = clientData.completedOrders;
            client.totalSpent = clientData.totalSpent;
            client.processingAmount = clientData.processingAmount;
            client.completedAmount = clientData.completedAmount;
            client.firstOrderDate = new Date(clientData.firstOrderDate);
            client.lastOrderDate = new Date(clientData.lastOrderDate);
            client.lastSyncDate = new Date();

            // Find and add orders for this client
            const clientOrders = orders?.filter(order => order.customer.email === clientData.email) || [];
            client.orders = clientOrders.map(order => ({
              orderId: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
              total: order.total,
              currency: order.currency,
              dateCreated: order.dateCreated,
              dateModified: order.dateModified,
              datePaid: order.datePaid,
              paymentMethod: order.payment.method,
              paymentMethodTitle: order.payment.methodTitle,
              transactionId: order.payment.transactionId,
              customerId: order.customerId
            }));

            await client.save();
            updatedClientsCount++;
          } else {
            // Create new client
            const clientOrders = orders?.filter(order => order.customer.email === clientData.email) || [];

            client = new WooCommerceClient({
              name: clientData.name,
              email: clientData.email,
              phone: clientData.phone,
              city: clientData.city,
              country: clientData.country,
              totalOrders: clientData.totalOrders,
              processingOrders: clientData.processingOrders,
              completedOrders: clientData.completedOrders,
              totalSpent: clientData.totalSpent,
              processingAmount: clientData.processingAmount,
              completedAmount: clientData.completedAmount,
              firstOrderDate: new Date(clientData.firstOrderDate),
              lastOrderDate: new Date(clientData.lastOrderDate),
              currency: (clientData as any).currency || 'INR',
              orders: clientOrders.map(order => ({
                orderId: order.id,
                orderNumber: order.orderNumber,
                status: order.status,
                total: order.total,
                currency: order.currency,
                dateCreated: order.dateCreated,
                dateModified: order.dateModified,
                datePaid: order.datePaid,
                paymentMethod: order.payment.method,
                paymentMethodTitle: order.payment.methodTitle,
                transactionId: order.payment.transactionId,
                customerId: order.customerId
              })),
              lastSyncDate: new Date()
            });

            await client.save();
            savedClientsCount++;
          }
        } catch (clientError) {
          console.error(`Error saving client ${clientData.email}:`, clientError);
        }
      }
    }

    const totalClientsCount = savedClientsCount + updatedClientsCount;



    return NextResponse.json({
      message: 'WooCommerce data saved successfully to MongoDB',
      savedClientsCount,
      updatedClientsCount,
      totalClientsCount,
      ordersCount: orders?.length || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to save data to MongoDB' },
      { status: 500 }
    );
  }
}
