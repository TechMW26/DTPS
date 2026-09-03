import { NextRequest } from 'next/server';
import User from '@/lib/db/models/User';
import OTPRecord from '@/lib/db/models/OTPRecord';
import { UserRole } from '@/types';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdmin } from '@/lib/firebase/firebaseAdmin';
import { POST as sendOtp } from '@/app/api/auth/otp/send/route';
import { POST as verifyOtp } from '@/app/api/auth/otp/verify/route';
import {
    createPhoneAuthIntentToken,
    getPhoneVariations,
    verifyPhoneAuthIntentToken,
} from '@/lib/auth/phoneAuthServer';
import {
    getFirebaseErrorCode,
    getPhoneAuthErrorMessage,
    shouldFallbackToWhatsapp,
} from '@/lib/firebase/phoneAuthClient';
import { validatePhoneNumber } from '@/lib/validations/contact';

jest.mock('@/lib/firebase/firebaseAdmin', () => ({
    getFirebaseAdmin: jest.fn(),
}));

jest.mock('firebase-admin/auth', () => ({
    getAuth: jest.fn(),
}));

jest.mock('@/lib/auth/onboarding-access', () => ({
    grantDietPlanAccessIfPublished: jest.fn().mockResolvedValue(false),
}));

const mockedGetFirebaseAdmin = getFirebaseAdmin as jest.MockedFunction<typeof getFirebaseAdmin>;
const mockedGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;

function request(url: string, body: Record<string, unknown>) {
    return new NextRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

async function createClient(phone: string, overrides: Record<string, unknown> = {}) {
    return User.create({
        firstName: 'Phone',
        lastName: 'Client',
        email: `phone-${Date.now()}-${Math.random()}@example.com`,
        phone,
        password: 'test-password-123',
        role: UserRole.CLIENT,
        status: 'active',
        onboardingCompleted: true,
        ...overrides,
    });
}

describe('Firebase SMS phone authentication with WhatsApp fallback', () => {
    const previousFirebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const previousFirebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
    const previousFirebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const previousAisensyKey = process.env.AISENSY_API_KEY;

    beforeEach(() => {
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-api-key';
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
        process.env.AISENSY_API_KEY = 'test-aisensy-key';
    });

    afterAll(() => {
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY = previousFirebaseApiKey;
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = previousFirebaseAuthDomain;
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = previousFirebaseProjectId;
        process.env.AISENSY_API_KEY = previousAisensyKey;
    });

    it('supports universal E.164 numbers without inventing local-number variants', () => {
        expect(getPhoneVariations('+447911123456')).toEqual([
            '+447911123456',
            '447911123456',
        ]);
        expect(getPhoneVariations('+919876543210')).toEqual([
            '+919876543210',
            '919876543210',
            '9876543210',
        ]);
        expect(validatePhoneNumber('+376123456').isValid).toBe(true);
        expect(validatePhoneNumber('+0123456789').isValid).toBe(false);
    });

    it('preflights an international client for Firebase SMS without creating a WhatsApp OTP', async () => {
        await createClient('+447911123456');

        const response = await sendOtp(request('http://localhost/api/auth/otp/send', {
            phone: '+447911123456',
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toMatchObject({
            success: true,
            provider: 'firebase',
            deliveryChannel: 'SMS',
            codeLength: 6,
            firebaseAvailable: true,
        });
        expect(verifyPhoneAuthIntentToken(data.authIntent).phone).toBe('+447911123456');
        expect(await OTPRecord.countDocuments({ phone: '+447911123456' })).toBe(0);
    });

    it('does not reveal a verification flow for an unknown client', async () => {
        const response = await sendOtp(request('http://localhost/api/auth/otp/send', {
            phone: '+14155552671',
        }));
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.error).toContain('No client account');
    });

    it('stops inactive clients before any SMS is requested', async () => {
        await createClient('+33142278186', { status: 'inactive' });
        const response = await sendOtp(request('http://localhost/api/auth/otp/send', {
            phone: '+33142278186',
        }));

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({
            success: false,
            error: expect.stringContaining('not active'),
        });
    });

    it('rejects WhatsApp fallback for invalid numbers and rate-limit errors', () => {
        expect(shouldFallbackToWhatsapp({ code: 'auth/invalid-phone-number' })).toBe(false);
        expect(shouldFallbackToWhatsapp({ code: 'auth/too-many-requests' })).toBe(false);
        expect(shouldFallbackToWhatsapp({ code: 'auth/network-request-failed' })).toBe(true);
        expect(getFirebaseErrorCode(new Error('offline'))).toBe('firebase-service-unavailable');
        expect(getPhoneAuthErrorMessage({ code: 'auth/invalid-verification-code' }))
            .toContain('incorrect');
    });

    it('uses WhatsApp only for a signed Firebase service-failure fallback', async () => {
        const client = await createClient('+919876543210');
        const authIntent = createPhoneAuthIntentToken({
            purpose: 'phone-auth-intent',
            phone: '+919876543210',
            mode: 'login',
            userId: client._id.toString(),
            userName: 'Phone Client',
        });
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ success: true }), { status: 200 }),
        );

        const denied = await sendOtp(request('http://localhost/api/auth/otp/send', {
            channel: 'whatsapp-fallback',
            authIntent,
            fallbackReason: 'auth/invalid-phone-number',
        }));
        expect(denied.status).toBe(400);

        const response = await sendOtp(request('http://localhost/api/auth/otp/send', {
            channel: 'whatsapp-fallback',
            authIntent,
            fallbackReason: 'auth/network-request-failed',
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toMatchObject({ provider: 'whatsapp', codeLength: 4 });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(await OTPRecord.countDocuments({ phone: '+919876543210' })).toBe(1);
    });

    it('exchanges only a matching Firebase phone token for a DTPS session token', async () => {
        await createClient('+14155552671');
        const prepared = await sendOtp(request('http://localhost/api/auth/otp/send', {
            phone: '+14155552671',
        }));
        const { authIntent } = await prepared.json();

        mockedGetFirebaseAdmin.mockResolvedValue({} as Awaited<ReturnType<typeof getFirebaseAdmin>>);
        mockedGetAuth.mockReturnValue({
            verifyIdToken: jest.fn().mockResolvedValue({ phone_number: '+14155552671' }),
        } as unknown as ReturnType<typeof getAuth>);

        const response = await verifyOtp(request('http://localhost/api/auth/otp/verify', {
            provider: 'firebase',
            authIntent,
            idToken: 'valid-firebase-id-token',
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.token).toEqual(expect.any(String));
        expect(data.user.role).toBe(UserRole.CLIENT);
    });

    it('creates an international client only after Firebase verifies the same phone', async () => {
        const prepared = await sendOtp(request('http://localhost/api/auth/otp/send', {
            mode: 'signup',
            phone: '+61412345678',
            firstName: 'New',
            lastName: 'Client',
            email: 'new.international@example.com',
        }));
        const preparedData = await prepared.json();
        expect(prepared.status).toBe(200);

        mockedGetFirebaseAdmin.mockResolvedValue({} as Awaited<ReturnType<typeof getFirebaseAdmin>>);
        mockedGetAuth.mockReturnValue({
            verifyIdToken: jest.fn().mockResolvedValue({ phone_number: '+61412345678' }),
        } as unknown as ReturnType<typeof getAuth>);

        const response = await verifyOtp(request('http://localhost/api/auth/otp/verify', {
            provider: 'firebase',
            authIntent: preparedData.authIntent,
            idToken: 'signup-firebase-token',
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.redirectUrl).toBe('/user/onboarding');
        await expect(User.findOne({ phone: '+61412345678' }).lean()).resolves.toMatchObject({
            firstName: 'New',
            lastName: 'Client',
            role: UserRole.CLIENT,
        });
    });

    it('verifies the four-digit WhatsApp fallback and consumes it once', async () => {
        const client = await createClient('+919811112222');
        const authIntent = createPhoneAuthIntentToken({
            purpose: 'phone-auth-intent',
            phone: '+919811112222',
            mode: 'login',
            userId: client._id.toString(),
            userName: 'Phone Client',
        });
        jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ success: true }), { status: 200 }),
        );
        await sendOtp(request('http://localhost/api/auth/otp/send', {
            channel: 'whatsapp-fallback',
            authIntent,
            fallbackReason: 'auth/quota-exceeded',
        }));
        const record = await OTPRecord.findOne({ phone: '+919811112222' }).lean() as unknown as { otp: string } | null;

        const response = await verifyOtp(request('http://localhost/api/auth/otp/verify', {
            provider: 'whatsapp',
            authIntent,
            otp: record?.otp,
        }));

        expect(response.status).toBe(200);
        expect(await OTPRecord.countDocuments({ phone: '+919811112222' })).toBe(0);
    });

    it('rejects a valid Firebase token issued for a different phone number', async () => {
        await createClient('+14155550100');
        const prepared = await sendOtp(request('http://localhost/api/auth/otp/send', {
            phone: '+14155550100',
        }));
        const { authIntent } = await prepared.json();

        mockedGetFirebaseAdmin.mockResolvedValue({} as Awaited<ReturnType<typeof getFirebaseAdmin>>);
        mockedGetAuth.mockReturnValue({
            verifyIdToken: jest.fn().mockResolvedValue({ phone_number: '+14155550101' }),
        } as unknown as ReturnType<typeof getAuth>);

        const response = await verifyOtp(request('http://localhost/api/auth/otp/verify', {
            provider: 'firebase',
            authIntent,
            idToken: 'other-users-token',
        }));
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toContain('does not match');
    });

    it('rejects tampered or expired auth intents before token exchange', async () => {
        const response = await verifyOtp(request('http://localhost/api/auth/otp/verify', {
            provider: 'firebase',
            authIntent: 'tampered-token',
            idToken: 'any-token',
        }));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain('expired');
        expect(mockedGetAuth).not.toHaveBeenCalled();
    });
});
