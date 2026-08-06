import RealtimeSignal from '@/lib/db/models/RealtimeSignal';
import { sendNotificationToUser } from '@/lib/firebase/firebaseNotification';
import { UserRole } from '@/types';
import { entityId } from '../utils/assertions';
import { createUser } from '../utils/database';
import { invokeRoute } from '../utils/routes';

jest.mock('@/lib/firebase/firebaseNotification', () => ({
  sendNotificationToUser: jest.fn().mockResolvedValue({
    successCount: 1,
    failureCount: 0,
    invalidTokens: [],
    responses: [],
  }),
}));

describe('WebRTC signal serverless fallback', () => {
  it('queues, polls, and acknowledges an incoming call signal', async () => {
    const caller = await createUser({ role: UserRole.DIETITIAN });
    const receiver = await createUser({ role: UserRole.CLIENT });
    const route = await import('@/app/api/webrtc/signal/route');

    const sent = await invokeRoute(route.POST, {
      method: 'POST',
      url: 'http://localhost/api/webrtc/signal',
      user: caller,
      body: {
        callId: 'call-fallback-1',
        receiverId: entityId(receiver),
        type: 'audio',
        offer: { type: 'offer', sdp: 'test-sdp' },
      },
    });

    expect(sent.status).toBe(200);
    expect(await RealtimeSignal.countDocuments({ recipientId: receiver._id })).toBe(1);
    expect(sendNotificationToUser).toHaveBeenCalledWith(
      entityId(receiver),
      expect.objectContaining({
        data: expect.objectContaining({ type: 'incoming_call', callId: 'call-fallback-1' }),
        saveToDb: false,
      }),
    );

    const firstPoll = await invokeRoute(route.GET, {
      method: 'GET',
      url: 'http://localhost/api/webrtc/signal',
      user: receiver,
    });

    expect(firstPoll.status).toBe(200);
    expect(firstPoll.response.headers.get('cache-control')).toBe('no-store');
    expect(firstPoll.json.signals).toEqual([
      expect.objectContaining({
        type: 'incoming_call',
        data: expect.objectContaining({
          callId: 'call-fallback-1',
          callerId: entityId(caller),
        }),
      }),
    ]);

    const secondPoll = await invokeRoute(route.GET, {
      method: 'GET',
      url: 'http://localhost/api/webrtc/signal',
      user: receiver,
    });
    expect(secondPoll.json.signals).toEqual([]);
  });

  it('rejects invalid recipients without creating a signal', async () => {
    const caller = await createUser({ role: UserRole.CLIENT });
    const route = await import('@/app/api/webrtc/signal/route');

    const result = await invokeRoute(route.POST, {
      method: 'POST',
      url: 'http://localhost/api/webrtc/signal',
      user: caller,
      body: { callId: 'invalid-call', receiverId: 'not-an-id', type: 'video' },
    });

    expect(result.status).toBe(400);
    expect(await RealtimeSignal.countDocuments()).toBe(0);
  });
});
