import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import DurationPreset from '@/lib/db/models/DurationPreset';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET - Fetch all duration presets (accessible by all authenticated users)
export async function GET() {
    try {
        await connectDB();

        const presets = await withCache(
            'duration-presets:active',
            async () => await DurationPreset.find({ isActive: true })
                .sort({ sortOrder: 1, days: 1 })
                .select('days label')
                .lean(),
            { ttl: 300000, tags: ['duration_presets'] }
        );

        return NextResponse.json({
            success: true,
            presets
        });
    } catch (error) {
        console.error('Error fetching duration presets:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch duration presets' },
            { status: 500 }
        );
    }
}

// POST - Create new duration preset (admin only)
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || session.user.role !== UserRole.ADMIN) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized - Admin only' },
                { status: 401 }
            );
        }

        await connectDB();
        const body = await req.json();
        const { days, label } = body;

        if (!days || !label) {
            return NextResponse.json(
                { success: false, error: 'Days and label are required' },
                { status: 400 }
            );
        }

        // Check if days already exists
        const existing = await DurationPreset.findOne({ days });
        if (existing) {
            return NextResponse.json(
                { success: false, error: 'A preset with this duration already exists' },
                { status: 400 }
            );
        }

        // Get max sort order
        const maxOrder = await DurationPreset.findOne().sort({ sortOrder: -1 }).select('sortOrder');
        const sortOrder = (maxOrder?.sortOrder || 0) + 1;

        const preset = await DurationPreset.create({
            days: Number(days),
            label: label.trim(),
            isActive: true,
            sortOrder,
            createdBy: session.user.id
        });

        clearCacheByTag('duration_presets');

        return NextResponse.json({
            success: true,
            preset,
            message: 'Duration preset created successfully'
        });
    } catch (error) {
        console.error('Error creating duration preset:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create duration preset' },
            { status: 500 }
        );
    }
}

// PUT - Update duration preset (admin only)
export async function PUT(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || session.user.role !== UserRole.ADMIN) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized - Admin only' },
                { status: 401 }
            );
        }

        await connectDB();
        const body = await req.json();
        const { id, days, label, isActive, sortOrder } = body;

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'Preset ID is required' },
                { status: 400 }
            );
        }

        // Check if days already exists for another preset
        if (days) {
            const existing = await DurationPreset.findOne({ days, _id: { $ne: id } });
            if (existing) {
                return NextResponse.json(
                    { success: false, error: 'A preset with this duration already exists' },
                    { status: 400 }
                );
            }
        }

        const updateData: Record<string, any> = {};
        if (days !== undefined) updateData.days = Number(days);
        if (label !== undefined) updateData.label = label.trim();
        if (isActive !== undefined) updateData.isActive = isActive;
        if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

        const preset = await DurationPreset.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );

        if (!preset) {
            return NextResponse.json(
                { success: false, error: 'Preset not found' },
                { status: 404 }
            );
        }

        clearCacheByTag('duration_presets');

        return NextResponse.json({
            success: true,
            preset,
            message: 'Duration preset updated successfully'
        });
    } catch (error) {
        console.error('Error updating duration preset:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update duration preset' },
            { status: 500 }
        );
    }
}

// DELETE - Delete duration preset (admin only)
export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || session.user.role !== UserRole.ADMIN) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized - Admin only' },
                { status: 401 }
            );
        }

        await connectDB();
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'Preset ID is required' },
                { status: 400 }
            );
        }

        const preset = await DurationPreset.findByIdAndDelete(id);

        if (!preset) {
            return NextResponse.json(
                { success: false, error: 'Preset not found' },
                { status: 404 }
            );
        }

        clearCacheByTag('duration_presets');

        return NextResponse.json({
            success: true,
            message: 'Duration preset deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting duration preset:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete duration preset' },
            { status: 500 }
        );
    }
}
