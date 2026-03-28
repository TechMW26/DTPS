import { userRoom, SOCKET_EVENTS } from '@/lib/realtime/socket-events';
import { UserRole } from '@/types';
import { entityId } from '../../utils/assertions';
import { createUser } from '../../utils/database';
import { invokeRoute } from '../../utils/routes';
import {
    createAuthenticatedSocketClient,
    disconnectSocket,
    expectNoSocketEvent,
    waitForSocketEvent,
} from '../../utils/socket';
import { getTestSocketIO } from '../../utils/runtime';

function toAuthUser(user: any) {
    return {
        id: entityId(user),
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
    };
}

describe('Socket.io security scenarios', () => {
    it('does not allow a client to spoof server-dispatched events by emitting them directly', async () => {
        const sender = await createUser({ role: UserRole.CLIENT, phone: '9222222221' });
        const recipient = await createUser({ role: UserRole.CLIENT, phone: '9222222222' });

        const { socket: senderSocket } = await createAuthenticatedSocketClient(toAuthUser(sender));
        const { socket: recipientSocket } = await createAuthenticatedSocketClient(toAuthUser(recipient));

        const noEvent = expectNoSocketEvent(recipientSocket, SOCKET_EVENTS.NEW_MESSAGE, 700);
        senderSocket.emit(SOCKET_EVENTS.NEW_MESSAGE, {
            message: { content: 'forged' },
            conversationWith: entityId(sender),
        });

        await noEvent;

        await disconnectSocket(senderSocket);
        await disconnectSocket(recipientSocket);
    });

    it('does not join an unauthorized room when a client emits a fake join request', async () => {
        const attacker = await createUser({ role: UserRole.CLIENT, phone: '9222222223' });
        const victim = await createUser({ role: UserRole.CLIENT, phone: '9222222224' });
        const victimRoom = userRoom(entityId(victim));

        const { socket: attackerSocket } = await createAuthenticatedSocketClient(toAuthUser(attacker));
        attackerSocket.emit('join_room', { roomId: victimRoom });

        expect(getTestSocketIO().sockets.adapter.rooms.get(victimRoom)?.has(attackerSocket.id)).not.toBe(true);

        await disconnectSocket(attackerSocket);
    });

    it('uses the authenticated session identity instead of a spoofed from field in realtime send', async () => {
        const sender = await createUser({ role: UserRole.DIETITIAN });
        const recipient = await createUser({ role: UserRole.CLIENT, phone: '9222222225' });

        const { socket: recipientSocket } = await createAuthenticatedSocketClient(toAuthUser(recipient));
        const securedEvent = waitForSocketEvent<any>(recipientSocket, 'secure_event');
        const route = await import('@/app/api/realtime/send/route');

        const result = await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/realtime/send',
            user: sender,
            body: {
                userId: entityId(recipient),
                event: 'secure_event',
                data: {
                    from: 'spoofed-user-id',
                    payload: 'hello',
                },
            },
        });

        const payload = await securedEvent;

        expect(result.status).toBe(200);
        expect(payload.from).toBe(entityId(sender));
        expect(payload.payload).toBe('hello');
        expect(payload.timestamp).toEqual(expect.any(Number));

        await disconnectSocket(recipientSocket);
    });
});