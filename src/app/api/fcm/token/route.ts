import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { registerFCMToken, unregisterFCMToken } from '@/lib/firebase';

/**
 * POST /api/fcm/token - Register a new FCM token
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
        const { token, deviceType = 'web', deviceInfo } = body;
        const normalizedToken = String(token || '').trim();
        const loweredToken = normalizedToken.toLowerCase();

        if (!normalizedToken || loweredToken === 'null' || loweredToken === 'undefined' || loweredToken === 'nan') {
            return NextResponse.json(
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

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error registering FCM token:', error);
        return NextResponse.json(
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
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { token } = body;
        const normalizedToken = String(token || '').trim();
        const loweredToken = normalizedToken.toLowerCase();

        if (!normalizedToken || loweredToken === 'null' || loweredToken === 'undefined' || loweredToken === 'nan') {
            return NextResponse.json(
                { success: false, error: 'Token is required' },
                { status: 400 }
            );
        }

        const result = await unregisterFCMToken(session.user.id, normalizedToken);

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error unregistering FCM token:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
