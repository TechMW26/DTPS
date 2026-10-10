import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import { getUserPermissions } from '@/lib/permissions/check';
import { PermissionKey } from '@/types/permissions';
import { UserRole } from '@/types';

// GET - Check permissions for current user or specific user
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return nativeResponseJson({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const permissionKey = searchParams.get('permission') as PermissionKey | null;
        const userId = searchParams.get('userId') || session.user.id;

        // Only admin can check other users' permissions
        if (userId !== session.user.id && session.user.role !== UserRole.ADMIN) {
            return nativeResponseJson({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user's role if checking another user
        let userRole = session.user.role as UserRole;
        if (userId !== session.user.id) {
            if(!/^[a-f0-9]{24}$/.test(userId))return nativeResponseJson({error:'Invalid user ID'},{status:400});
            const user=(await getNativeDatabase().collection('users').doc(userId).get()).data();
            if (!user) {
                return nativeResponseJson({ error: 'User not found' }, { status: 404 });
            }
            userRole = user.role as UserRole;
        }

        // If checking a specific permission
        if (permissionKey) {
            const { checkPermission } = await import('@/lib/permissions/check');
            const result = await checkPermission(userId, userRole, permissionKey);
            return nativeResponseJson({
                success: true,
                permission: permissionKey,
                ...result,
            });
        }

        // Get all permissions for the user
        const permissions = await getUserPermissions(userId, userRole);

        return nativeResponseJson({
            success: true,
            userId,
            role: userRole,
            permissions,
            isAdmin: userRole === UserRole.ADMIN,
        });
    } catch (error) {
        console.error('Error checking permissions:', error);
        return nativeResponseJson(
            { error: 'Failed to check permissions' },
            { status: 500 }
        );
    }
}
