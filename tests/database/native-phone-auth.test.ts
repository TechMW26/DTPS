import { NextRequest } from 'next/server';
import {randomBytes,createHash} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
jest.mock('@/lib/db/firestore-native',()=>({getNativeDatabase:jest.fn()}));
let db:any;
const fixtureIds:string[]=[];
const testPhones=['+447911123456','+14155552671','+33142278186','+919822223333','+919876543210','+61412345678','+919811112222','+14155550100'];
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
async function otpCount(phone:string){return (await db.collection('_nativeOtpChallenges').where('phone','==',phone).get()).size;}
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
    buildSignupPhonePrefillUrl,
    getFirebaseErrorCode,
    getPhoneAuthErrorMessage,
    getWhatsappFallbackReason,
    isNativeIosApp,
    readSignupPhonePrefill,
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
    const id=randomBytes(12).toString('hex');fixtureIds.push(id);
    const data={_id:id,
        firstName: 'Phone',
        lastName: 'Client',
        email: `phone-${Date.now()}-${Math.random()}@example.com`,
        phone,
        password: 'test-password-123',
        role: UserRole.CLIENT,
        status: 'active',
        onboardingCompleted: true,
        ...overrides,
    };
    await db.collection('users').doc(id).set(data);return data;
}

suite('Firebase SMS phone authentication with WhatsApp fallback', () => {
    const previousFirebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const previousFirebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
    const previousFirebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const previousAisensyKey = process.env.AISENSY_API_KEY;

    beforeAll(()=>{db=jest.requireActual('@/lib/db/firestore-native').getNativeDatabase();jest.mocked(getNativeDatabase).mockReturnValue(db);});
    beforeEach(async () => {
        process.env.NEXTAUTH_SECRET='synthetic-phone-auth-test-secret';
        await db.collection('_nativeCounters').doc('clientIds').set({seq:10000});
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-api-key';
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
        process.env.AISENSY_API_KEY = 'test-aisensy-key';
    });

    afterEach(async()=>{
        jest.restoreAllMocks();
        for(const id of fixtureIds.splice(0))await db.collection('users').doc(id).delete();
        for(const row of(await db.collection('users').where('phone','==','+61412345678').get()).docs)await row.ref.delete();
        for(const phone of testPhones){const id=createHash('sha256').update(phone).digest('hex');for(const name of ['_nativeOtpChallenges','_nativeOtpLimits'])await db.collection(name).doc(id).delete();}
        for(const [kind,value] of [['phone','+61412345678'],['email','new.international@example.com']])await db.collection('_nativeUserKeys').doc(createHash('sha256').update(kind+'\0'+value).digest('hex')).delete();
    });
    afterAll(async () => {
        await db.terminate();
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY = previousFirebaseApiKey;
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = previousFirebaseAuthDomain;
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = previousFirebaseProjectId;
        process.env.AISENSY_API_KEY = previousAisensyKey;
    });

    it('blocks local WhatsApp delivery before persisting a challenge',async()=>{
        const authIntent=createPhoneAuthIntentToken({purpose:'phone-auth-intent',phone:'+919822223333',mode:'login',userId:'a'.repeat(24),userName:'Synthetic'});
        const fetchSpy=jest.spyOn(global,'fetch');
        const result=await sendOtp(request('http://localhost/api/auth/otp/send',{channel:'whatsapp-fallback',authIntent,fallbackReason:'ios-native-app'}));
        expect(result.status).toBe(503);expect(fetchSpy).not.toHaveBeenCalled();expect(await otpCount('+919822223333')).toBe(0);
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
        expect(await otpCount('+447911123456')).toBe(0);
    });

    it('does not reveal a verification flow for an unknown client', async () => {
        const response = await sendOtp(request('http://localhost/api/auth/otp/send', {
            phone: '+14155552671',
        }));
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data).toMatchObject({
            code: 'client-not-found',
            error: expect.stringContaining('No client account'),
        });
    });

    it('carries a rejected login number safely into the registration flow', () => {
        const url = buildSignupPhonePrefillUrl('+91', '73035 40883');
        expect(url).toBe('/client-auth/signup?countryCode=%2B91&phone=7303540883');
        expect(readSignupPhonePrefill(new URL(url, 'https://dtps.tech').search)).toEqual({
            countryCode: '+91',
            phone: '7303540883',
        });
        expect(readSignupPhonePrefill('?countryCode=%2B999&phone=7303540883')).toBeNull();
        expect(readSignupPhonePrefill('?countryCode=%2B91&phone=not-a-phone')).toBeNull();
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
        expect(shouldFallbackToWhatsapp({ code: 'auth/invalid-app-credential' })).toBe(true);
        expect(shouldFallbackToWhatsapp({ code: 'auth/captcha-check-failed' })).toBe(true);
        expect(shouldFallbackToWhatsapp({ code: 'auth/new-service-outage-code' })).toBe(true);
        expect(getWhatsappFallbackReason({ code: 'auth/new-service-outage-code' }))
            .toBe('firebase-service-unavailable');
        expect(getWhatsappFallbackReason({ code: 'auth/captcha-check-failed' }))
            .toBe('auth/captcha-check-failed');
        expect(getFirebaseErrorCode(new Error('offline'))).toBe('firebase-service-unavailable');
        expect(getPhoneAuthErrorMessage({ code: 'auth/invalid-verification-code' }))
            .toContain('incorrect');
    });

    it('selects WhatsApp only for the native iOS shell, not Android or iOS Safari', () => {
        const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
        const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

        const setBrowser = (userAgent: string, nativeState?: { isNativeApp: boolean; deviceType: string }) => {
            Object.defineProperty(globalThis, 'navigator', {
                configurable: true,
                value: { userAgent },
            });
            Object.defineProperty(globalThis, 'window', {
                configurable: true,
                value: nativeState || {},
            });
        };

        try {
            setBrowser('Mozilla/5.0 DTPSApp/iOS');
            expect(isNativeIosApp()).toBe(true);

            setBrowser('Mozilla/5.0 (Linux; Android 15; wv) DTPSApp/Android');
            expect(isNativeIosApp()).toBe(false);

            setBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15');
            expect(isNativeIosApp()).toBe(false);

            setBrowser('Mozilla/5.0', { isNativeApp: true, deviceType: 'ios' });
            expect(isNativeIosApp()).toBe(true);
        } finally {
            if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
            else delete (globalThis as { window?: unknown }).window;
            if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
            else delete (globalThis as { navigator?: unknown }).navigator;
        }
    });

    it('sends native iOS verification directly through WhatsApp with neutral wording', async () => {
        const client = await createClient('+919822223333');
        const authIntent = createPhoneAuthIntentToken({
            purpose: 'phone-auth-intent',
            phone: '+919822223333',
            mode: 'login',
            userId: client._id.toString(),
            userName: 'iOS Client',
        });
        jest.replaceProperty(process.env,'NODE_ENV','production');
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ success: true }), { status: 200 }),
        );

        const response = await sendOtp(request('http://localhost/api/auth/otp/send', {
            channel: 'whatsapp-fallback',
            authIntent,
            fallbackReason: 'ios-native-app',
        }));
        const data = await response.json();
        const providerPayload = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));

        expect(response.status).toBe(200);
        expect(data).toMatchObject({
            provider: 'whatsapp',
            deliveryChannel: 'WhatsApp',
            codeLength: 4,
            message: 'We sent a 4-digit verification code on WhatsApp.',
        });
        expect(providerPayload.source).toBe('ios_native_app');
        expect(await otpCount('+919822223333')).toBe(1);
    });

    it('uses WhatsApp fallback only for a signed Firebase service failure', async () => {
        const client = await createClient('+919876543210');
        const authIntent = createPhoneAuthIntentToken({
            purpose: 'phone-auth-intent',
            phone: '+919876543210',
            mode: 'login',
            userId: client._id.toString(),
            userName: 'Phone Client',
        });
        jest.replaceProperty(process.env,'NODE_ENV','production');
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ success: true }), { status: 200 }),
        );

        const denied = await sendOtp(request('http://localhost/api/auth/otp/send', {
            channel: 'whatsapp-fallback',
            authIntent,
            fallbackReason: 'auth/invalid-phone-number',
        }));
        expect(denied.status).toBe(400);

        const nativeFallback = await sendOtp(request('http://localhost/api/auth/otp/send', {
            channel: 'whatsapp-fallback',
            authIntent,
            fallbackReason: 'firebase-client-incompatible',
        }));
        expect(nativeFallback.status).toBe(200);
        await expect(nativeFallback.json()).resolves.toMatchObject({
            provider: 'whatsapp',
            message: expect.stringContaining('SMS verification is temporarily unavailable'),
        });

        const response = await sendOtp(request('http://localhost/api/auth/otp/send', {
            channel: 'whatsapp-fallback',
            authIntent,
            fallbackReason: 'auth/network-request-failed',
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toMatchObject({ provider: 'whatsapp', codeLength: 4 });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(await otpCount('+919876543210')).toBe(1);
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
        expect((await db.collection('users').where('phone','==','+61412345678').get()).docs[0].data()).toMatchObject({
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
        jest.replaceProperty(process.env,'NODE_ENV','production');
        const fetchSpy=jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ success: true }), { status: 200 }),
        );
        await sendOtp(request('http://localhost/api/auth/otp/send', {
            channel: 'whatsapp-fallback',
            authIntent,
            fallbackReason: 'auth/quota-exceeded',
        }));
        const record={otp:JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body)).templateParams[0]};
        const stored=(await db.collection('_nativeOtpChallenges').where('phone','==','+919811112222').get()).docs[0].data();
        expect(stored.otp).toBeUndefined();expect(stored.hash).toEqual(expect.any(String));

        const response = await verifyOtp(request('http://localhost/api/auth/otp/verify', {
            provider: 'whatsapp',
            authIntent,
            otp: record?.otp,
        }));

        expect(response.status).toBe(200);
        expect(await otpCount('+919811112222')).toBe(0);
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
