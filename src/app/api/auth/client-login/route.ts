import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import WooCommerceClient from '@/lib/db/models/WooCommerceClient';
import jwt from 'jsonwebtoken';
import { logActivity } from '@/lib/utils/activityLogger';

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'your-secret-key';

// POST /api/auth/client-login - Client login endpoint
export async function POST(request: NextRequest) {
  try {
    // Connect to MongoDB
    await connectDB();

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find client by email
    const client = await WooCommerceClient.findOne({
      email: email.toLowerCase().trim()
    }).lean() as any;

    if (!client) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check password (plain text comparison as per your preference)
    if ((client as any).password !== password) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Create JWT token for client session
    const token = jwt.sign(
      {
        clientId: (client as any)._id,
        email: (client as any).email,
        name: (client as any).name,
        role: 'client'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Log login activity
    logActivity({
      userId: String(client._id),
      userRole: 'client',
      userName: client.name || client.email,
      userEmail: client.email,
      action: 'Logged In',
      actionType: 'login',
      category: 'auth',
      description: `Client ${client.name || client.email} logged in.`,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    }).catch(() => { });

    // Return client data and token
    return NextResponse.json({
      message: 'Login successful',
      client: {
        id: client._id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        city: client.city,
        country: client.country,
        totalOrders: client.totalOrders,
        totalSpent: client.totalSpent,
        lastOrderDate: client.lastOrderDate
      },
      token,
      expiresIn: '7d'
    });

  } catch (error) {
    console.error('Client login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}

// GET /api/auth/client-login - Verify client token
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      if (decoded.role !== 'client') {
        return NextResponse.json(
          { error: 'Invalid token type' },
          { status: 401 }
        );
      }

      // Connect to MongoDB
      await connectDB();

      // Get fresh client data
      const client = await WooCommerceClient.findById(decoded.clientId).lean();

      if (!client) {
        return NextResponse.json(
          { error: 'Client not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        valid: true,
        client: {
          id: (client as any)._id,
          name: (client as any).name,
          email: (client as any).email,
          phone: (client as any).phone,
          city: (client as any).city,
          country: (client as any).country,
          totalOrders: (client as any).totalOrders,
          totalSpent: (client as any).totalSpent,
          lastOrderDate: (client as any).lastOrderDate
        }
      });

    } catch (jwtError) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json(
      { error: 'Token verification failed' },
      { status: 500 }
    );
  }
}
