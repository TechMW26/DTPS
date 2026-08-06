import { socketManager } from '@/lib/realtime/socket-manager';
import { roleRoom, SOCKET_EVENTS, userRoom } from '@/lib/realtime/socket-events';
import { UserRole } from '@/types';
import { entityId } from '../../utils/assertions';
import { createUser } from '../../utils/database';
import { getTestSocketIO } from '../../utils/runtime';
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

describe('Socket.io room management', () => {
    it('auto-joins the authenticated user room and receives direct events', async () => {
        const user = await createUser({ role: UserRole.CLIENT, phone: '9555555551' });
        const { socket } = await createAuthenticatedSocketClient(toAuthUser(user));

        const userEvent = waitForSocketEvent<any>(socket, 'room_test_direct');
        socketManager.sendToUser(entityId(user), 'room_test_direct', { scope: 'user-room' });
        const payload = await userEvent;

        expect(payload).toEqual({ scope: 'user-room' });
        expect(getTestSocketIO().sockets.adapter.rooms.get(userRoom(entityId(user)))?.has(socket.id!)).toBe(true);

        await disconnectSocket(socket);
    });

    it('delivers role broadcasts only to sockets in the matching role room', async () => {
        const admin = await createUser({ role: UserRole.ADMIN });
        const dietitian = await createUser({ role: UserRole.DIETITIAN });

        const { socket: adminSocket } = await createAuthenticatedSocketClient(toAuthUser(admin));
        const { socket: dietitianSocket } = await createAuthenticatedSocketClient(toAuthUser(dietitian));

        const adminEvent = waitForSocketEvent<any>(adminSocket, 'role_test');
        const noDietitianEvent = expectNoSocketEvent(dietitianSocket, 'role_test', 700);

        socketManager.broadcastToRole(UserRole.ADMIN, 'role_test', { role: UserRole.ADMIN });

        const payload = await adminEvent;
        await noDietitianEvent;

        expect(payload).toEqual({ role: UserRole.ADMIN });
        expect(getTestSocketIO().sockets.adapter.rooms.get(roleRoom(UserRole.ADMIN))?.has(adminSocket.id!)).toBe(true);

        await disconnectSocket(adminSocket);
        await disconnectSocket(dietitianSocket);
    });

    it('receives personal and role-room events independently when a user belongs to both', async () => {
        const admin = await createUser({ role: UserRole.ADMIN });
        const { socket } = await createAuthenticatedSocketClient(toAuthUser(admin));

        const directEvent = waitForSocketEvent<any>(socket, 'dual_room_direct');
        const roleEvent = waitForSocketEvent<any>(socket, 'dual_room_role');

        socketManager.sendToUser(entityId(admin), 'dual_room_direct', { channel: 'user' });
        socketManager.broadcastToRole(UserRole.ADMIN, 'dual_room_role', { channel: 'role' });

        const [directPayload, rolePayload] = await Promise.all([directEvent, roleEvent]);

        expect(directPayload).toEqual({ channel: 'user' });
        expect(rolePayload).toEqual({ channel: 'role' });

        await disconnectSocket(socket);
    });

    it('removes room membership after disconnect', async () => {
        const user = await createUser({ role: UserRole.ADMIN });
        const { socket } = await createAuthenticatedSocketClient(toAuthUser(user));
        const userRoomName = userRoom(entityId(user));
        const roleRoomName = roleRoom(UserRole.ADMIN);

        expect(getTestSocketIO().sockets.adapter.rooms.get(userRoomName)?.has(socket.id!)).toBe(true);
        expect(getTestSocketIO().sockets.adapter.rooms.get(roleRoomName)?.has(socket.id!)).toBe(true);

        await disconnectSocket(socket);

        expect(getTestSocketIO().sockets.adapter.rooms.get(userRoomName)?.has(socket.id!)).not.toBe(true);
        expect(getTestSocketIO().sockets.adapter.rooms.get(roleRoomName)?.has(socket.id!)).not.toBe(true);
    });
});
