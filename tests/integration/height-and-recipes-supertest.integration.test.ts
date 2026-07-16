/// <reference types="jest" />

import request from 'supertest';
import { getServerSession } from 'next-auth';
import User from '@/lib/db/models/User';
import Recipe from '@/lib/db/models/Recipe';
import { UserRole } from '@/types';
import { entityId } from '../utils/assertions';
import {
    createAssignedDietitianClientPair,
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

describe('height + recipe CRUD integrations (supertest)', () => {
    beforeEach(async () => {
        await ensureDatabaseConnection();
    });

    it('allows assigned dietitian (dietician role alias) to update client height fields', async () => {
        const { client, dietitian } = await createAssignedDietitianClientPair();

        // Intentionally use legacy alias to verify normalization path.
        (getServerSession as jest.Mock).mockResolvedValue({
            user: toSessionUser(dietitian, 'dietician'),
        });

        const usersRoute = await import('@/app/api/users/[id]/route');
        const clientId = entityId(client);

        const server = createRouteTestServer((nextRequest) =>
            usersRoute.PUT(nextRequest, { params: Promise.resolve({ id: clientId }) })
        );

        try {
            const response = await request(server)
                .put(`/api/users/${clientId}`)
                .send({
                    height: 170,
                    heightCm: '170',
                    heightFeet: '5',
                    heightInch: '7',
                    // Include weightKg because the real client form sends it in same request.
                    weightKg: '72',
                });

            expect(response.status).toBe(200);
            expect(response.body?.user).toBeTruthy();

            const updatedUser: any = await User.findById(client._id).lean();
            expect(updatedUser).toBeTruthy();
            expect(updatedUser.heightCm).toBe('170');
            expect(updatedUser.heightFeet).toBe('5');
            expect(updatedUser.heightInch).toBe('7');
            expect(updatedUser.height).toBe(170);
            expect(updatedUser.weightKg).toBe('72');
            expect(updatedUser.weight).toBe(72);
        } finally {
            server.close();
        }
    });

    it('supports dietitian recipe create, edit, and delete end-to-end', async () => {
        const { dietitian } = await createAssignedDietitianClientPair();

        (getServerSession as jest.Mock).mockResolvedValue({
            user: toSessionUser(dietitian, UserRole.DIETITIAN),
        });

        const recipesRoute = await import('@/app/api/recipes/route');
        const recipeByIdRoute = await import('@/app/api/recipes/[id]/route');

        const createServer = createRouteTestServer((nextRequest) => recipesRoute.POST(nextRequest));

        let createdRecipeId = '';

        try {
            const createResponse = await request(createServer)
                .post('/api/recipes')
                .send({
                    name: 'Supertest Recipe',
                    description: 'Created from supertest integration test',
                    ingredients: [
                        { name: 'Oats', quantity: 50, unit: 'grams', remarks: '' },
                        { name: 'Milk', quantity: 200, unit: 'ml', remarks: '' },
                    ],
                    instructions: ['Mix ingredients', 'Cook for 5 minutes'],
                    prepTime: 5,
                    cookTime: 10,
                    servings: '1 CUP ( 150 ml )',
                    nutrition: {
                        calories: 280,
                        protein: 12,
                        carbs: 35,
                        fat: 9,
                    },
                    dietaryRestrictions: ['Vegetarian'],
                    medicalContraindications: ['Diabetes'],
                    isActive: true,
                });

            expect(createResponse.status).toBe(201);
            expect(createResponse.body?.success).toBe(true);
            expect(createResponse.body?.recipe?._id).toBeTruthy();
            createdRecipeId = String(createResponse.body.recipe._id);

            const updateDeleteServer = createRouteTestServer(async (nextRequest) => {
                if (nextRequest.method === 'PUT') {
                    return recipeByIdRoute.PUT(nextRequest, { params: Promise.resolve({ id: createdRecipeId }) });
                }
                if (nextRequest.method === 'DELETE') {
                    return recipeByIdRoute.DELETE(nextRequest, { params: Promise.resolve({ id: createdRecipeId }) });
                }
                return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                    status: 405,
                    headers: { 'Content-Type': 'application/json' },
                });
            });

            try {
                const updateResponse = await request(updateDeleteServer)
                    .put(`/api/recipes/${createdRecipeId}`)
                    .send({
                        name: 'Supertest Recipe Updated',
                        description: 'Updated from supertest integration test',
                        image: 'https://ik.imagekit.io/test-bucket/recipes/supertest-updated.jpg',
                        prepTime: 7,
                        cookTime: 12,
                        servings: '2 TSP ( 10 gm/ml )',
                        nutrition: {
                            calories: 300,
                            protein: 13,
                            carbs: 37,
                            fat: 10,
                        },
                        ingredients: [
                            { name: 'Oats', quantity: 60, unit: 'grams', remarks: '' },
                            { name: 'Milk', quantity: 220, unit: 'ml', remarks: 'low fat' },
                        ],
                        instructions: ['Mix well', 'Cook for 7 minutes'],
                        dietaryRestrictions: ['Vegetarian'],
                        medicalContraindications: ['Diabetes'],
                    });

                expect(updateResponse.status).toBe(200);
                expect(updateResponse.body?.success).toBe(true);
                expect(updateResponse.body?.recipe?.name).toBe('Supertest Recipe Updated');
                expect(updateResponse.body?.recipe?.image).toBe('https://ik.imagekit.io/test-bucket/recipes/supertest-updated.jpg');

                const updatedRecipe = await Recipe.findById(createdRecipeId).lean();
                expect(updatedRecipe?.image).toBe('https://ik.imagekit.io/test-bucket/recipes/supertest-updated.jpg');

                const deleteResponse = await request(updateDeleteServer)
                    .delete(`/api/recipes/${createdRecipeId}`);

                expect(deleteResponse.status).toBe(200);
                expect(deleteResponse.body?.success).toBe(true);

                const deletedRecipe = await Recipe.findById(createdRecipeId).lean();
                expect(deletedRecipe).toBeNull();
            } finally {
                updateDeleteServer.close();
            }
        } finally {
            createServer.close();
        }
    });
});
