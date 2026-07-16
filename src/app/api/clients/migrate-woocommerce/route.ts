import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import WooCommerceClient from '@/lib/db/models/WooCommerceClient';
import User from '@/lib/db/models/User';

// POST /api/clients/migrate-woocommerce - Migrate WooCommerce clients to main User collection
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow any authenticated user to migrate data (for development)
    // In production, you might want to restrict this to admins only

    // Connect to MongoDB
    await connectDB();

    // Get all WooCommerce clients
    const wooClients = await WooCommerceClient.find({}).lean();



    let migratedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const wooClient of wooClients) {
      try {
        // Check if user already exists in main User collection
        const existingUser = await User.findOne({ email: wooClient.email });

        if (existingUser) {
          // Update existing user with WooCommerce data
          await User.findByIdAndUpdate(existingUser._id, {
            // Keep existing firstName/lastName if they exist, otherwise split name
            firstName: existingUser.firstName || wooClient.name.split(' ')[0] || 'Client',
            lastName: existingUser.lastName || wooClient.name.split(' ').slice(1).join(' ') || '',
            phone: existingUser.phone || wooClient.phone,
            // Add WooCommerce-specific data as metadata
            wooCommerceData: {
              customerId: wooClient.wooCommerceCustomerId,
              totalOrders: wooClient.totalOrders,
              totalSpent: wooClient.totalSpent,
              processingOrders: wooClient.processingOrders,
              completedOrders: wooClient.completedOrders,
              processingAmount: wooClient.processingAmount,
              completedAmount: wooClient.completedAmount,
              firstOrderDate: wooClient.firstOrderDate,
              lastOrderDate: wooClient.lastOrderDate,
              orders: wooClient.orders,
              lastSyncDate: wooClient.lastSyncDate
            }
          });
          updatedCount++;
        } else {
          // Create new user from WooCommerce client
          const nameParts = wooClient.name.split(' ');
          const firstName = nameParts[0] || 'Client';
          const lastName = nameParts.slice(1).join(' ') || '';

          const newUser = new User({
            email: wooClient.email,
            password: wooClient.password || 'Password123',
            firstName,
            lastName,
            role: 'client',
            status: 'active',
            phone: wooClient.phone,
            emailVerified: true, // WooCommerce clients are considered verified
            // Track that this was migrated from WooCommerce
            createdBy: {
              userId: session.user.id, // Admin who ran the migration
              role: 'admin',
            },
            // WooCommerce-specific data
            wooCommerceData: {
              customerId: wooClient.wooCommerceCustomerId,
              totalOrders: wooClient.totalOrders,
              totalSpent: wooClient.totalSpent,
              processingOrders: wooClient.processingOrders,
              completedOrders: wooClient.completedOrders,
              processingAmount: wooClient.processingAmount,
              completedAmount: wooClient.completedAmount,
              firstOrderDate: wooClient.firstOrderDate,
              lastOrderDate: wooClient.lastOrderDate,
              orders: wooClient.orders,
              lastSyncDate: wooClient.lastSyncDate
            }
          });

          await newUser.save();
          migratedCount++;

        }
      } catch (clientError) {

        skippedCount++;
      }
    }

    return NextResponse.json({
      message: 'WooCommerce clients migration completed',
      totalWooClients: wooClients.length,
      migratedCount,
      updatedCount,
      skippedCount,
      summary: {
        newClients: migratedCount,
        updatedExisting: updatedCount,
        errors: skippedCount
      }
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to migrate WooCommerce clients' },
      { status: 500 }
    );
  }
}

// GET /api/clients/migrate-woocommerce - Check migration status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow any authenticated user to check status (for development)

    // Connect to MongoDB
    await connectDB();

    const totalWooClients = await WooCommerceClient.countDocuments({});
    const totalUsers = await User.countDocuments({});
    const clientUsers = await User.countDocuments({ role: 'client' });
    const wooCommerceUsers = await User.countDocuments({
      'wooCommerceData': { $exists: true }
    });

    // Get sample migrated clients
    const sampleClients = await User.find({
      'wooCommerceData': { $exists: true }
    })
      .select('firstName lastName email wooCommerceData.totalOrders wooCommerceData.totalSpent')
      .limit(5)
      .lean();

    return NextResponse.json({
      totalWooClients,
      totalUsers,
      clientUsers,
      wooCommerceUsers,
      migrationComplete: wooCommerceUsers > 0,
      sampleClients: sampleClients.map(client => ({
        name: `${client.firstName} ${client.lastName}`,
        email: client.email,
        totalOrders: client.wooCommerceData?.totalOrders || 0,
        totalSpent: client.wooCommerceData?.totalSpent || 0
      }))
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to check migration status' },
      { status: 500 }
    );
  }
}
