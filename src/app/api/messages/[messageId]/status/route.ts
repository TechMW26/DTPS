import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import { socketManager } from '@/lib/realtime/socket-manager';

// PUT /api/messages/[messageId]/status - Update message status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { status } = await request.json();

    if (!['delivered', 'read'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    await connectDB();

    // Find the message
    const message = await Message.findById(messageId);
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Only the receiver can update message status
    if (message.receiver.toString() !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update message status
    const updateData: any = { status };
    
    if (status === 'delivered') {
      updateData.deliveredAt = new Date();
    } else if (status === 'read') {
      updateData.isRead = true;
      updateData.readAt = new Date();
    }

    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      updateData,
      { new: true }
    ).populate('sender', 'firstName lastName avatar')
     .populate('receiver', 'firstName lastName avatar');

    // Send real-time notification to sender
    socketManager.sendToUser(message.sender.toString(), 'message_status_update', {
      messageId,
      status,
      timestamp: Date.now()
    });

    return NextResponse.json(updatedMessage);

  } catch (error) {
    console.error('Error updating message status:', error);
    return NextResponse.json(
      { error: 'Failed to update message status' },
      { status: 500 }
    );
  }
}

// PATCH /api/messages/[messageId]/status - Bulk update conversation status
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationWith, status } = await request.json();

    if (!['delivered', 'read'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    await connectDB();

    // Update all unread messages in the conversation
    const updateData: any = { status };
    
    if (status === 'delivered') {
      updateData.deliveredAt = new Date();
    } else if (status === 'read') {
      updateData.isRead = true;
      updateData.readAt = new Date();
    }

    const result = await Message.updateMany(
      {
        sender: conversationWith,
        receiver: session.user.id,
        isRead: false
      },
      updateData
    );

    // Send real-time notification to sender
    socketManager.sendToUser(conversationWith, 'conversation_read', {
      readBy: session.user.id,
      timestamp: Date.now(),
      count: result.modifiedCount
    });

    return NextResponse.json({ 
      message: 'Conversation status updated',
      updatedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('Error updating conversation status:', error);
    return NextResponse.json(
      { error: 'Failed to update conversation status' },
      { status: 500 }
    );
  }
}
