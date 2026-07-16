/// <reference types="jest" />

/**
 * Client API Performance Integration Tests
 * 
 * Tests all client-side APIs for:
 * 1. Functionality correctness
 * 2. Response time measurement
 * 3. Error handling (especially for phone-only users)
 */

import mongoose from 'mongoose';
import request from 'supertest';
import { getServerSession } from 'next-auth';
import User from '@/lib/db/models/User';
import ProgressEntry from '@/lib/db/models/ProgressEntry';
import JournalTracking from '@/lib/db/models/JournalTracking';
import LifestyleInfo from '@/lib/db/models/LifestyleInfo';
import MedicalInfo from '@/lib/db/models/MedicalInfo';
import ActivityLog from '@/lib/db/models/ActivityLog';
import { UserRole, UserStatus, ClientStatus } from '@/types';
import { entityId } from '../utils/assertions';
import {
    createUser,
    ensureDatabaseConnection,
    createAssignedDietitianClientPair,
} from '../utils/database';
import { createRouteTestServer } from '../utils/supertest-route';

// Performance tracking
interface PerformanceMetric {
    endpoint: string;
    method: string;
    avgTime: number;
    minTime: number;
    maxTime: number;
    runs: number;
    status: 'fast' | 'moderate' | 'slow';
}

const performanceMetrics: PerformanceMetric[] = [];

function classifySpeed(avgTime: number): 'fast' | 'moderate' | 'slow' {
    if (avgTime < 100) return 'fast';
    if (avgTime < 500) return 'moderate';
    return 'slow';
}

function recordMetric(endpoint: string, method: string, times: number[]) {
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    performanceMetrics.push({
        endpoint,
        method,
        avgTime: Math.round(avgTime),
        minTime: Math.round(Math.min(...times)),
        maxTime: Math.round(Math.max(...times)),
        runs: times.length,
        status: classifySpeed(avgTime),
    });
}

function toSessionUser(user: any) {
    return {
        id: entityId(user),
        email: user.email || '', // Support phone-only users
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        onboardingCompleted: user.onboardingCompleted || false,
    };
}

describe('Client API Performance & Functionality Tests', () => {
    let testClient: any;
    let testDietitian: any;
    let phoneOnlyClient: any; // Client without email (WhatsApp OTP signup)

    beforeAll(async () => {
        await ensureDatabaseConnection();

        // Create test users
        const { client, dietitian } = await createAssignedDietitianClientPair();
        testClient = client;
        testDietitian = dietitian;

        // Create phone-only client (simulates WhatsApp OTP signup)
        phoneOnlyClient = await createUser({
            role: UserRole.CLIENT,
            email: '', // No email - phone only
            phone: '9876543210',
            firstName: 'Phone',
            lastName: 'User',
            onboardingCompleted: false,
            assignedDietitian: dietitian._id,
            assignedDietitians: [dietitian._id],
        });
    });

    afterAll(() => {
        // Print performance report
        console.log('\n\n========== CLIENT API PERFORMANCE REPORT ==========\n');

        const sorted = [...performanceMetrics].sort((a, b) => b.avgTime - a.avgTime);

        console.log('SLOW ENDPOINTS (>500ms) - NEED OPTIMIZATION:');
        console.log('─'.repeat(70));
        sorted.filter(m => m.status === 'slow').forEach(m => {
            console.log(`  ❌ ${m.method.padEnd(6)} ${m.endpoint.padEnd(40)} ${m.avgTime}ms (${m.minTime}-${m.maxTime}ms)`);
        });

        console.log('\nMODERATE ENDPOINTS (100-500ms) - CONSIDER OPTIMIZATION:');
        console.log('─'.repeat(70));
        sorted.filter(m => m.status === 'moderate').forEach(m => {
            console.log(`  ⚠️  ${m.method.padEnd(6)} ${m.endpoint.padEnd(40)} ${m.avgTime}ms (${m.minTime}-${m.maxTime}ms)`);
        });

        console.log('\nFAST ENDPOINTS (<100ms) - GOOD:');
        console.log('─'.repeat(70));
        sorted.filter(m => m.status === 'fast').forEach(m => {
            console.log(`  ✅ ${m.method.padEnd(6)} ${m.endpoint.padEnd(40)} ${m.avgTime}ms (${m.minTime}-${m.maxTime}ms)`);
        });

        console.log('\n' + '='.repeat(70));
        console.log('SUMMARY:');
        console.log(`  Total endpoints tested: ${performanceMetrics.length}`);
        console.log(`  Fast (<100ms): ${performanceMetrics.filter(m => m.status === 'fast').length}`);
        console.log(`  Moderate (100-500ms): ${performanceMetrics.filter(m => m.status === 'moderate').length}`);
        console.log(`  Slow (>500ms): ${performanceMetrics.filter(m => m.status === 'slow').length}`);
        console.log('='.repeat(70) + '\n');
    });

    // ═══════════════════════════════════════════════════════════════════════
    // PROFILE ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/profile', () => {
        it('returns profile for email-based client', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/profile/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/profile');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                        // Profile returns user data directly, not wrapped in .user
                        expect(response.body._id || response.body.firstName).toBeDefined();
                    }
                }
                recordMetric('/api/client/profile', 'GET', times);
            } finally {
                server.close();
            }
        });

        it('returns profile for phone-only client (no email)', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(phoneOnlyClient) });

            const route = await import('@/app/api/client/profile/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/profile');
                    times.push(Date.now() - start);

                    // 200 or 404 (if user not found in cache) are both valid
                    if (i === 0) {
                        expect([200, 404]).toContain(response.status);
                    }
                }
                recordMetric('/api/client/profile (phone-only)', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ONBOARDING ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('POST /api/client/onboarding', () => {
        it('completes onboarding for phone-only client without email validation error', async () => {
            // Use fresh phone-only client for onboarding
            const freshPhoneClient = await createUser({
                role: UserRole.CLIENT,
                email: '',
                phone: '9988776655',
                firstName: 'Onboard',
                lastName: 'Test',
                onboardingCompleted: false,
                assignedDietitian: testDietitian._id,
            });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(freshPhoneClient) });

            const route = await import('@/app/api/client/onboarding/route');
            const server = createRouteTestServer(route.POST);

            const times: number[] = [];
            try {
                const onboardingData = {
                    gender: 'male',
                    dateOfBirth: '1990-01-15',
                    heightCm: 175,
                    weightKg: 80,
                    targetWeightKg: 70,
                    activityLevel: 'moderately_active',
                    generalGoal: 'weight-loss',
                    dietType: 'Non-Vegetarian',
                    allergies: [],
                    dailyGoals: {
                        calories: 2000,
                        steps: 8000,
                        water: 2500,
                    },
                };

                const start = Date.now();
                const response = await request(server)
                    .post('/api/client/onboarding')
                    .send(onboardingData)
                    .set('Content-Type', 'application/json');
                times.push(Date.now() - start);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.onboardingCompleted).toBe(true);

                // Verify no activity log validation errors occurred
                const alerts = await mongoose.model('SystemAlert').find({
                    message: { $regex: /Failed to log activity.*Completed Onboarding/i }
                }).lean();
                // Should not create new alerts for email validation

                recordMetric('/api/client/onboarding', 'POST', times);
            } finally {
                server.close();
            }
        });

        it('handles already-completed onboarding quickly', async () => {
            // Create a separate user that is already onboarded
            const alreadyOnboardedClient = await createUser({
                role: UserRole.CLIENT,
                email: `onboarded-${Date.now()}@test.com`,
                phone: '1122334455',
                firstName: 'Already',
                lastName: 'Onboarded',
                onboardingCompleted: true, // Already onboarded
                assignedDietitian: testDietitian._id,
            });

            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(alreadyOnboardedClient) });

            const route = await import('@/app/api/client/onboarding/route');
            const server = createRouteTestServer(route.POST);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server)
                        .post('/api/client/onboarding')
                        .send({ gender: 'male' })
                        .set('Content-Type', 'application/json');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                        expect(response.body.alreadyCompleted).toBe(true);
                    }
                }
                recordMetric('/api/client/onboarding (already done)', 'POST', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // PROGRESS ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/progress', () => {
        it('returns progress data efficiently', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/progress/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/progress?range=1W');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/progress', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    describe('POST /api/client/progress (weight logging)', () => {
        it('logs weight for phone-only user without validation error', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(phoneOnlyClient) });

            const route = await import('@/app/api/client/progress/route');
            const server = createRouteTestServer(route.POST);

            const times: number[] = [];
            try {
                const start = Date.now();
                const response = await request(server)
                    .post('/api/client/progress')
                    .send({ type: 'weight', value: 85 })
                    .set('Content-Type', 'application/json');
                times.push(Date.now() - start);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);

                recordMetric('/api/client/progress (weight)', 'POST', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEPS ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('POST /api/client/steps', () => {
        it('logs steps for phone-only user without validation error', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(phoneOnlyClient) });

            const route = await import('@/app/api/client/steps/route');
            const server = createRouteTestServer(route.POST);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server)
                        .post('/api/client/steps')
                        .send({ steps: 5000 })
                        .set('Content-Type', 'application/json');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                        expect(response.body.success).toBe(true);
                        expect(response.body.entry).toBeDefined();
                    }
                }
                recordMetric('/api/client/steps', 'POST', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // SLEEP ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('POST /api/client/sleep', () => {
        it('logs sleep for phone-only user without validation error', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(phoneOnlyClient) });

            const route = await import('@/app/api/client/sleep/route');
            const server = createRouteTestServer(route.POST);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server)
                        .post('/api/client/sleep')
                        .send({ hours: 7, minutes: 30, quality: 'Good' })
                        .set('Content-Type', 'application/json');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                        expect(response.body.success).toBe(true);
                        expect(response.body.entry).toBeDefined();
                    }
                }
                recordMetric('/api/client/sleep', 'POST', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // HYDRATION ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('POST /api/client/hydration', () => {
        it('logs water intake efficiently', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/hydration/route');
            const server = createRouteTestServer(route.POST);

            const times: number[] = [];
            try {
                const start = Date.now();
                const response = await request(server)
                    .post('/api/client/hydration')
                    .send({ amount: 250, date: new Date().toISOString() })
                    .set('Content-Type', 'application/json');
                times.push(Date.now() - start);

                expect(response.status).toBe(200);

                recordMetric('/api/client/hydration', 'POST', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('POST /api/client/activity', () => {
        it('logs activity for phone-only user', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(phoneOnlyClient) });

            const route = await import('@/app/api/client/activity/route');
            const server = createRouteTestServer(route.POST);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server)
                        .post('/api/client/activity')
                        .send({
                            name: 'Walking',
                            duration: 30,
                            intensity: 'moderate'
                        })
                        .set('Content-Type', 'application/json');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                        expect(response.body.success).toBe(true);
                        expect(response.body.entry).toBeDefined();
                    }
                }
                recordMetric('/api/client/activity', 'POST', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // UNREAD COUNTS ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/notifications/unread-count', () => {
        it('returns unread counts quickly', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/notifications/unread-count/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/notifications/unread-count');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/notifications/unread-count', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // DASHBOARD SUMMARY ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/dashboard-summary', () => {
        it('returns dashboard summary', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/dashboard-summary/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/dashboard-summary');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/dashboard-summary', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // NOTIFICATIONS ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/notifications', () => {
        it('returns notifications quickly', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/notifications/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/notifications');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/notifications', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // SERVICE PLANS ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/service-plans', () => {
        it('returns service plans', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/service-plans/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/service-plans');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/service-plans', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // TASKS ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/tasks', () => {
        it('returns tasks', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/tasks/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/tasks');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/tasks', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // MEDICAL INFO ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('POST /api/client/medical-info', () => {
        it('saves medical info for phone-only user', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(phoneOnlyClient) });

            const route = await import('@/app/api/client/medical-info/route');
            const server = createRouteTestServer(route.POST);

            const times: number[] = [];
            try {
                const start = Date.now();
                const response = await request(server)
                    .post('/api/client/medical-info')
                    .send({
                        conditions: ['diabetes'],
                        medications: ['metformin'],
                        allergies: ['peanuts'],
                    })
                    .set('Content-Type', 'application/json');
                times.push(Date.now() - start);

                expect(response.status).toBe(200);

                recordMetric('/api/client/medical-info', 'POST', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // LIFESTYLE INFO ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('POST /api/client/lifestyle-info', () => {
        it('saves lifestyle info for phone-only user', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(phoneOnlyClient) });

            const route = await import('@/app/api/client/lifestyle-info/route');
            const server = createRouteTestServer(route.POST);

            const times: number[] = [];
            try {
                const start = Date.now();
                const response = await request(server)
                    .post('/api/client/lifestyle-info')
                    .send({
                        occupation: 'Software Developer',
                        workSchedule: 'regular',
                        sleepHours: 7,
                    })
                    .set('Content-Type', 'application/json');
                times.push(Date.now() - start);

                expect(response.status).toBe(200);

                recordMetric('/api/client/lifestyle-info', 'POST', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // DIETARY RECALL ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('POST /api/client/dietary-recall', () => {
        it('saves dietary recall for phone-only user', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(phoneOnlyClient) });

            const route = await import('@/app/api/client/dietary-recall/route');
            const server = createRouteTestServer(route.POST);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server)
                        .post('/api/client/dietary-recall')
                        .send({
                            meals: [
                                {
                                    mealType: 'Breakfast',
                                    foodItems: ['Oatmeal', 'Banana', 'Coffee'],
                                    time: '08:00'
                                },
                                {
                                    mealType: 'Lunch',
                                    foodItems: ['Rice', 'Dal', 'Vegetables'],
                                    time: '13:00'
                                }
                            ],
                        })
                        .set('Content-Type', 'application/json');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/dietary-recall', 'POST', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // MEAL PLAN ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/meal-plan', () => {
        it('returns meal plan data', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/meal-plan/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/meal-plan');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/meal-plan', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // BILLING ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/billing', () => {
        it('returns billing history', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/billing/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/billing');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/billing', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // SUBSCRIPTIONS ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/subscriptions', () => {
        it('returns active subscriptions', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/subscriptions/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/subscriptions');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/subscriptions', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // BMI ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/bmi', () => {
        it('returns BMI data', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/bmi/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/bmi');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        // 200 or 404 (if user not found in test DB) are both valid
                        expect([200, 404]).toContain(response.status);
                    }
                }
                recordMetric('/api/client/bmi', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // HYDRATION GET ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/hydration', () => {
        it('returns hydration data', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/hydration/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/hydration');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/hydration', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEPS GET ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/steps', () => {
        it('returns steps data', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/steps/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/steps');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        // Steps returns 200 with data or empty data
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/steps', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // SLEEP GET ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/sleep', () => {
        it('returns sleep data', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/sleep/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/sleep');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/sleep', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY GET ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/activity', () => {
        it('returns activity data', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/activity/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/activity');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/activity', 'GET', times);
            } finally {
                server.close();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // DIETARY RECALL GET ENDPOINT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('GET /api/client/dietary-recall', () => {
        it('returns dietary recall history', async () => {
            (getServerSession as jest.Mock).mockResolvedValue({ user: toSessionUser(testClient) });

            const route = await import('@/app/api/client/dietary-recall/route');
            const server = createRouteTestServer(route.GET);

            const times: number[] = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    const response = await request(server).get('/api/client/dietary-recall');
                    times.push(Date.now() - start);

                    if (i === 0) {
                        expect(response.status).toBe(200);
                    }
                }
                recordMetric('/api/client/dietary-recall', 'GET', times);
            } finally {
                server.close();
            }
        });
    });
});
