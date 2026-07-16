/// <reference types="jest" />

import request from 'supertest';
import { getServerSession } from 'next-auth';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { UserRole } from '@/types';
import { entityId } from '../utils/assertions';
import {
    createAssignedDietitianClientPair,
    createUser,
    ensureDatabaseConnection,
} from '../utils/database';
import { createRouteTestServer } from '../utils/supertest-route';

jest.mock('@/lib/import', () => {
    const UnifiedPaymentModel = require('@/lib/db/models/UnifiedPayment').default;

    return {
        __esModule: true,
        modelRegistry: new Map([
            ['UnifiedPayment', {
                model: UnifiedPaymentModel,
                displayName: 'Unified Payment',
                fields: [
                    { path: '_id', type: 'ObjectId', required: true },
                    { path: 'planName', type: 'String', required: false },
                    { path: 'daysUsed', type: 'Number', required: false },
                    { path: 'remainingDays', type: 'Number', required: false },
                    { path: 'createdAt', type: 'Date', required: false },
                    { path: 'client', type: 'ObjectId', required: false },
                ],
            }],
        ]),
    };
});

function toSessionUser(user: any) {
    return {
        id: entityId(user),
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
    };
}

describe('admin records sorting integrations (supertest + jest)', () => {
    beforeEach(async () => {
        await ensureDatabaseConnection();
    });

    it('sorts UnifiedPayment rows by daysUsed and remainingDays for admin table', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: 'admin-records-sorting@example.com',
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'Fresh Plan',
            planCategory: 'weight-loss',
            durationDays: 90,
            durationLabel: '90 Days',
            baseAmount: 4500,
            finalAmount: 4500,
            amount: 4500,
            status: 'paid',
            paymentStatus: 'paid',
            mealPlanCreated: false,
            daysUsed: 0,
            remainingDays: 90,
        });

        await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'In Progress Plan',
            planCategory: 'weight-loss',
            durationDays: 90,
            durationLabel: '90 Days',
            baseAmount: 4700,
            finalAmount: 4700,
            amount: 4700,
            status: 'paid',
            paymentStatus: 'paid',
            mealPlanCreated: true,
            daysUsed: 20,
            remainingDays: 70,
        });

        await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'Advanced Plan',
            planCategory: 'weight-loss',
            durationDays: 90,
            durationLabel: '90 Days',
            baseAmount: 5000,
            finalAmount: 5000,
            amount: 5000,
            status: 'paid',
            paymentStatus: 'paid',
            mealPlanCreated: true,
            daysUsed: 64,
            remainingDays: 26,
        });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const route = await import('@/app/api/admin/data/records/route');
        const server = createRouteTestServer(route.GET);

        try {
            const byDaysUsed = await request(server)
                .get('/api/admin/data/records')
                .query({ model: 'UnifiedPayment', sortBy: 'daysUsed', sortOrder: 'desc', page: 1, limit: 20 });

            expect(byDaysUsed.status).toBe(200);
            expect(byDaysUsed.body.success).toBe(true);
            expect(byDaysUsed.body.records.slice(0, 3).map((record: any) => record.daysUsed)).toEqual([64, 20, 0]);

            const byRemainingDays = await request(server)
                .get('/api/admin/data/records')
                .query({ model: 'UnifiedPayment', sortBy: 'remainingDays', sortOrder: 'asc', page: 1, limit: 20 });

            expect(byRemainingDays.status).toBe(200);
            expect(byRemainingDays.body.success).toBe(true);
            expect(byRemainingDays.body.records.slice(0, 3).map((record: any) => record.remainingDays)).toEqual([26, 70, 90]);
        } finally {
            server.close();
        }
    });
});
