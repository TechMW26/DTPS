import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse } from 'next/server';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {issueNativeOtp,cancelNativeOtp} from '@/lib/db/repository/native-otp';
import { OTP_CONFIG } from '@/lib/auth/otpStore';
import {
    createPhoneAuthIntentToken,
    maskPhone,
    PhoneAuthError,
    preparePhoneAuth,
    verifyPhoneAuthIntentToken,
} from '@/lib/auth/phoneAuthServer';

const FIREBASE_FALLBACK_REASONS = new Set([
    'auth/billing-not-enabled',
    'auth/captcha-check-failed',
    'auth/configuration-not-found',
    'auth/internal-error',
    'auth/invalid-api-key',
    'auth/invalid-app-credential',
    'auth/missing-recaptcha-token',
    'auth/network-request-failed',
    'auth/operation-not-allowed',
    'auth/quota-exceeded',
    'auth/unauthorized-domain',
    'firebase-client-incompatible',
    'firebase-config-unavailable',
    'firebase-service-unavailable',
    'ios-native-app',
]);

function firebaseClientConfigAvailable(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY
        && process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
        && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    );
}

async function sendWhatsappFallback(authIntent: string, fallbackReason: string) {
    if (!FIREBASE_FALLBACK_REASONS.has(fallbackReason)) {
        return nativeResponseJson(
            { success: false, error: 'WhatsApp fallback is available only when SMS delivery is unavailable.' },
            { status: 400 },
        );
    }

    const intent = verifyPhoneAuthIntentToken(authIntent);
    if (process.env.NODE_ENV !== 'production') {
        return nativeResponseJson({ success: false, error: 'WhatsApp delivery is disabled during local migration testing.' }, { status: 503 });
    }
    const isNativeIosPrimary = fallbackReason === 'ios-native-app';
    const unavailableMessage = isNativeIosPrimary
        ? 'WhatsApp verification is temporarily unavailable. Please try again later.'
        : 'Both SMS and WhatsApp verification are temporarily unavailable. Please try again later.';
    const apiKey = process.env.AISENSY_API_KEY;
    const apiUrl = process.env.AISENSY_API_URL || 'https://backend.aisensy.com/campaign/t1/api/v2';
    if (!apiKey) {
        return nativeResponseJson(
            { success: false, error: unavailableMessage },
            { status: 503 },
        );
    }

    const record=await issueNativeOtp(getNativeDatabase(),intent.phone,intent.mode);
    if(!record)return nativeResponseJson({success:false,error:'Too many verification requests. Please try again in an hour.'},{status:429});
    const otp=record.otp;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey,
                campaignName: 'OTP',
                destination: intent.phone.replace(/^\+/, ''),
                userName: intent.userName,
                source: isNativeIosPrimary ? 'ios_native_app' : 'firebase_sms_fallback',
                templateParams: [otp],
                buttons: [{
                    type: 'button',
                    sub_type: 'url',
                    index: '0',
                    parameters: [{ type: 'text', text: otp }],
                }],
            }),
        });
        await response.body?.cancel();
        if (!response.ok) {
            console.error('AISensy fallback delivery rejected');
            await cancelNativeOtp(getNativeDatabase(),record.id,record.nonce);
            return nativeResponseJson(
                { success: false, error: unavailableMessage },
                { status: 503 },
            );
        }
    } catch (error) {
        console.error('AISensy fallback request failed');
        await cancelNativeOtp(getNativeDatabase(),record.id,record.nonce);
        return nativeResponseJson(
            { success: false, error: unavailableMessage },
            { status: 503 },
        );
    }

    return nativeResponseJson({
        success: true,
        provider: 'whatsapp',
        deliveryChannel: 'WhatsApp',
        codeLength: OTP_CONFIG.OTP_LENGTH,
        authIntent,
        phone: maskPhone(intent.phone),
        expiresIn: Math.floor(OTP_CONFIG.EXPIRY_MS / 1000),
        message: isNativeIosPrimary
            ? 'We sent a 4-digit verification code on WhatsApp.'
            : 'SMS verification is temporarily unavailable. We sent your verification code on WhatsApp instead.',
    });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (body.channel === 'whatsapp-fallback') {
            if (typeof body.authIntent !== 'string' || typeof body.fallbackReason !== 'string') {
                return nativeResponseJson(
                    { success: false, error: 'A valid fallback request is required.' },
                    { status: 400 },
                );
            }
            return await sendWhatsappFallback(body.authIntent, body.fallbackReason);
        }

        if (!body.phone || typeof body.phone !== 'string') {
            return nativeResponseJson(
                { success: false, error: 'Phone number is required.' },
                { status: 400 },
            );
        }

        const intent = await preparePhoneAuth(body);
        const authIntent = createPhoneAuthIntentToken(intent);
        return nativeResponseJson({
            success: true,
            provider: 'firebase',
            deliveryChannel: 'SMS',
            codeLength: 6,
            authIntent,
            firebaseAvailable: firebaseClientConfigAvailable(),
            phone: maskPhone(intent.phone),
            expiresIn: 600,
        });
    } catch (error) {
        if (error instanceof PhoneAuthError) {
            return nativeResponseJson(
                { success: false, error: error.message, code: error.code },
                { status: error.status },
            );
        }
        console.error('Phone verification preparation failed:', error);
        return nativeResponseJson(
            { success: false, error: 'Unable to start verification. Please try again.' },
            { status: 500 },
        );
    }
}
