import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { getUserPermissions } from '@/lib/permissions/check';
import { PermissionKey } from '@/lib/db/models/Permission';
import { UserRole } from '@/types';

// GET - Check permissions for current user or specific user
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const permissionKey = searchParams.get('permission') as PermissionKey | null;
        const userId = searchParams.get('userId') || session.user.id;

        // Only admin can check other users' permissions
        if (userId !== session.user.id && session.user.role !== UserRole.ADMIN) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        // Get user's role if checking another user
        let userRole = session.user.role as UserRole;
        if (userId !== session.user.id) {
            const User = (await import('@/lib/db/models/User')).default;
            const user = await User.findById(userId).select('role');
            if (!user) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }
            userRole = user.role;
        }

        // If checking a specific permission
        if (permissionKey) {
            const { checkPermission } = await import('@/lib/permissions/check');
            const result = await checkPermission(userId, userRole, permissionKey);
            return NextResponse.json({
                success: true,
                permission: permissionKey,
                ...result,
            });
        }

        // Get all permissions for the user
        const permissions = await getUserPermissions(userId, userRole);

        return NextResponse.json({
            success: true,
            userId,
            role: userRole,
            permissions,
            isAdmin: userRole === UserRole.ADMIN,
        });
    } catch (error) {
        console.error('Error checking permissions:', error);
        return NextResponse.json(
            { error: 'Failed to check permissions' },
            { status: 500 }
        );
    }
}
