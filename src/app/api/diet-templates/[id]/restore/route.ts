import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connect';
import DietTemplate from '@/lib/db/models/DietTemplate';
import { UserRole } from '@/types';
import mongoose from 'mongoose';
import { clearCacheByTag } from '@/lib/api/utils';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        // Recycle-bin restore is admin-only.
        if (session.user.role !== UserRole.ADMIN) {
            return NextResponse.json(
                { success: false, error: 'Insufficient permissions' },
                { status: 403 }
            );
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, error: 'Invalid template ID' },
                { status: 400 }
            );
        }

        await connectDB();

        const template = await DietTemplate.findById(id);
        if (!template) {
            return NextResponse.json(
                { success: false, error: 'Diet template not found' },
                { status: 404 }
            );
        }

        if (template.isActive) {
            return NextResponse.json({
                success: true,
                message: 'Diet template is already active',
                template,
            });
        }

        template.isActive = true;
        await template.save();

        clearCacheByTag('diet_templates');

        return NextResponse.json({
            success: true,
            message: 'Diet template restored successfully',
            template,
        });
    } catch (error) {
        console.error('Error restoring diet template:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to restore diet template' },
            { status: 500 }
        );
    }
}
