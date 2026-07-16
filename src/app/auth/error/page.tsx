'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
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
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'Default';
  const errorMessage = errorMessages[error] || errorMessages.Default;

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="flex flex-col items-center justify-center flex-1 px-4 py-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center justify-center overflow-hidden w-24 h-24 mx-auto mb-6 rounded-xl">
            <img
              src="/images/dtps-logo.png"
              alt="DTPS"
              className="object-cover w-full h-full"
            />
          </div>

          {/* Error Card */}
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Authentication Error
            </h1>

            <p className="text-gray-600 mb-6">
              {errorMessage}
            </p>

            {error && error !== 'Default' && (
              <p className="text-xs text-gray-400 mb-6 font-mono">
                Error code: {error}
              </p>
            )}

            <div className="space-y-3">
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                className="w-full h-12 rounded-xl"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>

              <Link href="/client-auth/signin" className="block">
                <Button className="w-full h-12 bg-[#61a035] hover:bg-[#60953a] text-white rounded-xl">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Sign In
                </Button>
              </Link>
            </div>
          </div>

          {/* Help Links */}
          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-gray-500">
              Need help?{' '}
              <Link href="/user" className="text-[#E06A26] hover:underline">
                Visit our homepage
              </Link>
            </p>
            <p className="text-sm text-gray-500">
              Staff member?{' '}
              <Link href="/auth/signin" className="text-[#E06A26] hover:underline">
                Use staff login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#E06A26]"></div>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}
