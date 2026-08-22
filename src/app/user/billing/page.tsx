'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  CreditCard,
  Download,
  CheckCircle,
  Clock,
  AlertCircle,
  IndianRupee,
  FileText,
  ChevronRight,
  Calendar,
  ArrowLeft,
  Package,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { ClientPageSkeleton } from '@/components/ui/skeleton';
import { useRealtime } from '@/hooks/useRealtime';

interface Invoice {
  id: string;
  paymentId: string;
  planName: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
  date: Date;
  dueDate?: Date;
  invoiceUrl?: string;
  downloadUrl?: string;
}

interface Subscription {
  id: string;
  planName: string;
  price: number;
  billingCycle: 'monthly' | 'quarterly' | 'yearly';
  status: 'active' | 'cancelled' | 'expired';
  startDate: Date;
  nextBillingDate: Date;
  features: string[];
}

export default function UserBillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Real-time SSE: auto-refresh billing data when payment status changes
  useRealtime({
    onMessage: (event) => {
      if (event.type === 'payment_updated' || event.type === 'payment_link_updated') {
        fetchBillingData();
      }
    },
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchBillingData();
    }
  }, [session]);

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await fetch('/api/client/billing', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        setSubscription(data.subscription);
        setInvoices(data.invoices || []);
        setHasData(!!(data.subscription || (data.invoices && data.invoices.length > 0)));
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch billing data' }));
        const errorMsg = errorData.message || 'Failed to fetch billing data';
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
      }
    } catch (error) {
      const errorMsg = 'Unable to load billing data. Please check your connection and try again.';
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
      console.error('Error fetching billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
      case 'active':
        return (
          <Badge
            className={
              isDarkMode
                ? 'text-green-200 bg-green-900/40 border border-green-800'
                : 'text-green-700 bg-green-100'
            }
          >
            <CheckCircle className="w-3 h-3 mr-1" />
            {status === 'paid' ? 'Paid' : 'Active'}
          </Badge>
        );
      case 'pending':
        return (
          <Badge
            className={
              isDarkMode
                ? 'text-yellow-200 bg-yellow-900/40 border border-yellow-800'
                : 'text-yellow-700 bg-yellow-100'
            }
          >
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case 'failed':
      case 'expired':
        return (
          <Badge
            className={
              isDarkMode
                ? 'text-red-200 bg-red-900/40 border border-red-800'
                : 'text-red-700 bg-red-100'
            }
          >
            <AlertCircle className="w-3 h-3 mr-1" />
            {status === 'failed' ? 'Failed' : 'Expired'}
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge
            className={
              isDarkMode
                ? 'text-gray-200 bg-gray-800 border border-gray-700'
                : 'text-gray-700 bg-gray-100'
            }
          >
            Cancelled
          </Badge>
        );
      default:
        return null;
    }
  };

  if (status === 'loading' || loading) {
    return <ClientPageSkeleton variant="list" showHeader={false} />;
  }

  // Show error state if there's an error
  if (errorMessage && !loading) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
        {/* Header */}
        <div className={`sticky top-0 z-40 transition-colors duration-300 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border-b`}>
          <div className="relative flex items-center justify-center px-4 py-4">
            <Link href="/user" className="absolute left-4 flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#ff9500]/10 transition-colors">
              <ArrowLeft className={`w-5 h-5 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`} />
            </Link>
            <h1 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-black'}`}>Billing</h1>
            <button
              onClick={fetchBillingData}
              className="absolute right-4 flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#ff9500]/10 transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`} />
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center px-4 py-16">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${isDarkMode ? 'bg-red-900/20' : 'bg-red-100'}`}>
            <AlertCircle className={`w-10 h-10 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} />
          </div>
          <h2 className={`text-xl font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Unable to Load Billing Data</h2>
          <p className={`text-center mb-6 max-w-md ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {errorMessage}
          </p>
          <Button
            onClick={fetchBillingData}
            className="bg-[#3AB1A0] hover:bg-[#3AB1A0]/90 text-white"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // No purchases yet - show empty state
  if (!hasData) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
        {/* Header */}
        <div className={`sticky top-0 z-40 transition-colors duration-300 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border-b`}>
          <div className="relative flex items-center justify-center px-4 py-4">
            <Link href="/user" className="absolute left-4 flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#ff9500]/10 transition-colors">
              <ArrowLeft className={`w-5 h-5 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`} />
            </Link>
            <h1 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-black'}`}>Billing</h1>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center px-4 py-16">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <Package className={`w-10 h-10 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
          </div>
          <h2 className={`text-xl font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>No Purchases Yet</h2>
          <p className={`text-center mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            You haven't made any purchases yet. Browse our services to get started with your health journey.
          </p>
          <Link href="/user/services">
            <Button className="bg-[#3AB1A0] hover:bg-[#3AB1A0]/90 text-white">
              Browse Services
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`sticky top-0 z-40 transition-colors duration-300 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border-b`}>
        <div className="relative flex items-center justify-center px-4 py-4">
          <Link href="/user" className="absolute left-4 flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#ff9500]/10 transition-colors">
            <ArrowLeft className={`w-5 h-5 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`} />
          </Link>
          <h1 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-black'}`}>Billing</h1>
          <button
            onClick={fetchBillingData}
            className="absolute right-4 flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#ff9500]/10 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`} />
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Active Subscription Card */}
        {subscription && (
          <Card
            className={`border-0 shadow-sm bg-linear-to-br ${isDarkMode ? 'from-[#3AB1A0]/20 to-gray-900' : 'from-[#3AB1A0]/10 to-emerald-50'
              }`}
          >
            <CardContent className="p-4 md:p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>Current Plan</p>
                  <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{subscription.planName}</h2>
                </div>
                {getStatusBadge(subscription.status)}
              </div>

              <div className="flex items-baseline gap-1 mb-4">
                <span className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {formatCurrency(subscription.price)}
                </span>
                <span className={`${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>/{subscription.billingCycle}</span>
              </div>

              <div className={`flex items-center gap-4 mb-4 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Valid until: {format(new Date(subscription.nextBillingDate), 'MMM d, yyyy')}</span>
                </div>
              </div>

              {subscription.features && subscription.features.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[#3AB1A0]/20">
                  <p className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Plan Features:</p>
                  <ul className="space-y-1">
                    {subscription.features.slice(0, 4).map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-3 w-3 text-[#3AB1A0] shrink-0" />
                        <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Billing History */}
        {invoices.length > 0 && (
          <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Payment History ({invoices.length})
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="space-y-3">
                {invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className={`flex items-center justify-between py-3 border-b last:border-0 ${isDarkMode ? 'border-gray-800' : 'border-gray-100'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                        <FileText className={`w-5 h-5 ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`} />
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{invoice.planName}</p>
                        <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                          {format(new Date(invoice.date), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatCurrency(invoice.amount)}</p>
                        {getStatusBadge(invoice.status)}
                      </div>
                      {invoice.status === 'paid' && (
                        <button
                          onClick={() => window.open(invoice.invoiceUrl || `/api/invoices/${invoice.paymentId}`, '_blank')}
                          className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-500'}`}
                          title="View Invoice"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Help Section */}
        <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Need help with billing?</p>
                <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Contact our support team</p>
              </div>
              <Link href="/user/messages">
                <Button variant="outline">
                  Get Help
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Browse More Services */}
        <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-[#E06A26]/10' : 'bg-[#E06A26]/5'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Explore More Services</p>
                <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Upgrade or add new plans</p>
              </div>
              <Link href="/user/services">
                <Button className="bg-[#E06A26] hover:bg-[#E06A26]/90 text-white">
                  Browse
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
