/// <reference types="jest" />

import request from 'supertest';
import { getServerSession } from 'next-auth';
import DietTemplate from '@/lib/db/models/DietTemplate';
import { UserRole } from '@/types';
import { entityId } from '../utils/assertions';
import {
    createUser,
    ensureDatabaseConnection,
} from '../utils/database';
import { createRouteTestServer } from '../utils/supertest-route';

function toSessionUser(user: any, roleOverride?: string) {
    return {
        id: entityId(user),
        email: user.email,
        role: roleOverride || user.role,
        firstName: user.firstName,
        lastName: user.lastName,
    };
}

const sampleMeals = [
    {
        id: 'day-1',
        day: 'Day 1',
        date: '2026-04-23',
        meals: {
            Breakfast: {
                id: 'meal-breakfast-1',
                name: 'Breakfast',
                time: '09:00 AM',
                foodOptions: [
                    {
                        id: 'opt-1',
                        label: '',
                        food: 'Oats',
                        unit: '1 bowl',
                        cal: '220',
                        carbs: '35',
                        fats: '6',
                        protein: '10',
                    },
                ],
            },
        },
        note: 'Initial note',
    },
];

const updatedMeals = [
    {
        id: 'day-1',
        day: 'Day 1',
        date: '2026-04-24',
        meals: {
            Breakfast: {
                id: 'meal-breakfast-1',
                name: 'Breakfast',
                time: '08:30 AM',
                foodOptions: [
                    {
                        id: 'opt-1',
                        label: '',
                        food: 'Paneer Sandwich',
                        unit: '1 plate',
                        cal: '320',
                        carbs: '28',
                        fats: '14',
                        protein: '18',
                    },
                ],
            },
            Lunch: {
                id: 'meal-lunch-1',
                name: 'Lunch',
                time: '01:15 PM',
                foodOptions: [
                    {
                        id: 'opt-2',
                        label: '',
                        food: 'Rice and Dal',
                        unit: '1 plate',
                        cal: '450',
                        carbs: '60',
                        fats: '10',
                        protein: '15',
                    },
                ],
            },
        },
        note: 'Updated note',
    },
];

describe('diet template persistence integrations (supertest)', () => {
    beforeEach(async () => {
        await ensureDatabaseConnection();
    });

    it('creates and lists diet templates with persisted meals + meal types', async () => {
        const dietitian = await createUser({ role: UserRole.DIETITIAN });

        (getServerSession as jest.Mock).mockResolvedValue({
            user: toSessionUser(dietitian, UserRole.DIETITIAN),
        });

        const listCreateRoute = await import('@/app/api/diet-templates/route');
        const server = createRouteTestServer(async (nextRequest) => {
            if (nextRequest.method === 'POST') {
                return listCreateRoute.POST(nextRequest);
            }
            if (nextRequest.method === 'GET') {
                return listCreateRoute.GET(nextRequest);
            }
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { 'Content-Type': 'application/json' },
            });
        });

        try {
            const createResponse = await request(server)
                .post('/api/diet-templates')
                .send({
                    name: 'Supertest Diet Template',
                    description: 'Template created via supertest',
                    category: 'weight-loss',
                    duration: 7,
                    targetCalories: { min: 1400, max: 1800 },
                    targetMacros: {
                        protein: { min: 70, max: 130 },
                        carbs: { min: 120, max: 220 },
                        fat: { min: 30, max: 70 },
                    },
                    dietaryRestrictions: ['vegetarian'],
                    tags: ['supertest'],
                    meals: sampleMeals,
                    mealTypes: [
                        { name: 'Breakfast', time: '09:00 AM' },
                        { name: 'Lunch', time: '01:00 PM' },
                    ],
                    isPublic: false,
                    isPremium: false,
                    difficulty: 'intermediate',
                    prepTime: { daily: 30, weekly: 210 },
                });

            expect(createResponse.status).toBe(201);
            expect(createResponse.body?.success).toBe(true);
            expect(createResponse.body?.template?._id).toBeTruthy();
            expect(createResponse.body?.template?.meals?.length).toBe(1);
            expect(createResponse.body?.template?.mealTypes?.length).toBe(2);

            const listResponse = await request(server)
                .get('/api/diet-templates?limit=50&page=1');

            expect(listResponse.status).toBe(200);
            expect(listResponse.body?.success).toBe(true);
            const created = (listResponse.body?.templates || []).find(
                (t: any) => t.name === 'Supertest Diet Template'
            );
            expect(created).toBeTruthy();
            expect(created.meals?.length).toBe(1);
            expect(created.mealTypes?.length).toBe(2);
        } finally {
            server.close();
        }
    });

    it('updates and soft-deletes diet template while preserving meal payload updates', async () => {
        const dietitian = await createUser({ role: UserRole.DIETITIAN });

        const created = await DietTemplate.create({
            name: 'Editable Diet Template',
            description: 'Before update',
            category: 'maintenance',
            duration: 7,
            targetCalories: { min: 1500, max: 2100 },
            targetMacros: {
                protein: { min: 60, max: 120 },
                carbs: { min: 130, max: 240 },
                fat: { min: 35, max: 80 },
            },
            dietaryRestrictions: [],
            tags: [],
            meals: sampleMeals,
            mealTypes: [
                { name: 'Breakfast', time: '09:00 AM' },
            ],
            isPublic: false,
            isPremium: false,
            isActive: true,
            difficulty: 'intermediate',
            prepTime: { daily: 25, weekly: 175 },
            targetAudience: {
                ageGroup: [],
                activityLevel: [],
                healthConditions: [],
                goals: [],
            },
            createdBy: dietitian._id,
        });

        (getServerSession as jest.Mock).mockResolvedValue({
            user: toSessionUser(dietitian, UserRole.DIETITIAN),
        });

        const templateId = entityId(created);
        const byIdRoute = await import('@/app/api/diet-templates/[id]/route');

        const byIdServer = createRouteTestServer(async (nextRequest) => {
            if (nextRequest.method === 'PUT') {
                return byIdRoute.PUT(nextRequest, { params: Promise.resolve({ id: templateId }) });
            }
            if (nextRequest.method === 'DELETE') {
                return byIdRoute.DELETE(nextRequest, { params: Promise.resolve({ id: templateId }) });
            }
            if (nextRequest.method === 'GET') {
                return byIdRoute.GET(nextRequest, { params: Promise.resolve({ id: templateId }) });
            }
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { 'Content-Type': 'application/json' },
            });
        });

        try {
            const updateResponse = await request(byIdServer)
                .put(`/api/diet-templates/${templateId}`)
                .send({
                    name: 'Editable Diet Template Updated',
                    duration: 14,
                    meals: updatedMeals,
                    mealTypes: [
                        { name: 'Breakfast', time: '08:30 AM' },
                        { name: 'Lunch', time: '01:15 PM' },
                    ],
                    targetCalories: { min: 1450, max: 2000 },
                    targetMacros: {
                        protein: { min: 75, max: 135 },
                        carbs: { min: 115, max: 210 },
                        fat: { min: 32, max: 72 },
                    },
                });

            expect(updateResponse.status).toBe(200);
            expect(updateResponse.body?.success).toBe(true);
            expect(updateResponse.body?.template?.duration).toBe(14);
            expect(updateResponse.body?.template?.meals?.length).toBe(1);
            expect(updateResponse.body?.template?.mealTypes?.length).toBe(2);
            expect(updateResponse.body?.template?.meals?.[0]?.meals?.Lunch?.foodOptions?.[0]?.food).toBe('Rice and Dal');

            const getResponse = await request(byIdServer)
                .get(`/api/diet-templates/${templateId}`);

            expect(getResponse.status).toBe(200);
            expect(getResponse.body?.template?.name).toBe('Editable Diet Template Updated');
            expect(getResponse.body?.template?.mealTypes?.length).toBe(2);

            const deleteResponse = await request(byIdServer)
                .delete(`/api/diet-templates/${templateId}`);

            expect(deleteResponse.status).toBe(200);
            expect(deleteResponse.body?.success).toBe(true);

            const deleted = await DietTemplate.findById(templateId).lean();
            expect(deleted).toBeTruthy();
            expect(deleted?.isActive).toBe(false);
        } finally {
            byIdServer.close();
        }
    });

    it('allows admin to list archived diet templates and restore them', async () => {
        const admin = await createUser({ role: UserRole.ADMIN });

        const archivedTemplate = await DietTemplate.create({
            name: 'Archived Diet Template',
            description: 'Archived for recycle bin test',
            category: 'maintenance',
            duration: 7,
            targetCalories: { min: 1400, max: 1900 },
            targetMacros: {
                protein: { min: 65, max: 125 },
                carbs: { min: 120, max: 220 },
                fat: { min: 30, max: 75 },
            },
            dietaryRestrictions: [],
            tags: ['archived'],
            meals: sampleMeals,
            mealTypes: [{ name: 'Breakfast', time: '09:00 AM' }],
            isPublic: false,
            isPremium: false,
            isActive: false,
            difficulty: 'intermediate',
            prepTime: { daily: 30, weekly: 210 },
            targetAudience: {
                ageGroup: [],
                activityLevel: [],
                healthConditions: [],
                goals: [],
            },
            createdBy: admin._id,
        });

        (getServerSession as jest.Mock).mockResolvedValue({
            user: toSessionUser(admin, UserRole.ADMIN),
        });

        const templateId = entityId(archivedTemplate);
        const listRoute = await import('@/app/api/diet-templates/route');
        const restoreRoute = await import('@/app/api/diet-templates/[id]/restore/route');

        const listServer = createRouteTestServer((nextRequest) => listRoute.GET(nextRequest));
        const restoreServer = createRouteTestServer((nextRequest) =>
            restoreRoute.POST(nextRequest, { params: Promise.resolve({ id: templateId }) })
        );

        try {
            const withoutArchived = await request(listServer)
                .get('/api/diet-templates?limit=100&page=1');

            expect(withoutArchived.status).toBe(200);
            const withoutMatch = (withoutArchived.body?.templates || []).find((t: any) => t._id === templateId);
            expect(withoutMatch).toBeFalsy();

            const withArchived = await request(listServer)
                .get('/api/diet-templates?limit=100&page=1&includeInactive=true');

            expect(withArchived.status).toBe(200);
            const archivedMatch = (withArchived.body?.templates || []).find((t: any) => t._id === templateId);
            expect(archivedMatch).toBeTruthy();
            expect(archivedMatch.isActive).toBe(false);

            const restoreResponse = await request(restoreServer)
                .post(`/api/diet-templates/${templateId}/restore`);

            expect(restoreResponse.status).toBe(200);
            expect(restoreResponse.body?.success).toBe(true);

            const restored = await DietTemplate.findById(templateId).lean();
            expect(restored).toBeTruthy();
            expect(restored?.isActive).toBe(true);
        } finally {
            listServer.close();
            restoreServer.close();
        }
    });

    it('API calories summary excludes alternative foods', async () => {
        const dietitian = await createUser({ role: UserRole.DIETITIAN });

        (getServerSession as jest.Mock).mockResolvedValue({
            user: toSessionUser(dietitian, UserRole.DIETITIAN),
        });

        const template = await DietTemplate.create({
            name: 'Alternative Exclusion Template',
            description: 'Main food calories should exclude alternatives in API summary',
            category: 'maintenance',
            duration: 7,
            targetCalories: { min: 1200, max: 2000 },
            targetMacros: {
                protein: { min: 60, max: 130 },
                carbs: { min: 120, max: 230 },
                fat: { min: 30, max: 75 },
            },
            dietaryRestrictions: [],
            tags: [],
            meals: [
                {
                    id: 'day-1',
                    day: 'Day 1',
                    date: '2026-04-24',
                    meals: {
                        Breakfast: {
                            id: 'meal-breakfast',
                            name: 'Breakfast',
                            time: '09:00 AM',
                            foodOptions: [
                                {
                                    id: 'main-1',
                                    label: 'Main',
                                    food: 'Oats',
                                    unit: '1 bowl',
                                    cal: '200',
                                    carbs: '30',
                                    fats: '5',
                                    protein: '10',
                                    isAlternative: false,
                                },
                                {
                                    id: 'alt-1',
                                    label: 'Alternative',
                                    food: 'Granola',
                                    unit: '1 bowl',
                                    cal: '500',
                                    carbs: '70',
                                    fats: '15',
                                    protein: '12',
                                    isAlternative: true,
                                },
                            ],
                        },
                    },
                    note: '',
                },
            ],
            mealTypes: [{ name: 'Breakfast', time: '09:00 AM' }],
            isPublic: false,
            isPremium: false,
            isActive: true,
            difficulty: 'intermediate',
            prepTime: { daily: 25, weekly: 175 },
            targetAudience: {
                ageGroup: [],
                activityLevel: [],
                healthConditions: [],
                goals: [],
            },
            createdBy: dietitian._id,
        });

        const listRoute = await import('@/app/api/diet-templates/route');
        const byIdRoute = await import('@/app/api/diet-templates/[id]/route');
        const templateId = entityId(template);

        const listServer = createRouteTestServer((nextRequest) => listRoute.GET(nextRequest));
        const byIdServer = createRouteTestServer((nextRequest) =>
            byIdRoute.GET(nextRequest, { params: Promise.resolve({ id: templateId }) })
        );

        try {
            const listResponse = await request(listServer)
                .get('/api/diet-templates?limit=100&page=1');

            expect(listResponse.status).toBe(200);
            const match = (listResponse.body?.templates || []).find((t: any) => t._id === templateId);
            expect(match).toBeTruthy();
            expect(match.averageDailyCalories).toBe(200);

            const getResponse = await request(byIdServer)
                .get(`/api/diet-templates/${templateId}`);

            expect(getResponse.status).toBe(200);
            expect(getResponse.body?.template?._id).toBe(templateId);
            // GET by id should still preserve alternative rows in payload,
            // but summary calories should continue to come from main foods only.
            expect(getResponse.body?.template?.meals?.[0]?.meals?.Breakfast?.foodOptions?.length).toBe(2);
            const altOption = getResponse.body?.template?.meals?.[0]?.meals?.Breakfast?.foodOptions?.find((opt: any) => opt.isAlternative === true);
            expect(altOption?.food).toBe('Granola');
        } finally {
            listServer.close();
            byIdServer.close();
        }
    });
});
