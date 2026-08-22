/// <reference types="jest" />

import request from 'supertest';
import { getServerSession } from 'next-auth';
import PaymentLink from '@/lib/db/models/PaymentLink';
import ServicePlan from '@/lib/db/models/ServicePlan';
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

function addDays(base: Date, days: number): Date {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

function toYMD(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function buildDailyMeals(startDate: Date, count: number) {
    return Array.from({ length: count }, (_, index) => ({
        date: toYMD(addDays(startDate, index)),
        day: `Day ${index + 1}`,
        meals: {},
    }));
}

function utcDayDiff(fromDate: Date, toDate: Date): number {
    const from = Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate());
    const to = Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate());
    return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function localCalendarDayDiff(fromDate: Date, toDate: Date): number {
    const from = Date.UTC(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const to = Date.UTC(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
    return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

describe('meal plan freeze/unfreeze integrations (supertest + jest)', () => {
    beforeEach(async () => {
        await ensureDatabaseConnection();
    });

    it('keeps phase duration from shrinking and preserves overall expected end extension across phases', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: 'admin-freeze-phase@example.com',
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        const servicePlan = await ServicePlan.create({
            name: 'Phase Freeze Plan',
            category: 'general-wellness',
            description: 'Multi-phase freeze/unfreeze behavior test',
            pricingTiers: [
                {
                    durationDays: 20,
                    durationLabel: '20 Days',
                    amount: 3200,
                    maxDiscount: 0,
                    extendDays: 0,
                    freezeDays: 10,
                    isActive: true,
                },
            ],
            features: ['Meal planning'],
            isActive: true,
            showToClients: true,
            maxDiscountPercent: 0,
            createdBy: admin._id,
        });

        const today = new Date();
        const phase1Start = addDays(today, 1);
        phase1Start.setUTCHours(0, 0, 0, 0);
        const phase1End = addDays(phase1Start, 9); // 10 days
        const phase2Start = addDays(phase1End, 1);
        const phase2End = addDays(phase2Start, 9); // 10 days

        const paymentLink = await PaymentLink.create({
            client: client._id,
            dietitian: dietitian._id,
            amount: 3200,
            tax: 0,
            discount: 0,
            finalAmount: 3200,
            planName: 'Phase Freeze Plan',
            planCategory: 'general-wellness',
            duration: '20 Days',
            durationDays: 20,
            servicePlanId: servicePlan._id,
            status: 'paid',
            paidAt: addDays(phase1Start, -1),
        });

        const unifiedPurchase = await UnifiedPayment.create({
            client: client._id,
            dietitian: dietitian._id,
            servicePlan: servicePlan._id,
            paymentLink: paymentLink._id,
            planName: 'Phase Freeze Plan',
            planCategory: 'general-wellness',
            durationDays: 20,
            durationLabel: '20 Days',
            baseAmount: 3200,
            finalAmount: 3200,
            amount: 3200,
            status: 'paid',
            paymentStatus: 'paid',
            expectedStartDate: phase1Start,
            expectedEndDate: phase2End,
            endDate: phase2End,
            mealPlanCreated: true,
            paidAt: addDays(phase1Start, -1),
        });

        const phase1 = await ClientMealPlan.create({
            clientId: client._id,
            dietitianId: dietitian._id,
            purchaseId: unifiedPurchase._id,
            phaseNumber: 1,
            phaseTag: 'PHASE-1',
            name: 'Phase 1',
            meals: [
                { date: toYMD(phase1Start), day: 'Day 1', meals: {} },
                { date: toYMD(addDays(phase1Start, 2)), day: 'Day 3', meals: {} },
                { date: toYMD(addDays(phase1Start, 4)), day: 'Day 5', meals: {} },
            ],
            startDate: phase1Start,
            endDate: phase1End,
            duration: 10,
            status: 'active',
            goals: { primaryGoal: 'weight-loss' },
        });

        const phase2 = await ClientMealPlan.create({
            clientId: client._id,
            dietitianId: dietitian._id,
            purchaseId: unifiedPurchase._id,
            phaseNumber: 2,
            phaseTag: 'PHASE-2',
            name: 'Phase 2',
            meals: buildDailyMeals(phase2Start, 10),
            startDate: phase2Start,
            endDate: phase2End,
            duration: 10,
            status: 'active',
            goals: { primaryGoal: 'weight-loss' },
        });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const route = await import('@/app/api/client-meal-plans/[id]/freeze/route');
        const phase2Id = entityId(phase2);

        const freezeServer = createRouteTestServer((nextRequest) =>
            route.POST(nextRequest, { params: Promise.resolve({ id: phase2Id }) })
        );

        const freezeDates = [
            toYMD(addDays(phase2Start, 7)),
            toYMD(addDays(phase2Start, 9)),
        ];

        const phase2BeforeFreeze: any = await ClientMealPlan.findById(phase2._id).lean();
        const purchaseBeforeFreeze: any = await UnifiedPayment.findById(unifiedPurchase._id).lean();

        try {
            const freezeResponse = await request(freezeServer)
                .post(`/api/client-meal-plans/${phase2Id}/freeze`)
                .send({ freezeDates, reason: 'Travel' });

            expect(freezeResponse.status).toBe(200);
            expect(freezeResponse.body.success).toBe(true);
            expect(Array.isArray(freezeResponse.body.data.frozenDates)).toBe(true);
            expect(freezeResponse.body.data.frozenDates.length).toBe(2);

            const freezeOriginalEnd = new Date(freezeResponse.body.data.originalEndDate);
            const freezeNewEnd = new Date(freezeResponse.body.data.newEndDate);
            expect(utcDayDiff(freezeOriginalEnd, freezeNewEnd)).toBe(2);

            const refreshedPhase2AfterFreeze: any = await ClientMealPlan.findById(phase2._id).lean();
            const refreshedPurchaseAfterFreeze: any = await UnifiedPayment.findById(unifiedPurchase._id).lean();

            expect(
                Math.abs(utcDayDiff(new Date(freezeResponse.body.data.newEndDate), new Date(refreshedPhase2AfterFreeze.endDate)))
            ).toBeLessThanOrEqual(1);
            expect(toYMD(new Date(refreshedPhase2AfterFreeze.endDate))).not.toBe(toYMD(phase2End));
            expect(
                localCalendarDayDiff(new Date(purchaseBeforeFreeze.expectedEndDate), new Date(refreshedPurchaseAfterFreeze.expectedEndDate))
            ).toBe(2);

            const unfreezeServer = createRouteTestServer((nextRequest) =>
                route.DELETE(nextRequest, { params: Promise.resolve({ id: phase2Id }) })
            );

            try {
                const unfreezeResponse = await request(unfreezeServer)
                    .delete(`/api/client-meal-plans/${phase2Id}/freeze`)
                    .send({ unfreezeDates: freezeDates });

                expect(unfreezeResponse.status).toBe(200);
                expect(unfreezeResponse.body.success).toBe(true);

                const refreshedPhase2AfterUnfreeze: any = await ClientMealPlan.findById(phase2._id).lean();
                const refreshedPurchaseAfterUnfreeze: any = await UnifiedPayment.findById(unifiedPurchase._id).lean();

                // Unfreeze must restore the original plan timeline and purchase expected end.
                expect(
                    utcDayDiff(new Date(refreshedPhase2AfterFreeze.endDate), new Date(refreshedPhase2AfterUnfreeze.endDate))
                ).toBeLessThan(0);
                expect(
                    Math.abs(utcDayDiff(new Date(phase2BeforeFreeze.endDate), new Date(refreshedPhase2AfterUnfreeze.endDate)))
                ).toBeLessThanOrEqual(1);
                expect(
                    Math.abs(utcDayDiff(new Date(purchaseBeforeFreeze.expectedEndDate), new Date(refreshedPurchaseAfterUnfreeze.expectedEndDate)))
                ).toBeLessThanOrEqual(1);

                // Original assigned duration remains intact and never changes.
                expect(refreshedPhase2AfterUnfreeze.duration).toBe(10);
                expect(refreshedPhase2AfterUnfreeze.totalFreezeCount).toBe(2);
            } finally {
                unfreezeServer.close();
            }
        } finally {
            freezeServer.close();
        }
    });

    it('supports a continuous pause that extends beyond the currently prepared diet', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: `admin-pause-window-${Date.now()}@example.com`,
        });
        const { client, dietitian } = await createAssignedDietitianClientPair();

        // Use the next local calendar day. At UTC-positive offsets, rounding a
        // UTC `now + 1 day` down to midnight can still produce today's local
        // date and incorrectly exercise the route's same-day safety guard.
        const pauseStart = new Date();
        pauseStart.setDate(pauseStart.getDate() + 1);
        pauseStart.setHours(12, 0, 0, 0);
        const preparedEnd = addDays(pauseStart, 1);
        const pauseDates = Array.from({ length: 8 }, (_, index) => toYMD(addDays(pauseStart, index)));

        const plan = await ClientMealPlan.create({
            clientId: client._id,
            dietitianId: dietitian._id,
            name: 'Two prepared days before eight-day pause',
            meals: buildDailyMeals(pauseStart, 2),
            startDate: pauseStart,
            endDate: preparedEnd,
            duration: 2,
            status: 'active',
            goals: { primaryGoal: 'weight-loss' },
        });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });
        const route = await import('@/app/api/client-meal-plans/[id]/freeze/route');
        const planId = entityId(plan);
        const server = createRouteTestServer((nextRequest) =>
            route.POST(nextRequest, { params: Promise.resolve({ id: planId }) })
        );

        try {
            const response = await request(server)
                .post(`/api/client-meal-plans/${planId}/freeze`)
                .send({ freezeDates: pauseDates, reason: 'Client requested pause' });

            expect(response.status).toBe(200);
            expect(response.body.data.frozenDates).toEqual(pauseDates);
            expect(response.body.data.addedMealDates).toEqual([
                toYMD(addDays(pauseStart, 8)),
                toYMD(addDays(pauseStart, 9)),
            ]);
            expect(response.body.data.newEndDate).toBe(toYMD(addDays(preparedEnd, 8)));

            const refreshed: any = await ClientMealPlan.findById(plan._id).lean();
            expect(refreshed.freezedDays).toHaveLength(8);
            expect(refreshed.duration).toBe(2);
            const recoveryDates = refreshed.meals
                .filter((meal: any) => meal.isFreezeRecovery)
                .map((meal: any) => toYMD(new Date(meal.date)));
            expect(recoveryDates).toEqual([
                toYMD(addDays(pauseStart, 8)),
                toYMD(addDays(pauseStart, 9)),
            ]);
        } finally {
            server.close();
        }
    });
});
