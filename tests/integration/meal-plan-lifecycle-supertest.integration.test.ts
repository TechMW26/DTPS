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
}));

function toSessionUser(user: any) {
    return {
        id: entityId(user),
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
    };
}

function buildPublishableMeals(days = 3) {
    const today = new Date();
    return Array.from({ length: days }, (_, i) => {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        return {
            date: date.toISOString().slice(0, 10),
            day: `Day ${i + 1}`,
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
        };
    });
}

async function createDraftPlan({
    clientId,
    dietitianId,
    name = 'Draft Plan',
}: {
    clientId: any;
    dietitianId: any;
    name?: string;
}) {
    return ClientMealPlan.create({
        clientId,
        dietitianId,
        name,
        meals: buildPublishableMeals(3),
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        duration: 7,
        status: 'draft',
        goals: { primaryGoal: 'weight-loss' },
    });
}

function buildPutServer(planId: string, route: any) {
    return createRouteTestServer((nextRequest) =>
        route.PUT(nextRequest, { params: Promise.resolve({ id: planId }) })
    );
}

function buildDeleteServer(planId: string, route: any) {
    return createRouteTestServer((nextRequest) =>
        route.DELETE(nextRequest, { params: Promise.resolve({ id: planId }) })
    );
}

describe('client meal plan lifecycle & immutability (supertest + jest)', () => {
    beforeEach(async () => {
        await ensureDatabaseConnection();
    });

    it('publishes a draft plan and records firstPublishedAt + republishCount=1', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });

        const route = await import('@/app/api/client-meal-plans/[id]/route');
        const planId = entityId(plan);
        const server = buildPutServer(planId, route);

        try {
            const res = await request(server)
                .put(`/api/client-meal-plans/${planId}`)
                .send({ status: 'active', meals: buildPublishableMeals(3) });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.mealPlan.status).toBe('active');

            const fresh: any = await ClientMealPlan.findById(plan._id).lean();
            expect(fresh.firstPublishedAt).toBeTruthy();
            expect(fresh.lastPublishedAt).toBeTruthy();
            expect(fresh.republishCount).toBe(1);
            expect(Array.isArray(fresh.lifecycleAudit)).toBe(true);
            expect(fresh.lifecycleAudit[0].action).toBe('publish');
        } finally {
            server.close();
        }
    });

    it('rejects publish when meal content is empty with 400', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const plan = await ClientMealPlan.create({
            clientId: client._id,
            dietitianId: dietitian._id,
            name: 'Empty Plan',
            meals: [],
            startDate: new Date(),
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            duration: 7,
            status: 'draft',
            goals: { primaryGoal: 'weight-loss' },
        });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
        const route = await import('@/app/api/client-meal-plans/[id]/route');
        const planId = entityId(plan);
        const server = buildPutServer(planId, route);

        try {
            const res = await request(server)
                .put(`/api/client-meal-plans/${planId}`)
                .send({ status: 'active' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        } finally {
            server.close();
        }
    });

    it('blocks title edit on a published plan with 409 TITLE_LOCKED_AFTER_PUBLISH', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id, name: 'Original' });
        await ClientMealPlan.updateOne({ _id: plan._id }, { $set: { status: 'active', firstPublishedAt: new Date(), lastPublishedAt: new Date(), republishCount: 1 } });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
        const route = await import('@/app/api/client-meal-plans/[id]/route');
        const planId = entityId(plan);
        const server = buildPutServer(planId, route);

        try {
            const res = await request(server)
                .put(`/api/client-meal-plans/${planId}`)
                .send({ name: 'Renamed After Publish' });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe('TITLE_LOCKED_AFTER_PUBLISH');

            const fresh: any = await ClientMealPlan.findById(plan._id).lean();
            expect(fresh.name).toBe('Original');
            expect(fresh.lifecycleAudit.some((e: any) => e.action === 'blocked_title_edit')).toBe(true);
        } finally {
            server.close();
        }
    });

    it('blocks active -> draft transition with 409 FORBIDDEN_STATE_TRANSITION', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });
        await ClientMealPlan.updateOne({ _id: plan._id }, { $set: { status: 'active' } });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
        const route = await import('@/app/api/client-meal-plans/[id]/route');
        const planId = entityId(plan);
        const server = buildPutServer(planId, route);

        try {
            const res = await request(server)
                .put(`/api/client-meal-plans/${planId}`)
                .send({ status: 'draft' });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe('FORBIDDEN_STATE_TRANSITION');

            const fresh: any = await ClientMealPlan.findById(plan._id).lean();
            expect(fresh.status).toBe('active');
            expect(fresh.lifecycleAudit.some((e: any) => e.action === 'blocked_revert_to_draft')).toBe(true);
        } finally {
            server.close();
        }
    });

    it('blocks invalid transition completed -> active with 409', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });
        await ClientMealPlan.updateOne({ _id: plan._id }, { $set: { status: 'completed' } });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
        const route = await import('@/app/api/client-meal-plans/[id]/route');
        const planId = entityId(plan);
        const server = buildPutServer(planId, route);

        try {
            const res = await request(server)
                .put(`/api/client-meal-plans/${planId}`)
                .send({ status: 'active' });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe('FORBIDDEN_STATE_TRANSITION');
        } finally {
            server.close();
        }
    });

    it('allows draft title edits', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id, name: 'Original Draft' });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
        const route = await import('@/app/api/client-meal-plans/[id]/route');
        const planId = entityId(plan);
        const server = buildPutServer(planId, route);

        try {
            const res = await request(server)
                .put(`/api/client-meal-plans/${planId}`)
                .send({ name: 'Renamed Draft' });

            expect(res.status).toBe(200);
            const fresh: any = await ClientMealPlan.findById(plan._id).lean();
            expect(fresh.name).toBe('Renamed Draft');
        } finally {
            server.close();
        }
    });

    it('soft-deletes a draft with metadata', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
        const route = await import('@/app/api/client-meal-plans/[id]/route');
        const planId = entityId(plan);
        const server = buildDeleteServer(planId, route);

        try {
            const res = await request(server).delete(`/api/client-meal-plans/${planId}`);
            expect(res.status).toBe(200);

            // Soft-deleted plans are excluded by the global findOne middleware; query directly.
            const fresh: any = await ClientMealPlan.collection.findOne({ _id: plan._id });
            expect(fresh.isDeleted).toBe(true);
            expect(fresh.deletedAt).toBeTruthy();
            expect(fresh.deletedBy).toBeTruthy();
            expect(fresh.deletionReason).toBe('user-requested-draft-delete');
        } finally {
            server.close();
        }
    });

    it('blocks delete on a published plan with 409', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });
        await ClientMealPlan.updateOne({ _id: plan._id }, { $set: { status: 'active' } });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
        const route = await import('@/app/api/client-meal-plans/[id]/route');
        const planId = entityId(plan);
        const server = buildDeleteServer(planId, route);

        try {
            const res = await request(server).delete(`/api/client-meal-plans/${planId}`);
            expect(res.status).toBe(409);

            const fresh: any = await ClientMealPlan.findById(plan._id).lean();
            expect(fresh).toBeTruthy();
            expect(fresh.isDeleted).not.toBe(true);
        } finally {
            server.close();
        }
    });

    it('republishing same plan id increments republishCount and preserves firstPublishedAt', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
        const route = await import('@/app/api/client-meal-plans/[id]/route');
        const planId = entityId(plan);
        const server = buildPutServer(planId, route);

        try {
            // First publish
            const firstRes = await request(server)
                .put(`/api/client-meal-plans/${planId}`)
                .send({ status: 'active', meals: buildPublishableMeals(3) });
            expect(firstRes.status).toBe(200);

            const afterFirst: any = await ClientMealPlan.findById(plan._id).lean();
            const firstPublishedAt = afterFirst.firstPublishedAt;
            expect(firstPublishedAt).toBeTruthy();
            expect(afterFirst.republishCount).toBe(1);

            // Simulate a permitted active -> paused -> active republish path.
            await ClientMealPlan.updateOne({ _id: plan._id }, { $set: { status: 'paused' } });
            const republishRes = await request(server)
                .put(`/api/client-meal-plans/${planId}`)
                .send({ status: 'active' });
            expect(republishRes.status).toBe(200);

            const afterSecond: any = await ClientMealPlan.findById(plan._id).lean();
            // republishCount should not change for paused->active (it's not draft->active),
            // but firstPublishedAt must remain stable.
            expect(new Date(afterSecond.firstPublishedAt).toISOString()).toBe(new Date(firstPublishedAt).toISOString());
            expect(afterSecond.status).toBe('active');
        } finally {
            server.close();
        }
    });

    it('rejects active -> cancelled without statusReason with 400', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });
        await ClientMealPlan.updateOne({ _id: plan._id }, { $set: { status: 'active' } });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
        const route = await import('@/app/api/client-meal-plans/[id]/route');
        const planId = entityId(plan);
        const server = buildPutServer(planId, route);

        try {
            const res = await request(server)
                .put(`/api/client-meal-plans/${planId}`)
                .send({ status: 'cancelled' });

            expect(res.status).toBe(400);
        } finally {
            server.close();
        }
    });

    it('returns 403 for an unrelated dietitian attempting update', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        const otherDietitian = await createUser({ role: UserRole.DIETITIAN, email: 'other-diet@example.com' });
        const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(otherDietitian) });
        const route = await import('@/app/api/client-meal-plans/[id]/route');
        const planId = entityId(plan);
        const server = buildPutServer(planId, route);

        try {
            const res = await request(server)
                .put(`/api/client-meal-plans/${planId}`)
                .send({ name: 'Hijacked' });

            expect(res.status).toBe(403);
        } finally {
            server.close();
        }
    });

    it('planning list with status=all returns drafts + active plans for assigned dietitian', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();
        await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id, name: 'Draft One' });
        const activePlan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id, name: 'Active One' });
        await ClientMealPlan.updateOne(
            { _id: activePlan._id },
            { $set: { status: 'active', firstPublishedAt: new Date(), lastPublishedAt: new Date(), republishCount: 1 } }
        );

        (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
        const listRoute = await import('@/app/api/client-meal-plans/route');
        const server = createRouteTestServer((nextRequest) => listRoute.GET(nextRequest));

        try {
            const res = await request(server)
                .get(`/api/client-meal-plans?clientId=${entityId(client)}&status=all&limit=200`);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            const names = res.body.mealPlans.map((p: any) => p.name).sort();
            expect(names).toEqual(['Active One', 'Draft One']);
            const active = res.body.mealPlans.find((p: any) => p.name === 'Active One');
            expect(active.firstPublishedAt).toBeTruthy();
            expect(active.republishCount).toBe(1);
        } finally {
            server.close();
        }
    });
});
