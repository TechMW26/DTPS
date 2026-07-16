import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { format } from 'date-fns';

import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import { UserRole } from '@/types';

import {
    createUser,
    ensureDatabaseConnection,
} from '../utils/database';

jest.mock('next-auth', () => ({
    getServerSession: jest.fn(),
}));

jest.mock('@/lib/imagekit', () => ({
    getImageKit: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({
            url: 'https://ik.imagekit.io/test/complete-meal/custom-brunch.jpg',
        }),
        listFiles: jest.fn().mockResolvedValue([]),
    })),
}));

jest.mock('@/lib/realtime/socket-manager', () => ({
    socketManager: {
        sendToUser: jest.fn(),
    },
}));

jest.mock('@/lib/realtime/broadcast-counts', () => ({
    broadcastUnreadCounts: jest.fn(),
    broadcastStaffUnreadCounts: jest.fn(),
}));

jest.mock('@/lib/utils/activityLogger', () => ({
    logActivity: jest.fn().mockResolvedValue(undefined),
}));

function buildSession(user: Record<string, any> | null) {
    if (!user) return null;

    return {
        user: {
            id: String(user._id ?? user.id),
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
            name: `${user.firstName} ${user.lastName}`.trim(),
        },
    };
}

function mockSession(user: Record<string, any> | null): void {
    (getServerSession as jest.Mock).mockResolvedValue(buildSession(user));
}

describe('Custom Meal Type Completion With Image Flow', () => {
    beforeAll(async () => {
        await ensureDatabaseConnection();
    });

    it('supports custom meal type completion with image and returns it in documents', async () => {
        const client = await createUser({ role: UserRole.CLIENT });
        const admin = await createUser({ role: UserRole.ADMIN });

        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);

        const mealPlan = await ClientMealPlan.create({
            clientId: client._id,
            dietitianId: admin._id,
            name: 'Custom Meal Type Test Plan',
            startDate: yesterdayStart,
            endDate: tomorrowStart,
            duration: 1,
            status: 'active',
            goals: {
                primaryGoal: 'health-improvement',
            },
            mealTypes: [
                { name: 'Second Breakfast', time: '10:30 AM' },
            ],
            meals: [
                {
                    date: todayStart,
                    meals: {
                        'Second Breakfast': {
                            time: '10:30 AM',
                            note: 'Custom meal type note',
                            foodOptions: [
                                {
                                    food: 'Oats Bowl',
                                    unit: '1 bowl',
                                    cal: '320',
                                    protein: '12',
                                    carbs: '45',
                                    fats: '10',
                                },
                            ],
                        },
                    },
                },
            ],
            mealCompletions: [],
            progress: [],
            reminders: {
                mealReminders: true,
                progressReminders: true,
                checkInReminders: true,
            },
            analytics: {
                totalDaysCompleted: 0,
            },
            freezedDays: [],
            totalFreezeCount: 0,
        });

        const mealPlanRoute = await import('@/app/api/client/meal-plan/route');
        const completeRoute = await import('@/app/api/client/meal-plan/complete/route');
        const documentsRoute = await import('@/app/api/dietitian-panel/clients/[clientId]/documents/route');
        const requestDate = format(new Date(), 'yyyy-MM-dd');

        // 1) Fetch meal plan for today - custom meal type should be visible and not completed.
        mockSession(client);
        const getPlanRequest = new NextRequest(
            `http://localhost/api/client/meal-plan?date=${requestDate}`,
            { method: 'GET' }
        );

        const getPlanResponse = await mealPlanRoute.GET(getPlanRequest);
        expect(getPlanResponse.status).toBe(200);
        const getPlanData = await getPlanResponse.json();

        expect(getPlanData.success).toBe(true);
        expect(getPlanData.hasPlan).toBe(true);

        const customMeal = (getPlanData.meals || []).find((meal: any) =>
            String(meal.type).toLowerCase().replace(/[\s_-]+/g, '') === 'secondbreakfast'
        );
        expect(customMeal).toBeTruthy();
        expect(customMeal.items.length).toBeGreaterThan(0);
        expect(customMeal.isCompleted).toBe(false);

        // 2) Complete the custom meal with an uploaded image.
        mockSession(client);
        const formData = new FormData();
        formData.append('mealId', customMeal.id);
        formData.append('date', requestDate);
        formData.append('mealType', 'Second Breakfast');
        formData.append('notes', 'Completed with custom meal image');

        const imageBlob = new Blob(['custom-meal-image-bytes'], { type: 'image/jpeg' });
        const imageFile = new File([imageBlob], 'custom-brunch.jpg', { type: 'image/jpeg' });
        formData.append('image', imageFile);

        const completeRequest = new NextRequest('http://localhost/api/client/meal-plan/complete', {
            method: 'POST',
            body: formData,
        });

        const completeResponse = await completeRoute.POST(completeRequest);
        expect(completeResponse.status).toBe(200);

        const completeData = await completeResponse.json();
        expect(completeData.success).toBe(true);
        expect(completeData.completion.mealTypeOriginal).toBe('Second Breakfast');
        expect(completeData.completion.imagePath).toContain('/complete-meal/');

        // 3) Re-fetch meal plan for today - custom meal should now be completed.
        mockSession(client);
        const getPlanAfterResponse = await mealPlanRoute.GET(getPlanRequest);
        expect(getPlanAfterResponse.status).toBe(200);

        const getPlanAfterData = await getPlanAfterResponse.json();
        const customMealAfter = (getPlanAfterData.meals || []).find((meal: any) =>
            String(meal.type).toLowerCase().replace(/[\s_-]+/g, '') === 'secondbreakfast'
        );

        expect(customMealAfter).toBeTruthy();
        expect(customMealAfter.isCompleted).toBe(true);

        // 4) Fetch client documents as admin - should include uploaded image with custom label.
        mockSession(admin);
        const docsRequest = new NextRequest(
            `http://localhost/api/dietitian-panel/clients/${String(client._id)}/documents`,
            { method: 'GET' }
        );

        const docsResponse = await documentsRoute.GET(docsRequest, {
            params: Promise.resolve({ clientId: String(client._id) }),
        });

        expect(docsResponse.status).toBe(200);
        const docsData = await docsResponse.json();

        expect(docsData.success).toBe(true);

        const uploadedMealDoc = (docsData.documents || []).find((doc: any) =>
            doc.type === 'meal-picture' &&
            String(doc.filePath || '').includes('/complete-meal/')
        );

        expect(uploadedMealDoc).toBeTruthy();
        expect(String(uploadedMealDoc.fileName)).toContain('Second Breakfast');
        expect(String(uploadedMealDoc.tag)).toContain('Second Breakfast');

        // Verify persistence in DB as well.
        const reloadedPlan = await ClientMealPlan.findById(mealPlan._id).lean() as any;
        const savedCompletion = (reloadedPlan.mealCompletions || [])[0];

        expect(savedCompletion).toBeTruthy();
        expect(savedCompletion.mealTypeOriginal).toBe('Second Breakfast');
        expect(savedCompletion.imagePath).toContain('/complete-meal/');
    });
});
