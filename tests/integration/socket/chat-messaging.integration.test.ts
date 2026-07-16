import Message from '@/lib/db/models/Message';
import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';
import { UserRole } from '@/types';
import { entityId, expectISTISOString } from '../../utils/assertions';
import {
    createAssignedDietitianClientPair,
    createUser,
    ensureDatabaseConnection,
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

describe('Socket.io chat messaging delivery', () => {
    it('delivers a client message to the assigned dietitian in real time with IST timestamps', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const { socket: clientSocket } = await createAuthenticatedSocketClient(toAuthUser(client));
        const { socket: dietitianSocket } = await createAuthenticatedSocketClient(toAuthUser(dietitian));
        const route = await import('@/app/api/client/messages/route');

        const recipientEvent = waitForSocketEvent<any>(dietitianSocket, SOCKET_EVENTS.NEW_MESSAGE);
        const senderEvent = waitForSocketEvent<any>(clientSocket, SOCKET_EVENTS.NEW_MESSAGE);

        const result = await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/client/messages',
            user: client,
            body: {
                recipientId: entityId(dietitian),
                content: 'Client hello',
            },
        });

        const [dietitianPayload, clientPayload] = await Promise.all([recipientEvent, senderEvent]);

        expect(result.status).toBe(200);
        expect(dietitianPayload.conversationWith).toBe(entityId(client));
        expect(clientPayload.conversationWith).toBe(entityId(dietitian));
        expect(dietitianPayload.message.content).toBe('Client hello');
        expect(entityId(dietitianPayload.message.sender)).toBe(entityId(client));
        expect(entityId(dietitianPayload.message.receiver)).toBe(entityId(dietitian));
        expectISTISOString(dietitianPayload.message.createdAt);
        expect(Math.abs(Date.now() - dietitianPayload.timestamp)).toBeLessThan(3000);

        await disconnectSocket(clientSocket);
        await disconnectSocket(dietitianSocket);
    });

    it('delivers a dietitian message to the client in the reverse direction', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const { socket: clientSocket } = await createAuthenticatedSocketClient(toAuthUser(client));
        const { socket: dietitianSocket } = await createAuthenticatedSocketClient(toAuthUser(dietitian));
        const route = await import('@/app/api/messages/route');

        const recipientEvent = waitForSocketEvent<any>(clientSocket, SOCKET_EVENTS.NEW_MESSAGE);
        const senderEvent = waitForSocketEvent<any>(dietitianSocket, SOCKET_EVENTS.NEW_MESSAGE);

        const result = await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/messages',
            user: dietitian,
            body: {
                recipientId: entityId(client),
                content: 'Dietitian reply',
            },
        });

        const [clientPayload, dietitianPayload] = await Promise.all([recipientEvent, senderEvent]);

        expect(result.status).toBe(201);
        expect(clientPayload.message.content).toBe('Dietitian reply');
        expect(entityId(clientPayload.message.sender)).toBe(entityId(dietitian));
        expect(clientPayload.conversationWith).toBe(entityId(dietitian));
        expect(dietitianPayload.conversationWith).toBe(entityId(client));

        await disconnectSocket(clientSocket);
        await disconnectSocket(dietitianSocket);
    });

    it('does not leak a message to an unrelated third socket', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const unrelatedUser = await createUser({ role: UserRole.CLIENT, phone: '9888888888' });

        const { socket: clientSocket } = await createAuthenticatedSocketClient(toAuthUser(client));
        const { socket: dietitianSocket } = await createAuthenticatedSocketClient(toAuthUser(dietitian));
        const { socket: unrelatedSocket } = await createAuthenticatedSocketClient(toAuthUser(unrelatedUser));
        const route = await import('@/app/api/client/messages/route');

        const recipientEvent = waitForSocketEvent<any>(dietitianSocket, SOCKET_EVENTS.NEW_MESSAGE);
        const senderEvent = waitForSocketEvent<any>(clientSocket, SOCKET_EVENTS.NEW_MESSAGE);
        const noLeak = expectNoSocketEvent(unrelatedSocket, SOCKET_EVENTS.NEW_MESSAGE, 700);

        await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/client/messages',
            user: client,
            body: {
                recipientId: entityId(dietitian),
                content: 'Private message only',
            },
        });

        await Promise.all([recipientEvent, senderEvent, noLeak]);

        await disconnectSocket(clientSocket);
        await disconnectSocket(dietitianSocket);
        await disconnectSocket(unrelatedSocket);
    });

    it('delivers multiple rapid messages in the correct order', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const { socket: dietitianSocket } = await createAuthenticatedSocketClient(toAuthUser(dietitian));
        const route = await import('@/app/api/client/messages/route');
        const contents = ['one', 'two', 'three'];

        const payloadsPromise = new Promise<any[]>((resolve, reject) => {
            const received: any[] = [];
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Timed out waiting for rapid message sequence'));
            }, 4000);

            const handler = (payload: any) => {
                received.push(payload);
                if (received.length === contents.length) {
                    cleanup();
                    resolve(received);
                }
            };

            const cleanup = () => {
                clearTimeout(timeout);
                dietitianSocket.off(SOCKET_EVENTS.NEW_MESSAGE, handler);
            };

            dietitianSocket.on(SOCKET_EVENTS.NEW_MESSAGE, handler);
        });

        for (const content of contents) {
            await invokeRoute(route.POST, {
                method: 'POST',
                url: 'http://localhost/api/client/messages',
                user: client,
                body: {
                    recipientId: entityId(dietitian),
                    content,
                },
            });
        }

        const messages = await payloadsPromise;
        expect(messages.map((payload) => payload.message.content)).toEqual(contents);

        await disconnectSocket(dietitianSocket);
    });

    it('persists the message even when the recipient socket is offline', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const route = await import('@/app/api/client/messages/route');

        const result = await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/client/messages',
            user: client,
            body: {
                recipientId: entityId(dietitian),
                content: 'Persist even offline',
            },
        });

        await ensureDatabaseConnection();
        const storedMessage = await Message.findOne({
            sender: entityId(client),
            receiver: entityId(dietitian),
            content: 'Persist even offline',
        });

        expect(result.status).toBe(200);
        expect(storedMessage).not.toBeNull();
        expect(storedMessage?.content).toBe('Persist even offline');
    });
});