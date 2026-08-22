import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { withCache } from '@/lib/api/utils';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    const body = await request.json();

    const { name, email, subject, message } = body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Import mongoose dynamically for the model
    const mongoose = await import('mongoose');
    
    // Define schema if not exists
    const ContactMessageSchema = new mongoose.Schema({
      name: { type: String, required: true },
      email: { type: String, required: true },
      subject: { type: String, required: true },
      message: { type: String, required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      status: { type: String, enum: ['pending', 'responded', 'resolved'], default: 'pending' },
      createdAt: { type: Date, default: Date.now }
    });

    const ContactMessage = mongoose.models.ContactMessage || 
      mongoose.model('ContactMessage', ContactMessageSchema);

    // Create contact message
    const contactMessage = await ContactMessage.create({
      name,
      email,
      subject,
      message,
      userId: session?.user?.id || null,
      status: 'pending',
      createdAt: new Date()
    });

    return NextResponse.json({
      success: true,
      message: 'Your message has been sent successfully',
      ticketId: contactMessage._id
    });

  } catch (error) {
    console.error('Error submitting contact message:', error);
    return NextResponse.json(
      { error: 'Failed to submit message' },
      { status: 500 }
    );
  }
}

// GET route to fetch contact messages (admin only)
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    
    if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const mongoose = await import('mongoose');
    
    const ContactMessageSchema = new mongoose.Schema({
      name: { type: String, required: true },
      email: { type: String, required: true },
      subject: { type: String, required: true },
      message: { type: String, required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      status: { type: String, enum: ['pending', 'responded', 'resolved'], default: 'pending' },
      createdAt: { type: Date, default: Date.now }
    });

    const ContactMessage = mongoose.models.ContactMessage || 
      mongoose.model('ContactMessage', ContactMessageSchema);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const query: Record<string, unknown> = {};
    if (status) query.status = status;

    const messagesPromise = withCache(
      `support:contact:${JSON.stringify(query)}:page=${page}:limit=${limit}`,
      async () => await ContactMessage.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'name email'),
      { ttl: 120000, tags: ['support'] }
    );
    const [messages, total] = await Promise.all([
      messagesPromise,
      ContactMessage.countDocuments(query),
    ]);

    return NextResponse.json({
      messages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching contact messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}
