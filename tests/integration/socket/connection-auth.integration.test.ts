import { UserRole } from '@/types';
import { createUser } from '../../utils/database';
import {
    attemptSocketConnection,
    createAuthenticatedSocketClient,
    createSessionToken,
    disconnectSocket,
} from '../../utils/socket';
import { entityId } from '../../utils/assertions';
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

describe('Socket.io connection and authentication', () => {
    it('accepts a valid auth token and emits a connected payload', async () => {
        const user = await createUser({ role: UserRole.DIETITIAN });

        const { socket, connectedPayload } = await createAuthenticatedSocketClient(toAuthUser(user));

        expect(connectedPayload).toMatchObject({
            status: 'connected',
            userId: entityId(user),
            socketId: socket.id,
        });
        expect(connectedPayload.timestamp).toEqual(expect.any(Number));

        await disconnectSocket(socket);
    });

    it('rejects a client with an expired token', async () => {
        const user = await createUser({ role: UserRole.CLIENT });
        const expiredToken = await createSessionToken(toAuthUser(user), { maxAge: -60 });

        const { error } = await attemptSocketConnection({ token: expiredToken });

        expect(error.message).toMatch(/Authentication/);
    });

    it('rejects a client with no token', async () => {
        const { error } = await attemptSocketConnection({});

        expect(error.message).toBe('Authentication required');
    });

    it('rejects a client with a malformed token', async () => {
        const { error } = await attemptSocketConnection({ token: 'malformed-token' });

        expect(error.message).toBe('Authentication failed');
    });

    it('rejects a client with a tampered token', async () => {
        const user = await createUser({ role: UserRole.ADMIN });
        const token = await createSessionToken(toAuthUser(user));
        const tokenParts = token.split('.');
        tokenParts[1] = `${tokenParts[1].slice(0, -1)}x`;
        const tamperedToken = tokenParts.join('.');

        const { error } = await attemptSocketConnection({ token: tamperedToken });

        expect(error.message).toBe('Authentication failed');
    });

    it('attaches authenticated identity to the server-side socket instance', async () => {
        const user = await createUser({ role: UserRole.HEALTH_COUNSELOR });
        const { socket } = await createAuthenticatedSocketClient(toAuthUser(user));

        const serverSocket = getTestSocketIO().sockets.sockets.get(socket.id);

        expect(serverSocket).toBeDefined();
        expect((serverSocket as any).userId).toBe(entityId(user));
        expect((serverSocket as any).userRole).toBe(UserRole.HEALTH_COUNSELOR);
        expect((serverSocket as any).firstName).toBe(user.firstName);
        expect((serverSocket as any).lastName).toBe(user.lastName);

        await disconnectSocket(socket);
    });
});