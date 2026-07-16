import Message from '@/lib/db/models/Message';
import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';
import { entityId } from '../../utils/assertions';
import {
    createAssignedDietitianClientPair,
    createMessageRecord,
    ensureDatabaseConnection,
} from '../../utils/database';
import { invokeRoute } from '../../utils/routes';
import {
    createAuthenticatedSocketClient,
    disconnectSocket,
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

describe('Socket.io chat history loading and synchronization', () => {
    it('returns message history in chronological order for a conversation', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const first = new Date('2026-03-27T04:00:00.000Z');
        const second = new Date('2026-03-27T04:05:00.000Z');
        const third = new Date('2026-03-27T04:10:00.000Z');

        await createMessageRecord({ sender: client._id, receiver: dietitian._id, content: 'first', createdAt: first });
        await createMessageRecord({ sender: dietitian._id, receiver: client._id, content: 'second', createdAt: second, isRead: true });
        await createMessageRecord({ sender: client._id, receiver: dietitian._id, content: 'third', createdAt: third });

        const route = await import('@/app/api/messages/route');
        const result = await invokeRoute(route.GET, {
            method: 'GET',
            url: `http://localhost/api/messages?conversationWith=${entityId(client)}`,
            user: dietitian,
        });

        expect(result.status).toBe(200);
        expect(result.json.messages.map((message: any) => message.content)).toEqual(['first', 'second', 'third']);
    });

    it('makes offline messages available through history after reconnect', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const { socket: clientSocket } = await createAuthenticatedSocketClient(toAuthUser(client));
        await disconnectSocket(clientSocket);

        const route = await import('@/app/api/messages/route');
        await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/messages',
            user: dietitian,
            body: {
                recipientId: entityId(client),
                content: 'Missed while offline',
            },
        });

        const { socket: reconnectedClient } = await createAuthenticatedSocketClient(toAuthUser(client));
        const historyRoute = await import('@/app/api/client/messages/route');
        const history = await invokeRoute(historyRoute.GET, {
            method: 'GET',
            url: `http://localhost/api/client/messages?conversationWith=${entityId(dietitian)}`,
            user: client,
        });

        expect(history.status).toBe(200);
        expect(history.json.messages.some((message: any) => message.content === 'Missed while offline')).toBe(true);

        await disconnectSocket(reconnectedClient);
    });

    it('marks unread messages as read and broadcasts unread-count sync when history is opened', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        await createMessageRecord({ sender: dietitian._id, receiver: client._id, content: 'unread-1' });
        await createMessageRecord({ sender: dietitian._id, receiver: client._id, content: 'unread-2' });

        const { socket: clientSocket } = await createAuthenticatedSocketClient(toAuthUser(client));
        const unreadCountsEvent = waitForSocketEvent<any>(clientSocket, SOCKET_EVENTS.UNREAD_COUNTS);
        const historyRoute = await import('@/app/api/client/messages/route');

        const history = await invokeRoute(historyRoute.GET, {
            method: 'GET',
            url: `http://localhost/api/client/messages?conversationWith=${entityId(dietitian)}`,
            user: client,
        });

        const unreadPayload = await unreadCountsEvent;
        await ensureDatabaseConnection();
        const remainingUnread = await Message.countDocuments({
            sender: dietitian._id,
            receiver: client._id,
            isRead: false,
        });

        expect(history.status).toBe(200);
        expect(unreadPayload.messages).toBe(0);
        expect(remainingUnread).toBe(0);

        await disconnectSocket(clientSocket);
    });
});