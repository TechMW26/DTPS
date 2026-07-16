'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateIST } from '@/lib/utils/formatDateIST';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2, Receipt, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface PaymentDetails {
  _id: string;
  amount: number;
  finalAmount: number;
  planName?: string;
  status: string;
  paidAt?: string;
  razorpayPaymentId?: string;
  razorpayPaymentLinkId?: string;
  razorpaySignature?: string;
  transactionId?: string;
  client?: {
    firstName: string;
    lastName: string;
  };
}

function PaymentSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(10);

  const redirectTo = searchParams.get('redirectTo') || '/health-counselor/clients';

  useEffect(() => {
    const verifyPayment = async () => {
      const paymentLinkId = searchParams.get('razorpay_payment_link_id');
      const paymentId = searchParams.get('razorpay_payment_id');
      const signature = searchParams.get('razorpay_signature');

      if (!paymentLinkId) {
        setError('Invalid payment reference');
        setLoading(false);
        return;
      }

      try {
        // Verify payment with backend
        const response = await fetch(`/api/payment-links/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentLinkId,
            paymentId,
            signature
          })
        });

        const data = await response.json();

        if (data.success) {
          setPaymentDetails(data.paymentLink);
        } else {
          setError(data.error || 'Payment verification failed');
        }
      } catch (err) {
        console.error('Verification error:', err);
        setError('Failed to verify payment');
      } finally {
        setLoading(false);
      }
    };

    verifyPayment();
  }, [searchParams]);

  useEffect(() => {
    if (loading || error || !paymentDetails) return;

    const timer = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          router.push(redirectTo);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loading, error, paymentDetails, redirectTo, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">Verifying payment...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-red-600">
              <XCircle className="h-16 w-16 mx-auto mb-4" />
              Payment Verification Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-gray-600 mb-6">{error}</p>
            <div className="text-center">
              <Link href="/">
                <Button>Go to Home</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-0 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl text-slate-900">Payment Request Completed</CardTitle>
            <p className="text-sm text-slate-500">The payment has been captured successfully and the receipt is ready.</p>
          </CardHeader>
          <CardContent>
            {paymentDetails && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-slate-400">Payment For</p>
                      <p className="font-semibold text-slate-900">{paymentDetails.planName || 'Service Plan'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Amount Paid</p>
                      <p className="font-semibold text-slate-900">INR {paymentDetails.finalAmount?.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Paid At</p>
                      <p className="font-medium text-slate-900">{paymentDetails.paidAt ? formatDateIST(paymentDetails.paidAt) : '-'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Status</p>
                      <p className="font-medium capitalize text-emerald-600">{paymentDetails.status}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-4 flex items-center gap-2 text-slate-900">
                    <Receipt className="h-4 w-4" />
                    <span className="font-semibold">Transaction Details</span>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-slate-500">Transaction ID</span>
                      <span className="break-all text-right font-mono text-slate-900">{paymentDetails.transactionId || paymentDetails.razorpayPaymentId || paymentDetails._id}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-slate-500">Razorpay Payment ID</span>
                      <span className="break-all text-right font-mono text-slate-900">{paymentDetails.razorpayPaymentId || '-'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-slate-500">Payment Link ID</span>
                      <span className="break-all text-right font-mono text-slate-900">{paymentDetails.razorpayPaymentLinkId || '-'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-slate-500">Signature</span>
                      <span className="break-all text-right font-mono text-slate-900">{paymentDetails.razorpaySignature || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="rounded-[28px] bg-[#09a15a] p-6 text-white shadow-[0_24px_80px_rgba(9,161,90,0.28)]">
          <p className="text-center text-sm text-white/80">You will be redirected in {countdown} seconds</p>
          <h1 className="mt-2 text-center text-3xl font-bold">Payment Successful</h1>

          <div className="mx-auto mt-8 flex h-40 w-40 items-center justify-center rounded-full bg-[#8ae234]/20 ring-8 ring-[#8ae234]/20">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#8ae234]">
              <CheckCircle className="h-12 w-12 text-white" />
            </div>
          </div>

          <div className="mt-8 rounded-2xl bg-white p-4 text-slate-900">
            <p className="truncate text-sm font-semibold">{paymentDetails?.planName || 'DTPS Payment'}</p>
            <p className="mt-2 text-xs text-slate-500">{paymentDetails?.paidAt ? formatDateIST(paymentDetails.paidAt) : 'Payment captured'}</p>
            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">Amount</span>
              <span className="font-semibold">INR {paymentDetails?.finalAmount?.toLocaleString() || '0'}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">Txn</span>
              <span className="max-w-45 truncate font-mono">{paymentDetails?.razorpayPaymentId || paymentDetails?.transactionId || '-'}</span>
            </div>
          </div>

          <Button
            className="mt-6 w-full bg-white text-[#067a45] hover:bg-white/90"
            onClick={() => router.push(redirectTo)}
          >
            Go To Client Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <p className="mt-4 text-center text-xs text-white/80">After 10 seconds you will be redirected automatically.</p>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading...</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PaymentSuccessContent />
    </Suspense>
  );
}


