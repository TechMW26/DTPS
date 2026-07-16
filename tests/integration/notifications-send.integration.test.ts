import Notification from '@/lib/db/models/Notification';
import { UserRole } from '@/types';
import { entityId } from '../utils/assertions';
import { createUser, ensureDatabaseConnection } from '../utils/database';
import { invokeRoute } from '../utils/routes';

jest.mock('@/lib/firebase/firebaseNotification', () => ({
    sendNotificationToUser: jest.fn(),
}));

import { sendNotificationToUser } from '@/lib/firebase/firebaseNotification';

const mockedSendNotificationToUser = sendNotificationToUser as jest.MockedFunction<typeof sendNotificationToUser>;

describe('Admin notifications send API', () => {
    beforeEach(async () => {
        await ensureDatabaseConnection();
        mockedSendNotificationToUser.mockReset();
        mockedSendNotificationToUser.mockResolvedValue({
            successCount: 1,
            failureCount: 0,
            skippedNoToken: false,
        } as any);
    });

    it('POST /api/admin/notifications/send supports multiple selected clients', async () => {
        const route = await import('@/app/api/admin/notifications/send/route');

        const admin = await createUser({ role: UserRole.ADMIN });
        const clientOne = await createUser({ role: UserRole.CLIENT, phone: '9000000011' });
        const clientTwo = await createUser({ role: UserRole.CLIENT, phone: '9000000012' });
        const clientThree = await createUser({ role: UserRole.CLIENT, phone: '9000000013' });

        const result = await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/admin/notifications/send',
            user: admin,
            body: {
                title: 'Bulk test',
                body: 'Testing multiple client selection',
                targetType: 'particular',
                userIds: [entityId(clientOne), entityId(clientTwo), entityId(clientThree)],
                recipientRoles: [UserRole.CLIENT],
                data: { type: 'custom', url: '/user/notifications' },
            },
        });

        expect(result.status).toBe(200);
        expect(result.json.success).toBe(true);
        expect(result.json.stats.total).toBe(3);
        expect(result.json.stats.success).toBe(3);
        expect(mockedSendNotificationToUser).toHaveBeenCalledTimes(3);
    });

    it('GET /api/admin/notifications/send returns recipients with role filtering', async () => {
        const route = await import('@/app/api/admin/notifications/send/route');

        const admin = await createUser({ role: UserRole.ADMIN });
        await createUser({ role: UserRole.CLIENT, phone: '9000000021' });
        await createUser({ role: UserRole.CLIENT, phone: '9000000022' });
        await createUser({ role: UserRole.DIETITIAN });

        const result = await invokeRoute(route.GET, {
            method: 'GET',
            url: 'http://localhost/api/admin/notifications/send?roles=client',
            user: admin,
        });

        expect(result.status).toBe(200);
        expect(result.json.success).toBe(true);
        expect(Array.isArray(result.json.recipients)).toBe(true);
        expect(result.json.recipients.every((recipient: any) => recipient.role === UserRole.CLIENT)).toBe(true);
    });

    it('DELETE /api/admin/notifications/send deletes for selected users', async () => {
        const route = await import('@/app/api/admin/notifications/send/route');

        const admin = await createUser({ role: UserRole.ADMIN });
        const clientOne = await createUser({ role: UserRole.CLIENT, phone: '9000000031' });
        const clientTwo = await createUser({ role: UserRole.CLIENT, phone: '9000000032' });

        await Notification.create({
            userId: clientOne._id,
            title: 'N1',
            message: 'first',
            type: 'custom',
            read: false,
        });

        await Notification.create({
            userId: clientTwo._id,
            title: 'N2',
            message: 'second',
            type: 'custom',
            read: true,
        });

        const result = await invokeRoute(route.DELETE, {
            method: 'DELETE',
            url: 'http://localhost/api/admin/notifications/send',
            user: admin,
            body: {
                targetType: 'selected',
                recipientRoles: [UserRole.CLIENT],
                userIds: [entityId(clientOne), entityId(clientTwo)],
                readState: 'all',
            },
        });

        expect(result.status).toBe(200);
        expect(result.json.success).toBe(true);
        expect(result.json.stats.deletedNotifications).toBe(2);
        expect(result.json.stats.targetUsers).toBe(2);
    });

    it('POST /api/admin/notifications/send returns 401 for unauthenticated request', async () => {
        const route = await import('@/app/api/admin/notifications/send/route');

        const result = await invokeRoute(route.POST, {
            method: 'POST',
            url: 'http://localhost/api/admin/notifications/send',
            user: null,
            body: {
                title: 'Unauthorized',
                body: 'Should fail',
                targetType: 'all',
            },
        });

        expect(result.status).toBe(401);
        expect(result.json.success).toBe(false);
    });
});
