import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';
import { broadcastUnreadCounts } from '@/lib/realtime/broadcast-counts';
import { UserRole } from '@/types';
import { entityId } from '../../utils/assertions';
import {
    createMessageRecord,
    createNotificationRecord,
    createUser,
} from '../../utils/database';
import { invokeRoute } from '../../utils/routes';
import {
    createAuthenticatedSocketClient,
    disconnectSocket,
    expectNoSocketEvent,
    waitForSocketEvent,
} from '../../utils/socket';

function toAuthUser(user: any) {
    return {
        id: entityId(user),
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
    };
}

describe('Socket.io notification and unread-count delivery', () => {
    it('delivers unread count updates only to the intended target user', async () => {
        const clientA = await createUser({ role: UserRole.CLIENT, phone: '9777777771' });
        const clientB = await createUser({ role: UserRole.CLIENT, phone: '9777777772' });
        const clientC = await createUser({ role: UserRole.CLIENT, phone: '9777777773' });

        const { socket: socketA } = await createAuthenticatedSocketClient(toAuthUser(clientA));
        const { socket: socketB } = await createAuthenticatedSocketClient(toAuthUser(clientB));
        const { socket: socketC } = await createAuthenticatedSocketClient(toAuthUser(clientC));

        const targetEvent = waitForSocketEvent<any>(socketB, SOCKET_EVENTS.UNREAD_COUNTS);
        const noEventA = expectNoSocketEvent(socketA, SOCKET_EVENTS.UNREAD_COUNTS, 700);
        const noEventC = expectNoSocketEvent(socketC, SOCKET_EVENTS.UNREAD_COUNTS, 700);

        broadcastUnreadCounts(entityId(clientB), { notifications: 3, messages: 1 });

        const payload = await targetEvent;
        await Promise.all([noEventA, noEventC]);

        expect(payload).toEqual({ notifications: 3, messages: 1 });

        await disconnectSocket(socketA);
        await disconnectSocket(socketB);
        await disconnectSocket(socketC);
    });

    it('broadcasts the exact unread count payload from the refresh route', async () => {
        const user = await createUser({ role: UserRole.CLIENT, phone: '9777777780' });
        const sender = await createUser({ role: UserRole.DIETITIAN });

        await createNotificationRecord({ userId: user._id, message: 'one' });
        await createNotificationRecord({ userId: user._id, message: 'two' });
        await createMessageRecord({ sender: sender._id, receiver: user._id, content: 'offline message' });

        const { socket } = await createAuthenticatedSocketClient(toAuthUser(user));
        const unreadEvent = waitForSocketEvent<any>(socket, SOCKET_EVENTS.UNREAD_COUNTS);
        const route = await import('@/app/api/client/unread-counts/refresh/route');

        const result = await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/client/unread-counts/refresh',
            user,
        });

        const payload = await unreadEvent;

        expect(result.status).toBe(200);
        expect(result.json).toMatchObject({
            success: true,
            notifications: 2,
            messages: 1,
        });
        expect(payload).toEqual({ notifications: 2, messages: 1 });

        await disconnectSocket(socket);
    });

    it('surfaces offline notification counts after reconnect through the refresh recovery path', async () => {
        const user = await createUser({ role: UserRole.CLIENT, phone: '9777777781' });
        const sender = await createUser({ role: UserRole.DIETITIAN });

        await createNotificationRecord({ userId: user._id, message: 'while offline' });
        await createMessageRecord({ sender: sender._id, receiver: user._id, content: 'while offline message' });

        const { socket } = await createAuthenticatedSocketClient(toAuthUser(user));
        await expectNoSocketEvent(socket, SOCKET_EVENTS.UNREAD_COUNTS, 400);

        const unreadEvent = waitForSocketEvent<any>(socket, SOCKET_EVENTS.UNREAD_COUNTS);
        const route = await import('@/app/api/client/unread-counts/refresh/route');
        await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/client/unread-counts/refresh',
            user,
        });

        const payload = await unreadEvent;
        expect(payload).toEqual({ notifications: 1, messages: 1 });

        await disconnectSocket(socket);
    });
});