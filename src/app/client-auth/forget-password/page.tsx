'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';

export default function ClientForgetPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/user/forget-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.trim().toLowerCase()
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.error || 'An error occurred. Please try again.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col min-h-screen bg-white md:bg-gray-50">
        <div className="flex items-center justify-center p-4 md:hidden">
          <h1 className="text-[#E06A26] text-center font-semibold text-lg">Check Email</h1>
        </div>

        <div className="flex flex-col items-center justify-center flex-1 px-4 py-4 sm:px-6 md:px-8">
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
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h2>
              <p className="text-gray-600 mb-6">
                If an account exists with <strong>{email}</strong>, you will receive a password reset link shortly.
              </p>
              <p className="text-sm text-gray-500 mb-6">
                The link will expire in 60 minutes. Make sure to check your spam folder.
              </p>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full h-12 rounded-xl border-[#3AB1A0] text-[#3AB1A0] hover:bg-[#3AB1A0]/10"
                  asChild
                >
                  <Link href="/client-auth/signin">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Login
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="w-full h-12 rounded-xl text-gray-500"
                  onClick={() => {
                    setSuccess(false);
                    setEmail('');
                  }}
                >
                  Try a different email
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white md:bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-center p-4 md:hidden relative">
        <Link href="/client-auth/signin" className="absolute left-4">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <h1 className="text-[#E06A26] text-center font-semibold text-lg">Forgot Password</h1>
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center justify-center flex-1 px-4 py-4 sm:px-6 md:px-8">
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
          <Link href="/client-auth" className="block text-2xl font-bold text-center text-[#E06A26] mt-4 mb-2 hover:text-[#d15a1a] transition-colors sm:text-3xl">
            DTPS
          </Link>
          <p className="mb-6 text-center text-gray-600 text-sm sm:text-base sm:mb-8">
            Enter your email to receive a password reset link
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="w-full space-y-4">
            {error && (
              <Alert variant="destructive" className="text-red-700 border-red-200 bg-red-50">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Email Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <Mail className="w-5 h-5 text-gray-500" />
                </div>
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 sm:h-14 pl-12 bg-[#3AB1A0]/5 border-[#3AB1A0]/20 text-black placeholder:text-gray-400 rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] focus:bg-white"
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-12 sm:h-14 bg-[#61a035] hover:bg-[#60953a] text-white font-semibold text-base sm:text-lg rounded-xl shadow-lg"
              disabled={isLoading || !email}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </Button>
          </form>

          {/* Back to Login */}
          <p className="mt-6 text-center text-gray-500 text-sm sm:text-base sm:mt-8">
            Remember your password?{' '}
            <Link href="/client-auth/signin" className="text-[#E06A26] font-semibold hover:underline">
              Log In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
