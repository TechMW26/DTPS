/// <reference types="jest" />

import request from 'supertest';
import { getServerSession } from 'next-auth';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import { UserRole } from '@/types';
import { entityId } from '../utils/assertions';
import {
    createAssignedDietitianClientPair,
    createUser,
    ensureDatabaseConnection,
} from '../utils/database';
import { createRouteTestServer } from '../utils/supertest-route';

jest.mock('@/lib/utils/activityLogger', () => ({
    logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/firebase/firebaseNotification', () => ({
    sendNotificationToUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/status/computeClientStatus', () => ({
    updateClientStatusFromMealPlan: jest.fn().mockResolvedValue('active'),
    recalculateAndPersistClientStatus: jest.fn().mockResolvedValue('active'),
    computeClientStatusFromDocs: jest.fn().mockReturnValue('active'),
}));

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

function addDays(base: Date, days: number): Date {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

function toYMD(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function buildPublishableMealsForDates(dates: string[], extra: Record<string, unknown> = {}) {
    return dates.map((date, idx) => ({
        date,
        day: `Day ${idx + 1}`,
        meals: {
            BREAKFAST: {
                foodOptions: [
                    {
                        food: 'Oats with milk',
                        foods: [{ food: 'Oats with milk', name: 'Oats with milk' }],
                    },
                ],
            },
        },
        ...extra,
    }));
}

describe('PUT /api/client-meal-plans/[id] – freeze recovery preservation', () => {
    beforeEach(async () => {
        await ensureDatabaseConnection();
    });

    async function setupFrozenPlan() {
        const { client, dietitian } = await createAssignedDietitianClientPair();

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const startDate = addDays(today, 1);
        const baseEndDate = addDays(startDate, 4); // 5 days
        const frozenOriginal = addDays(startDate, 2); // day 3
        const recoveryDate = addDays(baseEndDate, 1); // appended after baseEnd
        const finalEndDate = recoveryDate;

        const baseDayDates = [
            toYMD(startDate),
            toYMD(addDays(startDate, 1)),
            toYMD(frozenOriginal),
            toYMD(addDays(startDate, 3)),
            toYMD(baseEndDate),
        ];

        const baseMeals = buildPublishableMealsForDates(baseDayDates).map((meal, idx) => {
            if (idx === 2) return { ...meal, isFrozen: true };
            return meal;
        });

        const recoveryMeal = {
            ...buildPublishableMealsForDates([toYMD(recoveryDate)])[0],
            isFreezeRecovery: true,
            originalFreezeDate: toYMD(frozenOriginal),
            originalFreezeDateLabel: `Day 3 - ${frozenOriginal.toDateString()}`,
        };

        const plan = await ClientMealPlan.create({
            clientId: client._id,
            dietitianId: dietitian._id,
            name: 'Freeze Recovery Plan',
            startDate,
            endDate: finalEndDate,
            duration: 5,
            status: 'draft',
            meals: [...baseMeals, recoveryMeal],
            freezedDays: [
                {
                    date: frozenOriginal,
                    addedDate: toYMD(recoveryDate),
                    reason: 'Vacation',
                    frozenBy: 'dietitian',
                    createdAt: new Date(),
                },
            ],
            totalFreezeCount: 1,
            goals: { primaryGoal: 'weight-loss' },
        });

        return {
            client,
            dietitian,
            plan,
            startDate,
            baseEndDate,
            frozenOriginal,
            recoveryDate,
            baseDayDates,
        };
    }

    it('preserves recovery day on publish when the client payload drops it', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: `admin-freeze-publish-${Date.now()}@example.com`,
        });
        const { plan, recoveryDate, baseDayDates, frozenOriginal } = await setupFrozenPlan();

        // Client/UI sends ONLY the base 5 days (recovery day dropped) + status 'active'
        const incomingMeals = buildPublishableMealsForDates(baseDayDates);

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const route = await import('@/app/api/client-meal-plans/[id]/route');
        const planId = entityId(plan);
        const server = createRouteTestServer((req: any) =>
            (route.PUT as any)(req, { params: Promise.resolve({ id: planId }) })
        );

        try {
            const response = await request(server)
                .put(`/api/client-meal-plans/${planId}`)
                .send({ meals: incomingMeals, status: 'active' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            const stored: any = await ClientMealPlan.findById(plan._id).lean();
            expect(stored.status).toBe('active');

            // Recovery day must still be present
            const storedMealDates = stored.meals.map((m: any) =>
                toYMD(new Date(m.date))
            );
            expect(storedMealDates).toContain(toYMD(recoveryDate));

            const recoveryStored = stored.meals.find(
                (m: any) => toYMD(new Date(m.date)) === toYMD(recoveryDate)
            );
            expect(recoveryStored).toBeTruthy();
            expect(recoveryStored.isFreezeRecovery).toBe(true);
            expect(recoveryStored.originalFreezeDate).toBe(toYMD(frozenOriginal));

            // Originally frozen day inside base must retain isFrozen
            const frozenStored = stored.meals.find(
                (m: any) => toYMD(new Date(m.date)) === toYMD(frozenOriginal)
            );
            expect(frozenStored?.isFrozen).toBe(true);

            // endDate must extend to cover the recovery day
            expect(toYMD(new Date(stored.endDate))).toBe(toYMD(recoveryDate));

            expect(stored.freezedDays.length).toBe(1);
        } finally {
            server.close();
        }
    });

    it('preserves recovery metadata when the client edits content of a recovery day', async () => {
        const admin = await createUser({
            role: UserRole.ADMIN,
            email: `admin-freeze-edit-${Date.now()}@example.com`,
        });
        const { plan, recoveryDate, baseDayDates, frozenOriginal } = await setupFrozenPlan();

        // Client edits the recovery day's food but DROPS the freeze metadata flags.
        const editedRecoveryMeal = {
            date: toYMD(recoveryDate),
            day: 'Recovery (edited)',
            meals: {
                BREAKFAST: {
                    foodOptions: [
                        {
                            food: 'Idli & sambar (edited)',
                            foods: [{ food: 'Idli & sambar (edited)', name: 'Idli & sambar (edited)' }],
                        },
                    ],
                },
            },
        };

        const incomingMeals = [
            ...buildPublishableMealsForDates(baseDayDates),
            editedRecoveryMeal,
        ];

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });

        const route = await import('@/app/api/client-meal-plans/[id]/route');
        const planId = entityId(plan);
        const server = createRouteTestServer((req: any) =>
            (route.PUT as any)(req, { params: Promise.resolve({ id: planId }) })
        );

        try {
            const response = await request(server)
                .put(`/api/client-meal-plans/${planId}`)
                .send({ meals: incomingMeals, status: 'active' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            const stored: any = await ClientMealPlan.findById(plan._id).lean();
            const recoveryStored = stored.meals.find(
                (m: any) => toYMD(new Date(m.date)) === toYMD(recoveryDate)
            );

            expect(recoveryStored).toBeTruthy();
            // Edited content must be saved
            expect(recoveryStored.meals.BREAKFAST.foodOptions[0].food)
                .toBe('Idli & sambar (edited)');
            // …but freeze-recovery metadata must be force-restored
            expect(recoveryStored.isFreezeRecovery).toBe(true);
            expect(recoveryStored.originalFreezeDate).toBe(toYMD(frozenOriginal));
            expect(typeof recoveryStored.originalFreezeDateLabel).toBe('string');
        } finally {
            server.close();
        }
    });
});
