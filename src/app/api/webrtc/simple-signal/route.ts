import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { socketManager } from '@/lib/realtime/socket-manager';

// In-memory store for active connections (in production, use Redis)
const activeConnections = new Map<string, any>();

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, callId, fromUserId, toUserId, data, callType } = body;
    // Validate required fields
    if (!type || !fromUserId || !toUserId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create signal payload
    const signalPayload = {
      type,
      callId,
      fromUserId,
      toUserId,
      callType,
      data,
      timestamp: new Date().toISOString()
    };

    // Store call state for tracking
    if (type === 'call-invite') {
      activeConnections.set(callId, {
        callId,
        initiatorId: fromUserId,
        receiverId: toUserId,
        callType,
        status: 'calling',
        createdAt: new Date().toISOString()
      });
    }

    // Update call state
    if (['call-accept', 'call-reject', 'call-end'].includes(type)) {
      const callData = activeConnections.get(callId);
      if (callData) {
        callData.status = type.replace('call-', '');
        callData.updatedAt = new Date().toISOString();

        if (type === 'call-end' || type === 'call-reject') {
          // Clean up after a delay
          setTimeout(() => {
            activeConnections.delete(callId);
          }, 5000);
        }
      }
    }

    // Send signal to target user via Socket.io
    try {
      socketManager.sendToUser(toUserId, 'webrtc-signal', signalPayload);
    } catch (socketError) {
      console.error('❌ Socket delivery error:', socketError);
      return NextResponse.json({ error: 'Failed to deliver signal' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Signal ${type} sent successfully`,
      callId
    });

  } catch (error) {
    console.error('❌ Simple WebRTC signal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Get active calls (for debugging/monitoring)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const activeCalls = Array.from(activeConnections.values());

    return NextResponse.json({
      activeCalls,
      count: activeCalls.length
    });

  } catch (error) {
    console.error('❌ Get active calls error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
