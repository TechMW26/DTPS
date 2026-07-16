'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { AlertCircle, ArrowLeft, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

const errorMessages: Record<string, string> = {
  Configuration: 'There is a problem with the server configuration. Please contact support.',
  AccessDenied: 'Access denied. You do not have permission to access this resource.',
  Verification: 'The verification link may have expired or already been used.',
  Default: 'An authentication error occurred. Please try again.',
  CredentialsSignin: 'Invalid email or password. Please check your credentials and try again.',
  SessionRequired: 'Please sign in to access this page.',
  OAuthSignin: 'Error occurred during sign in with social account.',
  OAuthCallback: 'Error occurred during social login callback.',
  OAuthCreateAccount: 'Could not create account with social provider.',
  EmailCreateAccount: 'Could not create account with email.',
  Callback: 'Error occurred in authentication callback.',
  OAuthAccountNotLinked: 'This email is already linked to another account. Please sign in with your original method.',
  EmailSignin: 'The email sign in link is invalid or has expired.',
  network: 'Network error. Please check your internet connection and try again.',
  server: 'Server error. Please try again later.',
};

function ClientAuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'Default';
  const errorMessage = errorMessages[error] || errorMessages.Default;

  return (
    <div className="flex flex-col min-h-screen bg-white md:bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-center p-4 md:hidden">
        <h1 className="text-[#E06A26] text-center font-semibold text-lg">Error</h1>
      </div>

      <div className="flex flex-col items-center justify-center flex-1 px-4 py-8">
        <div className="w-full max-w-md md:bg-white md:rounded-2xl md:shadow-lg md:p-8">
          {/* Logo */}
          <div className="flex items-center justify-center overflow-hidden w-24 h-24 mx-auto mb-4 rounded-xl">
            <img
              src="/images/dtps-logo.png"
              alt="DTPS"
              className="object-cover w-full h-full"
            />
          </div>

          {/* Error Icon */}
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>

          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
            Oops! Something went wrong
          </h1>

          <p className="text-center text-gray-600 mb-6">
            {errorMessage}
          </p>

          {error && error !== 'Default' && (
            <p className="text-xs text-center text-gray-400 mb-6 font-mono">
              Error code: {error}
            </p>
          )}

          <div className="space-y-3">
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="w-full h-12 sm:h-14 rounded-xl border-[#3AB1A0]/30"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>

            <Link href="/client-auth/signin" className="block">
              <Button className="w-full h-12 sm:h-14 bg-[#61a035] hover:bg-[#60953a] text-white font-semibold rounded-xl">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Sign In
              </Button>
            </Link>

            <Link href="/user" className="block">
              <Button variant="ghost" className="w-full h-12 sm:h-14 text-[#E06A26] hover:bg-[#E06A26]/10 rounded-xl">
                <Home className="w-4 h-4 mr-2" />
                Go to Homepage
              </Button>
            </Link>
          </div>

          {/* Help Text */}
          <p className="mt-6 text-center text-sm text-gray-500">
            If the problem persists, please contact our{' '}
            <a href="mailto:support@dtps.tech" className="text-[#E06A26] hover:underline">
              support team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ClientAuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#E06A26]"></div>
      </div>
    }>
      <ClientAuthErrorContent />
    </Suspense>
  );
}
