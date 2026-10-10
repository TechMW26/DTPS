import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import {getNativeDatabase} from '@/lib/db/database';
import {consumeNativeOtp} from '@/lib/db/repository/native-otp';
import { getFirebaseAdmin } from '@/lib/firebase/firebaseAdmin';
import { validatePhoneNumber } from '@/lib/validations/contact';
import {
    completePhoneAuth,
    PhoneAuthError,
    verifyPhoneAuthIntentToken,
} from '@/lib/auth/phoneAuthServer';

async function verifyFirebaseToken(idToken: string, expectedPhone: string): Promise<void> {
    const app = await getFirebaseAdmin();
    if (!app) throw new PhoneAuthError('Firebase verification is temporarily unavailable.', 503);

    let decoded;
    try {
        decoded = await getAuth(app).verifyIdToken(idToken, true);
    } catch (error) {
        console.warn('Firebase phone token verification failed:', error);
        throw new PhoneAuthError('The SMS code is invalid or has expired. Please request a new code.', 401);
    }

    const verifiedPhone = validatePhoneNumber(String(decoded.phone_number || ''), '+91');
    if (!verifiedPhone.isValid || verifiedPhone.normalized !== expectedPhone) {
        throw new PhoneAuthError('The verified phone number does not match this login request.', 401);
    }
}


export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        if (typeof body.authIntent !== 'string') {
            return nativeResponseJson(
                { success: false, error: 'This verification request is missing or expired. Please request a new code.' },
                { status: 400 },
            );
        }

        const intent = verifyPhoneAuthIntentToken(body.authIntent);

        if (body.provider === 'firebase') {
            if (typeof body.idToken !== 'string' || !body.idToken) {
                throw new PhoneAuthError('Firebase verification token is required.', 400);
            }
            await verifyFirebaseToken(body.idToken, intent.phone);
        } else if (body.provider === 'whatsapp') {
            const verified=await consumeNativeOtp(getNativeDatabase(),intent.phone,intent.mode,String(body.otp||''));
            if(!verified.ok)throw new PhoneAuthError(
                verified.reason==='attempts'?'Too many incorrect attempts. Please request a new code.':'The verification code is incorrect, expired or already used. Please request a new code.',
                verified.reason==='attempts'?429:400,
            );
        } else {
            throw new PhoneAuthError('Unsupported verification provider.', 400);
        }

        const result = await completePhoneAuth(intent);
        return nativeResponseJson(result);
    } catch (error) {
        if (error instanceof PhoneAuthError) {
            return nativeResponseJson({
                success: false,
                error: error.message,
                fallbackEligible: error.status === 503,
            }, { status: error.status });
        }
        console.error('Phone verification failed:', error);
        return nativeResponseJson(
            { success: false, error: 'Verification failed. Please try again.' },
            { status: 500 },
        );
    }
}
