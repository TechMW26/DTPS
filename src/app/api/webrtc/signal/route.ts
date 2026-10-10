import {nativeResponseJson} from '@/lib/api/native-response';
import { measureApi } from '@/lib/api/performance';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {NativeMessageError} from '@/lib/db/repository/native-messages';
import {authorizeNativeSignal} from '@/lib/db/repository/native-signals';
import {nativeDates} from '@/lib/db/repository/native-plan-editor';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';

const SIGNAL_TTL_MS = 2 * 60 * 1000;

type SignalDelivery = {
  recipientId: string;
  event: string;
  payload: Record<string, unknown>;
};

function isValidUserId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return nativeResponseJson({ error: 'Unauthorized' }, { status: 401 });
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

    if (typeof callId !== 'string' || !/^[a-zA-Z0-9._:-]{1,150}$/.test(callId)) {
      return nativeResponseJson({ error: 'Missing required field: callId' }, { status: 400 });
    }

    const now = Date.now();
    let delivery: SignalDelivery | null = null;

    switch (type) {
      case 'audio':
      case 'video':
      case 'call-offer':
        if (!isValidUserId(actualReceiverId)) {
          return nativeResponseJson({ error: 'Invalid receiverId/targetUserId' }, { status: 400 });
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
          return nativeResponseJson({ error: 'Invalid callerId' }, { status: 400 });
        }
        delivery = {
          recipientId: callerId,
          event: 'call_accepted',
          payload: { callId, acceptedBy: session.user.id, answer, timestamp: now },
        };
        break;

      case 'call_rejected':
        if (!isValidUserId(callerId)) {
          return nativeResponseJson({ error: 'Invalid callerId' }, { status: 400 });
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
          return nativeResponseJson({ error: 'Invalid call participant' }, { status: 400 });
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
          return nativeResponseJson({ error: 'Invalid ICE signal' }, { status: 400 });
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
          return nativeResponseJson({ error: 'Invalid receiverId' }, { status: 400 });
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
        return nativeResponseJson({ error: 'Invalid signal type' }, { status: 400 });
    }

    const db=getNativeDatabase();
    const payload=JSON.parse(JSON.stringify(delivery.payload));
    if(Buffer.byteLength(JSON.stringify(payload))>100_000)return nativeResponseJson({error:'Signal too large'},{status:400});
    await authorizeNativeSignal(db,session.user.id,delivery.recipientId,callId,delivery.event);
    const id=randomBytes(12).toString('hex');
    await db.collection('realtimesignals').doc(id).create({
      _id:id,senderId:session.user.id,recipientId:delivery.recipientId,type:delivery.event,payload,
      createdAt:new Date(now),expiresAt:new Date(now+SIGNAL_TTL_MS),deliveredAt:null,
    });

    if (delivery.event === 'incoming_call' && process.env.NODE_ENV === 'production') {
      const { sendNotificationToUser } = await import('@/lib/firebase/firebaseNotification');
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

    // Native MongoDB event stream; the signal record retains polling compatibility.
    const { socketManager } = await import('@/lib/realtime/socket-manager');
    await socketManager.sendToUser(delivery.recipientId, delivery.event, delivery.payload);

    return nativeResponseJson({ success: true });
  } catch (error) {
    console.error('Error handling WebRTC signal:', error);
    return nativeResponseJson({error:error instanceof NativeMessageError?error.message:'Failed to process signal'},{status:error instanceof NativeMessageError?error.status:503});
  }
}

async function getHandler() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return nativeResponseJson({ error: 'Unauthorized' }, { status: 401 });
    }

    const db=getNativeDatabase();
    const signals=await db.runTransaction(async tx=>{
      const actor=await tx.get(db.collection('users').doc(session.user.id));
      if(!actor.exists||actor.get('isDeleted')||['inactive','suspended','deleted'].includes(actor.get('status'))||!['admin','dietitian','health_counselor','client'].includes(actor.get('role')))throw new NativeMessageError('Unauthorized',403);
      const rows=await tx.get(db.collection('realtimesignals').where('recipientId','==',session.user.id)
        .where('deliveredAt','==',null).where('expiresAt','>',new Date()).orderBy('expiresAt','asc').limit(50));
      for(const row of rows.docs)tx.update(row.ref,{deliveredAt:new Date()});
      return rows.docs.map(row=>({...nativeDates(row.data()),_id:row.id}));
    });

    return nativeResponseJson({
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
    return nativeResponseJson({ error: error instanceof NativeMessageError?error.message:'Failed to poll signals' }, { status: error instanceof NativeMessageError?error.status:500 });
  }
}

export const GET = measureApi('/api/webrtc/signal', getHandler);
