import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import RealtimeSignal from '@/lib/db/models/RealtimeSignal';
import { sendNotificationToUser } from '@/lib/firebase/firebaseNotification';
import { socketManager } from '@/lib/realtime/socket-manager';

const SIGNAL_TTL_MS = 2 * 60 * 1000;

type SignalDelivery = {
  recipientId: string;
  event: string;
  payload: Record<string, unknown>;
};

function isValidUserId(value: unknown): value is string {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const signalData = await request.json();
    const {
      callId,
      callerId,
      receiverId,
      targetUserId,
      type,
      offer,
      answer,
      iceCandidate,
    } = signalData;
    const actualReceiverId = receiverId || targetUserId;

    if (typeof callId !== 'string' || !callId.trim()) {
      return NextResponse.json({ error: 'Missing required field: callId' }, { status: 400 });
    }

    const now = Date.now();
    let delivery: SignalDelivery | null = null;

    switch (type) {
      case 'audio':
      case 'video':
      case 'call-offer':
        if (!isValidUserId(actualReceiverId)) {
          return NextResponse.json({ error: 'Invalid receiverId/targetUserId' }, { status: 400 });
        }
        delivery = {
          recipientId: actualReceiverId,
          event: 'incoming_call',
          payload: {
            callId,
            callerId: session.user.id,
            callerName: `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim(),
            callerAvatar: session.user.avatar,
            type: type === 'call-offer' ? 'video' : type,
            offer,
            timestamp: now,
          },
        };
        break;

      case 'call_accepted':
        if (!isValidUserId(callerId)) {
          return NextResponse.json({ error: 'Invalid callerId' }, { status: 400 });
        }
        delivery = {
          recipientId: callerId,
          event: 'call_accepted',
          payload: { callId, acceptedBy: session.user.id, answer, timestamp: now },
        };
        break;

      case 'call_rejected':
        if (!isValidUserId(callerId)) {
          return NextResponse.json({ error: 'Invalid callerId' }, { status: 400 });
        }
        delivery = {
          recipientId: callerId,
          event: 'call_rejected',
          payload: { callId, rejectedBy: session.user.id, timestamp: now },
        };
        break;

      case 'call_ended': {
        const recipientId = callerId === session.user.id ? actualReceiverId : callerId;
        if (!isValidUserId(recipientId)) {
          return NextResponse.json({ error: 'Invalid call participant' }, { status: 400 });
        }
        delivery = {
          recipientId,
          event: 'call_ended',
          payload: { callId, endedBy: session.user.id, timestamp: now },
        };
        break;
      }

      case 'ice_candidate': {
        const recipientId = callerId === session.user.id ? actualReceiverId : callerId;
        if (!isValidUserId(recipientId) || !iceCandidate) {
          return NextResponse.json({ error: 'Invalid ICE signal' }, { status: 400 });
        }
        delivery = {
          recipientId,
          event: 'ice_candidate',
          payload: { callId, iceCandidate, from: session.user.id, timestamp: now },
        };
        break;
      }

      case 'missed_call':
        if (!isValidUserId(actualReceiverId)) {
          return NextResponse.json({ error: 'Invalid receiverId' }, { status: 400 });
        }
        delivery = {
          recipientId: actualReceiverId,
          event: 'missed_call',
          payload: {
            callId,
            fromUserId: session.user.id,
            fromName: `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim(),
            timestamp: now,
          },
        };
        break;

      default:
        return NextResponse.json({ error: 'Invalid signal type' }, { status: 400 });
    }

    await connectDB();
    // Production disables automatic index creation, so prune stale signals here as
    // well as declaring the TTL index on the model.
    await RealtimeSignal.deleteMany({ expiresAt: { $lte: new Date(now) } });
    await RealtimeSignal.create({
      senderId: session.user.id,
      recipientId: delivery.recipientId,
      type: delivery.event,
      payload: delivery.payload,
      expiresAt: new Date(now + SIGNAL_TTL_MS),
    });

    if (delivery.event === 'incoming_call') {
      const callerName = String(delivery.payload.callerName || 'Your care team');
      const callType = String(delivery.payload.type || 'audio');
      const clickAction = `/messages?userId=${encodeURIComponent(session.user.id)}`;
      await sendNotificationToUser(delivery.recipientId, {
        title: `Incoming ${callType} call`,
        body: `${callerName} is calling you`,
        data: {
          type: 'incoming_call',
          callId,
          callerId: session.user.id,
          conversationWith: session.user.id,
          clickAction,
        },
        clickAction,
        saveToDb: false,
      });
    }

    // Fast path when a colocated/dedicated socket broadcaster is available.
    // The Mongo queue above remains the delivery fallback across serverless hosts.
    socketManager.sendToUser(delivery.recipientId, delivery.event, delivery.payload);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error handling WebRTC signal:', error);
    return NextResponse.json({ error: 'Failed to process signal' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const signals = await RealtimeSignal.find({
      recipientId: session.user.id,
      deliveredAt: null,
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: 1 })
      .limit(50)
      .lean();

    if (signals.length > 0) {
      await RealtimeSignal.updateMany(
        { _id: { $in: signals.map((signal) => signal._id) }, deliveredAt: null },
        { $set: { deliveredAt: new Date() } },
      );
    }

    return NextResponse.json({
      signals: signals.map((signal) => ({
        id: String(signal._id),
        type: signal.type,
        data: signal.payload,
        createdAt: signal.createdAt,
      })),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Error polling WebRTC signals:', error);
    return NextResponse.json({ error: 'Failed to poll signals' }, { status: 500 });
  }
}
