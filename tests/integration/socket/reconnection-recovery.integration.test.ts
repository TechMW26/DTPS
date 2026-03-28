import { socketClient } from '@/lib/realtime/socket-client';
import { socketManager } from '@/lib/realtime/socket-manager';
import { entityId } from '../../utils/assertions';
import { createAssignedDietitianClientPair } from '../../utils/database';
import { invokeRoute } from '../../utils/routes';
import {
    createAuthenticatedSocketClient,
    createSessionToken,
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

describe('Socket.io reconnection and recovery', () => {
    it('rejoins personal rooms after reconnect and recovers missed messages through history', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const authUser = toAuthUser(client);

        const initialConnection = await createAuthenticatedSocketClient(authUser);
        await disconnectSocket(initialConnection.socket);

        const messageRoute = await import('@/app/api/messages/route');
        await invokeRoute(messageRoute.POST, {
            method: 'POST',
            url: 'http://localhost/api/messages',
            user: dietitian,
            body: {
                recipientId: entityId(client),
                content: 'Sent while reconnecting',
            },
        });

        const reconnected = await createAuthenticatedSocketClient(authUser, {
            token: await createSessionToken(authUser),
        });
        const personalEvent = waitForSocketEvent<any>(reconnected.socket, 'reconnect_probe');
        socketManager.sendToUser(entityId(client), 'reconnect_probe', { ok: true });

        const historyRoute = await import('@/app/api/client/messages/route');
        const history = await invokeRoute(historyRoute.GET, {
            method: 'GET',
            url: `http://localhost/api/client/messages?conversationWith=${entityId(dietitian)}`,
            user: client,
        });

        expect(await personalEvent).toEqual({ ok: true });
        expect(history.json.messages.some((message: any) => message.content === 'Sent while reconnecting')).toBe(true);

        await disconnectSocket(reconnected.socket);
    });

    it('exposes the configured reconnect policy for the client socket wrapper', () => {
        expect(socketClient.getReconnectPolicy()).toEqual({
            initialDelay: 1000,
            maxDelay: 30000,
            maxRetries: 15,
            multiplier: 1.5,
        });
    });

    it('preserves messages sent during a disconnect window so they can be fetched after reconnect', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const authUser = toAuthUser(client);
        const connection = await createAuthenticatedSocketClient(authUser);
        await disconnectSocket(connection.socket);

        const route = await import('@/app/api/messages/route');
        await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/messages',
            user: dietitian,
            body: {
                recipientId: entityId(client),
                content: 'first while offline',
            },
        });
        await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/messages',
            user: dietitian,
            body: {
                recipientId: entityId(client),
                content: 'second while offline',
            },
        });

        const reconnected = await createAuthenticatedSocketClient(authUser);
        const historyRoute = await import('@/app/api/client/messages/route');
        const history = await invokeRoute(historyRoute.GET, {
            method: 'GET',
            url: `http://localhost/api/client/messages?conversationWith=${entityId(dietitian)}`,
            user: client,
        });

        const offlineMessages = history.json.messages
            .map((message: any) => message.content)
            .filter((content: string) => content.includes('while offline'));

        expect(offlineMessages).toEqual(['first while offline', 'second while offline']);

        await disconnectSocket(reconnected.socket);
    });
});