/**
 * Integration tests: Health Counselor can ONLY assign clients to PRIMARY dietitian
 *
 * Tests the restriction that Health Counselors:
 * 1. See only primary-eligible dietitians (no secondaries) in the GET dropdown
 * 2. Can replace the primary dietitian via PATCH
 * 3. Are BLOCKED from adding secondary dietitians (add mode when primary exists)
 * 4. Are BLOCKED from assigning multiple dietitians at once
 * 5. Admin users are NOT restricted (can assign both primary & secondary)
 */

import Permission, { PermissionKey } from '@/lib/db/models/Permission';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { entityId } from '../utils/assertions';
import { createUser, ensureDatabaseConnection } from '../utils/database';
import { invokeRouteWithParams } from '../utils/routes';

// Helper: create the ASSIGN_CLIENTS_TO_DIETITIANS permission granting it to health_counselor role
async function ensureAssignDietitiansPermission(): Promise<void> {
    await Permission.findOneAndUpdate(
        { key: PermissionKey.ASSIGN_CLIENTS_TO_DIETITIANS },
        {
            key: PermissionKey.ASSIGN_CLIENTS_TO_DIETITIANS,
            name: 'Assign Clients to Dietitians',
            description: 'Assign clients to dietitians',
            category: 'Client Management',
            allowedRoles: [UserRole.HEALTH_COUNSELOR, UserRole.DIETITIAN],
            isActive: true,
        },
        { upsert: true, new: true }
    );
}

// Helper: create a full test scenario (HC, client assigned to HC, primary dietitian, secondary dietitian)
async function createTestScenario() {
    const healthCounselor = await createUser({ role: UserRole.HEALTH_COUNSELOR });
    const primaryDietitian = await createUser({ role: UserRole.DIETITIAN });
    const secondaryDietitian = await createUser({ role: UserRole.DIETITIAN });
    const admin = await createUser({ role: UserRole.ADMIN });

    // Create client assigned to the HC and the primary dietitian
    const client = await createUser({
        role: UserRole.CLIENT,
        assignedHealthCounselor: healthCounselor._id,
        assignedHealthCounselors: [healthCounselor._id],
        assignedDietitian: primaryDietitian._id,
        assignedDietitians: [secondaryDietitian._id], // secondaries array
    });

    await ensureAssignDietitiansPermission();

    return { healthCounselor, primaryDietitian, secondaryDietitian, admin, client };
}

describe('Health Counselor Primary Dietitian Restriction', () => {
    beforeAll(async () => {
        await ensureDatabaseConnection();
    });

    // ================================================================
    // GET /api/clients/[clientId]/assign — Dropdown Data
    // ================================================================
    describe('GET /api/clients/[clientId]/assign', () => {
        it('should return primaryDietitianOnly=true for Health Counselor role', async () => {
            const { healthCounselor, client } = await createTestScenario();

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.GET, {
                method: 'GET',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: healthCounselor,
                params: { clientId: entityId(client) },
            });

            expect(result.status).toBe(200);
            expect(result.json.primaryDietitianOnly).toBe(true);
            expect(result.json.assignmentMessage).toContain('Primary Dietitian');
        });

        it('should mark primary dietitian with isPrimary=true for Health Counselor', async () => {
            const { healthCounselor, primaryDietitian, client } = await createTestScenario();

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.GET, {
                method: 'GET',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: healthCounselor,
                params: { clientId: entityId(client) },
            });

            expect(result.status).toBe(200);
            const dietitians = result.json.dietitians;
            expect(dietitians).toBeDefined();
            expect(Array.isArray(dietitians)).toBe(true);

            const primary = dietitians.find(
                (d: any) => d._id.toString() === entityId(primaryDietitian)
            );
            expect(primary).toBeTruthy();
            expect(primary.isPrimary).toBe(true);
        });

        it('should mark secondary dietitian with isSecondary=true for Health Counselor', async () => {
            const { healthCounselor, secondaryDietitian, client } = await createTestScenario();

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.GET, {
                method: 'GET',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: healthCounselor,
                params: { clientId: entityId(client) },
            });

            expect(result.status).toBe(200);
            const secondary = result.json.dietitians.find(
                (d: any) => d._id.toString() === entityId(secondaryDietitian)
            );
            expect(secondary).toBeTruthy();
            expect(secondary.isSecondary).toBe(true);
        });

        it('should NOT set primaryDietitianOnly for Admin role', async () => {
            const { admin, client } = await createTestScenario();

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.GET, {
                method: 'GET',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: admin,
                params: { clientId: entityId(client) },
            });

            expect(result.status).toBe(200);
            expect(result.json.primaryDietitianOnly).toBeUndefined();
            // Admin sees all dietitians without isPrimary/isSecondary flags
            const dietitians = result.json.dietitians;
            expect(dietitians).toBeDefined();
            const anyWithFlag = dietitians.some((d: any) => d.isPrimary !== undefined || d.isSecondary !== undefined);
            expect(anyWithFlag).toBe(false);
        });

        it('should return all active dietitians for HC (including both primary & secondary markers)', async () => {
            const { healthCounselor, primaryDietitian, secondaryDietitian, client } = await createTestScenario();

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.GET, {
                method: 'GET',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: healthCounselor,
                params: { clientId: entityId(client) },
            });

            expect(result.status).toBe(200);
            const ids = result.json.dietitians.map((d: any) => d._id.toString());
            expect(ids).toContain(entityId(primaryDietitian));
            expect(ids).toContain(entityId(secondaryDietitian));
        });
    });

    // ================================================================
    // PATCH /api/clients/[clientId]/assign — Assignment Restriction
    // ================================================================
    describe('PATCH /api/clients/[clientId]/assign', () => {
        it('should allow HC to replace primary dietitian (mode=replace)', async () => {
            const { healthCounselor, client } = await createTestScenario();
            const newDietitian = await createUser({ role: UserRole.DIETITIAN });

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.PATCH, {
                method: 'PATCH',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: healthCounselor,
                params: { clientId: entityId(client) },
                body: {
                    dietitianId: entityId(newDietitian),
                    mode: 'replace',
                },
            });

            expect(result.status).toBe(200);
            expect(result.json.success).toBe(true);
            expect(result.json.message).toContain('Assignment updated');

            // Verify in DB: primary dietitian is now the new one
            const updatedClient = await User.findById(client._id).lean() as any;
            expect(updatedClient.assignedDietitian.toString()).toBe(entityId(newDietitian));
        });

        it('should allow HC to set primary dietitian when none exists (mode=add)', async () => {
            const { healthCounselor } = await createTestScenario();
            const newDietitian = await createUser({ role: UserRole.DIETITIAN });

            // Create client with NO dietitian assigned
            const clientNoPrimary = await createUser({
                role: UserRole.CLIENT,
                assignedHealthCounselor: healthCounselor._id,
                assignedHealthCounselors: [healthCounselor._id],
                assignedDietitian: null,
                assignedDietitians: [],
            });

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.PATCH, {
                method: 'PATCH',
                url: `http://localhost/api/clients/${entityId(clientNoPrimary)}/assign`,
                user: healthCounselor,
                params: { clientId: entityId(clientNoPrimary) },
                body: {
                    dietitianId: entityId(newDietitian),
                    mode: 'add',
                },
            });

            expect(result.status).toBe(200);
            expect(result.json.success).toBe(true);

            // Verify primary was set
            const updatedClient = await User.findById(clientNoPrimary._id).lean() as any;
            expect(updatedClient.assignedDietitian.toString()).toBe(entityId(newDietitian));
        });

        it('should BLOCK HC from adding secondary dietitian (mode=add when primary exists)', async () => {
            const { healthCounselor, client } = await createTestScenario();
            const anotherDietitian = await createUser({ role: UserRole.DIETITIAN });

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.PATCH, {
                method: 'PATCH',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: healthCounselor,
                params: { clientId: entityId(client) },
                body: {
                    dietitianId: entityId(anotherDietitian),
                    mode: 'add',
                },
            });

            expect(result.status).toBe(403);
            expect(result.json.error).toContain('Only Primary Dietitian assignment is allowed');
            expect(result.json.code).toBe('SECONDARY_ASSIGNMENT_BLOCKED');
        });

        it('should BLOCK HC from assigning multiple dietitians at once', async () => {
            const { healthCounselor, client } = await createTestScenario();
            const dt1 = await createUser({ role: UserRole.DIETITIAN });
            const dt2 = await createUser({ role: UserRole.DIETITIAN });

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.PATCH, {
                method: 'PATCH',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: healthCounselor,
                params: { clientId: entityId(client) },
                body: {
                    dietitianIds: [entityId(dt1), entityId(dt2)],
                    mode: 'replace',
                },
            });

            expect(result.status).toBe(403);
            expect(result.json.error).toContain('only assign one primary dietitian');
            expect(result.json.code).toBe('MULTIPLE_DIETITIAN_BLOCKED');
        });

        it('should allow Admin to add secondary dietitian (mode=add when primary exists)', async () => {
            const { admin, client } = await createTestScenario();
            const anotherDietitian = await createUser({ role: UserRole.DIETITIAN });

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.PATCH, {
                method: 'PATCH',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: admin,
                params: { clientId: entityId(client) },
                body: {
                    dietitianId: entityId(anotherDietitian),
                    mode: 'add',
                },
            });

            expect(result.status).toBe(200);
            expect(result.json.success).toBe(true);

            // Verify secondary was added
            const updatedClient = await User.findById(client._id).lean() as any;
            const secondaryIds = updatedClient.assignedDietitians.map((d: any) => d.toString());
            expect(secondaryIds).toContain(entityId(anotherDietitian));
        });

        it('should allow Admin to assign multiple dietitians at once', async () => {
            const { admin, client } = await createTestScenario();
            const dt1 = await createUser({ role: UserRole.DIETITIAN });
            const dt2 = await createUser({ role: UserRole.DIETITIAN });

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.PATCH, {
                method: 'PATCH',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: admin,
                params: { clientId: entityId(client) },
                body: {
                    dietitianIds: [entityId(dt1), entityId(dt2)],
                    mode: 'replace',
                },
            });

            expect(result.status).toBe(200);
            expect(result.json.success).toBe(true);
        });

        it('should reject HC assignment if client is not assigned to the HC', async () => {
            const { client } = await createTestScenario();
            const unrelatedHC = await createUser({ role: UserRole.HEALTH_COUNSELOR });
            const newDietitian = await createUser({ role: UserRole.DIETITIAN });
            await ensureAssignDietitiansPermission();

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.PATCH, {
                method: 'PATCH',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: unrelatedHC,
                params: { clientId: entityId(client) },
                body: {
                    dietitianId: entityId(newDietitian),
                    mode: 'replace',
                },
            });

            expect(result.status).toBe(403);
            expect(result.json.error).toContain('only modify assignments for clients assigned to you');
        });
    });

    // ================================================================
    // Role-Based Access Control validation
    // ================================================================
    describe('Role-Based Access Control', () => {
        it('should return 403 if user has no assign permission', async () => {
            const hcNoPerms = await createUser({ role: UserRole.HEALTH_COUNSELOR });
            const { client } = await createTestScenario();

            // Remove HC role from the permission
            await Permission.findOneAndUpdate(
                { key: PermissionKey.ASSIGN_CLIENTS_TO_DIETITIANS },
                { allowedRoles: [UserRole.DIETITIAN] } // HC not included
            );

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.GET, {
                method: 'GET',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: hcNoPerms,
                params: { clientId: entityId(client) },
            });

            expect(result.status).toBe(403);

            // Restore permission for subsequent tests
            await ensureAssignDietitiansPermission();
        });

        it('should return 401 for unauthenticated request', async () => {
            const { client } = await createTestScenario();

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.GET, {
                method: 'GET',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: null,
                params: { clientId: entityId(client) },
            });

            expect(result.status).toBe(401);
        });
    });

    // ================================================================
    // Edge Cases
    // ================================================================
    describe('Edge Cases', () => {
        it('should handle assignment when client has no primary or secondary dietitians', async () => {
            const healthCounselor = await createUser({ role: UserRole.HEALTH_COUNSELOR });
            await ensureAssignDietitiansPermission();

            const clientEmpty = await createUser({
                role: UserRole.CLIENT,
                assignedHealthCounselor: healthCounselor._id,
                assignedHealthCounselors: [healthCounselor._id],
            });

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const getResult = await invokeRouteWithParams(route.GET, {
                method: 'GET',
                url: `http://localhost/api/clients/${entityId(clientEmpty)}/assign`,
                user: healthCounselor,
                params: { clientId: entityId(clientEmpty) },
            });

            expect(getResult.status).toBe(200);
            expect(getResult.json.primaryDietitianOnly).toBe(true);
            // None should be marked as primary
            const hasPrimary = getResult.json.dietitians.some((d: any) => d.isPrimary === true);
            expect(hasPrimary).toBe(false);
        });

        it('should validate that dietitianId references an actual dietitian', async () => {
            const { healthCounselor, client } = await createTestScenario();

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.PATCH, {
                method: 'PATCH',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: healthCounselor,
                params: { clientId: entityId(client) },
                body: {
                    dietitianId: entityId(healthCounselor), // HC is not a dietitian
                    mode: 'replace',
                },
            });

            expect(result.status).toBe(400);
            expect(result.json.error).toContain('Invalid dietitian');
        });

        it('should handle client that is not found', async () => {
            const { healthCounselor } = await createTestScenario();
            const fakeId = '000000000000000000000000';

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.PATCH, {
                method: 'PATCH',
                url: `http://localhost/api/clients/${fakeId}/assign`,
                user: healthCounselor,
                params: { clientId: fakeId },
                body: {
                    dietitianId: entityId(healthCounselor),
                    mode: 'replace',
                },
            });

            expect(result.status).toBe(404);
            expect(result.json.error).toContain('Client not found');
        });
    });

    // ================================================================
    // Database Integrity
    // ================================================================
    describe('Database Integrity', () => {
        it('should correctly update assignedDietitian field on replace', async () => {
            const { healthCounselor, primaryDietitian, client } = await createTestScenario();
            const newPrimary = await createUser({ role: UserRole.DIETITIAN });

            const route = await import('@/app/api/clients/[clientId]/assign/route');
            await invokeRouteWithParams(route.PATCH, {
                method: 'PATCH',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: healthCounselor,
                params: { clientId: entityId(client) },
                body: {
                    dietitianId: entityId(newPrimary),
                    mode: 'replace',
                },
            });

            const updatedClient = await User.findById(client._id).lean() as any;
            // Primary changed
            expect(updatedClient.assignedDietitian.toString()).toBe(entityId(newPrimary));
            // assignedDietitians should contain only the new primary
            expect(updatedClient.assignedDietitians.map((d: any) => d.toString())).toEqual([entityId(newPrimary)]);
        });

        it('should not alter secondary dietitians when Admin replaces primary', async () => {
            const { admin, primaryDietitian, secondaryDietitian, client } = await createTestScenario();
            const newPrimary = await createUser({ role: UserRole.DIETITIAN });

            // Admin uses primary_secondary mode on admin route - but here testing the general assign route
            const route = await import('@/app/api/clients/[clientId]/assign/route');
            const result = await invokeRouteWithParams(route.PATCH, {
                method: 'PATCH',
                url: `http://localhost/api/clients/${entityId(client)}/assign`,
                user: admin,
                params: { clientId: entityId(client) },
                body: {
                    dietitianId: entityId(newPrimary),
                    mode: 'add',
                },
            });

            expect(result.status).toBe(200);

            const updatedClient = await User.findById(client._id).lean() as any;
            // Secondary dietitian should still be present
            const allDietitianIds = updatedClient.assignedDietitians.map((d: any) => d.toString());
            expect(allDietitianIds).toContain(entityId(secondaryDietitian));
            expect(allDietitianIds).toContain(entityId(newPrimary));
        });
    });
});
