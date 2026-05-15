import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Permission, { PermissionKey } from '@/lib/db/models/Permission';
import { withCache } from '@/lib/api/utils';
import { UserRole } from '@/types';
import { Types } from 'mongoose';

export interface PermissionCheckResult {
    hasPermission: boolean;
    reason?: string;
}

/**
 * Check if a user has a specific permission
 * Admin always has all permissions
 * 
 * @param userId - The user ID to check
 * @param userRole - The user's role
 * @param permissionKey - The permission to check
 * @returns PermissionCheckResult
 */
export async function checkPermission(
    userId: string,
    userRole: UserRole,
    permissionKey: PermissionKey
): Promise<PermissionCheckResult> {
    // Admin always has all permissions
    if (userRole === UserRole.ADMIN) {
        return { hasPermission: true, reason: 'Admin has all permissions' };
    }

    // Clients don't have staff permissions
    if (userRole === UserRole.CLIENT) {
        return { hasPermission: false, reason: 'Clients do not have staff permissions' };
    }

    await connectDB();

    const permission = await withCache(
        `permissions:key:${permissionKey}`,
        async () => Permission.findOne({ key: permissionKey, isActive: true }).lean(),
        { ttl: 30000, tags: ['permissions'] }
    );

    if (!permission) {
        return { hasPermission: false, reason: 'Permission not found or inactive' };
    }

    const userObjectId = new Types.ObjectId(userId);

    // Check if user is explicitly denied
    if (permission.deniedUsers.some((id: Types.ObjectId) => id.equals(userObjectId))) {
        return { hasPermission: false, reason: 'User is explicitly denied this permission' };
    }

    // Check if user is explicitly allowed
    if (permission.allowedUsers.some((id: Types.ObjectId) => id.equals(userObjectId))) {
        return { hasPermission: true, reason: 'User is explicitly granted this permission' };
    }

    // Check if user's role is allowed
    if (permission.allowedRoles.includes(userRole)) {
        return { hasPermission: true, reason: 'User role has this permission' };
    }

    return { hasPermission: false, reason: 'User does not have this permission' };
}

/**
 * Check permission using the current session
 * @param permissionKey - The permission to check
 * @returns PermissionCheckResult
 */
export async function checkSessionPermission(
    permissionKey: PermissionKey
): Promise<PermissionCheckResult> {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session?.user?.role) {
        return { hasPermission: false, reason: 'Not authenticated' };
    }

    return checkPermission(session.user.id, session.user.role as UserRole, permissionKey);
}

/**
 * Get all permissions for a user
 * @param userId - The user ID
 * @param userRole - The user's role
 * @returns Array of permission keys the user has
 */
export async function getUserPermissions(
    userId: string,
    userRole: UserRole
): Promise<PermissionKey[]> {
    // Admin has all permissions
    if (userRole === UserRole.ADMIN) {
        return Object.values(PermissionKey);
    }

    // Clients don't have staff permissions
    if (userRole === UserRole.CLIENT) {
        return [];
    }

    await connectDB();

    return withCache(
        `permissions:user:${userId}:role:${userRole}`,
        async () => {
            const userObjectId = new Types.ObjectId(userId);

            // Find all permissions where:
            // 1. User's role is in allowedRoles, OR
            // 2. User is in allowedUsers
            // AND user is NOT in deniedUsers
            const permissions = await Permission.find({
                isActive: true,
                deniedUsers: { $ne: userObjectId },
                $or: [
                    { allowedRoles: userRole },
                    { allowedUsers: userObjectId },
                ],
            }).select('key').lean();

            return permissions.map((p) => p.key as PermissionKey);
        },
        { ttl: 30000, tags: ['permissions'] }
    );
}

/**
 * Get all permissions for the current session user
 * @returns Array of permission keys
 */
export async function getSessionUserPermissions(): Promise<PermissionKey[]> {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session?.user?.role) {
        return [];
    }

    return getUserPermissions(session.user.id, session.user.role as UserRole);
}

/**
 * Higher-order function to wrap API route handlers with permission check
 * @param permissionKey - Required permission
 * @param handler - The API route handler
 */
export function withPermission<TContext = unknown>(
    permissionKey: PermissionKey,
    handler: (req: Request, context?: TContext) => Promise<Response>
) {
    return async (req: Request, context?: TContext): Promise<Response> => {
        const result = await checkSessionPermission(permissionKey);

        if (!result.hasPermission) {
            return Response.json(
                { error: 'Permission denied', reason: result.reason },
                { status: 403 }
            );
        }

        return handler(req, context);
    };
}

/**
 * Require multiple permissions (all must be granted)
 */
export async function checkAllPermissions(
    userId: string,
    userRole: UserRole,
    permissionKeys: PermissionKey[]
): Promise<PermissionCheckResult> {
    for (const key of permissionKeys) {
        const result = await checkPermission(userId, userRole, key);
        if (!result.hasPermission) {
            return result;
        }
    }
    return { hasPermission: true };
}

/**
 * Require at least one permission (any one is sufficient)
 */
export async function checkAnyPermission(
    userId: string,
    userRole: UserRole,
    permissionKeys: PermissionKey[]
): Promise<PermissionCheckResult> {
    for (const key of permissionKeys) {
        const result = await checkPermission(userId, userRole, key);
        if (result.hasPermission) {
            return result;
        }
    }
    return { hasPermission: false, reason: 'User does not have any of the required permissions' };
}
