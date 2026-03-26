'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, Clock, CheckCircle, XCircle, Calendar, User, FileText } from 'lucide-react';

interface PaymentLinkDetails {
  _id: string;
  amount: number;
  tax: number;
  discount: number;
  finalAmount: number;
  currency: string;
  planName?: string;
  planCategory?: string;
  duration?: string;
  status: string;
  expireDate?: string;
  paidAt?: string;
  razorpayPaymentLinkUrl?: string;
  razorpayPaymentLinkShortUrl?: string;
  client?: {
    firstName: string;
    lastName: string;
  };
  dietitian?: {
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

export default function ManualPaymentPage() {
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [paymentLink, setPaymentLink] = useState<PaymentLinkDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPaymentLink = async () => {
      if (!id) {
        setError('Invalid payment link');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/payment-links/public/${id}`);
        const data = await response.json();

        if (data.success) {
          setPaymentLink(data.paymentLink);
        } else {
          setError(data.error || 'Payment link not found');
        }
      } catch (err) {
        console.error('Error fetching payment link:', err);
        setError('Failed to load payment details');
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentLink();
  }, [id]);

  const handlePayNow = () => {
    if (paymentLink?.razorpayPaymentLinkUrl && !paymentLink.razorpayPaymentLinkUrl.includes('/payment/manual/')) {
      window.location.href = paymentLink.razorpayPaymentLinkUrl;
    } else if (paymentLink?.razorpayPaymentLinkShortUrl) {
      window.location.href = paymentLink.razorpayPaymentLinkShortUrl;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-purple-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading payment details...</p>
        </div>
      </div>
    );
  }

  if (error || !paymentLink) {
    return (
      <div className="min-h-screen bg-linear-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Payment Link Not Found</h2>
            <p className="text-gray-600">{error || 'The payment link does not exist or has been removed.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPending = paymentLink.status === 'pending' || paymentLink.status === 'created';
  const isPaid = paymentLink.status === 'paid';
  const isExpired = paymentLink.status === 'expired';
  const isCancelled = paymentLink.status === 'cancelled';
  const hasRazorpayLink = paymentLink.razorpayPaymentLinkUrl && !paymentLink.razorpayPaymentLinkUrl.includes('/payment/manual/');

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-50 via-white to-blue-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-linear-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            DTPS
          </h1>
          <p className="text-gray-500 mt-1">Dietitian Practice System</p>
        </div>

        <Card className="shadow-xl border-0 overflow-hidden">
          <div className={`px-6 py-4 flex items-center justify-between border-b ${isPaid ? 'bg-green-100 text-green-800' :
              isExpired ? 'bg-red-100 text-red-800' :
                isCancelled ? 'bg-gray-100 text-gray-800' :
                  'bg-yellow-100 text-yellow-800'
            }`}>
            <div className="flex items-center gap-2">
              {isPaid ? <CheckCircle className="h-5 w-5" /> :
                isExpired || isCancelled ? <XCircle className="h-5 w-5" /> :
                  <Clock className="h-5 w-5" />}
              <span className="font-semibold capitalize">{paymentLink.status}</span>
            </div>
            {paymentLink.expireDate && isPending && (
              <div className="text-sm flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Expires: {formatDate(paymentLink.expireDate)}
              </div>
            )}
          </div>

          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Payment Details</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {paymentLink.client && (
              <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                <User className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">
                    {paymentLink.client.firstName} {paymentLink.client.lastName}
                  </p>
                </div>
              </div>
            )}

            {(paymentLink.planName || paymentLink.duration) && (
              <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-lg">
                <FileText className="h-5 w-5 text-purple-500 mt-0.5" />
                <div>
                  {paymentLink.planName && (
                    <p className="font-medium text-gray-900">{paymentLink.planName}</p>
                  )}
                  {paymentLink.duration && (
                    <p className="text-sm text-purple-600 mt-1">Duration: {paymentLink.duration}</p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3 pt-4 border-t">
              <div className="flex justify-between text-gray-600">
                <span>Amount</span>
                <span>₹{paymentLink.amount.toLocaleString('en-IN')}</span>
              </div>

              {paymentLink.tax > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Tax ({paymentLink.tax}%)</span>
                  <span>+₹{((paymentLink.amount * paymentLink.tax) / 100).toLocaleString('en-IN')}</span>
                </div>
              )}

              {paymentLink.discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount ({paymentLink.discount}%)</span>
                  <span>-₹{((paymentLink.amount * paymentLink.discount) / 100).toLocaleString('en-IN')}</span>
                </div>
              )}

              <div className="flex justify-between pt-3 border-t border-dashed">
                <span className="text-lg font-semibold text-gray-900">Total</span>
                <span className="text-2xl font-bold text-purple-600">
                  ₹{paymentLink.finalAmount.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {paymentLink.dietitian && (
              <div className="text-center text-sm text-gray-500 pt-2">
                Consultation with <span className="font-medium">{paymentLink.dietitian.firstName} {paymentLink.dietitian.lastName}</span>
              </div>
            )}

            <div className="pt-4">
              {isPending && hasRazorpayLink && (
                <Button
                  onClick={handlePayNow}
                  className="w-full h-14 text-lg font-semibold bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  <CreditCard className="mr-2 h-5 w-5" />
                  Pay ₹{paymentLink.finalAmount.toLocaleString('en-IN')}
                </Button>
              )}

              {isPending && !hasRazorpayLink && (
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <Clock className="h-12 w-12 text-yellow-500 mx-auto mb-2" />
                  <p className="font-semibold text-yellow-800">Payment Pending</p>
                  <p className="text-sm text-yellow-600 mt-1">
                    Please contact your dietitian for payment instructions.
                  </p>
                </div>
              )}

              {isPaid && (
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                  <p className="font-semibold text-green-800">Payment Successful!</p>
                  {paymentLink.paidAt && (
                    <p className="text-sm text-green-600 mt-1">
                      Paid on {formatDate(paymentLink.paidAt)}
                    </p>
                  )}
                </div>
              )}

              {isExpired && (
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <XCircle className="h-12 w-12 text-red-500 mx-auto mb-2" />
                  <p className="font-semibold text-red-800">Payment Link Expired</p>
                  <p className="text-sm text-red-600 mt-1">
                    Please contact your dietitian for a new payment link.
                  </p>
                </div>
              )}

              {isCancelled && (
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <XCircle className="h-12 w-12 text-gray-500 mx-auto mb-2" />
                  <p className="font-semibold text-gray-800">Payment Cancelled</p>
                  <p className="text-sm text-gray-600 mt-1">
                    This payment link has been cancelled.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-6 text-sm text-gray-500">
          <p>Secure payment powered by Razorpay</p>
          <p className="mt-1">© {new Date().getFullYear()} DTPS</p>
        </div>
      </div>
    </div>
  );
}
