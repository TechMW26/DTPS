/// <reference types="jest" />

import request from 'supertest';
import mongoose from 'mongoose';
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

async function setStatus(planId: any, status: string, extra: Record<string, any> = {}) {
    await ClientMealPlan.updateOne({ _id: planId }, { $set: { status, ...extra } });
}

function putServer(planId: string, route: any) {
    return createRouteTestServer((nextRequest) =>
        route.PUT(nextRequest, { params: Promise.resolve({ id: planId }) })
    );
}

function deleteServer(planId: string, route: any) {
    return createRouteTestServer((nextRequest) =>
        route.DELETE(nextRequest, { params: Promise.resolve({ id: planId }) })
    );
}

function getServer(planId: string, route: any) {
    return createRouteTestServer((nextRequest) =>
        route.GET(nextRequest, { params: Promise.resolve({ id: planId }) })
    );
}

describe('client meal plan — exhaustive edge cases', () => {
    beforeEach(async () => {
        await ensureDatabaseConnection();
    });

    // ──────────────────────────────────────────────────────────────────────
    // AUTHENTICATION / AUTHORIZATION
    // ──────────────────────────────────────────────────────────────────────
    describe('auth & authorization', () => {
        it('PUT without session returns 401', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });

            (getServerSession as jest.Mock).mockResolvedValue(null);
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ name: 'Hi' });
                expect(res.status).toBe(401);
            } finally {
                server.close();
            }
        });

        it('DELETE without session returns 401', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });

            (getServerSession as jest.Mock).mockResolvedValue(null);
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = deleteServer(entityId(plan), route);
            try {
                const res = await request(server).delete(`/api/client-meal-plans/${entityId(plan)}`);
                expect(res.status).toBe(401);
            } finally {
                server.close();
            }
        });

        it('GET without session returns 401', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });

            (getServerSession as jest.Mock).mockResolvedValue(null);
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = getServer(entityId(plan), route);
            try {
                const res = await request(server).get(`/api/client-meal-plans/${entityId(plan)}`);
                expect(res.status).toBe(401);
            } finally {
                server.close();
            }
        });

        it('Admin is still blocked from reverting published plan to draft', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const admin = await createUser({ role: UserRole.ADMIN, email: 'admin-edge@example.com' });
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });
            await setStatus(plan._id, 'active', { firstPublishedAt: new Date(), lastPublishedAt: new Date(), republishCount: 1 });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ status: 'draft' });
                expect(res.status).toBe(409);
                expect(res.body.code).toBe('FORBIDDEN_STATE_TRANSITION');
            } finally {
                server.close();
            }
        });

        it('Admin is still blocked from renaming a published plan', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const admin = await createUser({ role: UserRole.ADMIN, email: 'admin-edge2@example.com' });
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id, name: 'Locked' });
            await setStatus(plan._id, 'active', { firstPublishedAt: new Date(), lastPublishedAt: new Date(), republishCount: 1 });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ name: 'Admin Rename Attempt' });
                expect(res.status).toBe(409);
                expect(res.body.code).toBe('TITLE_LOCKED_AFTER_PUBLISH');
            } finally {
                server.close();
            }
        });

        it('Admin is still blocked from hard-deleting a published plan', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const admin = await createUser({ role: UserRole.ADMIN, email: 'admin-edge3@example.com' });
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });
            await setStatus(plan._id, 'active');

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(admin) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = deleteServer(entityId(plan), route);
            try {
                const res = await request(server).delete(`/api/client-meal-plans/${entityId(plan)}`);
                expect(res.status).toBe(409);
                const fresh: any = await ClientMealPlan.findById(plan._id).lean();
                expect(fresh.isDeleted).not.toBe(true);
            } finally {
                server.close();
            }
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // NOT FOUND / SOFT-DELETED
    // ──────────────────────────────────────────────────────────────────────
    describe('not-found & soft-deleted plans', () => {
        it('PUT on non-existent id returns 404', async () => {
            const { dietitian } = await createAssignedDietitianClientPair();
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const fakeId = new mongoose.Types.ObjectId().toString();
            const server = putServer(fakeId, route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${fakeId}`)
                    .send({ name: 'ghost' });
                expect(res.status).toBe(404);
            } finally {
                server.close();
            }
        });

        it('DELETE on non-existent id returns 404', async () => {
            const { dietitian } = await createAssignedDietitianClientPair();
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const fakeId = new mongoose.Types.ObjectId().toString();
            const server = deleteServer(fakeId, route);
            try {
                const res = await request(server).delete(`/api/client-meal-plans/${fakeId}`);
                expect(res.status).toBe(404);
            } finally {
                server.close();
            }
        });

        it('PUT on already soft-deleted plan returns 404', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });
            await ClientMealPlan.collection.updateOne(
                { _id: plan._id },
                { $set: { isDeleted: true, deletedAt: new Date() } }
            );

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ name: 'After Delete' });
                expect(res.status).toBe(404);
            } finally {
                server.close();
            }
        });

        it('DELETE on already soft-deleted plan returns 404', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });
            await ClientMealPlan.collection.updateOne(
                { _id: plan._id },
                { $set: { isDeleted: true, deletedAt: new Date() } }
            );

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = deleteServer(entityId(plan), route);
            try {
                const res = await request(server).delete(`/api/client-meal-plans/${entityId(plan)}`);
                expect(res.status).toBe(404);
            } finally {
                server.close();
            }
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // STATE-MACHINE: every transition
    // ──────────────────────────────────────────────────────────────────────
    describe('state machine — every transition', () => {
        async function attemptTransition(from: string, to: string, statusReason?: string) {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });
            await setStatus(plan._id, from, {
                firstPublishedAt: from !== 'draft' ? new Date() : undefined,
                lastPublishedAt: from !== 'draft' ? new Date() : undefined,
                republishCount: from !== 'draft' ? 1 : 0,
            });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const payload: Record<string, unknown> = { status: to };
                if (statusReason) payload.statusReason = statusReason;
                if (from === 'draft' && to === 'active') payload.meals = buildPublishableMeals(3);
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send(payload);
                return { res, plan };
            } finally {
                server.close();
            }
        }

        const allowed: Array<[string, string, string?]> = [
            ['draft', 'active'],
            ['active', 'paused'],
            ['active', 'completed'],
            ['active', 'cancelled', 'no longer needed'],
            ['paused', 'active'],
            ['paused', 'completed'],
            ['paused', 'cancelled', 'cancelled by client'],
        ];

        const forbidden: Array<[string, string]> = [
            ['active', 'draft'],
            ['paused', 'draft'],
            ['completed', 'draft'],
            ['cancelled', 'draft'],
            ['completed', 'active'],
            ['completed', 'paused'],
            ['completed', 'cancelled'],
            ['cancelled', 'active'],
            ['cancelled', 'paused'],
            ['cancelled', 'completed'],
            ['draft', 'paused'],
            ['draft', 'completed'],
            ['draft', 'cancelled'],
        ];

        it.each(allowed)('allows %s -> %s', async (...args: unknown[]) => {
            const [from, to, reason] = args as [string, string, string?];
            const { res } = await attemptTransition(from, to, reason);
            expect(res.status).toBe(200);
        }, 30000);

        it.each(forbidden)('blocks %s -> %s with 409 FORBIDDEN_STATE_TRANSITION', async (...args: unknown[]) => {
            const [from, to] = args as [string, string];
            const { res, plan } = await attemptTransition(from, to);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('FORBIDDEN_STATE_TRANSITION');
            const fresh: any = await ClientMealPlan.findById(plan._id).lean();
            expect(fresh.status).toBe(from);
        }, 30000);

        it('allows same-status no-op (active -> active)', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });
            await setStatus(plan._id, 'active', { firstPublishedAt: new Date() });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ status: 'active' });
                expect(res.status).toBe(200);
            } finally {
                server.close();
            }
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // TITLE IMMUTABILITY edges
    // ──────────────────────────────────────────────────────────────────────
    describe('title immutability edges', () => {
        it('allows title change with only leading/trailing whitespace difference on published plan (trim-equal)', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id, name: 'Detox' });
            await setStatus(plan._id, 'active', { firstPublishedAt: new Date() });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ name: '  Detox  ' });
                expect(res.status).toBe(200);
            } finally {
                server.close();
            }
        });

        it('omitting name in PUT body never triggers title-locked error', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });
            await setStatus(plan._id, 'active', { firstPublishedAt: new Date() });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ description: 'updated note' });
                expect(res.status).toBe(200);
            } finally {
                server.close();
            }
        });

        it('title + status revert in same body — state-machine guard fires first', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id, name: 'Original' });
            await setStatus(plan._id, 'active', { firstPublishedAt: new Date() });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ status: 'draft', name: 'New Name' });
                expect(res.status).toBe(409);
                expect(res.body.code).toBe('FORBIDDEN_STATE_TRANSITION');
                const fresh: any = await ClientMealPlan.findById(plan._id).lean();
                expect(fresh.name).toBe('Original');
                expect(fresh.status).toBe('active');
            } finally {
                server.close();
            }
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // PUBLISH TIMELINE & AUDIT
    // ──────────────────────────────────────────────────────────────────────
    describe('publish timeline & audit accumulation', () => {
        it('firstPublishedAt is set once and stays stable across pause/resume cycles', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const planId = entityId(plan);
            const server = putServer(planId, route);
            try {
                // Publish
                await request(server).put(`/api/client-meal-plans/${planId}`).send({ status: 'active', meals: buildPublishableMeals(3) });
                const afterPublish: any = await ClientMealPlan.findById(plan._id).lean();
                const fpa = afterPublish.firstPublishedAt;
                expect(fpa).toBeTruthy();
                expect(afterPublish.republishCount).toBe(1);

                // active -> paused
                await request(server).put(`/api/client-meal-plans/${planId}`).send({ status: 'paused' });
                // paused -> active (republish path; not draft->active, so republishCount stays)
                await request(server).put(`/api/client-meal-plans/${planId}`).send({ status: 'active' });
                // active -> paused again
                await request(server).put(`/api/client-meal-plans/${planId}`).send({ status: 'paused' });

                const finalPlan: any = await ClientMealPlan.findById(plan._id).lean();
                expect(new Date(finalPlan.firstPublishedAt).toISOString()).toBe(new Date(fpa).toISOString());
                expect(finalPlan.republishCount).toBe(1);

                // Audit log should contain a publish + multiple status_change entries
                const actions = finalPlan.lifecycleAudit.map((e: any) => e.action);
                expect(actions).toContain('publish');
                expect(actions.filter((a: string) => a === 'status_change').length).toBeGreaterThanOrEqual(3);
            } finally {
                server.close();
            }
        });

        it('blocked attempts are recorded in lifecycleAudit', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id, name: 'Locked Title' });
            await setStatus(plan._id, 'active', { firstPublishedAt: new Date() });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                // Title block
                await request(server).put(`/api/client-meal-plans/${entityId(plan)}`).send({ name: 'New Name' });
                // Revert block
                await request(server).put(`/api/client-meal-plans/${entityId(plan)}`).send({ status: 'draft' });
                // Invalid transition block (active -> nonsense actually picks completed->active path; use a real invalid one)
                await setStatus(plan._id, 'completed');
                await request(server).put(`/api/client-meal-plans/${entityId(plan)}`).send({ status: 'active' });

                const fresh: any = await ClientMealPlan.findById(plan._id).lean();
                const actions = fresh.lifecycleAudit.map((e: any) => e.action);
                expect(actions).toContain('blocked_title_edit');
                expect(actions).toContain('blocked_revert_to_draft');
                expect(actions).toContain('blocked_invalid_transition');
            } finally {
                server.close();
            }
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // PUBLISH CONTENT VALIDATION
    // ──────────────────────────────────────────────────────────────────────
    describe('publish content validation', () => {
        it('publishing without body meals but with stored meals succeeds (uses existing)', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ status: 'active' });
                expect(res.status).toBe(200);
            } finally {
                server.close();
            }
        });

        it('publishing with meals[] containing no food options returns 400', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await ClientMealPlan.create({
                clientId: client._id,
                dietitianId: dietitian._id,
                name: 'Empty content',
                meals: [{ date: '2026-06-01', day: 'Day 1', meals: { BREAKFAST: { foodOptions: [] } } }],
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                duration: 7,
                status: 'draft',
                goals: { primaryGoal: 'weight-loss' },
            });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ status: 'active' });
                expect(res.status).toBe(400);
            } finally {
                server.close();
            }
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // CANCEL REASON
    // ──────────────────────────────────────────────────────────────────────
    describe('cancel reason validation', () => {
        it('rejects cancel with whitespace-only statusReason', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });
            await setStatus(plan._id, 'active', { firstPublishedAt: new Date() });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ status: 'cancelled', statusReason: '   ' });
                expect(res.status).toBe(400);
            } finally {
                server.close();
            }
        });

        it('accepts cancel with trimmed valid statusReason', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });
            await setStatus(plan._id, 'active', { firstPublishedAt: new Date() });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ status: 'cancelled', statusReason: '  client requested  ' });
                expect(res.status).toBe(200);
                const fresh: any = await ClientMealPlan.findById(plan._id).lean();
                expect(fresh.deletionReason).toBe('client requested');
            } finally {
                server.close();
            }
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // DATE VALIDATION
    // ──────────────────────────────────────────────────────────────────────
    describe('date validation', () => {
        it('rejects update with startDate > endDate', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ startDate: '2026-12-31', endDate: '2026-01-01' });
                expect(res.status).toBe(400);
            } finally {
                server.close();
            }
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // DURATION IMMUTABILITY (existing behavior)
    // ──────────────────────────────────────────────────────────────────────
    describe('duration immutability after publish', () => {
        it('ignores duration change once plan is non-draft', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });
            await setStatus(plan._id, 'active', { firstPublishedAt: new Date() });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ duration: 99 });
                expect(res.status).toBe(200);
                const fresh: any = await ClientMealPlan.findById(plan._id).lean();
                expect(fresh.duration).toBe(7);
            } finally {
                server.close();
            }
        });

        it('allows duration change on draft plan', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({ clientId: client._id, dietitianId: dietitian._id });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const server = putServer(entityId(plan), route);
            try {
                const res = await request(server)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ duration: 14 });
                expect(res.status).toBe(200);
                const fresh: any = await ClientMealPlan.findById(plan._id).lean();
                expect(fresh.duration).toBe(14);
            } finally {
                server.close();
            }
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // DRAFT FIRST, THEN PUBLISH / NEVER PUBLISH
    // ──────────────────────────────────────────────────────────────────────
    describe('draft-first flows', () => {
        it('save as draft first, then publish later keeps same plan and sets publish metadata once', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({
                clientId: client._id,
                dietitianId: dietitian._id,
                name: 'Draft Before Publish',
            });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');
            const planId = entityId(plan);
            const server = putServer(planId, route);

            try {
                // Step 1: save as draft (no publish)
                const draftSaveRes = await request(server)
                    .put(`/api/client-meal-plans/${planId}`)
                    .send({
                        name: 'Draft Updated Name',
                        description: 'saved in draft mode',
                        status: 'draft',
                    });

                expect(draftSaveRes.status).toBe(200);
                const afterDraft: any = await ClientMealPlan.findById(plan._id).lean();
                expect(afterDraft.status).toBe('draft');
                expect(afterDraft.name).toBe('Draft Updated Name');
                expect(afterDraft.firstPublishedAt).toBeFalsy();
                expect(afterDraft.republishCount).toBe(0);

                // Step 2: publish same plan id
                const publishRes = await request(server)
                    .put(`/api/client-meal-plans/${planId}`)
                    .send({ status: 'active', meals: buildPublishableMeals(3) });

                expect(publishRes.status).toBe(200);
                const afterPublish: any = await ClientMealPlan.findById(plan._id).lean();
                expect(entityId(afterPublish)).toBe(planId);
                expect(afterPublish.status).toBe('active');
                expect(afterPublish.firstPublishedAt).toBeTruthy();
                expect(afterPublish.lastPublishedAt).toBeTruthy();
                expect(afterPublish.republishCount).toBe(1);
            } finally {
                server.close();
            }
        });

        it('if a plan is never published it stays draft, is editable, and can be soft-deleted', async () => {
            const { client, dietitian } = await createAssignedDietitianClientPair();
            const plan = await createDraftPlan({
                clientId: client._id,
                dietitianId: dietitian._id,
                name: 'Never Published Plan',
            });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(dietitian) });
            const route = await import('@/app/api/client-meal-plans/[id]/route');

            const editServer = putServer(entityId(plan), route);
            try {
                const editRes = await request(editServer)
                    .put(`/api/client-meal-plans/${entityId(plan)}`)
                    .send({ name: 'Still Draft Editable', description: 'not published yet' });

                expect(editRes.status).toBe(200);
                const afterEdit: any = await ClientMealPlan.findById(plan._id).lean();
                expect(afterEdit.status).toBe('draft');
                expect(afterEdit.firstPublishedAt).toBeFalsy();
                expect(afterEdit.lastPublishedAt).toBeFalsy();
                expect(afterEdit.republishCount).toBe(0);
                expect(afterEdit.name).toBe('Still Draft Editable');
            } finally {
                editServer.close();
            }

            const removeServer = deleteServer(entityId(plan), route);
            try {
                const deleteRes = await request(removeServer)
                    .delete(`/api/client-meal-plans/${entityId(plan)}`);

                expect(deleteRes.status).toBe(200);
                const rawDoc = await ClientMealPlan.collection.findOne({ _id: plan._id });
                expect(rawDoc?.isDeleted).toBe(true);
                expect(rawDoc?.status).toBe('cancelled');
            } finally {
                removeServer.close();
            }
        });
    });
});
