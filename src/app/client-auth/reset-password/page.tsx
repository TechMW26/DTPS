'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Lock,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  ArrowLeft,
  LogIn,
  KeyRound,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  useEffect(() => {
    if (!token || !email) {
      setError('Invalid or expired reset link. Please request a new password reset.');
    }
  }, [token, email]);

  const validatePassword = (pwd: string) => {
    if (pwd.length < 4) {
      return 'Password must be at least 4 characters';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const passwordError = validatePassword(password);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        toast.success('Password reset successfully!');
      } else {
        toast.error(data.message || data.error || 'Failed to reset password');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Error state - Invalid link
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white px-5 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/client-auth/signin"
                className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-700" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Reset Password</h1>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center px-4 py-16">
          {/* Error Icon */}
          <div className="h-20 w-20 rounded-full bg-red-100 flex items-center justify-center mb-6">
            <AlertCircle className="h-10 w-10 text-red-500" />
          </div>

          {/* Error Message */}
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Invalid Link</h2>
          <p className="text-gray-600 text-center max-w-sm mb-8">
            {error}
          </p>

          {/* Request New Link Button */}
          <Link href="/user/settings/password" className="w-full max-w-sm">
            <Button
              className="w-full h-14 bg-[#3AB1A0] hover:bg-[#3AB1A0]/90 text-white font-semibold rounded-xl text-base"
            >
              Request New Link
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Success state - Password reset complete
  if (success) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white px-5 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10" /> {/* Spacer */}
              <div>
                <h1 className="text-xl font-bold text-gray-900">Password Reset</h1>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center px-4 py-16">
          {/* Success Icon */}
          <div className="relative mb-6">
            <div className="h-28 w-28 rounded-2xl bg-[#3AB1A0]/10 flex items-center justify-center">
              <KeyRound className="h-14 w-14 text-[#3AB1A0]" />
            </div>
            <div className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-white shadow-md flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-[#E06A26]" />
            </div>
          </div>

          {/* Success Message */}
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Password Changed!</h2>
          <p className="text-gray-600 text-center max-w-sm mb-8">
            Your password has been reset successfully. You can now log in with your new password.
          </p>

          {/* Go to Login Button */}
          <Link href="/client-auth/signin" className="w-full max-w-sm">
            <Button
              className="w-full h-14 bg-[#3AB1A0] hover:bg-[#3AB1A0]/90 text-white font-semibold rounded-xl text-base"
            >
              Go to Login
              <LogIn className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white px-5 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/client-auth/signin"
              className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">New Password</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-6">
        {/* Info Card */}
        <Card className="border border-gray-100 shadow-sm mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-[#3AB1A0]/10 flex items-center justify-center shrink-0">
                <KeyRound className="h-7 w-7 text-[#3AB1A0]" />
              </div>
              <div>
                <h3 className="font-semibold text-[#3AB1A0] text-lg">Create New Password</h3>
                <p className="text-sm text-gray-600">
                  Enter a strong password for your account.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-gray-700 font-medium">
              New Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-12 pr-12 h-14 border-gray-200 rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] text-base"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-gray-700 font-medium">
              Confirm Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-12 pr-12 h-14 border-gray-200 rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] text-base"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Password Requirements */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Password Requirements:</p>
            <ul className="space-y-1 text-sm text-gray-600">
              <li className={`flex items-center gap-2 ${password.length >= 4 ? 'text-[#3AB1A0]' : ''}`}>
                <CheckCircle className={`h-4 w-4 ${password.length >= 4 ? 'text-[#3AB1A0]' : 'text-gray-300'}`} />
                At least 4 characters (letters, numbers, or special characters)
              </li>
            </ul>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full h-14 bg-[#3AB1A0] hover:bg-[#3AB1A0]/90 text-white font-semibold rounded-xl text-base"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Resetting Password...
              </>
            ) : (
              'Reset Password'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#3AB1A0]" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
