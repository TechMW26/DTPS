import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import WooCommerceClient from '@/lib/db/models/WooCommerceClient';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// POST /api/clients/update-passwords - Add passwords to all existing clients
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admins to update passwords
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Connect to MongoDB
    await connectDB();

    // Get all clients without passwords
    const clientsWithoutPasswords = await withCache(
      `clients:update-passwords:${JSON.stringify({
      $or: [
        { password: { $exists: false } },
        { password: null },
        { password: '' }
      ]
    })}`,
      async () => await WooCommerceClient.find({
      $or: [
        { password: { $exists: false } },
        { password: null },
        { password: '' }
      ]
    }).sort({ createdAt: 1 }),
      { ttl: 120000, tags: ['clients'] }
    );


    let updatedCount = 0;

    // Update each client with a sequential password
    for (let i = 0; i < clientsWithoutPasswords.length; i++) {
      const client = clientsWithoutPasswords[i];
      const passwordNumber = i + 1;
      const password = `Password${passwordNumber.toString().padStart(3, '0')}`;
      
      await WooCommerceClient.findByIdAndUpdate(client._id, {
        password: password
      });
      
      updatedCount++;
    }

    // Also update any clients that have the default password
    const clientsWithDefaultPassword = await withCache(
      `clients:update-passwords:${JSON.stringify({
      password: 'Password123'
    })}`,
      async () => await WooCommerceClient.find({
      password: 'Password123'
    }).sort({ createdAt: 1 }),
      { ttl: 120000, tags: ['clients'] }
    );

    for (let i = 0; i < clientsWithDefaultPassword.length; i++) {
      const client = clientsWithDefaultPassword[i];
      const passwordNumber = clientsWithoutPasswords.length + i + 1;
      const password = `Password${passwordNumber.toString().padStart(3, '0')}`;
      
      await WooCommerceClient.findByIdAndUpdate(client._id, {
        password: password
      });
      
      updatedCount++;

    }

    return NextResponse.json({
      message: 'Client passwords updated successfully',
      updatedCount,
      totalClients: clientsWithoutPasswords.length + clientsWithDefaultPassword.length
    });

  } catch (error) {
    console.error('Error updating client passwords:', error);
    return NextResponse.json(
      { error: 'Failed to update client passwords' },
      { status: 500 }
    );
  }
}

// GET /api/clients/update-passwords - Get password update status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admins to check status
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Connect to MongoDB
    await connectDB();

    const totalClients = await WooCommerceClient.countDocuments({});
    const passwordQuery = {
      password: {
        $exists: true,
        $ne: null,
        $nin: ['', null]
      }
    };
    const clientsWithPasswords = await WooCommerceClient.countDocuments(passwordQuery);
    const clientsWithoutPasswords = totalClients - clientsWithPasswords;

    // Get sample clients with their passwords (first 5)
    const sampleClients = await withCache(
      `clients:update-passwords:${JSON.stringify(passwordQuery)}`,
      async () => await WooCommerceClient.find(passwordQuery)
    .select('name email password')
    .limit(5)
    ,
      { ttl: 120000, tags: ['clients'] }
    );

    return NextResponse.json({
      totalClients,
      clientsWithPasswords,
      clientsWithoutPasswords,
      passwordsComplete: clientsWithoutPasswords === 0,
      sampleClients: sampleClients.map(client => ({
        name: client.name,
        email: client.email,
        password: client.password
      }))
    });

  } catch (error) {
    console.error('Error checking password status:', error);
    return NextResponse.json(
      { error: 'Failed to check password status' },
      { status: 500 }
    );
  }
}
