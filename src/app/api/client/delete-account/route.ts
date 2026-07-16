import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';

export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Only clients can delete their own accounts through this endpoint
        if (session.user.role !== UserRole.CLIENT) {
            return NextResponse.json(
                { error: 'Only client accounts can be deleted through this endpoint' },
                { status: 403 }
            );
        }

        await connectDB();

        const userId = session.user.id;

        // Verify password for confirmation
        const body = await req.json().catch(() => ({}));
        const { password } = body;

        if (!password) {
            return NextResponse.json(
                { error: 'Password is required to confirm account deletion' },
                { status: 400 }
            );
        }

        // Find the user and verify password
        const user = await User.findById(userId).select('+password');
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return NextResponse.json(
                { error: 'Incorrect password. Please try again.' },
                { status: 401 }
            );
        }

        // Permanently delete the user account and all associated data
        // Delete related data from other collections
        const mongoose = await import('mongoose');
        const db = mongoose.connection.db;

        if (db) {
            // Get all collections
            const collections = await db.listCollections().toArray();
            const collectionNames = collections.map(c => c.name);

            // Delete from common related collections
            const relatedCollections = [
                'mealplans',
                'appointments',
                'messages',
                'progressentries',
                'foodlogs',
                'dietaryrecalls',
                'notifications',
                'payments',
                'subscriptions',
                'hydrationlogs',
                'sleeplogs',
                'activitylogs',
                'steplogs',
            ];

            for (const collName of relatedCollections) {
                if (collectionNames.includes(collName)) {
                    try {
                        await db.collection(collName).deleteMany({
                            $or: [
                                { userId: user._id },
                                { user: user._id },
                                { client: user._id },
                                { clientId: user._id },
                            ]
                        });
                    } catch (err) {
                        console.error(`Error deleting from ${collName}:`, err);
                        // Continue with other deletions
                    }
                }
            }
        }

        // Delete the user document
        await User.findByIdAndDelete(userId);

        return NextResponse.json({
            success: true,
            message: 'Your account has been permanently deleted.',
        });
    } catch (error) {
        console.error('Error deleting account:', error);
        return NextResponse.json(
            { error: 'Failed to delete account. Please try again later.' },
            { status: 500 }
        );
    }
}
