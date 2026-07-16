import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { sendNotificationToUser, testFirebaseConnection } from '@/lib/firebase';

/**
 * POST /api/fcm/send - Send a test notification (admin only or to self)
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const {
            userId,
            title = 'Test Notification',
            body: notificationBody = 'This is a test notification from DTPS!',
            data = {}
        } = body;

        // Allow sending to self, or if admin, to anyone
        const targetUserId = userId || session.user.id;

        // Only admins can send to other users
        if (targetUserId !== session.user.id && session.user.role !== 'admin') {
            return NextResponse.json(
                { success: false, error: 'You can only send notifications to yourself' },
                { status: 403 }
            );
        }

        const result = await sendNotificationToUser(targetUserId, {
            title,
            body: notificationBody,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            data,
        });

        return NextResponse.json({
            success: result.successCount > 0,
            ...result,
        });
    } catch (error: any) {
        console.error('Error sending notification:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/fcm/send - Test Firebase connection
 */
export async function GET() {
    try {
        const result = await testFirebaseConnection();
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error testing Firebase:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
