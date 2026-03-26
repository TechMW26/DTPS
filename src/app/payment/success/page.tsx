'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateIST } from '@/lib/utils/formatDateIST';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface PaymentDetails {
  _id: string;
  amount: number;
  finalAmount: number;
  planName?: string;
  status: string;
  paidAt?: string;
  client?: {
    firstName: string;
    lastName: string;
  };
}

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-green-600">
            <CheckCircle className="h-16 w-16 mx-auto mb-4" />
            Payment Successful!
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {paymentDetails && (
              <>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-gray-500">Amount Paid:</span>
                    <span className="font-semibold text-right">₹{paymentDetails.finalAmount?.toLocaleString()}</span>

                    {paymentDetails.planName && (
                      <>
                        <span className="text-gray-500">Plan:</span>
                        <span className="font-medium text-right">{paymentDetails.planName}</span>
                      </>
                    )}

                    {paymentDetails.paidAt && (
                      <>
                        <span className="text-gray-500">Date:</span>
                        <span className="text-right">{formatDateIST(paymentDetails.paidAt)}</span>
                      </>
                    )}
                  </div>
                </div>

                <p className="text-center text-gray-600">
                  Thank you for your payment! A confirmation has been sent to your email.
                </p>
              </>
            )}

            <div className="text-center pt-4">
              <Link href="/dashboard">
                <Button>Go to Dashboard</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
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


