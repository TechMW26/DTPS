'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Mail, 
  Send,
  Loader2,
  CheckCircle,
  ArrowLeft,
  LogIn,
  MailCheck
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (response.ok) {
        setEmailSent(true);
        toast.success('Password reset link sent!');
      } else {
        const data = await response.json();
        toast.error(data.message || 'Failed to send reset link');
      }
    } catch (error) {
      console.error('Error sending reset link:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToLogin = async () => {
    try {
      // Sign out and redirect to login
      await signOut({ 
        callbackUrl: '/client-auth/signin',
        redirect: true
      });
    } catch (error) {
      console.error('Error during logout:', error);
      router.push('/client-auth/signin');
    }
  };

  // Success state - Email sent
  if (emailSent) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white px-4 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-700" />
              </button>
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
              <MailCheck className="h-14 w-14 text-[#3AB1A0]" />
            </div>
            <div className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-white shadow-md flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-[#E06A26]" />
            </div>
          </div>

          {/* Success Message */}
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Check Your Email</h2>
          <p className="text-gray-600 text-center max-w-sm mb-8">
            We've sent a password reset link to your email address. Please check your inbox and spam folder.
          </p>

          {/* Go to Login Button */}
          <Button 
            onClick={handleGoToLogin}
            className="w-full max-w-sm h-14 bg-[#3AB1A0] hover:bg-[#3AB1A0]/90 text-white font-semibold rounded-xl text-base"
          >
            Go to Login
            <LogIn className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white px-4 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Forgot Password</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-6">
        {/* Info Card */}
        <Card className="border border-gray-100 shadow-sm mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-[#3AB1A0]/10 flex items-center justify-center shrink-0">
                <MailCheck className="h-7 w-7 text-[#3AB1A0]" />
              </div>
              <div>
                <h3 className="font-semibold text-[#3AB1A0] text-lg">Reset Password</h3>
                <p className="text-sm text-gray-600">
                  Enter your email to receive a password reset link.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Email Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-gray-700 font-medium">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-12 h-14 border-gray-200 rounded-xl focus:border-[#3AB1A0] focus:ring-[#3AB1A0] text-base"
              />
            </div>
            <p className="text-sm text-gray-500">
              We'll send a link to this address if an account exists.
            </p>
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
                Sending...
              </>
            ) : (
              <>
                Send Reset Link
                <Send className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </form>

        {/* Back to Settings Link */}
        <div className="mt-6 text-center">
          <Link 
            href="/user/settings" 
            className="text-[#3AB1A0] font-medium hover:underline"
          >
            Back to Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
