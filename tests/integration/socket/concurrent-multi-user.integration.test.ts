import { socketManager } from '@/lib/realtime/socket-manager';
import { UserRole } from '@/types';
import { entityId } from '../../utils/assertions';
import { createAssignedDietitianClientPair, createUser } from '../../utils/database';
import { createAuthenticatedSocketClient, disconnectSocket } from '../../utils/socket';

function toAuthUser(user: any) {
    return {
        id: entityId(user),
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
    };
}

describe('Socket.io concurrent multi-user scenarios', () => {
    it('delivers each targeted event only to its intended user across ten simultaneous clients', async () => {
        const users = await Promise.all(
            Array.from({ length: 10 }, (_, index) =>
                createUser({ role: UserRole.CLIENT, phone: `94444444${String(index).padStart(2, '0')}` })
            )
        );

        const clients = await Promise.all(users.map((user) => createAuthenticatedSocketClient(toAuthUser(user))));
        const receipts = new Map<string, string[]>();
        const completion = Promise.all(
            clients.map(async ({ socket }, index) => {
                const user = users[index];
                receipts.set(entityId(user), []);
                return new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        cleanup();
                        reject(new Error(`Timed out waiting for message for ${entityId(user)}`));
                    }, 3000);

                    const handler = (payload: any) => {
                        receipts.get(entityId(user))?.push(payload.target);
                        cleanup();
                        resolve();
                    };

                    const cleanup = () => {
                        clearTimeout(timeout);
                        socket.off('bulk_delivery_test', handler);
                    };

                    socket.on('bulk_delivery_test', handler);
                });
            })
        );

        users.forEach((user) => {
            socketManager.sendToUser(entityId(user), 'bulk_delivery_test', { target: entityId(user) });
        });

        await completion;

        for (const user of users) {
            expect(receipts.get(entityId(user))).toEqual([entityId(user)]);
        }

        await Promise.all(clients.map(({ socket }) => disconnectSocket(socket)));
    });

    it('delivers simultaneous bidirectional events without duplication', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const { socket: clientSocket } = await createAuthenticatedSocketClient(toAuthUser(client));
        const { socket: dietitianSocket } = await createAuthenticatedSocketClient(toAuthUser(dietitian));

        const clientReceipt = new Promise<any[]>((resolve, reject) => {
            const payloads: any[] = [];
            const timeout = setTimeout(() => reject(new Error('Timed out waiting for client receipts')), 3000);

            const handler = (payload: any) => {
                payloads.push(payload);
                if (payloads.length === 1) {
                    clearTimeout(timeout);
                    clientSocket.off('simul_message', handler);
                    resolve(payloads);
                }
            };

            clientSocket.on('simul_message', handler);
        });

        const dietitianReceipt = new Promise<any[]>((resolve, reject) => {
            const payloads: any[] = [];
            const timeout = setTimeout(() => reject(new Error('Timed out waiting for dietitian receipts')), 3000);

            const handler = (payload: any) => {
                payloads.push(payload);
                if (payloads.length === 1) {
                    clearTimeout(timeout);
                    dietitianSocket.off('simul_message', handler);
                    resolve(payloads);
                }
            };

            dietitianSocket.on('simul_message', handler);
        });

        await Promise.all([
            Promise.resolve().then(() => socketManager.sendToUser(entityId(client), 'simul_message', { from: entityId(dietitian) })),
            Promise.resolve().then(() => socketManager.sendToUser(entityId(dietitian), 'simul_message', { from: entityId(client) })),
        ]);

        const [clientEvents, dietitianEvents] = await Promise.all([clientReceipt, dietitianReceipt]);

        expect(clientEvents).toHaveLength(1);
        expect(dietitianEvents).toHaveLength(1);
        expect(clientEvents[0].from).toBe(entityId(dietitian));
        expect(dietitianEvents[0].from).toBe(entityId(client));

        await disconnectSocket(clientSocket);
        await disconnectSocket(dietitianSocket);
    });

    it('handles rapid connect-disconnect cycles without corrupting online membership state', async () => {
        const users = await Promise.all(
            Array.from({ length: 5 }, (_, index) =>
                createUser({ role: UserRole.CLIENT, phone: `93333333${String(index).padStart(2, '0')}` })
            )
        );

        for (let cycle = 0; cycle < 3; cycle += 1) {
            const sockets = await Promise.all(users.map((user) => createAuthenticatedSocketClient(toAuthUser(user))));
            await Promise.all(sockets.map(({ socket }) => disconnectSocket(socket)));
        }

        await new Promise<void>((resolve, reject) => {
            const startedAt = Date.now();
            const interval = setInterval(() => {
                if (socketManager.getOnlineUsers().length === 0) {
                    clearInterval(interval);
                    resolve();
                    return;
                }

                if (Date.now() - startedAt > 2000) {
                    clearInterval(interval);
                    reject(new Error(`Online users were not cleared: ${socketManager.getOnlineUsers().join(', ')}`));
                }
            }, 25);
        });

        expect(socketManager.getOnlineUsers()).toEqual([]);
    });
});