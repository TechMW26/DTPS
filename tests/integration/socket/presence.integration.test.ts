import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';
import { UserRole } from '@/types';
import { entityId } from '../../utils/assertions';
import { createUser } from '../../utils/database';
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

describe('Socket.io online and offline presence', () => {
    it('emits a user_online update to relevant peers when a user connects', async () => {
        const watcher = await createUser({ role: UserRole.DIETITIAN });
        const subject = await createUser({ role: UserRole.CLIENT, phone: '9666666666' });

        const { socket: watcherSocket } = await createAuthenticatedSocketClient(toAuthUser(watcher));
        const onlineEvent = waitForSocketEvent<any>(watcherSocket, SOCKET_EVENTS.USER_ONLINE);

        const { socket: subjectSocket } = await createAuthenticatedSocketClient(toAuthUser(subject));
        const payload = await onlineEvent;

        expect(payload.userId).toBe(entityId(subject));
        expect(payload.timestamp).toEqual(expect.any(Number));

        await disconnectSocket(subjectSocket);
        await disconnectSocket(watcherSocket);
    });

    it('emits a user_offline update on a clean disconnect', async () => {
        const watcher = await createUser({ role: UserRole.ADMIN });
        const subject = await createUser({ role: UserRole.CLIENT, phone: '9666666667' });

        const { socket: watcherSocket } = await createAuthenticatedSocketClient(toAuthUser(watcher));
        const { socket: subjectSocket } = await createAuthenticatedSocketClient(toAuthUser(subject));

        const offlineEvent = waitForSocketEvent<any>(watcherSocket, SOCKET_EVENTS.USER_OFFLINE);
        await disconnectSocket(subjectSocket);
        const payload = await offlineEvent;

        expect(payload.userId).toBe(entityId(subject));

        await disconnectSocket(watcherSocket);
    });

    it('emits user_offline when the connection drops unexpectedly', async () => {
        const watcher = await createUser({ role: UserRole.DIETITIAN });
        const subject = await createUser({ role: UserRole.CLIENT, phone: '9666666668' });

        const { socket: watcherSocket } = await createAuthenticatedSocketClient(toAuthUser(watcher));
        const { socket: subjectSocket } = await createAuthenticatedSocketClient(toAuthUser(subject));

        const offlineEvent = waitForSocketEvent<any>(watcherSocket, SOCKET_EVENTS.USER_OFFLINE, 4000);
        (subjectSocket.io.engine as any).close();
        const payload = await offlineEvent;

        expect(payload.userId).toBe(entityId(subject));

        await disconnectSocket(watcherSocket);
    });

    it('marks a user offline immediately on explicit logout-style disconnect', async () => {
        const watcher = await createUser({ role: UserRole.ADMIN });
        const subject = await createUser({ role: UserRole.CLIENT, phone: '9666666669' });

        const { socket: watcherSocket } = await createAuthenticatedSocketClient(toAuthUser(watcher));
        const { socket: subjectSocket } = await createAuthenticatedSocketClient(toAuthUser(subject));

        const startedAt = Date.now();
        const offlineEvent = waitForSocketEvent<any>(watcherSocket, SOCKET_EVENTS.USER_OFFLINE);
        await disconnectSocket(subjectSocket);
        const payload = await offlineEvent;

        expect(payload.userId).toBe(entityId(subject));
        expect(Date.now() - startedAt).toBeLessThan(1500);

        await disconnectSocket(watcherSocket);
    });
});