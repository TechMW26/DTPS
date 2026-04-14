/// <reference types="jest" />

import mongoose from 'mongoose';
import request from 'supertest';
import { getServerSession } from 'next-auth';
import PaymentLink from '@/lib/db/models/PaymentLink';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
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
});
