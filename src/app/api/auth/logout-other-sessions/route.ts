import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, invalidateUserStatusCache } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import ActivityLog from '@/lib/db/models/ActivityLog';

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        const now = new Date();
        const keepSessionId = session.user.sessionId || '';

        await User.findByIdAndUpdate(session.user.id, {
            $set: {
                logoutOtherSessionsAt: now,
                keepCurrentSessionId: keepSessionId,
            },
        });

        invalidateUserStatusCache(session.user.id);

        try {
            await ActivityLog.create({
                userId: session.user.id,
                userRole: session.user.role,
                userName: session.user.name || `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim() || 'User',
                userEmail: session.user.email,
                action: 'Logged Out Other Devices',
                actionType: 'logout',
                category: 'auth',
                description: `${session.user.name || 'User'} logged out other active sessions`,
                details: {
                    keepSessionId,
                    triggeredAt: now.toISOString(),
                },
                isRead: false,
            });
        } catch (logError) {
            console.error('Failed to log logout-other-sessions activity:', logError);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error logging out other sessions:', error);
        return NextResponse.json({ error: 'Failed to logout other sessions' }, { status: 500 });
    }
}
