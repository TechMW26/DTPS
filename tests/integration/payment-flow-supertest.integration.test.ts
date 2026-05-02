/// <reference types="jest" />

import mongoose from 'mongoose';
import request from 'supertest';
import { getServerSession } from 'next-auth';
import PaymentLink from '@/lib/db/models/PaymentLink';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import '@/lib/db/models/ServicePlan';
import { UserRole } from '@/types';
import { entityId } from '../utils/assertions';
import {
    createAssignedDietitianClientPair,
    createUser,
    ensureDatabaseConnection,
} from '../utils/database';
import { createRouteTestServer } from '../utils/supertest-route';

function toSessionUser(user: any) {
    return {
        id: entityId(user),
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
    };
}

describe('payment flow integrations (supertest + jest)', () => {
    beforeEach(async () => {
        await ensureDatabaseConnection();
    });

    it('reconciles paid-proof links to paid status in payment-links GET', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: 'admin-payment-links@example.com',
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        const paymentLink = await PaymentLink.create({
            client: client._id,
            dietitian: dietitian._id,
            amount: 2000,
            tax: 0,
            discount: 0,
            finalAmount: 2000,
            planName: 'Starter Plan',
            planCategory: 'weight-loss',
            duration: '30 Days',
            durationDays: 30,
            servicePlanId: new mongoose.Types.ObjectId(),
            status: 'expired',
            paidAt: new Date('2026-04-09T10:00:00.000Z'),
            expireDate: new Date('2026-04-01T00:00:00.000Z'),
        });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const route = await import('@/app/api/payment-links/route');
        const server = createRouteTestServer(route.GET);

        try {
            const response = await request(server)
                .get('/api/payment-links')
                .query({ clientId: entityId(client) });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            const returned = response.body.paymentLinks.find((item: any) =>
                String(item._id) === String(paymentLink._id)
            );
            expect(returned).toBeTruthy();
            expect(returned.status).toBe('paid');

            const stored: any = await PaymentLink.findById(paymentLink._id).lean();
            expect(stored?.status).toBe('paid');
        } finally {
            server.close();
        }
    });

    it('backfills paid links into unified purchases and enables planning', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: 'admin-client-purchases-check@example.com',
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        const paymentLink = await PaymentLink.create({
            client: client._id,
            dietitian: dietitian._id,
            amount: 4000,
            tax: 0,
            discount: 0,
            finalAmount: 4000,
            planName: 'Monthly Plan',
            planCategory: 'general-wellness',
            duration: '1 Month',
            servicePlanId: new mongoose.Types.ObjectId(),
            status: 'paid',
            paidAt: new Date('2026-04-10T07:30:00.000Z'),
        });

        const beforeCount = await UnifiedPayment.countDocuments({ client: client._id });
        expect(beforeCount).toBe(0);

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const route = await import('@/app/api/client-purchases/check/route');
        const server = createRouteTestServer(route.GET);

        try {
            const response = await request(server)
                .get('/api/client-purchases/check')
                .query({ clientId: entityId(client) });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.hasPaidPlan).toBe(true);
            expect(response.body.canCreateMealPlan).toBe(true);
            expect(response.body.remainingDays).toBeGreaterThan(0);
            expect(response.body.purchase.durationDays).toBe(30);

            const backfilled = await UnifiedPayment.findOne({ paymentLink: paymentLink._id }).lean();
            expect(backfilled).toBeTruthy();
            expect(backfilled?.paymentStatus).toBe('paid');
            expect(backfilled?.status).toBe('paid');
            expect(backfilled?.durationDays).toBe(30);
        } finally {
            server.close();
        }
    });

    it('keeps payment-link status paid when unified payment is already paid', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: 'admin-paid-priority@example.com',
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        const paymentLink = await PaymentLink.create({
            client: client._id,
            dietitian: dietitian._id,
            amount: 2500,
            tax: 0,
            discount: 0,
            finalAmount: 2500,
            planName: 'Premium Plan',
            planCategory: 'weight-loss',
            duration: '30 Days',
            durationDays: 30,
            servicePlanId: new mongoose.Types.ObjectId(),
            status: 'expired',
            expireDate: new Date('2026-03-01T00:00:00.000Z'),
        });

        await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            paymentLink: paymentLink._id,
            planName: 'Premium Plan',
            planCategory: 'weight-loss',
            durationDays: 30,
            durationLabel: '30 Days',
            baseAmount: 2500,
            finalAmount: 2500,
            amount: 2500,
            status: 'paid',
            paymentStatus: 'paid',
            paidAt: new Date('2026-03-01T09:00:00.000Z'),
        });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const route = await import('@/app/api/payment-links/route');
        const server = createRouteTestServer(route.GET);

        try {
            const response = await request(server)
                .get('/api/payment-links')
                .query({ clientId: entityId(client) });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            const returned = response.body.paymentLinks.find((item: any) =>
                String(item._id) === String(paymentLink._id)
            );
            expect(returned).toBeTruthy();
            expect(returned.status).toBe('paid');
        } finally {
            server.close();
        }
    });

    it('returns correct remaining days when days counters exist but duration metadata is missing', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: 'admin-gargi-duration-fallback@example.com',
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        const now = new Date();
        const futureStart = new Date(now);
        futureStart.setDate(futureStart.getDate() + 30);
        const futureEnd = new Date(now);
        futureEnd.setDate(futureEnd.getDate() + 120);

        const inProgressWithoutDuration = await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'Gargi Plan - In Progress',
            planCategory: 'weight-loss',
            // Intentionally omit durationDays/durationLabel to verify fallback from day counters.
            baseAmount: 5000,
            finalAmount: 5000,
            amount: 5000,
            status: 'paid',
            paymentStatus: 'paid',
            expectedStartDate: futureStart,
            expectedEndDate: futureEnd,
            mealPlanCreated: false,
            daysUsed: 64,
            remainingDays: 26,
            paidAt: now,
        });

        await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'Gargi Plan - Fresh',
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
            paidAt: now,
        });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const route = await import('@/app/api/client-purchases/check/route');
        const server = createRouteTestServer(route.GET);

        try {
            const response = await request(server)
                .get('/api/client-purchases/check')
                .query({ clientId: entityId(client) });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.hasPaidPlan).toBe(true);

            expect(String(response.body.purchase?._id)).toBe(entityId(inProgressWithoutDuration));
            expect(response.body.purchase?.daysUsed).toBe(64);
            expect(response.body.purchase?.durationDays).toBe(90);
            expect(response.body.remainingDays).toBe(26);

            const reflectedPurchase = response.body.allPurchasesNeedingMealPlan?.find(
                (p: any) => String(p._id) === entityId(inProgressWithoutDuration)
            );
            expect(reflectedPurchase).toBeTruthy();
            expect(reflectedPurchase.daysUsed).toBe(64);
            expect(reflectedPurchase.remainingDays).toBe(26);
        } finally {
            server.close();
        }
    });

    it('keeps client-purchases GET aligned with check-route stored counters', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: 'admin-client-purchases-get-alignment@example.com',
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        const purchase = await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'Counter Alignment Plan',
            planCategory: 'general-wellness',
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
            paidAt: new Date('2026-04-12T07:30:00.000Z'),
        });

        await UnifiedPayment.collection.updateOne(
            { _id: purchase._id },
            { $set: { remainingDays: 10 } }
        );

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const listRoute = await import('@/app/api/client-purchases/route');
        const checkRoute = await import('@/app/api/client-purchases/check/route');
        const listServer = createRouteTestServer(listRoute.GET);
        const checkServer = createRouteTestServer(checkRoute.GET);

        try {
            const [listResponse, checkResponse] = await Promise.all([
                request(listServer)
                    .get('/api/client-purchases')
                    .query({ clientId: entityId(client) }),
                request(checkServer)
                    .get('/api/client-purchases/check')
                    .query({ clientId: entityId(client) }),
            ]);

            expect(listResponse.status).toBe(200);
            expect(listResponse.body.success).toBe(true);
            expect(checkResponse.status).toBe(200);
            expect(checkResponse.body.success).toBe(true);

            const listedPurchase = listResponse.body.purchases.find(
                (item: any) => String(item._id) === entityId(purchase)
            );

            expect(listedPurchase).toBeTruthy();
            expect(listedPurchase.daysUsed).toBe(64);
            expect(listedPurchase.remainingDays).toBe(10);
            expect(checkResponse.body.purchase?.daysUsed).toBe(64);
            expect(checkResponse.body.remainingDays).toBe(10);
        } finally {
            listServer.close();
            checkServer.close();
        }
    });

    it('clamps inconsistent stored remaining days so used plus remaining never exceeds total duration', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: 'admin-counter-consistency@example.com',
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        const inconsistentPurchase = await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'Inconsistent Counter Plan',
            planCategory: 'weight-loss',
            durationDays: 60,
            durationLabel: '60 Days',
            baseAmount: 3500,
            finalAmount: 3500,
            amount: 3500,
            status: 'paid',
            paymentStatus: 'paid',
            mealPlanCreated: true,
            daysUsed: 60,
            remainingDays: 1,
            paidAt: new Date('2026-04-10T07:30:00.000Z'),
        });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const route = await import('@/app/api/client-purchases/check/route');
        const server = createRouteTestServer(route.GET);

        try {
            const response = await request(server)
                .get('/api/client-purchases/check')
                .query({ clientId: entityId(client) });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(String(response.body.purchase?._id)).toBe(entityId(inconsistentPurchase));
            expect(response.body.purchase?.durationDays).toBe(60);
            expect(response.body.purchase?.daysUsed).toBe(60);
            expect(response.body.remainingDays).toBe(0);
            expect(response.body.canCreateMealPlan).toBe(false);
            expect(response.body.allPurchases).toEqual([]);
        } finally {
            server.close();
        }
    });

    it('prioritizes the relevant in-progress purchase when multiple partially used purchases exist', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: 'admin-multi-partial-priority@example.com',
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        const now = new Date();
        const inWindowStart = new Date(now);
        inWindowStart.setDate(inWindowStart.getDate() - 5);
        const inWindowEnd = new Date(now);
        inWindowEnd.setDate(inWindowEnd.getDate() + 25);

        await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'Older Partial Purchase',
            planCategory: 'general-wellness',
            durationDays: 90,
            durationLabel: '90 Days',
            baseAmount: 3000,
            finalAmount: 3000,
            amount: 3000,
            status: 'paid',
            paymentStatus: 'paid',
            expectedStartDate: inWindowStart,
            expectedEndDate: inWindowEnd,
            mealPlanCreated: true,
            daysUsed: 20,
            remainingDays: 70,
            paidAt: now,
        });

        const moreRelevantPartial = await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'Current Partial Purchase',
            planCategory: 'general-wellness',
            durationDays: 90,
            durationLabel: '90 Days',
            baseAmount: 3200,
            finalAmount: 3200,
            amount: 3200,
            status: 'paid',
            paymentStatus: 'paid',
            expectedStartDate: inWindowStart,
            expectedEndDate: inWindowEnd,
            mealPlanCreated: true,
            daysUsed: 64,
            remainingDays: 26,
            paidAt: now,
        });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const route = await import('@/app/api/client-purchases/check/route');
        const server = createRouteTestServer(route.GET);

        try {
            const response = await request(server)
                .get('/api/client-purchases/check')
                .query({ clientId: entityId(client) });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.hasPaidPlan).toBe(true);

            expect(String(response.body.purchase?._id)).toBe(entityId(moreRelevantPartial));
            expect(response.body.purchase?.daysUsed).toBe(64);
            expect(response.body.remainingDays).toBe(26);
        } finally {
            server.close();
        }
    });

    it('does not overwrite stored counters when Fix Days recalculation is triggered', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: 'admin-fix-days-preserve-counters@example.com',
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        const purchase = await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'Counter Source of Truth Plan',
            planCategory: 'general-wellness',
            durationDays: 180,
            durationLabel: '180 Days',
            baseAmount: 6000,
            finalAmount: 6000,
            amount: 6000,
            status: 'paid',
            paymentStatus: 'paid',
            mealPlanCreated: true,
            daysUsed: 160,
            remainingDays: 20,
            paidAt: new Date('2026-04-10T07:30:00.000Z'),
        });

        // Linked plan has only 10 days to emulate the old overwrite bug path.
        await ClientMealPlan.create({
            clientId: client._id,
            dietitianId: dietitian._id,
            purchaseId: purchase._id,
            name: 'Linked Plan With Short Duration',
            startDate: new Date('2026-04-01T00:00:00.000Z'),
            endDate: new Date('2026-04-10T00:00:00.000Z'),
            duration: 10,
            status: 'active',
            goals: {
                primaryGoal: 'maintenance',
            },
        });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const route = await import('@/app/api/client-purchases/route');
        const server = createRouteTestServer(route.PATCH);

        try {
            const response = await request(server)
                .patch('/api/client-purchases')
                .send({
                    action: 'recalculate',
                    purchaseId: entityId(purchase),
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.oldDaysUsed).toBe(160);
            expect(response.body.newDaysUsed).toBe(160);
            expect(response.body.remainingDays).toBe(20);
            expect(response.body.message).toContain('preserved');

            const refreshed: any = await UnifiedPayment.findById(purchase._id).lean();
            expect(refreshed).toBeTruthy();
            expect(refreshed.daysUsed).toBe(160);
            expect(refreshed.remainingDays).toBe(20);
        } finally {
            server.close();
        }
    });

    it('synchronizes remaining days when updating days used through client purchases PUT', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: 'admin-put-sync-days@example.com',
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        const purchase = await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            planName: 'PUT Sync Plan',
            planCategory: 'general-wellness',
            durationDays: 60,
            durationLabel: '60 Days',
            baseAmount: 3000,
            finalAmount: 3000,
            amount: 3000,
            status: 'paid',
            paymentStatus: 'paid',
            mealPlanCreated: true,
            daysUsed: 59,
            remainingDays: 1,
            paidAt: new Date('2026-04-10T07:30:00.000Z'),
        });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const route = await import('@/app/api/client-purchases/route');
        const server = createRouteTestServer(route.PUT);

        try {
            const response = await request(server)
                .put('/api/client-purchases')
                .send({
                    purchaseId: entityId(purchase),
                    daysUsed: 60,
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.totalDaysUsed).toBe(60);
            expect(response.body.remainingDays).toBe(0);

            const refreshed: any = await UnifiedPayment.findById(purchase._id).lean();
            expect(refreshed).toBeTruthy();
            expect(refreshed.daysUsed).toBe(60);
            expect(refreshed.remainingDays).toBe(0);
        } finally {
            server.close();
        }
    });
});
