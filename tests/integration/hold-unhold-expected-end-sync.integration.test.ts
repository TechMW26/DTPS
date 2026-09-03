/// <reference types="jest" />

import mongoose from 'mongoose';
import request from 'supertest';
import { getServerSession } from 'next-auth';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { ClientPurchase } from '@/lib/db/models/ServicePlan';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { entityId } from '../utils/assertions';
import {
    createAssignedDietitianClientPair,
    createUser,
    ensureDatabaseConnection,
} from '../utils/database';
import { createRouteTestServer } from '../utils/supertest-route';
import { getApplicableHoldExtensionMs } from '@/lib/status/holdExtension';

jest.mock('@/lib/utils/activityLogger', () => ({
    logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/status/computeClientStatus', () => ({
    __esModule: true,
    recalculateAndPersistClientStatus: jest.fn().mockResolvedValue('active'),
    computeClientStatusFromDocs: jest.fn().mockReturnValue('active'),
    updateClientStatusFromMealPlan: jest.fn().mockResolvedValue('active'),
}));

const MS_PER_DAY = 24 * 60 * 60 * 1000;

jest.setTimeout(60000);

function toSessionUser(user: any) {
    return {
        id: entityId(user),
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
    };
}

describe('unhold extends expected end dates across payment models (supertest)', () => {
    beforeEach(async () => {
        await ensureDatabaseConnection();
    });

    it('extends expectedEndDate for UnifiedPayment and ClientPurchase on unhold', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: `admin-unhold-sync-${Date.now()}@example.com`,
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        const baseExpectedEnd = new Date('2026-07-01T00:00:00.000Z');

        const unified = await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'Unified Test Plan',
            planCategory: 'general-wellness',
            durationDays: 30,
            baseAmount: 4000,
            finalAmount: 4000,
            amount: 4000,
            status: 'active',
            paymentStatus: 'paid',
            paymentType: 'subscription',
            expectedStartDate: new Date('2026-06-01T00:00:00.000Z'),
            expectedEndDate: baseExpectedEnd,
            endDate: baseExpectedEnd,
        });

        const legacy = await ClientPurchase.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'Legacy Test Plan',
            durationDays: 30,
            durationLabel: '30 Days',
            status: 'active',
            paymentStatus: 'paid',
            expectedStartDate: new Date('2026-06-01T00:00:00.000Z'),
            expectedEndDate: baseExpectedEnd,
            endDate: baseExpectedEnd,
            finalAmount: 4000,
            baseAmount: 4000,
        });

        // Use deterministic historical hold window so unhold computes a predictable delta
        // without relying on fake timers (which can interfere with mongodb-memory-server hooks).
        const holdEnd = new Date('2026-06-20T12:00:00.000Z');
        const holdStart = new Date(holdEnd.getTime() - 5 * MS_PER_DAY);

        await User.findByIdAndUpdate(client._id, {
            $set: {
                'holdStatus.isOnHold': true,
                'holdStatus.holdDate': holdStart,
                'holdStatus.holdTime': '12:00:00',
                'holdStatus.heldBy': new mongoose.Types.ObjectId(entityId(admin)),
                clientStatus: 'hold',
            },
            $inc: { 'holdStatus.holdCount': 1 },
            $push: {
                holdStatusHistory: {
                    action: 'hold',
                    performedBy: new mongoose.Types.ObjectId(entityId(admin)),
                    performedByName: `${admin.firstName} ${admin.lastName}`,
                    performedByRole: 'Admin',
                    timestamp: holdStart,
                },
            },
        });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const route = await import('@/app/api/admin/clients/[clientId]/hold/route');
        const handler = async (req: any) => (route.DELETE as any)(req, {
            params: Promise.resolve({ clientId: entityId(client) }),
        });
        const server = createRouteTestServer(handler);

        try {
            const response = await request(server)
                .delete(`/api/admin/clients/${entityId(client)}/hold`)
                .send({ reason: 'resume after hold' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.endDateExtension).toBeTruthy();

            const refreshedUnified: any = await UnifiedPayment.findById(unified._id).lean();
            const refreshedLegacy: any = await ClientPurchase.findById(legacy._id).lean();

            const unifiedExpected = new Date(refreshedUnified.expectedEndDate).getTime();
            const unifiedEnd = new Date(refreshedUnified.endDate).getTime();
            const unifiedOriginal = new Date(refreshedUnified.originalExpectedEndDate).getTime();
            const legacyExpected = new Date(refreshedLegacy.expectedEndDate).getTime();
            const legacyEnd = new Date(refreshedLegacy.endDate).getTime();

            // Unified window is shifted and endDate kept in sync.
            expect(unifiedExpected).toBeGreaterThan(baseExpectedEnd.getTime());
            expect(unifiedEnd).toBe(unifiedExpected);
            // Original expected end date is preserved exactly once.
            expect(unifiedOriginal).toBe(baseExpectedEnd.getTime());

            // Legacy purchase is also shifted and aligned with unified date.
            expect(legacyExpected).toBeGreaterThan(baseExpectedEnd.getTime());
            expect(legacyEnd).toBe(legacyExpected);
            expect(legacyExpected).toBe(unifiedExpected);

            // Audit accumulator should equal the actual millis shift applied.
            expect(refreshedUnified.holdExtensionMs).toBe(unifiedExpected - unifiedOriginal);

            expect(response.body.endDateExtension.extendedPurchasesCount).toBeGreaterThanOrEqual(2);

            const refreshedClient: any = await User.findById(client._id).lean();
            expect(refreshedClient.holdStatus.isOnHold).toBe(false);
        } finally {
            server.close();
        }
    });

    it('does not extend a purchase when the hold ends before its service starts', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: `admin-prestart-hold-${Date.now()}@example.com`,
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        const now = new Date();
        const expectedStart = new Date(now.getTime() + 10 * MS_PER_DAY);
        const expectedEnd = new Date(expectedStart.getTime() + 30 * MS_PER_DAY);
        const holdStart = new Date(now.getTime() - 5 * MS_PER_DAY);

        const unified = await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'Unstarted Unified Plan',
            planCategory: 'general-wellness',
            durationDays: 30,
            baseAmount: 4000,
            finalAmount: 4000,
            amount: 4000,
            status: 'active',
            paymentStatus: 'paid',
            paymentType: 'subscription',
            expectedStartDate: expectedStart,
            expectedEndDate: expectedEnd,
            endDate: expectedEnd,
            daysUsed: 0,
            remainingDays: 30,
            mealPlanCreated: false,
        });

        const legacy = await ClientPurchase.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'Unstarted Legacy Plan',
            durationDays: 30,
            durationLabel: '30 Days',
            status: 'active',
            paymentStatus: 'paid',
            expectedStartDate: expectedStart,
            expectedEndDate: expectedEnd,
            endDate: expectedEnd,
            finalAmount: 4000,
            baseAmount: 4000,
            daysUsed: 0,
            remainingDays: 30,
            mealPlanCreated: false,
        });

        await User.findByIdAndUpdate(client._id, {
            $set: {
                'holdStatus.isOnHold': true,
                'holdStatus.holdDate': holdStart,
                'holdStatus.holdTime': '12:00:00',
                'holdStatus.heldBy': new mongoose.Types.ObjectId(entityId(admin)),
                clientStatus: 'hold',
            },
        });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });
        const route = await import('@/app/api/admin/clients/[clientId]/hold/route');
        const server = createRouteTestServer((req) => route.DELETE(req, {
            params: Promise.resolve({ clientId: entityId(client) }),
        }));

        try {
            const response = await request(server)
                .delete(`/api/admin/clients/${entityId(client)}/hold`)
                .send({ reason: 'activate before first phase' });

            expect(response.status).toBe(200);
            expect(response.body.endDateExtension.extendedPurchasesCount).toBe(0);

            const refreshedUnified: any = await UnifiedPayment.findById(unified._id).lean();
            const refreshedLegacy: any = await ClientPurchase.findById(legacy._id).lean();
            expect(new Date(refreshedUnified.expectedEndDate).getTime()).toBe(expectedEnd.getTime());
            expect(new Date(refreshedUnified.endDate).getTime()).toBe(expectedEnd.getTime());
            expect(refreshedUnified.holdExtensionMs || 0).toBe(0);
            expect(new Date(refreshedLegacy.expectedEndDate).getTime()).toBe(expectedEnd.getTime());
            expect(new Date(refreshedLegacy.endDate).getTime()).toBe(expectedEnd.getTime());
        } finally {
            server.close();
        }
    });

    it('counts only the hold period after a future service start', () => {
        const holdStart = new Date('2026-08-20T00:00:00.000Z');
        const serviceStart = new Date('2026-08-22T00:00:00.000Z');
        const holdEnd = new Date('2026-08-25T00:00:00.000Z');

        expect(getApplicableHoldExtensionMs({
            expectedStartDate: serviceStart,
            expectedEndDate: new Date('2026-09-20T00:00:00.000Z'),
            daysUsed: 0,
            mealPlanCreated: false,
        }, holdStart, holdEnd)).toBe(3 * MS_PER_DAY);
    });
});
