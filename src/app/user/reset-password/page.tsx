'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Eye, EyeOff, CheckCircle, XCircle, Loader2, ArrowLeft } from 'lucide-react';

function ResetPasswordForm() {
  const searchParams = useSearchParams();

  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [userName, setUserName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    const emailParam = searchParams.get('email');

    if (tokenParam && emailParam) {
      setToken(tokenParam);
      setEmail(emailParam);
      validateToken(tokenParam, emailParam);
    } else {
      setIsValidating(false);
      setError('Invalid password reset link. Missing token or email.');
    }
  }, [searchParams]);

  const validateToken = async (token: string, email: string) => {
    try {
      const response = await fetch(`/api/user/reset-password?token=${token}&email=${encodeURIComponent(email)}`);
      const data = await response.json();

      if (data.valid) {
        setIsValid(true);
        setUserName(data.userName);
      } else {
        setError(data.error || 'Invalid or expired password reset link.');
      }
    } catch (err) {
      setError('An error occurred while validating the reset link.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/user/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to reset password. Please try again.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="flex flex-col min-h-screen bg-white md:bg-gray-50 items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-[#3AB1A0] mx-auto" />
          <p className="mt-4 text-gray-600">Validating reset link...</p>
        </div>
      </div>
    );
  }

  if (!isValid && !success) {
    return (
      <div className="flex flex-col min-h-screen bg-white md:bg-gray-50">
        <div className="flex flex-col items-center justify-center flex-1 px-4 py-4">
          <div className="w-full max-w-md md:bg-white md:rounded-2xl md:shadow-lg md:p-8 lg:p-10">
            {/* Logo */}
            <div className="flex items-center justify-center overflow-hidden w-24 h-24 mx-auto rounded-xl sm:w-28 sm:h-28 md:w-32 md:h-32">
              <Image
                src="/images/dtps-logo.png"
                alt="DTPS"
                width={128}
                height={128}
                className="object-cover w-full h-full"
              />
            </div>

            <div className="text-center mt-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Invalid Link</h2>
              <p className="text-gray-600 mb-6">{error}</p>
              <div className="space-y-3">
                <Button
                  className="w-full h-12 bg-[#3AB1A0] hover:bg-[#2A9A8B] text-white rounded-xl"
                  asChild
                >
                  <Link href="/user/forget-password">
                    Request New Reset Link
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-12 rounded-xl border-[#3AB1A0] text-[#3AB1A0]"
                  asChild
                >
                  <Link href="/client-auth/signin">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Login
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col min-h-screen bg-white md:bg-gray-50">
        <div className="flex flex-col items-center justify-center flex-1 px-4 py-4">
          <div className="w-full max-w-md md:bg-white md:rounded-2xl md:shadow-lg md:p-8 lg:p-10">
            {/* Logo */}
            <div className="flex items-center justify-center overflow-hidden w-24 h-24 mx-auto rounded-xl sm:w-28 sm:h-28 md:w-32 md:h-32">
              <Image
                src="/images/dtps-logo.png"
                alt="DTPS"
                width={128}
                height={128}
                className="object-cover w-full h-full"
              />
            </div>

            <div className="text-center mt-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Password Reset Successful!</h2>
              <p className="text-gray-600 mb-6">
                Your password has been reset successfully. You can now log in with your new password.
              </p>
              <Button
                className="w-full h-12 sm:h-14 bg-[#61a035] hover:bg-[#60953a] text-white font-semibold text-base sm:text-lg rounded-xl shadow-lg"
                asChild
              >
                <Link href="/client-auth/signin">
                  Log In
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white md:bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-center p-4 md:hidden">
        <h1 className="text-[#E06A26] text-center font-semibold text-lg">Reset Password</h1>
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center justify-center flex-1 px-4 py-4">
        <div className="w-full max-w-md md:bg-white md:rounded-2xl md:shadow-lg md:p-8 lg:p-10">
          {/* Logo */}
          <div className="flex items-center justify-center overflow-hidden w-24 h-24 mx-auto rounded-xl sm:w-28 sm:h-28 md:w-32 md:h-32">
            <Image
              src="/images/dtps-logo.png"
              alt="DTPS"
              width={128}
              height={128}
              className="object-cover w-full h-full"
            />
          </div>

          {/* App Name */}
          <h2 className="text-2xl font-bold text-center text-[#E06A26] mt-4 mb-2 sm:text-3xl">Reset Password</h2>
          {userName && (
            <p className="mb-6 text-center text-gray-600 text-sm sm:text-base sm:mb-8">
              Hello {userName}, enter your new password below
            </p>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="w-full space-y-4">
            {error && (
              <Alert variant="destructive" className="text-red-700 border-red-200 bg-red-50">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* New Password Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">New Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <Lock className="w-5 h-5 text-gray-500" />
                </div>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 sm:h-14 pl-12 pr-12 bg-[#3AB1A0]/5 border-[#3AB1A0]/20 text-black placeholder:text-gray-400 rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] focus:bg-white"
                  required
                  minLength={4}
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
            </div>

            {/* Confirm Password Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Confirm Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <Lock className="w-5 h-5 text-gray-500" />
                </div>
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-12 sm:h-14 pl-12 pr-12 bg-[#3AB1A0]/5 border-[#3AB1A0]/20 text-black placeholder:text-gray-400 rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] focus:bg-white"
                  required
                  minLength={4}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-4"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <Eye className="w-5 h-5 text-gray-500" />
                  ) : (
                    <EyeOff className="w-5 h-5 text-gray-500" />
                  )}
                </button>
              </div>
            </div>

            {password && confirmPassword && password !== confirmPassword && (
              <p className="text-sm text-red-500">Passwords do not match</p>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-12 sm:h-14 bg-[#61a035] hover:bg-[#60953a] text-white font-semibold text-base sm:text-lg rounded-xl shadow-lg"
              disabled={isLoading || !password || !confirmPassword || password !== confirmPassword}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Resetting Password...
                </>
              ) : (
                'Reset Password'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function UserResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-screen bg-white md:bg-gray-50 items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-[#3AB1A0]" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
