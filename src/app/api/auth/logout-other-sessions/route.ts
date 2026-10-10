import {nativeResponseJson} from '@/lib/api/native-response';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, invalidateUserStatusCache } from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {revokeNativeOtherSessions} from '@/lib/db/repository/native-account';
import {recordNativeLogin} from '@/lib/db/repository/native-auth';

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return nativeResponseJson({ error: 'Unauthorized' }, { status: 401 });
        }


        const now = new Date();
        const keepSessionId = session.user.sessionId || '';

        await revokeNativeOtherSessions(getNativeDatabase(),session.user.id,keepSessionId,!!session.user.isWooCommerceClient);

        invalidateUserStatusCache(session.user.id);

        try {
            await recordNativeLogin(getNativeDatabase(),{
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

        return nativeResponseJson({ success: true });
    } catch (error) {
        console.error('Error logging out other sessions:', error);
        return nativeResponseJson({ error: 'Failed to logout other sessions' }, { status: 500 });
    }
}
