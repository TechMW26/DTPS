import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import OTPRecord from '@/lib/db/models/OTPRecord';
import { OTP_CONFIG, generateOTP } from '@/lib/auth/otpStore';
import {
    createPhoneAuthIntentToken,
    maskPhone,
    PhoneAuthError,
    preparePhoneAuth,
    verifyPhoneAuthIntentToken,
} from '@/lib/auth/phoneAuthServer';

const FIREBASE_FALLBACK_REASONS = new Set([
    'auth/billing-not-enabled',
    'auth/configuration-not-found',
    'auth/internal-error',
    'auth/network-request-failed',
    'auth/operation-not-allowed',
    'auth/quota-exceeded',
    'auth/unauthorized-domain',
    'firebase-config-unavailable',
    'firebase-service-unavailable',
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
        return NextResponse.json(
            { success: false, error: 'WhatsApp fallback is available only when SMS delivery is unavailable.' },
            { status: 400 },
        );
    }

    const intent = verifyPhoneAuthIntentToken(authIntent);
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const recentOtpCount = await OTPRecord.countDocuments({
        phone: intent.phone,
        createdAt: { $gte: oneHourAgo },
    });
    if (recentOtpCount >= OTP_CONFIG.MAX_REQUESTS_PER_HOUR) {
        return NextResponse.json(
            { success: false, error: 'Too many verification requests. Please try again in an hour.' },
            { status: 429 },
        );
    }

    const apiKey = process.env.AISENSY_API_KEY;
    const apiUrl = process.env.AISENSY_API_URL || 'https://backend.aisensy.com/campaign/t1/api/v2';
    if (!apiKey) {
        return NextResponse.json(
            { success: false, error: 'Both SMS and WhatsApp verification are temporarily unavailable. Please try again later.' },
            { status: 503 },
        );
    }

    const otp = generateOTP();
    const record = await OTPRecord.findOneAndUpdate(
        { phone: intent.phone },
        {
            phone: intent.phone,
            otp,
            userId: intent.userId,
            userName: intent.userName,
            purpose: intent.mode,
            signupPayload: intent.signupPayload,
            attempts: 0,
            expiresAt: new Date(Date.now() + OTP_CONFIG.EXPIRY_MS),
            createdAt: new Date(),
        },
        { upsert: true, new: true },
    );

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey,
                campaignName: 'OTP',
                destination: intent.phone.replace(/^\+/, ''),
                userName: intent.userName,
                source: 'firebase_sms_fallback',
                templateParams: [otp],
                buttons: [{
                    type: 'button',
                    sub_type: 'url',
                    index: '0',
                    parameters: [{ type: 'text', text: otp }],
                }],
            }),
        });
        const responseData = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error('AISensy fallback error:', responseData);
            await OTPRecord.deleteOne({ _id: record._id });
            return NextResponse.json(
                { success: false, error: 'Both SMS and WhatsApp verification are temporarily unavailable. Please try again later.' },
                { status: 503 },
            );
        }
    } catch (error) {
        console.error('AISensy fallback request failed:', error);
        await OTPRecord.deleteOne({ _id: record._id });
        return NextResponse.json(
            { success: false, error: 'Both SMS and WhatsApp verification are temporarily unavailable. Please try again later.' },
            { status: 503 },
        );
    }

    return NextResponse.json({
        success: true,
        provider: 'whatsapp',
        deliveryChannel: 'WhatsApp',
        codeLength: OTP_CONFIG.OTP_LENGTH,
        authIntent,
        phone: maskPhone(intent.phone),
        expiresIn: Math.floor(OTP_CONFIG.EXPIRY_MS / 1000),
        message: 'SMS delivery was unavailable, so we sent your verification code on WhatsApp.',
    });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        await connectDB();

        if (body.channel === 'whatsapp-fallback') {
            if (typeof body.authIntent !== 'string' || typeof body.fallbackReason !== 'string') {
                return NextResponse.json(
                    { success: false, error: 'A valid fallback request is required.' },
                    { status: 400 },
                );
            }
            return await sendWhatsappFallback(body.authIntent, body.fallbackReason);
        }

        if (!body.phone || typeof body.phone !== 'string') {
            return NextResponse.json(
                { success: false, error: 'Phone number is required.' },
                { status: 400 },
            );
        }

        const intent = await preparePhoneAuth(body);
        const authIntent = createPhoneAuthIntentToken(intent);
        return NextResponse.json({
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
            return NextResponse.json({ success: false, error: error.message }, { status: error.status });
        }
        console.error('Phone verification preparation failed:', error);
        return NextResponse.json(
            { success: false, error: 'Unable to start verification. Please try again.' },
            { status: 500 },
        );
    }
}
