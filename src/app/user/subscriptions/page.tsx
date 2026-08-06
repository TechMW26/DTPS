'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import PageTransition from '@/components/animations/PageTransition';
import { useTheme } from '@/contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  ShoppingBag,
  Calendar,
  Check,
  Crown,
  Clock,
  AlertCircle,
  ChevronRight,
  CreditCard,
  Star,
  Sparkles,
  X,
  Download,
  Receipt,
  Mail
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';
import { useBodyScrollLock } from '@/hooks';

interface ReceiptData {
  planName: string;
  amount: number;
  currency: string;
  paymentId: string;
  razorpayPaymentId?: string;
  paidAt: string;
  status: string;
  userName: string;
  userEmail: string;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface Subscription {
  _id: string;
  planName: string;
  planCategory: string;
  amount: number;
  currency: string;
  status: 'paid' | 'active' | 'pending' | 'expired' | 'cancelled';
  startDate?: string;
  endDate?: string;
  durationDays: number;
  durationLabel?: string;
  features: string[];
  paymentStatus: 'paid' | 'pending' | 'failed';
  razorpayPaymentLinkUrl?: string;
  razorpayPaymentLinkShortUrl?: string;
  razorpayPaymentId?: string;
  paidAt?: string;
}

interface AvailablePlan {
  _id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  duration: number;
  durationType: 'days' | 'weeks' | 'months';
  category: string;
  features: string[];
  consultationsIncluded: number;
  dietPlanIncluded: boolean;
  followUpsIncluded: number;
  chatSupport: boolean;
  videoCallsIncluded: number;
  isActive: boolean;
}

export default function UserSubscriptionsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [availablePlans, setAvailablePlans] = useState<AvailablePlan[]>([]);
  const [activeTab, setActiveTab] = useState('my-plans');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);

  // Prevent body scroll when modal is open
  useBodyScrollLock(showReceiptModal);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchSubscriptions();
      fetchAvailablePlans();
    }
  }, [session]);

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const fetchSubscriptions = async () => {
    try {
      setSubscriptionError(null);
      const response = await fetch('/api/client/subscriptions', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        setSubscriptions(data.subscriptions || []);
      } else {
        const errorMsg = 'Failed to load your subscriptions';
        setSubscriptionError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (error) {
      const errorMsg = 'Unable to load subscriptions. Please check your connection and try again.';
      setSubscriptionError(errorMsg);
      toast.error(errorMsg);
      console.error('Error fetching subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailablePlans = async () => {
    try {
      setPlansError(null);
      const response = await fetch('/api/subscription-plans?isActive=true', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        setAvailablePlans(data.plans || []);
      } else {
        const errorMsg = 'Failed to load available plans';
        setPlansError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (error) {
      const errorMsg = 'Unable to load plans. Please check your connection and try again.';
      setPlansError(errorMsg);
      toast.error(errorMsg);
      console.error('Error fetching plans:', error);
    }
  };

  const handlePurchase = async (plan: AvailablePlan) => {
    setPurchasing(plan._id);
    try {
      // Create order/payment link
      const response = await fetch('/api/client/subscriptions/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan._id,
          amount: plan.price,
          currency: plan.currency || 'INR'
        })
      });

      if (response.ok) {
        const data = await response.json();

        if (data.paymentLink) {
          // Redirect to Razorpay payment link
          window.location.href = data.paymentLink;
        } else if (data.orderId && window.Razorpay) {
          // Use Razorpay checkout
          const options = {
            key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
            amount: plan.price * 100,
            currency: plan.currency || 'INR',
            name: 'DTPS',
            description: plan.name,
            order_id: data.orderId,
            handler: async function (response: any) {
              // Verify payment
              const verifyResponse = await fetch('/api/client/subscriptions/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  planId: plan._id
                })
              });

              if (verifyResponse.ok) {
                toast.success('Payment successful! Your subscription is now active.');
                fetchSubscriptions();
              } else {
                toast.error('Payment verification failed');
              }
            },
            prefill: {
              name: `${session?.user?.firstName || ''} ${session?.user?.lastName || ''}`.trim(),
              email: session?.user?.email || ''
            },
            theme: {
              color: '#E06A26'
            }
          };

          const razorpay = new window.Razorpay(options);
          razorpay.open();
        } else {
          toast.success('Order created! You will be contacted for payment.');
          fetchSubscriptions();
        }
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to initiate purchase');
      }
    } catch (error) {
      console.error('Error purchasing plan:', error);
      toast.error('Failed to process purchase');
    } finally {
      setPurchasing(null);
    }
  };

  const getStatusBadge = (status: string, paymentStatus?: string) => {
    if (paymentStatus === 'paid' || status === 'paid' || status === 'completed') {
      return (
        <Badge
          className={
            isDarkMode
              ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
              : 'bg-green-100 text-green-700'
          }
        >
          Paid
        </Badge>
      );
    }

    if (paymentStatus === 'pending') {
      return (
        <Badge
          className={
            isDarkMode
              ? 'bg-yellow-500/15 text-yellow-200 border border-yellow-500/30'
              : 'bg-yellow-100 text-yellow-700'
          }
        >
          Payment Pending
        </Badge>
      );
    }
    switch (status) {
      case 'active':
        return (
          <Badge
            className={
              isDarkMode
                ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
                : 'bg-green-100 text-green-700'
            }
          >
            Active
          </Badge>
        );
      case 'expired':
        return (
          <Badge
            className={
              isDarkMode
                ? 'bg-red-500/15 text-red-200 border border-red-500/30'
                : 'bg-red-100 text-red-700'
            }
          >
            Expired
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge
            className={
              isDarkMode
                ? 'bg-gray-800 text-gray-300 border border-gray-700'
                : 'bg-gray-100 text-gray-600'
            }
          >
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge
            className={
              isDarkMode
                ? 'bg-yellow-500/15 text-yellow-200 border border-yellow-500/30'
                : 'bg-yellow-100 text-yellow-700'
            }
          >
            Pending
          </Badge>
        );
    }
  };

  const formatCurrency = (amount: number, currency: string = 'INR') => {
    if (currency === 'INR') {
      return `₹${amount.toLocaleString('en-IN')}`;
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  };

  const getDurationLabel = (duration: number, type: string) => {
    const unit = type === 'days' ? (duration === 1 ? 'day' : 'days') :
      type === 'weeks' ? (duration === 1 ? 'week' : 'weeks') :
        (duration === 1 ? 'month' : 'months');
    return `${duration} ${unit}`;
  };

  const handleCardClick = async (subscription: Subscription) => {
    setSelectedSubscription(subscription);
    setShowReceiptModal(true);

    if (subscription.paymentStatus === 'paid' && subscription._id) {
      setLoadingReceipt(true);
      try {
        const response = await fetch(`/api/client/payment-receipt?paymentId=${subscription._id}`);
        if (response.ok) {
          const data = await response.json();
          setReceiptData(data.receipt);
        }
      } catch (error) {
        console.error('Error fetching receipt:', error);
      } finally {
        setLoadingReceipt(false);
      }
    }
  };

  const closeModal = () => {
    setShowReceiptModal(false);
    setSelectedSubscription(null);
    setReceiptData(null);
  };

  const handleDownloadReceipt = async () => {
    if (!receiptData) return;

    try {
      const html2canvas = (await import('html2canvas')).default as any;
      const receiptElement = document.getElementById('receipt-content');
      if (receiptElement) {
        const canvas = await html2canvas(receiptElement, {
          backgroundColor: '#ffffff',
          scale: 2
        });
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((value: Blob | null) => value ? resolve(value) : reject(new Error('Receipt rendering failed')), 'image/png')
        );
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `DTPS-Receipt-${receiptData.paymentId}.png`;
        link.href = objectUrl;
        link.click();
        URL.revokeObjectURL(objectUrl);
        toast.success('Receipt downloaded!');
      }
    } catch (error) {
      toast.error('Failed to download receipt');
    }
  };

  const handleEmailReceipt = async () => {
    if (!receiptData) return;

    try {
      const response = await fetch('/api/client/send-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: receiptData.paymentId })
      });

      if (response.ok) {
        toast.success('Receipt sent to your email!');
      } else {
        toast.error('Failed to send receipt');
      }
    } catch (error) {
      toast.error('Failed to send receipt');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div
        className={`fixed inset-0 flex items-center justify-center z-100 ${isDarkMode ? 'bg-gray-950' : 'bg-white'
          }`}
      >
        <SpoonGifLoader size="lg" />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className={`min-h-screen pb-24 ${isDarkMode ? 'bg-black' : 'bg-gray-50'}`}>
        {/* Header */}
        <div className={`border-b ${isDarkMode ? 'bg-gray-950 border-gray-800' : 'bg-white border-gray-100'}`}>
          <div className="flex items-center gap-3 px-4 py-3">
            <Link
              href="/user"
              className={`p-2 -ml-2 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                }`}
            >
              <ArrowLeft className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`} />
            </Link>
            <div>
              <h1 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>My Subscriptions</h1>
              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Manage your plans & services</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList
              className={`w-full grid grid-cols-2 p-1 rounded-xl ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'
                }`}
            >
              <TabsTrigger
                value="my-plans"
                className={`rounded-lg ${isDarkMode
                  ? 'data-[state=active]:bg-black data-[state=active]:text-white data-[state=inactive]:text-gray-300'
                  : 'data-[state=active]:bg-white'
                  }`}
              >
                My Plans
              </TabsTrigger>
              <TabsTrigger
                value="browse"
                className={`rounded-lg ${isDarkMode
                  ? 'data-[state=active]:bg-black data-[state=active]:text-white data-[state=inactive]:text-gray-300'
                  : 'data-[state=active]:bg-white'
                  }`}
              >
                Browse Plans
              </TabsTrigger>
            </TabsList>

            {/* My Plans Tab */}
            <TabsContent value="my-plans" className="mt-4 space-y-4">
              {subscriptions.length > 0 ? (
                subscriptions.map((sub) => (
                  <Card
                    key={sub._id}
                    className={`border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${isDarkMode ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white'
                      }`}
                    onClick={() => handleCardClick(sub)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-xl bg-linear-to-br from-[#E06A26]/20 to-[#E06A26]/10 flex items-center justify-center overflow-hidden">
                            <Image
                              src="/images/dtps-logo.png"
                              alt="DTPS"
                              width={36}
                              height={36}
                              className="object-contain"
                            />
                          </div>
                          <div>
                            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{sub.planName}</h3>
                            <p className={`text-sm capitalize ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{sub.planCategory?.replace('-', ' ')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(sub.status, sub.paymentStatus)}
                          <ChevronRight className={`h-4 w-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        </div>
                      </div>

                      <div
                        className={`flex items-center gap-4 p-3 rounded-xl mb-3 ${isDarkMode ? 'bg-black/40' : 'bg-gray-50'
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <CreditCard className={`h-4 w-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                          <span className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>
                            {formatCurrency(sub.amount, sub.currency)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className={`h-4 w-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                          <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                            {sub.durationLabel || `${sub.durationDays} days`}
                          </span>
                        </div>
                      </div>

                      {sub.features && sub.features.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {sub.features.slice(0, 3).map((feature, i) => (
                            <div key={i} className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                              <Check className="h-4 w-4 text-[#3AB1A0]" />
                              <span>{feature}</span>
                            </div>
                          ))}
                          {sub.features.length > 3 && (
                            <p className="text-xs text-[#E06A26]">+{sub.features.length - 3} more features</p>
                          )}
                        </div>
                      )}

                      {sub.paymentStatus === 'pending' && sub.razorpayPaymentLinkShortUrl && (
                        <Button
                          className="w-full bg-[#E06A26] hover:bg-[#d15a1a]"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(sub.razorpayPaymentLinkShortUrl, '_blank');
                          }}
                        >
                          Complete Payment
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-12">
                  <ShoppingBag className={`h-12 w-12 mx-auto mb-3 ${isDarkMode ? 'text-gray-700' : 'text-gray-300'}`} />
                  <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>No Active Plans</h3>
                  <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Browse our plans to get started with your health journey</p>
                  <Button
                    className="bg-[#E06A26] hover:bg-[#d15a1a]"
                    onClick={() => setActiveTab('browse')}
                  >
                    Browse Plans
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Browse Plans Tab */}
            <TabsContent value="browse" className="mt-4 space-y-4">
              {availablePlans.length > 0 ? (
                availablePlans.map((plan) => {
                  const alreadyPurchased = subscriptions.some(
                    s => s.planName === plan.name && (s.paymentStatus === 'paid' || s.status === 'paid' || s.status === 'active' || s.paymentStatus === 'pending')
                  );

                  return (
                    <Card
                      key={plan._id}
                      className={`border-0 shadow-sm overflow-hidden ${isDarkMode ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white'}`}
                    >
                      <div className="bg-linear-to-r from-[#3AB1A0]/10 to-[#E06A26]/10 p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Sparkles className="h-5 w-5 text-[#E06A26]" />
                              <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
                            </div>
                            <p className={`text-sm capitalize ${isDarkMode ? 'text-gray-200' : 'text-gray-500'}`}>{plan.category?.replace('-', ' ')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-[#E06A26]">
                              {formatCurrency(plan.price, plan.currency)}
                            </p>
                            <p className={`text-xs ${isDarkMode ? 'text-gray-200' : 'text-gray-500'}`}>
                              {getDurationLabel(plan.duration, plan.durationType)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <CardContent className="p-4">
                        {plan.description && (
                          <p className={`text-sm mb-3 ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>{plan.description}</p>
                        )}

                        <div className="space-y-2 mb-4">
                          {plan.dietPlanIncluded && (
                            <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                              <Check className="h-4 w-4 text-[#3AB1A0]" />
                              <span>Personalized Diet Plan</span>
                            </div>
                          )}
                          {plan.consultationsIncluded > 0 && (
                            <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                              <Check className="h-4 w-4 text-[#3AB1A0]" />
                              <span>{plan.consultationsIncluded} Consultations</span>
                            </div>
                          )}
                          {plan.videoCallsIncluded > 0 && (
                            <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                              <Check className="h-4 w-4 text-[#3AB1A0]" />
                              <span>{plan.videoCallsIncluded} Video Calls</span>
                            </div>
                          )}
                          {plan.followUpsIncluded > 0 && (
                            <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                              <Check className="h-4 w-4 text-[#3AB1A0]" />
                              <span>{plan.followUpsIncluded} Follow-ups</span>
                            </div>
                          )}
                          {plan.chatSupport && (
                            <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                              <Check className="h-4 w-4 text-[#3AB1A0]" />
                              <span>Chat Support</span>
                            </div>
                          )}
                          {plan.features && plan.features.map((feature, i) => (
                            <div key={i} className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                              <Check className="h-4 w-4 text-[#3AB1A0]" />
                              <span>{feature}</span>
                            </div>
                          ))}
                        </div>

                        <Button
                          className={`w-full ${alreadyPurchased
                            ? isDarkMode
                              ? 'bg-gray-800 text-gray-400'
                              : 'bg-gray-200 text-gray-500'
                            : 'bg-[#E06A26] hover:bg-[#d15a1a]'
                            }`}
                          disabled={alreadyPurchased || purchasing === plan._id}
                          onClick={() => handlePurchase(plan)}
                        >
                          {purchasing === plan._id ? (
                            'Processing...'
                          ) : alreadyPurchased ? (
                            'Already Purchased'
                          ) : (
                            <>
                              <CreditCard className="h-4 w-4 mr-2" />
                              Purchase Now
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <div className="text-center py-12">
                  <AlertCircle className={`h-12 w-12 mx-auto mb-3 ${isDarkMode ? 'text-gray-700' : 'text-gray-300'}`} />
                  <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>No Plans Available</h3>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Plans will be available soon</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Receipt/Details Modal */}
        {showReceiptModal && selectedSubscription && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div
              className={`rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto ${isDarkMode ? 'bg-gray-900 text-white border border-gray-800' : 'bg-white'
                }`}
            >
              {/* Modal Header */}
              <div
                className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-100'
                  }`}
              >
                <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {selectedSubscription.paymentStatus === 'paid' ? 'Payment Receipt' : 'Subscription Details'}
                </h2>
                <button
                  onClick={closeModal}
                  className={`p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                    }`}
                >
                  <X className={`h-5 w-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-4">
                {loadingReceipt ? (
                  <div className="flex items-center justify-center min-h-[40vh]">
                    <SpoonGifLoader size="md" />
                  </div>
                ) : selectedSubscription.paymentStatus === 'paid' && receiptData ? (
                  <div id="receipt-content" className="bg-white p-6 rounded-xl">
                    {/* Receipt Header */}
                    <div className="text-center mb-6">
                      <div className="h-16 w-16 mx-auto mb-3 rounded-full bg-linear-to-br from-[#E06A26] to-[#3AB1A0] flex items-center justify-center p-1">
                        <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                          <Image
                            src="/images/dtps-logo.png"
                            alt="DTPS"
                            width={40}
                            height={40}
                            className="object-contain"
                          />
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-[#E06A26]">DTPS</h3>
                      <p className="text-sm text-gray-500">Payment Receipt</p>
                    </div>

                    {/* Success Badge */}
                    <div className="flex items-center justify-center gap-2 bg-green-50 text-green-700 py-2 px-4 rounded-full mb-6">
                      <Check className="h-4 w-4" />
                      <span className="text-sm font-medium">Payment Successful</span>
                    </div>

                    {/* Receipt Details */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-gray-500 text-sm">Plan</span>
                        <span className="font-medium text-gray-900">{receiptData.planName}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-gray-500 text-sm">Amount</span>
                        <span className="font-bold text-[#E06A26] text-lg">
                          {receiptData.currency === 'INR' ? '₹' : '$'}{receiptData.amount.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-gray-500 text-sm">Payment ID</span>
                        <span className="font-mono text-xs text-gray-700">
                          {receiptData.razorpayPaymentId || receiptData.paymentId}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-gray-500 text-sm">Date</span>
                        <span className="text-gray-900">
                          {format(new Date(receiptData.paidAt), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-gray-500 text-sm">Status</span>
                        <Badge className="bg-green-100 text-green-700">Paid</Badge>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Subscription Info */}
                    <div className={`flex items-center gap-3 p-4 rounded-xl ${isDarkMode ? 'bg-black/40' : 'bg-gray-50'}`}>
                      <div className="h-14 w-14 rounded-xl bg-linear-to-br from-[#E06A26]/20 to-[#E06A26]/10 flex items-center justify-center overflow-hidden">
                        <Image
                          src="/images/dtps-logo.png"
                          alt="DTPS"
                          width={40}
                          height={40}
                          className="object-contain"
                        />
                      </div>
                      <div>
                        <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedSubscription.planName}</h3>
                        <p className={`text-sm capitalize ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{selectedSubscription.planCategory?.replace('-', ' ')}</p>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="space-y-3">
                      <div className={`flex justify-between items-center py-2 border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-100'}`}>
                        <span className="text-gray-500 text-sm">Amount</span>
                        <span className="font-bold text-[#E06A26]">
                          {selectedSubscription.currency === 'INR' ? '₹' : '$'}{selectedSubscription.amount.toLocaleString()}
                        </span>
                      </div>
                      <div className={`flex justify-between items-center py-2 border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-100'}`}>
                        <span className="text-gray-500 text-sm">Duration</span>
                        <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{selectedSubscription.durationLabel || `${selectedSubscription.durationDays} days`}</span>
                      </div>
                      <div className={`flex justify-between items-center py-2 border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-100'}`}>
                        <span className="text-gray-500 text-sm">Status</span>
                        {getStatusBadge(selectedSubscription.status, selectedSubscription.paymentStatus)}
                      </div>
                      {selectedSubscription.startDate && (
                        <div className={`flex justify-between items-center py-2 border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-100'}`}>
                          <span className="text-gray-500 text-sm">Start Date</span>
                          <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{format(new Date(selectedSubscription.startDate), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                      {selectedSubscription.endDate && (
                        <div className="flex justify-between items-center py-2">
                          <span className="text-gray-500 text-sm">End Date</span>
                          <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{format(new Date(selectedSubscription.endDate), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                    </div>

                    {/* Features */}
                    {selectedSubscription.features && selectedSubscription.features.length > 0 && (
                      <div className="mt-4">
                        <h4 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Features Included</h4>
                        <div className="space-y-2">
                          {selectedSubscription.features.map((feature, i) => (
                            <div key={i} className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                              <Check className="h-4 w-4 text-[#3AB1A0]" />
                              <span>{feature}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedSubscription.paymentStatus === 'pending' && selectedSubscription.razorpayPaymentLinkShortUrl && (
                      <Button
                        className="w-full bg-[#E06A26] hover:bg-[#d15a1a] mt-4"
                        onClick={() => window.open(selectedSubscription.razorpayPaymentLinkShortUrl, '_blank')}
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Complete Payment
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer for Paid Subscriptions */}
              {selectedSubscription.paymentStatus === 'paid' && receiptData && (
                <div className={`p-4 border-t flex gap-3 ${isDarkMode ? 'border-gray-800' : 'border-gray-100'}`}>
                  <Button
                    variant="outline"
                    className={`flex-1 ${isDarkMode ? 'border-gray-700 text-gray-200 hover:bg-white/10 hover:text-white' : ''
                      }`}
                    onClick={handleDownloadReceipt}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button
                    className="flex-1 bg-[#3AB1A0] hover:bg-[#2ea090]"
                    onClick={handleEmailReceipt}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Email Receipt
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
