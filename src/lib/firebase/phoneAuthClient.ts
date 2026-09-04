'use client';

import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';
import { initializeFirebaseApp } from '@/lib/firebase/fcmHelper';

export type PhoneOtpProvider = 'firebase' | 'whatsapp';

let recaptchaVerifier: RecaptchaVerifier | null = null;

export interface FirebasePhoneAuthError extends Error {
    code?: string;
}

export interface PhoneAuthRuntimeSignals {
    userAgent?: string;
    displayModeStandalone?: boolean;
    iosStandalone?: boolean;
    nativeBridge?: boolean;
    nativeFlag?: boolean;
}

/**
 * Firebase Web Phone Auth must complete a browser reCAPTCHA challenge. Native
 * DTPS WebViews and installed PWAs can move that challenge to an external
 * browser and lose the result when returning to the app. In those runtimes we
 * use the signed, rate-limited WhatsApp fallback without starting reCAPTCHA.
 */
export function shouldUseWhatsappFallbackForRuntime(
    signals: PhoneAuthRuntimeSignals,
): boolean {
    const userAgent = signals.userAgent || '';
    const isAndroidWebView = /;\s*wv\)/i.test(userAgent) || /\bDTPSApp\/Android\b/i.test(userAgent);
    const isIOSWebView = /\bDTPSApp\/iOS\b/i.test(userAgent)
        || (/\b(iPhone|iPad|iPod)\b/i.test(userAgent)
            && /AppleWebKit/i.test(userAgent)
            && !/Safari/i.test(userAgent));

    return Boolean(
        signals.nativeBridge
        || signals.nativeFlag
        || signals.displayModeStandalone
        || signals.iosStandalone
        || isAndroidWebView
        || isIOSWebView,
    );
}

export function shouldUseWhatsappFallbackForCurrentRuntime(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

    const runtimeWindow = window as Window & {
        NativeApp?: unknown;
        isNativeApp?: boolean;
        webkit?: { messageHandlers?: { nativeInterface?: unknown } };
    };
    const iosNavigator = navigator as Navigator & { standalone?: boolean };

    return shouldUseWhatsappFallbackForRuntime({
        userAgent: navigator.userAgent,
        displayModeStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
        iosStandalone: iosNavigator.standalone === true,
        nativeBridge: Boolean(
            runtimeWindow.NativeApp
            || runtimeWindow.webkit?.messageHandlers?.nativeInterface,
        ),
        nativeFlag: runtimeWindow.isNativeApp === true,
    });
}

export function getFirebaseErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
        return String((error as { code?: unknown }).code || 'firebase-service-unavailable');
    }
    return 'firebase-service-unavailable';
}

export function shouldFallbackToWhatsapp(error: unknown): boolean {
    return getWhatsappFallbackReason(error) !== null;
}

/**
 * Firebase adds client error codes over time. WhatsApp fallback must not stop
 * working merely because a service/configuration failure has a code this build
 * has not seen before. Only errors that need user correction or an abuse-limit
 * cooldown stay on the Firebase path.
 */
export function getWhatsappFallbackReason(error: unknown): string | null {
    const code = getFirebaseErrorCode(error);
    const nonFallbackReasons = new Set([
        'auth/invalid-phone-number',
        'auth/too-many-requests',
        'auth/invalid-verification-code',
        'auth/code-expired',
        'auth/session-expired',
    ]);

    if (nonFallbackReasons.has(code)) return null;

    const explicitReasons = new Set([
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
    ]);

    return explicitReasons.has(code) ? code : 'firebase-service-unavailable';
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
