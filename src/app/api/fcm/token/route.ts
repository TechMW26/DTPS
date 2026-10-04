import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { registerFCMToken, unregisterFCMToken } from '@/lib/firebase';
import { getNativeDatabase } from '@/lib/db/firestore-native';
import { isValidMealTimeZone } from '@/lib/task-schedule';

/**
 * POST /api/fcm/token - Register a new FCM token
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return nativeResponseJson(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { token, deviceType = 'web', deviceInfo } = body;
        if (!['web', 'android', 'ios'].includes(deviceType)) return nativeResponseJson({error:'Invalid device type'},{status:400});
        if (body.timeZone !== undefined && !isValidMealTimeZone(body.timeZone)) {
            return nativeResponseJson({ success: false, error: 'Invalid timezone' }, { status: 400 });
        }
        const normalizedToken = String(token || '').trim();
        const loweredToken = normalizedToken.toLowerCase();

        if (!normalizedToken || loweredToken === 'null' || loweredToken === 'undefined' || loweredToken === 'nan') {
            return nativeResponseJson(
                { success: false, error: 'Token is required' },
                { status: 400 }
            );
        }

        const result = await registerFCMToken(
            session.user.id,
            normalizedToken,
            deviceType,
            deviceInfo || request.headers.get('user-agent') || 'Unknown device'
        );

        if (result.success && body.timeZone) {
            await getNativeDatabase().collection('users').doc(session.user.id).update({ notificationTimeZone: body.timeZone, updatedAt: new Date() });
        }
        return nativeResponseJson(result, {status:result.success?200:503});
    } catch (error: any) {
        console.error('Error registering FCM token:', error);
        return nativeResponseJson(
            { success: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/fcm/token - Unregister an FCM token (on logout)
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return nativeResponseJson(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { token } = body;
        const normalizedToken = String(token || '').trim();
        const loweredToken = normalizedToken.toLowerCase();

        if (!normalizedToken || loweredToken === 'null' || loweredToken === 'undefined' || loweredToken === 'nan') {
            return nativeResponseJson(
                { success: false, error: 'Token is required' },
                { status: 400 }
            );
        }

        const result = await unregisterFCMToken(session.user.id, normalizedToken);

        return nativeResponseJson(result, {status:result.success?200:503});
    } catch (error: any) {
        console.error('Error unregistering FCM token:', error);
        return nativeResponseJson(
            { success: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
