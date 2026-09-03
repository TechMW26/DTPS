'use client';

import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';
import { initializeFirebaseApp } from '@/lib/firebase/fcmHelper';

export type PhoneOtpProvider = 'firebase' | 'whatsapp';

let recaptchaVerifier: RecaptchaVerifier | null = null;

export interface FirebasePhoneAuthError extends Error {
    code?: string;
}

export function getFirebaseErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
        return String((error as { code?: unknown }).code || 'firebase-service-unavailable');
    }
    return 'firebase-service-unavailable';
}

export function shouldFallbackToWhatsapp(error: unknown): boolean {
    return new Set([
        'auth/billing-not-enabled',
        'auth/configuration-not-found',
        'auth/internal-error',
        'auth/network-request-failed',
        'auth/operation-not-allowed',
        'auth/quota-exceeded',
        'auth/unauthorized-domain',
        'firebase-config-unavailable',
        'firebase-service-unavailable',
    ]).has(getFirebaseErrorCode(error));
}

export function getPhoneAuthErrorMessage(error: unknown): string {
    switch (getFirebaseErrorCode(error)) {
        case 'auth/invalid-phone-number':
            return 'Please enter a valid phone number, including the correct country code.';
        case 'auth/invalid-verification-code':
            return 'The SMS code is incorrect. Please check it and try again.';
        case 'auth/code-expired':
        case 'auth/session-expired':
            return 'The SMS code has expired. Please request a new one.';
        case 'auth/too-many-requests':
            return 'Too many verification attempts. Please wait before trying again.';
        case 'auth/captcha-check-failed':
        case 'auth/missing-recaptcha-token':
            return 'Security verification failed. Please refresh the page and try again.';
        default:
            return 'SMS verification is temporarily unavailable.';
    }
}

export async function requestFirebasePhoneOtp(
    phone: string,
    recaptchaContainerId: string,
): Promise<ConfirmationResult> {
    clearFirebaseRecaptcha();
    const app = await initializeFirebaseApp();
    if (!app) {
        const error = new Error('Firebase client configuration is unavailable') as FirebasePhoneAuthError;
        error.code = 'firebase-config-unavailable';
        throw error;
    }

    const { getAuth, inMemoryPersistence, RecaptchaVerifier, setPersistence, signInWithPhoneNumber } = await import('firebase/auth');
    const auth = getAuth(app);
    auth.useDeviceLanguage();
    await setPersistence(auth, inMemoryPersistence);
    recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
        size: 'invisible',
    });

    try {
        return await signInWithPhoneNumber(auth, phone, recaptchaVerifier);
    } catch (error) {
        clearFirebaseRecaptcha();
        throw error;
    }
}

export async function confirmFirebasePhoneOtp(
    confirmationResult: ConfirmationResult,
    code: string,
): Promise<string> {
    const credential = await confirmationResult.confirm(code);
    const idToken = await credential.user.getIdToken(true);
    // DTPS uses NextAuth for the durable session; Firebase is only the proof of
    // phone ownership, so keep its browser session ephemeral.
    const { getAuth, signOut } = await import('firebase/auth');
    await signOut(getAuth()).catch(() => undefined);
    return idToken;
}

export function clearFirebaseRecaptcha(): void {
    if (recaptchaVerifier) {
        recaptchaVerifier.clear();
        recaptchaVerifier = null;
    }
}
