import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { socketManager } from '@/lib/realtime/socket-manager';

// POST /api/webrtc/signal - Handle WebRTC signaling
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const signalData = await request.json();
    const {
      callId,
      callerId,
      receiverId,
      targetUserId, // Support both receiverId and targetUserId
      type,
      offer,
      answer,
      iceCandidate
    } = signalData;

    // Support both receiverId and targetUserId for backward compatibility
    const actualReceiverId = receiverId || targetUserId;

    // Validate required fields based on signal type
    if (!callId) {
      return NextResponse.json({
        error: 'Missing required field: callId',
        received: { callId, receiverId, targetUserId, type }
      }, { status: 400 });
    }

    // For call offers, we need receiverId/targetUserId
    // For call responses (accepted/rejected/ended), we need callerId
    // For ICE candidates, we need either
    if ((type === 'audio' || type === 'video' || type === 'call-offer') && !actualReceiverId) {
      return NextResponse.json({
        error: 'Missing required field: receiverId/targetUserId for call offers',
        received: { callId, receiverId, targetUserId, type }
      }, { status: 400 });
    }

    if ((type === 'call_accepted' || type === 'call_rejected') && !callerId) {
      console.error('WebRTC Signal validation failed:', {
        type,
        callId,
        callerId,
        receiverId,
        targetUserId,
        hasCallerId: !!callerId,
        allFields: Object.keys(signalData)
      });
      return NextResponse.json({
        error: 'Missing required field: callerId for call responses',
        received: { callId, callerId, type, allFields: Object.keys(signalData) }
      }, { status: 400 });
    }

    // Get SSE manager instance

    // Route the signal to the appropriate recipient
    switch (type) {
      case 'audio':
      case 'video':
      case 'call-offer': // Support legacy call-offer type
        // Incoming call offer
        socketManager.sendToUser(actualReceiverId, 'incoming_call', {
          callId,
          callerId: session.user.id,
          callerName: `${session.user.firstName} ${session.user.lastName}`,
          callerAvatar: session.user.avatar,
          type: type === 'call-offer' ? 'video' : type, // Convert legacy type
          offer,
          timestamp: Date.now()
        });
        break;

      case 'call_accepted':
        // Call was accepted
        socketManager.sendToUser(callerId, 'call_accepted', {
          callId,
          acceptedBy: session.user.id,
          answer,
          timestamp: Date.now()
        });
        break;

      case 'call_rejected':
        // Call was rejected
        socketManager.sendToUser(callerId, 'call_rejected', {
          callId,
          rejectedBy: session.user.id,
          timestamp: Date.now()
        });
        break;

      case 'call_ended':
        // Call was ended
        const targetUserId = callerId === session.user.id ? actualReceiverId : callerId;
        socketManager.sendToUser(targetUserId, 'call_ended', {
          callId,
          endedBy: session.user.id,
          timestamp: Date.now()
        });
        break;

      case 'ice_candidate':
        // ICE candidate exchange
        const targetForIce = callerId === session.user.id ? actualReceiverId : callerId;
        socketManager.sendToUser(targetForIce, 'ice_candidate', {
          callId,
          iceCandidate,
          from: session.user.id,
          timestamp: Date.now()
        });
        break;

      case 'missed_call':
        socketManager.sendToUser(actualReceiverId, 'missed_call', {
          callId,
          fromUserId: session.user.id,
          fromName: `${session.user.firstName ?? ''} ${session.user.lastName ?? ''}`.trim() || undefined,
          timestamp: Date.now(),
        });
        break;

      default:
        return NextResponse.json({ error: 'Invalid signal type' }, { status: 400 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error handling WebRTC signal:', error);
    return NextResponse.json(
      { error: 'Failed to process signal' },
      { status: 500 }
    );
  }
}

// GET /api/webrtc/signal - Get call status (optional)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const callId = searchParams.get('callId');

    if (!callId) {
      return NextResponse.json({ error: 'Call ID required' }, { status: 400 });
    }

    // Here you could implement call status tracking in a database
    // For now, we'll return a simple response
    return NextResponse.json({
      callId,
      status: 'active', // This would come from your call tracking system
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error getting call status:', error);
    return NextResponse.json(
      { error: 'Failed to get call status' },
      { status: 500 }
    );
  }
}
