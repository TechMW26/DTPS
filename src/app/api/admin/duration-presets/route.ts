import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import DurationPreset from '@/lib/db/models/DurationPreset';
import { UserRole } from '@/types';

// GET - Fetch all duration presets including inactive (admin only)
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || session.user.role !== UserRole.ADMIN) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized - Admin only' },
                { status: 401 }
            );
        }

        await connectDB();

        const presets = await DurationPreset.find()
            .sort({ sortOrder: 1, days: 1 })
            .populate('createdBy', 'name email')
            .lean();

        return NextResponse.json({
            success: true,
            presets
        });
    } catch (error) {
        console.error('Error fetching admin duration presets:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch duration presets' },
            { status: 500 }
        );
    }
}

// POST - Seed default presets if none exist (admin only)
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

        // Check if presets exist
        const count = await DurationPreset.countDocuments();
        if (count > 0) {
            return NextResponse.json({
                success: true,
                message: 'Presets already exist',
                seeded: false
            });
        }

        // Seed default presets
        const defaultPresets = [
            { days: 7, label: '1 Week', sortOrder: 1 },
            { days: 10, label: '10 Days', sortOrder: 2 },
            { days: 14, label: '2 Weeks', sortOrder: 3 },
            { days: 21, label: '3 Weeks', sortOrder: 4 },
            { days: 30, label: '1 Month', sortOrder: 5 },
            { days: 60, label: '2 Months', sortOrder: 6 },
            { days: 90, label: '3 Months', sortOrder: 7 },
            { days: 180, label: '6 Months', sortOrder: 8 },
            { days: 365, label: '1 Year', sortOrder: 9 },
        ];

        const presets = await DurationPreset.insertMany(
            defaultPresets.map(p => ({
                ...p,
                isActive: true,
                createdBy: session.user.id
            }))
        );

        return NextResponse.json({
            success: true,
            message: 'Default presets seeded successfully',
            seeded: true,
            count: presets.length
        });
    } catch (error) {
        console.error('Error seeding duration presets:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to seed duration presets' },
            { status: 500 }
        );
    }
}

// PUT - Reorder presets (admin only)
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
        const { orderedIds } = body;

        if (!orderedIds || !Array.isArray(orderedIds)) {
            return NextResponse.json(
                { success: false, error: 'orderedIds array is required' },
                { status: 400 }
            );
        }

        // Update sort order for each preset using individual updates
        for (let i = 0; i < orderedIds.length; i++) {
            await DurationPreset.findByIdAndUpdate(orderedIds[i], { sortOrder: i + 1 });
        }

        return NextResponse.json({
            success: true,
            message: 'Presets reordered successfully'
        });
    } catch (error) {
        console.error('Error reordering duration presets:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to reorder presets' },
            { status: 500 }
        );
    }
}
