'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    User,
    Mail,
    Phone,
    Flag,
    ArrowLeft,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { COUNTRY_CODE_OPTIONS } from '@/lib/constants/countries';
import { validateOptionalEmail, validatePhoneNumber } from '@/lib/validations/contact';
import type { ConfirmationResult } from 'firebase/auth';
import {
    clearFirebaseRecaptcha,
    confirmFirebasePhoneOtp,
    getPhoneAuthErrorMessage,
    getWhatsappFallbackReason,
    isNativeIosApp,
    NATIVE_IOS_WHATSAPP_REASON,
    readSignupPhonePrefill,
    requestFirebasePhoneOtp,
    type PhoneOtpProvider,
} from '@/lib/firebase/phoneAuthClient';

function ClientSignUpForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const phonePrefillSearch = searchParams.toString();
    const phonePrefill = readSignupPhonePrefill(phonePrefillSearch);
    const { data: session, status } = useSession();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [countryCode, setCountryCode] = useState('+91');
    const [countryCodeEdited, setCountryCodeEdited] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [nativeIosApp, setNativeIosApp] = useState(false);

    // Form fields
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [phoneEdited, setPhoneEdited] = useState(false);
    const activeCountryCode = countryCodeEdited ? countryCode : (phonePrefill?.countryCode || countryCode);
    const activePhone = phoneEdited ? phone : (phonePrefill?.phone || phone);
    const [agreeToTerms, setAgreeToTerms] = useState(false);

    // OTP step
    const [step, setStep] = useState<'details' | 'otp'>('details');
    const [otp, setOtp] = useState(Array(6).fill(''));
    const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
    const [resendTimer, setResendTimer] = useState(0);
    const [otpProvider, setOtpProvider] = useState<PhoneOtpProvider>('firebase');
    const [authIntent, setAuthIntent] = useState('');
    const confirmationResultRef = useRef<ConfirmationResult | null>(null);
    const firebaseIdTokenRef = useRef('');

    useEffect(() => {
        setNativeIosApp(isNativeIosApp());
        setMounted(true);
        return () => clearFirebaseRecaptcha();
    }, []);

    // Redirect if already logged in
    useEffect(() => {
        if (status === 'authenticated' && session?.user) {
            if (session.user.role === 'client') {
                router.replace('/user');
            } else if (session.user.role === 'admin') {
                router.replace('/dashboard/admin');
            } else if (session.user.role === 'dietitian') {
                router.replace('/dashboard/dietitian');
            } else if (session.user.role === 'health_counselor') {
                router.replace('/health-counselor/clients');
            }
        }
    }, [status, session, router]);

    // Resend timer countdown
    useEffect(() => {
        if (resendTimer <= 0) return;
        const timer = setTimeout(() => setResendTimer((prev) => prev - 1), 1000);
        return () => clearTimeout(timer);
    }, [resendTimer]);

    const handleOtpChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        if (value.length > 1) {
            const pasted = value.replace(/\D/g, '').slice(0, otp.length).split('');
            const next = [...otp];
            pasted.forEach((digit, offset) => {
                if (index + offset < next.length) next[index + offset] = digit;
            });
            setOtp(next);
            otpRefs.current[Math.min(index + pasted.length, otp.length - 1)]?.focus();
            return;
        }
        const next = [...otp];
        next[index] = value.slice(-1);
        setOtp(next);
        if (value && index < otp.length - 1) {
            otpRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    };

    const requestWhatsappFallback = async (intent: string, fallbackReason: string) => {
        const response = await fetch('/api/auth/otp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                channel: 'whatsapp-fallback',
                authIntent: intent,
                fallbackReason,
            }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to send a verification code.');
        confirmationResultRef.current = null;
        setOtpProvider('whatsapp');
        setOtp(Array(data.codeLength || 4).fill(''));
        setSuccess(data.message);
    };

    const sendOtp = async () => {
        // Validate required fields
        if (!firstName.trim()) {
            setError('First name is required.');
            return;
        }
        if (!lastName.trim()) {
            setError('Last name is required.');
            return;
        }
        // Strip non-digits and leading zeros (e.g. UK local 07911... → 7911...)
        const rawPhone = activePhone.replace(/\D/g, '').replace(/^0+/, '');
        const fullPhone = `${activeCountryCode}${rawPhone}`;
        const phoneValidation = validatePhoneNumber(fullPhone, activeCountryCode);
        if (!phoneValidation.isValid) {
            setError(phoneValidation.error || 'Please enter a valid phone number.');
            return;
        }

        // Email is optional, but if provided must be valid
        const emailValidation = validateOptionalEmail(email);
        if (!emailValidation.isValid) {
            setError(emailValidation.error || 'Please enter a valid email address.');
            return;
        }

        if (!agreeToTerms) {
            setError('You must agree to the Terms of Service and Privacy Policy.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/otp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'signup',
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    email: emailValidation.normalized,
                    phone: phoneValidation.normalized,
                }),
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                setError(data.error || 'Failed to send OTP. Please try again.');
                return;
            }

            setAuthIntent(data.authIntent);
            firebaseIdTokenRef.current = '';
            if (nativeIosApp) {
                await requestWhatsappFallback(data.authIntent, NATIVE_IOS_WHATSAPP_REASON);
            } else {
                try {
                    if (!data.firebaseAvailable) {
                        throw Object.assign(new Error('Firebase is unavailable'), {
                            code: 'firebase-config-unavailable',
                        });
                    }
                    confirmationResultRef.current = await requestFirebasePhoneOtp(
                        phoneValidation.normalized!,
                        'signup-firebase-recaptcha',
                    );
                    setOtpProvider('firebase');
                    setOtp(Array(data.codeLength || 6).fill(''));
                    setSuccess('We sent a 6-digit verification code by SMS. Standard messaging rates may apply.');
                } catch (firebaseError) {
                    const fallbackReason = getWhatsappFallbackReason(firebaseError);
                    if (!fallbackReason) {
                        setError(getPhoneAuthErrorMessage(firebaseError));
                        return;
                    }
                    await requestWhatsappFallback(data.authIntent, fallbackReason);
                }
            }

            setStep('otp');
            setResendTimer(60);
        } catch (error) {
            console.error('Send signup OTP error:', error);
            setError(error instanceof Error
                ? error.message
                : 'Failed to send OTP. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const verifyOtpAndCreateUser = async () => {
        const otpValue = otp.join('');
        if (otpValue.length !== otp.length) {
            setError(`Please enter the complete ${otp.length}-digit code.`);
            return;
        }

        const phoneValidation = validatePhoneNumber(`${activeCountryCode}${activePhone.replace(/\D/g, '').replace(/^0+/, '')}`, activeCountryCode);
        if (!phoneValidation.isValid) {
            setError(phoneValidation.error || 'Please enter a valid phone number.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            let idToken = firebaseIdTokenRef.current;
            if (otpProvider === 'firebase' && !idToken) {
                if (!confirmationResultRef.current) {
                    setError('This SMS verification session has expired. Please request a new code.');
                    return;
                }
                try {
                    idToken = await confirmFirebasePhoneOtp(confirmationResultRef.current, otpValue);
                    firebaseIdTokenRef.current = idToken;
                } catch (firebaseError) {
                    setError(getPhoneAuthErrorMessage(firebaseError));
                    return;
                }
            }

            const response = await fetch('/api/auth/otp/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: otpProvider,
                    authIntent,
                    ...(otpProvider === 'firebase' ? { idToken } : { otp: otpValue }),
                }),
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                setError(data.error || 'OTP verification failed.');
                return;
            }

            setSuccess('Account created successfully! Logging you in...');

            // Sign in with the OTP token
            const signInResult = await signIn('credentials', {
                email: data.user.email,
                otpToken: data.token,
                redirect: false,
            });

            if (signInResult?.error) {
                setError('Account created but auto-login failed. Please sign in manually.');
                setTimeout(() => {
                    router.push('/client-auth/signin');
                }, 2000);
                return;
            }

            // Redirect based on onboarding status
            window.location.href = data.redirectUrl || '/user/onboarding';
        } catch {
            setError('Verification failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const resendOtp = async () => {
        if (resendTimer > 0) return;
        await sendOtp();
    };

    // Show loading while checking session
    if (!mounted || status === 'loading') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-white">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#E06A26] mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    // If already authenticated, redirect effect will run; don't show any intermediate UI.
    if (status === 'authenticated') return null;

    return (
        <div className="flex min-h-[100dvh] flex-col bg-white md:bg-gray-50">
            {/* Header - Hidden on larger screens */}
            <div className="flex min-h-14 items-center justify-center border-b border-gray-100 px-5 md:hidden">
                <h1 className="text-center text-lg font-semibold text-[#E06A26]">Sign Up</h1>
            </div>

            {/* Main Content */}
            <main className="flex flex-1 flex-col items-center justify-start overflow-y-auto px-5 pb-8 pt-5 sm:px-6 md:justify-center md:px-8 md:py-10">
                {/* Card wrapper for larger screens */}
                <div className="w-full max-w-md md:rounded-2xl md:bg-white md:p-8 md:shadow-lg lg:p-10">
                    {/* Logo */}
                    <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl sm:h-24 sm:w-24 md:h-28 md:w-28">
                        <img
                            src="/images/dtps-logo.png"
                            alt="DTPS"
                            className="object-cover w-full h-full"
                        />
                    </div>

                    {/* Title */}
                    <div className="mb-6 mt-3 w-full text-center">
                        <h2 className="text-xl font-bold text-[#E06A26] sm:text-2xl">Create Account</h2>
                        <p className="mt-1 text-sm text-gray-600 sm:text-base">
                            Track your macros, crush your goals, and join a community of achievers.
                        </p>
                    </div>

                    {/* Form */}
                    <div className="w-full space-y-4">
                        <div id="signup-firebase-recaptcha" className="h-0 overflow-hidden" />
                        {error && (
                            <Alert variant="destructive" className="text-red-700 border-red-200 bg-red-50">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {success && (
                            <Alert className="text-green-700 border-green-200 bg-green-50">
                                <AlertDescription>{success}</AlertDescription>
                            </Alert>
                        )}

                        {step === 'details' ? (
                            <>
                                {/* First Name Input */}
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                        <User className="h-5 w-5 text-[#3AB1A0]" />
                                    </div>
                                    <Input
                                        type="text"
                                        placeholder="First Name *"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        autoComplete="given-name"
                                        aria-label="First Name"
                                        className="h-12 sm:h-14 pl-12 bg-[#3AB1A0]/5 border-[#3AB1A0]/20 text-black placeholder:text-gray-400 rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] focus:bg-white"
                                    />
                                </div>

                                {/* Last Name Input */}
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                        <User className="h-5 w-5 text-[#3AB1A0]" />
                                    </div>
                                    <Input
                                        type="text"
                                        placeholder="Last Name *"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        autoComplete="family-name"
                                        aria-label="Last Name"
                                        className="h-12 sm:h-14 pl-12 bg-[#3AB1A0]/5 border-[#3AB1A0]/20 text-black placeholder:text-gray-400 rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] focus:bg-white"
                                    />
                                </div>

                                {/* Phone Input with Country Code - Fixed UI */}
                                <div className="flex items-center h-12 sm:h-14 bg-[#3AB1A0]/5 border border-[#3AB1A0]/20  rounded-xl overflow-hidden px-2 focus-within:border-[#3AB1A0] focus-within:ring-1 focus-within:ring-[#3AB1A0]">

                                    {/* Country Select */}
                                    <Select
                                        value={activeCountryCode}
                                        onValueChange={(value) => {
                                            setCountryCodeEdited(true);
                                            setCountryCode(value);
                                        }}
                                    >
                                        <SelectTrigger
                                            className="flex items-center gap-1 w-22.5 h-full border-0 bg-transparent px-2 focus:ring-0 focus:outline-none"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>

                                        <SelectContent className="max-h-60">
                                            {COUNTRY_CODE_OPTIONS.map((country) => (
                                                <SelectItem
                                                    key={`${country.code}-${country.country}`}
                                                    value={country.code}
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <Flag aria-hidden="true" className="h-4 w-4 text-gray-500" />
                                                        <span>{country.code}</span>
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {/* Divider */}
                                    <div className="w-px h-6 bg-[#3AB1A0]/20 mx-2" />

                                    {/* Phone Icon */}
                                    <Phone className="h-5 w-5 text-[#3AB1A0] mr-2 shrink-0" />

                                    {/* Input */}
                                    <Input
                                        type="tel"
                                        placeholder="Phone Number *"
                                        value={activePhone}
                                        onChange={(e) => {
                                            setPhoneEdited(true);
                                            setPhone(e.target.value.replace(/\D/g, '').slice(0, 15));
                                        }}
                                        autoComplete="tel-national"
                                        aria-label="Phone Number"
                                        className="flex-1 h-full border-0 outline-none bg-transparent text-black placeholder:text-gray-400 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none shadow-none"
                                    />
                                </div>
                                <p className="text-xs leading-5 text-gray-500">
                                    {nativeIosApp
                                        ? 'We will send your verification code on WhatsApp.'
                                        : 'Your verification code is sent by Firebase SMS. If SMS is temporarily unavailable, we may send it on WhatsApp instead. Standard messaging rates may apply.'}
                                </p>

                                {/* Email Input (Optional) */}
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                        <Mail className="h-5 w-5 text-[#3AB1A0]" />
                                    </div>
                                    <Input
                                        type="email"
                                        placeholder="Email Address (Optional)"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        autoComplete="email"
                                        aria-label="Email Address"
                                        className="h-12 sm:h-14 pl-12 bg-[#3AB1A0]/5 border-[#3AB1A0]/20 text-black placeholder:text-gray-400 rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] focus:bg-white"
                                    />
                                </div>

                                {/* Terms Checkbox */}
                                <div className="flex items-start gap-3 py-2">
                                    <Checkbox
                                        id="terms"
                                        checked={agreeToTerms}
                                        onCheckedChange={(checked) => setAgreeToTerms(checked as boolean)}
                                        className="mt-0.5 border-[#3AB1A0] data-[state=checked]:bg-[#3AB1A0] data-[state=checked]:border-[#3AB1A0]"
                                    />
                                    <label htmlFor="terms" className="text-sm leading-tight text-gray-600">
                                        I agree to the{' '}
                                        <Link href="https://dtpoonamsagar.com/terms" target="_blank" className="text-[#E06A26] hover:underline font-medium">
                                            Terms of Service
                                        </Link>{' '}
                                        and{' '}
                                        <Link href="https://dtpoonamsagar.com/privacy-policy/" target="_blank" className="text-[#E06A26] hover:underline font-medium">
                                            Privacy Policy
                                        </Link>
                                        .
                                    </label>
                                </div>

                                {/* Sign Up Button */}
                                <Button
                                    type="button"
                                    onClick={sendOtp}
                                    className="w-full h-12 sm:h-14 bg-[#61a035] hover:bg-[#60953a] text-white font-semibold text-base sm:text-lg rounded-xl shadow-lg"
                                    disabled={isLoading}
                                >
                                    {isLoading ? 'Sending OTP...' : 'Sign Up'}
                                </Button>
                            </>
                        ) : (
                            <>
                                {/* OTP Step */}
                                <div className="space-y-2 text-center">
                                    <p className="text-sm text-gray-600">
                                        Enter the {otp.length}-digit code sent by {otpProvider === 'firebase' ? 'SMS' : 'WhatsApp'}
                                    </p>
                                    <p className="text-sm font-semibold text-gray-800">
                                        {activeCountryCode}{activePhone}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setStep('details');
                                            setOtp(Array(6).fill(''));
                                            setError('');
                                            setSuccess('');
                                            clearFirebaseRecaptcha();
                                        }}
                                        className="mx-auto inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3AB1A0]"
                                    >
                                        <ArrowLeft className="h-4 w-4" />
                                        Back to edit details
                                    </button>
                                </div>

                                {/* OTP Input Boxes */}
                                <div className="flex justify-center gap-2 sm:gap-3">
                                    {otp.map((digit, index) => (
                                        <Input
                                            key={index}
                                            ref={(el) => {
                                                otpRefs.current[index] = el;
                                            }}
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete={index === 0 ? 'one-time-code' : 'off'}
                                            aria-label={`Verification code digit ${index + 1}`}
                                            maxLength={index === 0 ? otp.length : 1}
                                            value={digit}
                                            onChange={(e) => handleOtpChange(index, e.target.value)}
                                            onKeyDown={(e) => handleOtpKeyDown(index, e)}
                                            className="w-11 h-12 sm:w-14 sm:h-14 text-center text-xl font-semibold bg-[#3AB1A0]/5 border-[#3AB1A0]/20 text-black rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] focus:bg-white"
                                        />
                                    ))}
                                </div>

                                {/* Verify Button */}
                                <Button
                                    type="button"
                                    onClick={verifyOtpAndCreateUser}
                                    className="w-full h-12 sm:h-14 bg-[#61a035] hover:bg-[#60953a] text-white font-semibold text-base sm:text-lg rounded-xl shadow-lg"
                                    disabled={isLoading || otp.join('').length !== otp.length}
                                >
                                    {isLoading ? 'Verifying...' : 'Verify & Create Account'}
                                </Button>

                                {/* Resend OTP */}
                                <div className="text-center">
                                    {resendTimer > 0 ? (
                                        <p className="text-sm text-gray-500">
                                            Resend OTP in {resendTimer}s
                                        </p>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={resendOtp}
                                            className="text-sm text-[#E06A26] font-medium hover:underline"
                                            disabled={isLoading}
                                        >
                                            Resend OTP
                                        </button>
                                    )}
                                </div>

                            </>
                        )}
                    </div>

                    {/* Login Link */}
                    <p className="mt-6 text-center text-gray-600 text-sm sm:text-base sm:mt-8">
                        Already have an account?{' '}
                        <Link href="/client-auth/signin" className="text-[#E06A26] font-semibold hover:underline">
                            Log In
                        </Link>
                    </p>
                </div>
            </main>
        </div>
    );
}

export default function ClientSignUpPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-white" aria-hidden="true" />}>
            <ClientSignUpForm />
        </Suspense>
    );
}
