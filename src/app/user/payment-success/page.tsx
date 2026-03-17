'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { CheckCircle, Download, Mail, ArrowRight, Receipt, Calendar, CreditCard, User, Package, Loader2 } from 'lucide-react';
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';
import { toast } from 'sonner';

interface PaymentDetails {
  _id: string;
  planName: string;
  planCategory: string;
  amount: number;
  currency: string;
  status: string;
  durationDays: number;
  durationLabel: string;
  payerEmail: string;
  payerName: string;
  razorpayPaymentId: string;
  razorpayOrderId: string;
  paidAt: string;
  createdAt: string;
  transactionId: string;
  dietitian?: {
    firstName: string;
    lastName: string;
  };
}

export default function PaymentSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const receiptRef = useRef<HTMLDivElement>(null);

  const paymentId = searchParams.get('payment_id');
  const orderId = searchParams.get('order_id');
  const razorpayPaymentId = searchParams.get('razorpay_payment_id');

  useEffect(() => {
    if (paymentId || orderId || razorpayPaymentId) {
      fetchPaymentDetails();
    } else {
      // If no payment ID, redirect to user page
      router.push('/user');
    }
  }, [paymentId, orderId, razorpayPaymentId]);

  useEffect(() => {
    // Auto redirect countdown
    if (!loading && payment) {
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            router.push('/user');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [loading, payment, router]);

  const fetchPaymentDetails = async () => {
    try {
      const params = new URLSearchParams();
      if (paymentId) params.set('payment_id', paymentId);
      if (orderId) params.set('order_id', orderId);
      if (razorpayPaymentId) params.set('razorpay_payment_id', razorpayPaymentId);

      const response = await fetch(`/api/client/payment-receipt?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setPayment(data.payment);
        
        // Auto-send email receipt
        if (data.payment && !emailSent) {
          sendEmailReceipt(data.payment._id);
        }
      } else {
        toast.error('Could not fetch payment details');
        setTimeout(() => router.push('/user'), 3000);
      }
    } catch (error) {
      console.error('Error fetching payment:', error);
      toast.error('Error loading payment details');
    } finally {
      setLoading(false);
    }
  };

  const sendEmailReceipt = async (id: string) => {
    if (sendingEmail || emailSent) return;
    
    setSendingEmail(true);
    try {
      const response = await fetch('/api/client/send-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: id })
      });

      if (response.ok) {
        setEmailSent(true);
        toast.success('Receipt sent to your email!');
      }
    } catch (error) {
      console.error('Error sending email:', error);
    } finally {
      setSendingEmail(false);
    }
  };

  const downloadReceipt = async () => {
    if (!receiptRef.current || downloading) return;
    
    setDownloading(true);
    try {
      // Dynamic import for html2canvas
      const html2canvasModule = await import('html2canvas');
      const html2canvasFn = html2canvasModule.default as (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
      
      const canvas = await html2canvasFn(receiptRef.current, {
        backgroundColor: '#ffffff',
        useCORS: true
      });
      
      const link = document.createElement('a');
      link.download = `DTPS-Receipt-${payment?._id?.slice(-8) || 'payment'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      toast.success('Receipt downloaded!');
    } catch (error) {
      console.error('Error downloading receipt:', error);
      toast.error('Failed to download receipt');
    } finally {
      setDownloading(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      'weight-loss': 'Weight Loss',
      'weight-gain': 'Weight Gain',
      'muscle-gain': 'Muscle Gain',
      'diabetes': 'Diabetes Management',
      'pcos': 'PCOS',
      'thyroid': 'Thyroid',
      'general-wellness': 'General Wellness',
      'detox': 'Detox',
      'sports-nutrition': 'Sports Nutrition',
      'custom': 'Custom Plan'
    };
    return labels[category] || category;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-950 flex items-center justify-center z-100">
        <div className="text-center">
          <SpoonGifLoader size="lg" />
          <p className="text-gray-600 mt-4">Loading payment details...</p>
        </div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="min-h-screen bg-linear-to-br from-green-50 to-teal-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Payment details not found</p>
          <button
            onClick={() => router.push('/user')}
            className="px-6 py-3 bg-[#E06A26] text-white rounded-xl font-medium"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-green-50 to-teal-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Success Animation */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-green-100 mb-4 animate-bounce">
            <CheckCircle className="h-12 w-12 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
          <p className="text-gray-600">Your subscription is now active</p>
        </div>

        {/* Receipt Card */}
        <div ref={receiptRef} className="bg-white rounded-3xl shadow-xl overflow-hidden mb-6">
          {/* Header */}
          <div className="bg-linear-to-r from-[#E06A26] to-[#DB9C6E] p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <Image
                    src="/images/dtps-logo.png"
                    alt="DTPS"
                    width={40}
                    height={40}
                    className="object-contain"
                  />
                </div>
                <div>
                  <h2 className="text-xl font-bold">DTPS</h2>
                  <p className="text-white/80 text-sm">Payment Receipt</p>
                </div>
              </div>
              <Receipt className="h-8 w-8 text-white/80" />
            </div>
          </div>

          {/* Receipt Details */}
          <div className="p-6 space-y-4">
            {/* Transaction Info */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-500 text-sm">Transaction ID</span>
              <span className="font-mono text-sm text-gray-900">
                {payment.razorpayPaymentId || payment.transactionId || payment._id.slice(-12).toUpperCase()}
              </span>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-500 text-sm">Date & Time</span>
              <span className="text-sm text-gray-900">{formatDate(payment.paidAt || payment.createdAt)}</span>
            </div>

            {/* Plan Details */}
            <div className="bg-[#3AB1A0]/5 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#3AB1A0]/20 flex items-center justify-center">
                  <Package className="h-5 w-5 text-[#3AB1A0]" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{payment.planName}</p>
                  <p className="text-xs text-gray-500">{getCategoryLabel(payment.planCategory)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Duration
                </span>
                <span className="font-medium text-gray-900">{payment.durationLabel}</span>
              </div>

              {payment.dietitian && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Dietitian
                  </span>
                  <span className="font-medium text-gray-900">
                    Dt. {payment.dietitian.firstName} {payment.dietitian.lastName}
                  </span>
                </div>
              )}
            </div>

            {/* Payment Summary */}
            <div className="bg-gray-50 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Amount Paid</span>
                <span className="text-2xl font-bold text-[#E06A26]">
                  ₹{payment.amount.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2 text-sm">
                <span className="text-gray-500 flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Payment Method
                </span>
                <span className="text-gray-700">Razorpay</span>
              </div>
            </div>

            {/* Status Badge */}
            <div className="flex items-center justify-center">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                <CheckCircle className="h-4 w-4" />
                Payment Verified
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 text-center text-xs text-gray-500">
            <p>Thank you for choosing DTPS!</p>
            <p className="mt-1">For support, contact support@dtps.in</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={downloadReceipt}
            disabled={downloading}
            className="w-full py-4 rounded-2xl bg-white border-2 border-[#3AB1A0] text-[#3AB1A0] font-semibold flex items-center justify-center gap-2 hover:bg-[#3AB1A0]/5 transition-colors disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Download className="h-5 w-5" />
            )}
            Download Receipt
          </button>

          <button
            onClick={() => sendEmailReceipt(payment._id)}
            disabled={sendingEmail || emailSent}
            className="w-full py-4 rounded-2xl bg-white border-2 border-[#E06A26] text-[#E06A26] font-semibold flex items-center justify-center gap-2 hover:bg-[#E06A26]/5 transition-colors disabled:opacity-50"
          >
            {sendingEmail ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : emailSent ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <Mail className="h-5 w-5" />
            )}
            {emailSent ? 'Email Sent!' : 'Send to Email'}
          </button>

          <button
            onClick={() => router.push('/user/subscriptions')}
            className="w-full py-4 rounded-2xl bg-linear-to-r from-[#E06A26] to-[#DB9C6E] text-white font-semibold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all"
          >
            View My Subscriptions
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>

        {/* Auto Redirect Notice */}
        <div className="mt-6 text-center text-sm text-gray-500">
          Redirecting to dashboard in {countdown} seconds...
        </div>
      </div>
    </div>
  );
}
