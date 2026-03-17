import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Permission, {
    PermissionKey,
    PermissionLabels,
    PermissionDescriptions,
    PermissionCategories,
    seedPermissions
} from '@/lib/db/models/Permission';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';

// GET - List all permissions
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || session.user.role !== UserRole.ADMIN) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        // Seed permissions if not exist
        await seedPermissions();

        const permissions = await Permission.find({})
            .populate('allowedUsers', 'firstName lastName email role')
            .populate('deniedUsers', 'firstName lastName email role')
            .sort({ category: 1, name: 1 });

        // Get staff users for selection
        const staffUsers = await User.find({
            role: { $in: [UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR] },
            status: 'active',
        })
            .select('firstName lastName email role')
            .sort({ firstName: 1, lastName: 1 });

        return NextResponse.json({
            success: true,
            permissions,
            staffUsers,
            categories: Object.keys(PermissionCategories),
            labels: PermissionLabels,
            descriptions: PermissionDescriptions,
        });
    } catch (error) {
        console.error('Error fetching permissions:', error);
        return NextResponse.json(
            { error: 'Failed to fetch permissions' },
            { status: 500 }
        );
    }
}

// PUT - Update a permission
export async function PUT(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || session.user.role !== UserRole.ADMIN) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { permissionId, allowedRoles, allowedUsers, deniedUsers, isActive } = body;

        if (!permissionId) {
            return NextResponse.json(
                { error: 'Permission ID is required' },
                { status: 400 }
            );
        }

        await connectDB();

        const permission = await Permission.findById(permissionId);
        if (!permission) {
            return NextResponse.json(
                { error: 'Permission not found' },
                { status: 404 }
            );
        }

        // Update fields if provided
        if (allowedRoles !== undefined) {
            permission.allowedRoles = allowedRoles;
        }
        if (allowedUsers !== undefined) {
            permission.allowedUsers = allowedUsers;
        }
        if (deniedUsers !== undefined) {
            permission.deniedUsers = deniedUsers;
        }
        if (isActive !== undefined) {
            permission.isActive = isActive;
        }

        await permission.save();

        // Populate for response
        await permission.populate('allowedUsers', 'firstName lastName email role');
        await permission.populate('deniedUsers', 'firstName lastName email role');

        return NextResponse.json({
            success: true,
            permission,
            message: 'Permission updated successfully',
        });
    } catch (error) {
        console.error('Error updating permission:', error);
        return NextResponse.json(
            { error: 'Failed to update permission' },
            { status: 500 }
        );
    }
}

// POST - Bulk update permissions
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || session.user.role !== UserRole.ADMIN) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { updates } = body;

        if (!updates || !Array.isArray(updates)) {
            return NextResponse.json(
                { error: 'Updates array is required' },
                { status: 400 }
            );
        }

        await connectDB();

        const results = [];
        for (const update of updates) {
            const { permissionId, allowedRoles, allowedUsers, deniedUsers, isActive } = update;

            const permission = await Permission.findById(permissionId);
            if (permission) {
                if (allowedRoles !== undefined) permission.allowedRoles = allowedRoles;
                if (allowedUsers !== undefined) permission.allowedUsers = allowedUsers;
                if (deniedUsers !== undefined) permission.deniedUsers = deniedUsers;
                if (isActive !== undefined) permission.isActive = isActive;
                await permission.save();
                results.push({ permissionId, success: true });
            } else {
                results.push({ permissionId, success: false, error: 'Not found' });
            }
        }

        return NextResponse.json({
            success: true,
            results,
            message: 'Permissions updated successfully',
        });
    } catch (error) {
        console.error('Error bulk updating permissions:', error);
        return NextResponse.json(
            { error: 'Failed to update permissions' },
            { status: 500 }
        );
    }
}
