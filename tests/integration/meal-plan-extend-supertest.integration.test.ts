/// <reference types="jest" />

import request from 'supertest';
import { getServerSession } from 'next-auth';
import PaymentLink from '@/lib/db/models/PaymentLink';
import ServicePlan, { ClientPurchase } from '@/lib/db/models/ServicePlan';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
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

describe('meal plan extend expected-end integrations (supertest + jest)', () => {
    beforeEach(async () => {
        await ensureDatabaseConnection();
    });

    it('extends linked purchase expected end date and keeps meal plan end date unchanged', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: 'admin-extend-expected-end@example.com',
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        const servicePlan = await ServicePlan.create({
            name: 'Expected End Plan',
            category: 'general-wellness',
            description: 'Plan with extend days for integration test',
            pricingTiers: [
                {
                    durationDays: 30,
                    durationLabel: '30 Days',
                    amount: 2500,
                    maxDiscount: 0,
                    extendDays: 10,
                    freezeDays: 0,
                    isActive: true,
                },
            ],
            features: ['Meal planning'],
            isActive: true,
            showToClients: true,
            maxDiscountPercent: 0,
            createdBy: admin._id,
        });

        const paymentLink = await PaymentLink.create({
            client: client._id,
            dietitian: dietitian._id,
            amount: 2500,
            tax: 0,
            discount: 0,
            finalAmount: 2500,
            planName: 'Expected End Plan',
            planCategory: 'general-wellness',
            duration: '30 Days',
            durationDays: 30,
            servicePlanId: servicePlan._id,
            status: 'paid',
            paidAt: new Date('2026-05-01T00:00:00.000Z'),
        });

        const expectedEndBefore = new Date('2026-05-31T00:00:00.000Z');
        const expectedStart = new Date('2026-05-01T00:00:00.000Z');

        const legacyPurchase = await ClientPurchase.create({
            client: client._id,
            dietitian: dietitian._id,
            servicePlan: servicePlan._id,
            paymentLink: paymentLink._id,
            planName: 'Expected End Plan',
            planCategory: 'general-wellness',
            durationDays: 30,
            durationLabel: '30 Days',
            selectedTier: {
                durationDays: 30,
                durationLabel: '30 Days',
                amount: 2500,
                extendDays: 10,
                freezeDays: 0,
            },
            paymentStatus: 'paid',
            status: 'active',
            expectedStartDate: expectedStart,
            expectedEndDate: expectedEndBefore,
            endDate: expectedEndBefore,
            mealPlanCreated: true,
        });

        const unifiedPurchase = await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            servicePlan: servicePlan._id,
            paymentLink: paymentLink._id,
            planName: 'Expected End Plan',
            planCategory: 'general-wellness',
            durationDays: 30,
            durationLabel: '30 Days',
            baseAmount: 2500,
            finalAmount: 2500,
            amount: 2500,
            status: 'paid',
            paymentStatus: 'paid',
            expectedStartDate: expectedStart,
            expectedEndDate: expectedEndBefore,
            endDate: expectedEndBefore,
            mealPlanCreated: true,
            paidAt: new Date('2026-05-01T00:00:00.000Z'),
        });

        const mealPlanEndDate = new Date('2026-05-31T00:00:00.000Z');
        const mealPlan = await ClientMealPlan.create({
            clientId: client._id,
            dietitianId: dietitian._id,
            purchaseId: legacyPurchase._id,
            name: 'Client Meal Plan - Phase 1',
            meals: [],
            startDate: expectedStart,
            endDate: mealPlanEndDate,
            duration: 30,
            status: 'active',
            goals: {
                primaryGoal: 'weight-loss',
            },
        });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const route = await import('@/app/api/client-meal-plans/[id]/extend/route');
        const mealPlanId = entityId(mealPlan);
        const server = createRouteTestServer((nextRequest) =>
            route.POST(nextRequest, { params: Promise.resolve({ id: mealPlanId }) })
        );

        try {
            const response = await request(server)
                .post(`/api/client-meal-plans/${mealPlanId}/extend`)
                .send({ extendDays: 10 });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.extendInfo.remainingExtendDays).toBe(0);

            const expectedEndAfterIso = new Date('2026-06-10T00:00:00.000Z').toISOString();
            expect(new Date(response.body.extendInfo.newExpectedEndDate).toISOString()).toBe(expectedEndAfterIso);

            const refreshedMealPlan: any = await ClientMealPlan.findById(mealPlan._id).lean();
            expect(new Date(refreshedMealPlan.endDate).toISOString()).toBe(mealPlanEndDate.toISOString());
            expect(refreshedMealPlan.duration).toBe(30);

            const refreshedLegacyPurchase: any = await ClientPurchase.findById(legacyPurchase._id).lean();
            const refreshedUnifiedPurchase: any = await UnifiedPayment.findById(unifiedPurchase._id).lean();

            expect(refreshedLegacyPurchase?.durationDays).toBe(40);
            expect(refreshedUnifiedPurchase?.durationDays).toBe(40);
            expect(refreshedLegacyPurchase?.extendedDaysUsed).toBe(10);
            expect(refreshedUnifiedPurchase?.extendedDaysUsed).toBe(10);
            expect(new Date(refreshedLegacyPurchase?.expectedEndDate).toISOString()).toBe(expectedEndAfterIso);
            expect(new Date(refreshedUnifiedPurchase?.expectedEndDate).toISOString()).toBe(expectedEndAfterIso);

            const secondAttempt = await request(server)
                .post(`/api/client-meal-plans/${mealPlanId}/extend`)
                .send({ extendDays: 1 });

            expect(secondAttempt.status).toBe(400);
            expect(secondAttempt.body.success).toBe(false);
            expect(secondAttempt.body.error).toContain('No extend days remaining');

            const getServer = createRouteTestServer((nextRequest) =>
                route.GET(nextRequest, { params: Promise.resolve({ id: mealPlanId }) })
            );

            try {
                const extendInfoResponse = await request(getServer)
                    .get(`/api/client-meal-plans/${mealPlanId}/extend`);

                expect(extendInfoResponse.status).toBe(200);
                expect(extendInfoResponse.body.success).toBe(true);
                expect(extendInfoResponse.body.canExtend).toBe(false);
                expect(extendInfoResponse.body.remainingExtendDays).toBe(0);
                expect(new Date(extendInfoResponse.body.currentExpectedEndDate).toISOString()).toBe(expectedEndAfterIso);
            } finally {
                getServer.close();
            }
        } finally {
            server.close();
        }
    });
});