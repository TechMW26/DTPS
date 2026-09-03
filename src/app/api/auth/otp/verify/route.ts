import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import connectDB from '@/lib/db/connection';
import OTPRecord from '@/lib/db/models/OTPRecord';
import { OTP_CONFIG } from '@/lib/auth/otpStore';
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

async function verifyWhatsappOtp(phone: string, otp: string) {
    if (!/^\d{4}$/.test(otp)) {
        throw new PhoneAuthError('Enter the complete 4-digit WhatsApp code.', 400);
    }
    const record = await OTPRecord.findOne({ phone }).sort({ createdAt: -1 });
    if (!record) throw new PhoneAuthError('No WhatsApp code was requested. Please request a new code.', 400);
    if (new Date() > new Date(record.expiresAt)) {
        await OTPRecord.deleteOne({ _id: record._id });
        throw new PhoneAuthError('The WhatsApp code has expired. Please request a new one.', 400);
    }
    if (record.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
        await OTPRecord.deleteOne({ _id: record._id });
        throw new PhoneAuthError('Too many incorrect attempts. Please request a new code.', 429);
    }
    if (String(record.otp) !== otp) {
        await OTPRecord.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
        const remaining = OTP_CONFIG.MAX_ATTEMPTS - record.attempts - 1;
        throw new PhoneAuthError(
            remaining > 0
                ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
                : 'Incorrect code. Please request a new one.',
            400,
        );
    }
    return record;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        if (typeof body.authIntent !== 'string') {
            return NextResponse.json(
                { success: false, error: 'This verification request is missing or expired. Please request a new code.' },
                { status: 400 },
            );
        }

        const intent = verifyPhoneAuthIntentToken(body.authIntent);
        await connectDB();
        let whatsappRecordId: unknown;

        if (body.provider === 'firebase') {
            if (typeof body.idToken !== 'string' || !body.idToken) {
                throw new PhoneAuthError('Firebase verification token is required.', 400);
            }
            await verifyFirebaseToken(body.idToken, intent.phone);
        } else if (body.provider === 'whatsapp') {
            const record = await verifyWhatsappOtp(intent.phone, String(body.otp || ''));
            if (record.purpose !== intent.mode) {
                throw new PhoneAuthError('This verification request is no longer valid.', 400);
            }
            whatsappRecordId = record._id;
        } else {
            throw new PhoneAuthError('Unsupported verification provider.', 400);
        }

        const result = await completePhoneAuth(intent);
        if (whatsappRecordId) {
            await OTPRecord.deleteOne({ _id: whatsappRecordId });
        }
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof PhoneAuthError) {
            return NextResponse.json({
                success: false,
                error: error.message,
                fallbackEligible: error.status === 503,
            }, { status: error.status });
        }
        console.error('Phone verification failed:', error);
        return NextResponse.json(
            { success: false, error: 'Verification failed. Please try again.' },
            { status: 500 },
        );
    }
}
