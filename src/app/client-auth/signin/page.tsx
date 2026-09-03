'use client';

import { useState, useEffect, useRef } from 'react';
import { signIn, getSession, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Eye, EyeOff, Mail, Lock, ArrowLeft, Leaf, Phone, MessageSquare, Flag } from 'lucide-react';
import { signInSchema, SignInInput } from '@/lib/validations/auth';
import { validatePhoneNumber } from '@/lib/validations/contact';
import { COUNTRY_CODE_OPTIONS } from '@/lib/constants/countries';
import Image from 'next/image';
import type { ConfirmationResult } from 'firebase/auth';
import {
  clearFirebaseRecaptcha,
  confirmFirebasePhoneOtp,
  getFirebaseErrorCode,
  getPhoneAuthErrorMessage,
  requestFirebasePhoneOtp,
  shouldFallbackToWhatsapp,
  type PhoneOtpProvider,
} from '@/lib/firebase/phoneAuthClient';

type LoginMode = 'otp' | 'email';
type OTPStep = 'phone' | 'verify';

export default function ClientSignInPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const redirectAttemptedRef = useRef(false);

  // OTP login state
  const [loginMode, setLoginMode] = useState<LoginMode>('otp');
  const [otpStep, setOtpStep] = useState<OTPStep>('phone');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState(Array(6).fill(''));
  const [otpSent, setOtpSent] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [otpProvider, setOtpProvider] = useState<PhoneOtpProvider>('firebase');
  const [authIntent, setAuthIntent] = useState('');
  const [deliveryNotice, setDeliveryNotice] = useState('');
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const firebaseIdTokenRef = useRef('');

  useEffect(() => {
    setMounted(true);
    return () => clearFirebaseRecaptcha();
  }, []);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Redirect if already logged in
  useEffect(() => {
    if (!mounted) return;
    if (status !== 'authenticated' || !session?.user) return;
    if (redirectAttemptedRef.current) return;

    // Prevent navigation ping-pong loops (common in mobile/webview when cookies/session fail)
    const now = Date.now();
    const lockUntil = Number(sessionStorage.getItem('dtps:authRedirectLockUntil') || '0');
    if (lockUntil && now < lockUntil) {
      return;
    }

    redirectAttemptedRef.current = true;
    sessionStorage.setItem('dtps:authRedirectLockUntil', String(now + 2000));

    const role = (session.user.role || '').toLowerCase();
    if (role === 'client') {
      router.replace('/user');
    } else if (role.includes('admin')) {
      router.replace('/dashboard/admin');
    } else if (role === 'dietitian') {
      router.replace('/dashboard/dietitian');
    } else if (role === 'health_counselor') {
      router.replace('/health-counselor/clients');
    }
  }, [mounted, status, session?.user, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
  });

  // Handle OTP input change
  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      const pastedDigits = value.replace(/\D/g, '').slice(0, otp.length).split('');
      const newOtp = [...otp];
      pastedDigits.forEach((digit, i) => {
        if (index + i < otp.length) {
          newOtp[index + i] = digit;
        }
      });
      setOtp(newOtp);
      const nextIndex = Math.min(index + pastedDigits.length, otp.length - 1);
      otpInputRefs.current[nextIndex]?.focus();
      return;
    }

    if (!/^\d*$/.test(value)) return; // Only allow digits

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < otp.length - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  // Handle OTP input keydown
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
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
    setDeliveryNotice(data.message);
  };

  const handleSendOtp = async () => {
    // Strip non-digits and remove leading zeros (e.g. UK local 07911... → 7911...)
    const localDigits = phoneNumber.replace(/\D/g, '').replace(/^0+/, '');
    const phoneValidation = validatePhoneNumber(`${countryCode}${localDigits}`, countryCode);
    if (!phoneValidation.isValid) {
      setError(phoneValidation.error || 'Please enter a valid phone number');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneValidation.normalized }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to send OTP. Please try again.');
        return;
      }

      setAuthIntent(data.authIntent);
      firebaseIdTokenRef.current = '';
      try {
        if (!data.firebaseAvailable) {
          const configError = Object.assign(new Error('Firebase is unavailable'), {
            code: 'firebase-config-unavailable',
          });
          throw configError;
        }
        confirmationResultRef.current = await requestFirebasePhoneOtp(
          phoneValidation.normalized!,
          'signin-firebase-recaptcha',
        );
        setOtpProvider('firebase');
        setOtp(Array(data.codeLength || 6).fill(''));
        setDeliveryNotice('We sent a 6-digit verification code by SMS. Standard messaging rates may apply.');
      } catch (firebaseError) {
        if (!shouldFallbackToWhatsapp(firebaseError)) {
          setError(getPhoneAuthErrorMessage(firebaseError));
          return;
        }
        await requestWhatsappFallback(data.authIntent, getFirebaseErrorCode(firebaseError));
      }

      setOtpSent(true);
      setOtpStep('verify');
      setResendTimer(60);
    } catch (err) {
      console.error('Send OTP error:', err);
      setError('Failed to send OTP. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Verify OTP
  const handleVerifyOtp = async () => {
    const otpValue = otp.join('');
    if (otpValue.length !== otp.length) {
      setError(`Please enter the complete ${otp.length}-digit code.`);
      return;
    }

    const localDigitsVerify = phoneNumber.replace(/\D/g, '').replace(/^0+/, '');
    const phoneValidation = validatePhoneNumber(`${countryCode}${localDigitsVerify}`, countryCode);
    if (!phoneValidation.isValid) {
      setError(phoneValidation.error || 'Please enter a valid phone number');
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
        setError(data.error || 'Invalid OTP. Please try again.');
        return;
      }

      // OTP verified - now sign in with the token
      // We'll use NextAuth credentials provider with a special OTP token
      const result = await signIn('credentials', {
        email: data.user.email,
        otpToken: data.token, // Special token for OTP login
        loginContext: 'client',
        redirect: false,
        callbackUrl: '/user',
      });

      if (result?.error) {
        setError('Login failed. Please try again.');
        return;
      }

      if (result?.ok) {
        redirectAttemptedRef.current = true;
        sessionStorage.setItem('dtps:authRedirectLockUntil', String(Date.now() + 3000));
        window.location.href = data.redirectUrl || '/user';
        return;
      }
    } catch (err) {
      console.error('Verify OTP error:', err);
      setError('Verification failed. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    await handleSendOtp();
  };

  // Switch login mode
  const switchToEmailLogin = () => {
    setLoginMode('email');
    setError('');
    setOtpStep('phone');
    setOtpSent(false);
    setOtp(Array(6).fill(''));
    setDeliveryNotice('');
    clearFirebaseRecaptcha();
  };

  const switchToOtpLogin = () => {
    setLoginMode('otp');
    setError('');
  };

  const onSubmit = async (data: SignInInput) => {
    setIsLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        loginContext: 'client',
        redirect: false,
        callbackUrl: '/user',
      });

      if (result?.error) {
        // Handle specific error types
        if (result.error === 'CredentialsSignin') {
          setError('Wrong email or password. Please try again.');
        } else if (result.error === 'Configuration') {
          setError('Server configuration error. Please try again later.');
        } else {
          setError(result.error || 'Wrong email or password');
        }
        return;
      }

      if (result?.ok) {
        // Login succeeded! Mark that we're redirecting to prevent loops
        redirectAttemptedRef.current = true;
        sessionStorage.setItem('dtps:authRedirectLockUntil', String(Date.now() + 3000));

        // Try to get session to verify role, but don't block on it
        try {
          const sessionData = await Promise.race([
            getSession(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000))
          ]) as any;

          // If we got session and user is NOT a client, show error
          if (sessionData?.user && sessionData.user.role !== 'client') {
            setError('This login is for clients only. Please use the main login page.');
            setIsLoading(false);
            return;
          }
        } catch {
          // Ignore - we'll navigate anyway
        }

        // Use window.location for reliable full page navigation
        // This ensures cookies are properly set and session is established
        // Works better than router.replace() in webviews and avoids "stuck loading" issue
        window.location.href = '/user';
        return;
      }
    } catch (err) {
      console.error('Sign in error:', err);
      setError('An unexpected error occurred. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
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
  if (status === 'authenticated') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#E06A26] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white md:bg-gray-50">
      {/* Header - Hidden on larger screens */}
      <div className="flex items-center justify-center p-4 md:hidden">

        <h1 className="text-[#E06A26] text-center  font-semibold text-lg">Log In</h1>

      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center justify-center flex-1 px-4 py-4 overflow-y-auto sm:px-6 md:px-8">
        {/* Card wrapper for larger screens */}
        <div className="w-full max-w-md md:bg-white md:rounded-2xl md:shadow-lg md:p-8 lg:p-10">
          {/* Logo */}
          <div className="flex items-center justify-center overflow-hidden w-24 h-24 mx-auto rounded-xl sm:w-28 sm:h-28 md:w-32 md:h-32">
            <img
              src="/images/dtps-logo.png"
              alt="DTPS"
              className="object-cover w-full h-full"
            />
          </div>

          {/* App Name */}
          <Link href="/user" className="block text-2xl font-bold text-center text-[#E06A26] mt-4 mb-2 hover:text-[#d15a1a] transition-colors sm:text-3xl">DTPS</Link>
          <p className="mb-6 text-center text-gray-600 text-sm sm:text-base sm:mb-8">
            Welcome back! Please enter your details.
          </p>

          {error && (
            <Alert variant="destructive" className="mb-4 text-red-700 border-red-200 bg-red-50">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* OTP Login (Default) */}
          {loginMode === 'otp' && (
            <div className="w-full space-y-4">
              <div id="signin-firebase-recaptcha" className="h-0 overflow-hidden" />
              {otpStep === 'phone' && (
                <>
                  {/* Phone Input */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Phone Number</label>
                    <div className="flex items-center h-12 sm:h-14 bg-[#3AB1A0]/5 border border-[#3AB1A0]/20 rounded-xl overflow-hidden px-2 focus-within:border-[#3AB1A0] focus-within:ring-1 focus-within:ring-[#3AB1A0]">
                      <Select value={countryCode} onValueChange={setCountryCode}>
                        <SelectTrigger className="w-24 h-full border-0 bg-transparent px-2 focus:ring-0 focus:outline-none text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {COUNTRY_CODE_OPTIONS.map((country) => (
                            <SelectItem key={`${country.code}-${country.country}`} value={country.code}>
                              <span className="flex items-center gap-2">
                                <Flag aria-hidden="true" className="h-4 w-4 text-gray-500" />
                                <span>{country.code}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="w-px h-6 bg-[#3AB1A0]/20 mx-2" />
                      <Phone className="w-5 h-5 text-gray-500 mr-2 shrink-0" />

                      <Input
                        type="tel"
                        placeholder="Enter phone number"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 15))}
                        className="flex-1 h-full border-0 outline-none bg-transparent text-black placeholder:text-gray-400 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none shadow-none"
                        maxLength={15}
                      />
                    </div>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      We will send a secure verification code by SMS
                    </p>
                  </div>

                  {/* Send OTP Button */}
                  <Button
                    type="button"
                    onClick={handleSendOtp}
                    className="w-full h-12 sm:h-14 bg-[#61a035] hover:bg-[#60953a] text-white font-semibold text-base sm:text-lg rounded-xl shadow-lg"
                    disabled={isLoading || phoneNumber.replace(/\D/g, '').length < 6}
                  >
                    {isLoading ? 'Sending OTP...' : 'Send OTP'}
                  </Button>
                </>
              )}

              {otpStep === 'verify' && (
                <>
                  {/* Back to phone input */}
                  <button
                    type="button"
                    onClick={() => {
                      setOtpStep('phone');
                      setError('');
                    }}
                    className="flex  justify-centeritems-center gap-1 text-gray-500 hover:text-gray-700 text-sm mb-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Change number
                  </button>

                  <p className="text-center text-gray-600 text-sm mb-4">
                    Enter the {otp.length}-digit code sent by {otpProvider === 'firebase' ? 'SMS' : 'WhatsApp'} to
                    <br />
                    <span className="font-semibold text-gray-800">{countryCode} {phoneNumber}</span>
                  </p>

                  {/* OTP Input */}
                  <div className="flex justify-center gap-2 sm:gap-3 mb-4">
                    {otp.map((digit, index) => (
                      <Input
                        key={index}
                        ref={(el) => { otpInputRefs.current[index] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={otp.length}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        className="w-11 h-12 sm:w-14 sm:h-14 text-center text-xl font-bold bg-[#3AB1A0]/5 border-[#3AB1A0]/20 text-black rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] focus:bg-white"
                      />
                    ))}
                  </div>

                  {deliveryNotice && (
                    <p className="text-center text-xs leading-5 text-gray-500">{deliveryNotice}</p>
                  )}

                  {/* Resend OTP */}
                  <div className="text-center mb-4">
                    {resendTimer > 0 ? (
                      <p className="text-sm text-gray-500">
                        Resend OTP in <span className="font-semibold">{resendTimer}s</span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={isLoading}
                        className="text-[#E06A26] text-sm font-semibold hover:underline"
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>

                  {/* Verify OTP Button */}
                  <Button
                    type="button"
                    onClick={handleVerifyOtp}
                    className="w-full h-12 sm:h-14 bg-[#61a035] hover:bg-[#60953a] text-white font-semibold text-base sm:text-lg rounded-xl shadow-lg"
                    disabled={isLoading || otp.join('').length !== otp.length}
                  >
                    {isLoading ? 'Verifying...' : 'Verify & Login'}
                  </Button>
                </>
              )}

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-500">or</span>
                </div>
              </div>

              {/* Switch to Email Login */}
              <button
                type="button"
                onClick={switchToEmailLogin}
                className="w-full h-12 sm:h-14 border-2 border-gray-200 text-gray-700 font-semibold text-base rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                <Mail className="w-5 h-5" />
                Login with Email
              </button>
            </div>
          )}

          {/* Email Login (Alternative) */}
          {loginMode === 'email' && (
            <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-4">
              {/* Email Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                    <Mail className="w-5 h-5 text-gray-500" />
                  </div>
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    {...register('email')}
                    className={`h-12 sm:h-14 pl-12 bg-[#3AB1A0]/5 border-[#3AB1A0]/20 text-black placeholder:text-gray-400 rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] focus:bg-white ${errors.email ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-red-400">{errors.email.message}</p>
                )}
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                    <Lock className="w-5 h-5 text-gray-500" />
                  </div>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    {...register('password')}
                    className={`h-12 sm:h-14 pl-12 pr-12 bg-[#3AB1A0]/5 border-[#3AB1A0]/20 text-black placeholder:text-gray-400 rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] focus:bg-white ${errors.password ? 'border-red-500' : ''}`}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center pr-4"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <Eye className="w-5 h-5 text-gray-500" />
                    ) : (
                      <EyeOff className="w-5 h-5 text-gray-500" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-red-400">{errors.password.message}</p>
                )}
              </div>

              {/* Forgot Password */}
              <div className="text-right">
                <Link
                  href="/client-auth/forget-password"
                  className="text-[#E06A26] text-sm hover:underline"
                >
                  Forgot Password?
                </Link>
              </div>

              {/* Login Button */}
              <Button
                type="submit"
                className="w-full h-12 sm:h-14 bg-[#61a035] hover:bg-[#60953a] text-white font-semibold text-base sm:text-lg rounded-xl shadow-lg"
                disabled={isLoading}
              >
                {isLoading ? 'Logging in...' : 'Log In'}
              </Button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-500">or</span>
                </div>
              </div>

              {/* Switch to OTP Login */}
              <button
                type="button"
                onClick={switchToOtpLogin}
                className="w-full h-12 sm:h-14 border-2 border-gray-200 text-gray-700 font-semibold text-base rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-5 h-5" />
                Login with Phone OTP
              </button>
            </form>
          )}

          {/* Sign Up Link */}
          <p className="mt-6 text-center text-gray-500 text-sm sm:text-base sm:mt-8">
            Don't have an account?{' '}
            <Link href="/client-auth/signup" className="text-[#E06A26] font-semibold hover:underline">
              Sign up for free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
