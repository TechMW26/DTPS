'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Download, Home, FileText } from 'lucide-react';
import { format } from 'date-fns';

interface SubscriptionDetails {
  _id: string;
  amount: number;
  currency: string;
  status: string;
  paymentStatus: string;
  paidAt: string;
  startDate: string;
  endDate: string;
  plan: {
    name: string;
    description: string;
    duration: number;
  };
  dietitian: {
    firstName: string;
    lastName: string;
    email: string;
  };
  razorpayPaymentId: string;
}

function PaymentSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const paymentId = searchParams.get('razorpay_payment_id');
  const paymentLinkId = searchParams.get('razorpay_payment_link_id');
  const paymentLinkStatus = searchParams.get('razorpay_payment_link_status');

  useEffect(() => {
    if (paymentId && paymentLinkStatus === 'paid') {
      fetchSubscriptionDetails();
    } else {
      setError('Invalid payment details');
      setLoading(false);
    }
  }, [paymentId, paymentLinkStatus]);

  const fetchSubscriptionDetails = async () => {
    try {
      setLoading(true);
      // Fetch subscription details using the payment ID
      const response = await fetch(`/api/subscriptions?paymentId=${paymentId}`);
      
      if (response.ok) {
        const data = await response.json();
        setSubscription(data.subscription);
      } else {
        setError('Failed to fetch subscription details');
      }
    } catch (err) {
      console.error('Error fetching subscription:', err);
      setError('An error occurred while fetching subscription details');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReceipt = () => {
    if (!subscription) return;
    
    // Generate receipt content
    const receiptContent = `
SUBSCRIPTION PAYMENT RECEIPT
========================================

Payment Status: SUCCESSFUL ✓
Payment ID: ${subscription.razorpayPaymentId}
Date: ${format(new Date(subscription.paidAt), 'PPP p')}

SUBSCRIPTION DETAILS
========================================
Plan: ${subscription.plan.name}
Duration: ${subscription.plan.duration} days
Amount: ${subscription.currency} ${subscription.amount}

PERIOD
========================================
Start Date: ${format(new Date(subscription.startDate), 'PPP')}
End Date: ${format(new Date(subscription.endDate), 'PPP')}

DIETITIAN
========================================
Name: Dt. ${subscription.dietitian.firstName} ${subscription.dietitian.lastName}
Email: ${subscription.dietitian.email}

STATUS
========================================
Subscription Status: ${subscription.status.toUpperCase()}
Payment Status: ${subscription.paymentStatus.toUpperCase()}

Thank you for your subscription!
    `;

    // Create blob and download
    const blob = new Blob([receiptContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${subscription.razorpayPaymentId}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading payment details...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto">
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="text-red-600">Payment Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-red-700 mb-4">{error}</p>
              <Button onClick={() => router.push('/billing')} variant="outline">
                Back to Billing
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        {/* Success Header */}
        <Card className="border-green-200 bg-green-50 mb-6">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-600">Payment Successful!</CardTitle>
            <CardDescription className="text-green-700 mt-2">
              Your subscription has been activated
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Subscription Details */}
        {subscription && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Subscription Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Plan Name</p>
                    <p className="font-semibold">{subscription.plan.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Amount Paid</p>
                    <p className="font-semibold text-green-600">
                      {subscription.currency} {subscription.amount}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Start Date</p>
                    <p className="font-semibold">
                      {format(new Date(subscription.startDate), 'PPP')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">End Date</p>
                    <p className="font-semibold">
                      {format(new Date(subscription.endDate), 'PPP')}
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600 mb-2">Status</p>
                  <div className="flex gap-2">
                    <Badge className="bg-green-600">
                      {subscription.status.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">
                      {subscription.paymentStatus.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Dietitian Info */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Your Dietitian</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="font-semibold">
                    Dt. {subscription.dietitian.firstName} {subscription.dietitian.lastName}
                  </p>
                  <p className="text-sm text-gray-600">{subscription.dietitian.email}</p>
                </div>
              </CardContent>
            </Card>

            {/* Payment Info */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Payment Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment ID:</span>
                  <span className="font-mono text-sm">{subscription.razorpayPaymentId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Paid At:</span>
                  <span>{format(new Date(subscription.paidAt), 'PPP p')}</span>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 justify-center">
          <Button
            onClick={handleDownloadReceipt}
            variant="outline"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Download Receipt
          </Button>
          <Button
            onClick={() => router.push('/billing')}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            View All Subscriptions
          </Button>
          <Button
            onClick={() => router.push('/')}
            variant="ghost"
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading payment details...</p>
          </div>
        </div>
      </DashboardLayout>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}

