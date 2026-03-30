'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    User,
    Mail,
    Phone
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { COUNTRY_CODES } from '@/lib/constants/countries';
import { validateOptionalEmail, validatePhoneNumber } from '@/lib/validations/contact';

export default function ClientSignUpPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [countryCode, setCountryCode] = useState('+91');
    const [mounted, setMounted] = useState(false);

    // Form fields
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [agreeToTerms, setAgreeToTerms] = useState(false);

    // OTP step
    const [step, setStep] = useState<'details' | 'otp'>('details');
    const [otp, setOtp] = useState(['', '', '', '']);
    const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
    const [resendTimer, setResendTimer] = useState(0);

    useEffect(() => {
        setMounted(true);
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
        const next = [...otp];
        next[index] = value.slice(-1);
        setOtp(next);
        if (value && index < 3) {
            otpRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
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
        const rawPhone = phone.replace(/\D/g, '');
        const fullPhone = `${countryCode}${rawPhone}`;
        const phoneValidation = validatePhoneNumber(fullPhone, countryCode);
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

            setStep('otp');
            setOtp(['', '', '', '']);
            setResendTimer(60);
            setSuccess('OTP sent to your WhatsApp number.');
        } catch {
            setError('Failed to send OTP. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const verifyOtpAndCreateUser = async () => {
        const otpValue = otp.join('');
        if (otpValue.length !== 4) {
            setError('Please enter the 4-digit OTP.');
            return;
        }

        const phoneValidation = validatePhoneNumber(`${countryCode}${phone.replace(/\D/g, '')}`, countryCode);
        if (!phoneValidation.isValid) {
            setError(phoneValidation.error || 'Please enter a valid phone number.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/otp/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: phoneValidation.normalized,
                    otp: otpValue,
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
        <div className="flex flex-col min-h-screen bg-white md:bg-gray-50">
            {/* Header - Hidden on larger screens */}
            <div className="flex items-center justify-center p-4 md:hidden">
                <h1 className="text-[#E06A26] font-semibold text-center text-lg">Sign Up</h1>
            </div>

            {/* Main Content */}
            <div className="flex flex-col items-center justify-center flex-1 px-4 py-6 overflow-y-auto sm:px-6 md:px-8">
                {/* Card wrapper for larger screens */}
                <div className="w-full max-w-md md:bg-white md:rounded-2xl md:shadow-lg md:p-8 lg:p-10">
                    {/* Logo */}
                    <div className="flex items-center justify-center overflow-hidden w-20 h-20 mx-auto rounded-xl sm:w-24 sm:h-24 md:w-28 md:h-28">
                        <img
                            src="/images/dtps-logo.png"
                            alt="DTPS"
                            className="object-cover w-full h-full"
                        />
                    </div>

                    {/* Title */}
                    <div className="w-full mb-4 text-center sm:mb-6">
                        <h2 className="text-xl font-bold text-[#E06A26] sm:text-2xl">Create Account</h2>
                        <p className="mt-1 text-sm text-gray-600 sm:text-base">
                            Track your macros, crush your goals, and join a community of achievers.
                        </p>
                    </div>

                    {/* Form */}
                    <div className="w-full space-y-3 sm:space-y-4">
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
                                        className="h-12 sm:h-14 pl-12 bg-[#3AB1A0]/5 border-[#3AB1A0]/20 text-black placeholder:text-gray-400 rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] focus:bg-white"
                                    />
                                </div>

                                {/* Phone Input with Country Code - Fixed UI */}
                                <div className="flex items-center h-12 sm:h-14 bg-[#3AB1A0]/5 border border-[#3AB1A0]/20  rounded-xl overflow-hidden px-2 focus-within:border-[#3AB1A0] focus-within:ring-1 focus-within:ring-[#3AB1A0]">

                                    {/* Country Select */}
                                    <Select value={countryCode} onValueChange={setCountryCode}>
                                        <SelectTrigger
                                            className="flex items-center gap-1 w-22.5 h-full border-0 bg-transparent px-2 focus:ring-0 focus:outline-none"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>

                                        <SelectContent className="max-h-60">
                                            {COUNTRY_CODES.map((country) => (
                                                <SelectItem
                                                    key={`${country.code}-${country.country}`}
                                                    value={country.code}
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <span>{country.flag}</span>
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
                                        placeholder="WhatsApp Number *"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                                        className="flex-1 h-full border-0 outline-none bg-transparent text-black placeholder:text-gray-400 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none shadow-none"
                                    />
                                </div>

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
                                        <Link href="https://dtpoonamsagar.com/terms-and-conditions/" target="_blank" className="text-[#E06A26] hover:underline font-medium">
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
                                <div className="text-center mb-4">
                                    <p className="text-sm text-gray-600">
                                        Enter the 4-digit OTP sent to your WhatsApp
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {countryCode}{phone}
                                    </p>
                                </div>

                                {/* OTP Input Boxes */}
                                <div className="flex justify-center gap-3">
                                    {otp.map((digit, index) => (
                                        <Input
                                            key={index}
                                            ref={(el) => {
                                                otpRefs.current[index] = el;
                                            }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handleOtpChange(index, e.target.value)}
                                            onKeyDown={(e) => handleOtpKeyDown(index, e)}
                                            className="w-14 h-14 sm:w-16 sm:h-16 text-center text-xl font-semibold bg-[#3AB1A0]/5 border-[#3AB1A0]/20 text-black rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] focus:bg-white"
                                        />
                                    ))}
                                </div>

                                {/* Verify Button */}
                                <Button
                                    type="button"
                                    onClick={verifyOtpAndCreateUser}
                                    className="w-full h-12 sm:h-14 bg-[#61a035] hover:bg-[#60953a] text-white font-semibold text-base sm:text-lg rounded-xl shadow-lg"
                                    disabled={isLoading || otp.join('').length !== 4}
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

                                {/* Back to details */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStep('details');
                                        setOtp(['', '', '', '']);
                                        setError('');
                                        setSuccess('');
                                    }}
                                    className="w-full text-sm text-gray-500 hover:text-gray-700"
                                >
                                    ← Back to edit details
                                </button>
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
            </div>
        </div>
    );
}