import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {PermissionKey} from '@/types/permissions';
import { UserRole } from '@/types';

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

    const matches=await getNativeDatabase().collection('permissions').where('key','==',permissionKey).where('isActive','==',true).limit(2).get();
    const permission=matches.size===1?matches.docs[0].data():null;

    if (!permission) {
        return { hasPermission: false, reason: 'Permission not found or inactive' };
    }


    // Check if user is explicitly denied
    if ((permission.deniedUsers||[]).includes(userId)) {
        return { hasPermission: false, reason: 'User is explicitly denied this permission' };
    }

    // Check if user is explicitly allowed
    if ((permission.allowedUsers||[]).includes(userId)) {
        return { hasPermission: true, reason: 'User is explicitly granted this permission' };
    }

    // Check if user's role is allowed
    if ((permission.allowedRoles||[]).includes(userRole)) {
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

    const rows=await getNativeDatabase().collection('permissions').where('isActive','==',true).get();
    const duplicateKeys=new Set<string>(),seen=new Set<string>();
    for(const doc of rows.docs){const key=doc.get('key');if(seen.has(key))duplicateKeys.add(key);seen.add(key);}
    return rows.docs.filter(doc=>!duplicateKeys.has(doc.get('key'))&&!(doc.get('deniedUsers')||[]).includes(userId)&&((doc.get('allowedUsers')||[]).includes(userId)||(doc.get('allowedRoles')||[]).includes(userRole))).map(doc=>doc.get('key') as PermissionKey);

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
