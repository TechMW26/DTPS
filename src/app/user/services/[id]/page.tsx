'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Star, Check, X, Loader2, ShoppingCart } from 'lucide-react';
import { ClientPageSkeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import Script from 'next/script';
import { useTheme } from '@/contexts/ThemeContext';

declare global {
  interface Window {
    Razorpay: any;
  }
}

// Helper function to strip HTML tags from text
const stripHtmlTags = (html: string): string => {
  if (!html) return '';
  // Replace common HTML entities
  let text = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<\/div>/gi, ' ')
    .replace(/<\/li>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');
  // Clean up extra whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
};

interface ServicePlan {
  _id: string;
  name: string;
  category: string;
  description?: string;
  pricingTiers?: Array<{
    durationDays: number;
    durationLabel: string;
    amount: number;
  }>;
  features?: string[];
  maxDiscountPercent?: number;
  benefits?: string[];
}

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const [service, setService] = useState<ServicePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  useEffect(() => {
    fetchServiceDetail();
  }, [params.id]);

  const fetchServiceDetail = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/service-plans/${params.id}`);
      if (response.ok) {
        const data = await response.json();
        setService(data.plan);
        if (data.plan?.pricingTiers?.length > 0) {
          setSelectedTier(0);
        }
      }
    } catch (error) {
      console.error('Error fetching service detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!service || selectedTier === null || !service.pricingTiers) {
      toast.error('Please select a plan');
      return;
    }

    const tier = service.pricingTiers[selectedTier];

    setIsPurchasing(true);

    try {
      // Create order via API
      const response = await fetch('/api/client/service-plans/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: service._id,
          tierId: selectedTier,
          amount: tier.amount,
          durationDays: tier.durationDays,
          durationLabel: tier.durationLabel,
          planName: service.name,
          planCategory: service.category
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create order');
      }

      // If we get a payment link, redirect to it
      if (data.paymentLink) {
        window.location.href = data.paymentLink;
        return;
      }

      // If we get an order ID, open Razorpay checkout
      if (data.orderId && razorpayLoaded && window.Razorpay) {
        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_live_5iryw2HyZ6RWRW',
          amount: tier.amount * 100,
          currency: 'INR',
          name: 'DTPS',
          description: `${service.name} - ${tier.durationLabel}`,
          order_id: data.orderId,
          handler: async function (response: any) {
            try {
              // Verify payment
              const verifyRes = await fetch('/api/client/service-plans/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  paymentId: data.paymentId
                })
              });

              const verifyData = await verifyRes.json();

              if (verifyRes.ok && verifyData.success) {
                toast.success('Payment successful! Plan activated.');
                router.push('/user?payment_success=true');
              } else {
                toast.error(verifyData.error || 'Payment verification failed');
              }
            } catch (err) {
              console.error('Verification error:', err);
              toast.error('Payment verification failed. Please contact support.');
            }
          },
          prefill: {
            name: '',
            email: '',
            contact: ''
          },
          theme: {
            color: '#3AB1A0'
          },
          modal: {
            ondismiss: function () {
              setIsPurchasing(false);
              toast.info('Payment cancelled');
            }
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
        return;
      }

      // Fallback - show success message
      toast.success(data.message || 'Order created successfully!');
      router.push('/user');

    } catch (error: any) {
      console.error('Purchase error:', error);
      toast.error(error.message || 'Failed to process payment');
    } finally {
      setIsPurchasing(false);
    }
  };

  if (loading) {
    return <ClientPageSkeleton variant="grid" showHeader={false} />;
  }

  if (!service) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
        <div className="text-center">
          <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-500'} mb-4`}>Service not found</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-[#3AB1A0] text-white rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-32 ${isDarkMode ? 'bg-gray-900' : 'bg-linear-to-b from-white to-gray-50'}`}>
      {/* Razorpay Script */}
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setRazorpayLoaded(true)}
      />

      {/* Header */}
      <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${isDarkMode ? 'bg-gray-900/80 border-gray-800' : 'bg-white/95 border-gray-100'}`}>
        <div className="flex items-center gap-3 px-4 py-4 max-w-5xl mx-auto w-full">
          <button
            onClick={() => router.back()}
            className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-[#3AB1A0]/10'}`}
          >
            <ArrowLeft className="w-5 h-5 text-[#3AB1A0]" />
          </button>
          <h1 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Service Details</h1>
        </div>
      </div>

      <div className="px-4 py-6 max-w-5xl mx-auto">
        {/* Service Hero Section */}
        <div className="bg-linear-to-br from-[#3AB1A0] to-[#2A9A8B] rounded-3xl shadow-lg p-8 mb-8 text-white">
          <div className="mb-4">
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold bg-white/20 text-white">
              {service.category}
            </span>
          </div>
          <h2 className="text-4xl font-bold mb-3">{service.name}</h2>
          <div className="text-lg text-white/90 mb-6 max-w-3xl leading-relaxed">
            {service.description ? (
              <div
                className="prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{
                  __html: service.description
                    .replace(/<strong>/g, `<strong class=\"${isDarkMode ? 'text-white' : 'text-black'} font-bold\">`)
                    .replace(/<b>/g, `<b class=\"${isDarkMode ? 'text-white' : 'text-black'} font-bold\">`)
                }}
              />
            ) : (
              <p>No description available</p>
            )}
          </div>
        </div>

        {/* Pricing Section - Vertical Display */}
        {service.pricingTiers && service.pricingTiers.length > 0 && (
          <div className="mb-8">
            <h3 className={`text-2xl font-bold mb-5 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Choose Your Plan</h3>
            <div className="flex flex-col gap-4">
              {service.pricingTiers.map((tier, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedTier(index)}
                  className={`w-full p-6 rounded-2xl border-2 transition-all ${selectedTier === index
                    ? 'border-[#3AB1A0] bg-linear-to-br from-[#3AB1A0]/10 to-[#3AB1A0]/5 shadow-md'
                    : isDarkMode
                      ? 'border-gray-700 hover:border-[#3AB1A0] bg-gray-800'
                      : 'border-gray-200 hover:border-[#3AB1A0] bg-white'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <p className={`text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{tier.durationLabel}</p>
                      <p className="text-3xl font-bold text-[#E06A26]">₹{tier.amount}</p>
                    </div>
                    <div className={`px-5 py-2.5 rounded-xl font-bold transition-all text-sm ${selectedTier === index
                      ? 'bg-[#3AB1A0] text-white'
                      : isDarkMode
                        ? 'bg-gray-700 text-gray-100'
                        : 'bg-gray-100 text-gray-700'
                      }`}>
                      {selectedTier === index ? (
                        <span className="inline-flex items-center gap-1.5"><Check aria-hidden="true" className="h-4 w-4" /> Selected</span>
                      ) : 'Select'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Features */}
        {service.features && service.features.length > 0 && (
          <div className={`rounded-2xl shadow-sm p-8 mb-8 border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
            <h3 className={`text-2xl font-bold mb-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>What's Included</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {service.features.map((feature, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 p-4 rounded-lg hover:shadow-sm transition-all ${isDarkMode ? 'bg-gray-900 border border-gray-700' : 'bg-linear-to-br from-green-50 to-emerald-50'}`}
                >
                  <Check className="w-6 h-6 text-[#3AB1A0] mt-0.5 shrink-0 font-bold" />
                  <div className="prose prose-sm max-w-none">
                    <span
                      className={`${isDarkMode ? 'text-white' : 'text-gray-700'} font-medium leading-relaxed`}
                      dangerouslySetInnerHTML={{
                        __html: feature
                          .replace(/<strong>/g, `<strong class=\"${isDarkMode ? 'text-white' : 'text-black'} font-bold\">`)
                          .replace(/<b>/g, `<b class=\"${isDarkMode ? 'text-white' : 'text-black'} font-bold\">`)
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Benefits */}
        {service.benefits && service.benefits.length > 0 && (
          <div className="mb-8">
            <h3 className={`text-2xl font-bold mb-5 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Key Benefits</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {service.benefits.map((benefit, index) => (
                <div
                  key={index}
                  className={`rounded-2xl p-6 border shadow-sm hover:shadow-md transition-all ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100 bg-linear-to-br from-white to-blue-50/50'}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-12 h-12 rounded-xl bg-[#3AB1A0]/10 flex items-center justify-center">
                      <Star className="w-6 h-6 text-[#3AB1A0]" />
                    </div>
                    <div className="flex-1">
                      <div
                        className={`${isDarkMode ? 'text-white prose-invert' : 'text-gray-700'} font-medium leading-relaxed prose prose-sm max-w-none`}
                        dangerouslySetInnerHTML={{
                          __html: benefit
                            .replace(/<strong>/g, `<strong class=\"${isDarkMode ? 'text-white' : 'text-black'} font-bold\">`)
                            .replace(/<b>/g, `<b class=\"${isDarkMode ? 'text-white' : 'text-black'} font-bold\">`)
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}



        {/* Nutritional Disclaimer & Citations */}
        <div className={`p-4 rounded-2xl ${isDarkMode ? 'bg-gray-800/50 ring-1 ring-white/5' : 'bg-gray-50'}`}>
          <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <span className="font-semibold">Disclaimer:</span> All diet plans and nutritional recommendations are prepared
            by certified dietitians at DTPS using evidence-based guidelines from{' '}
            <a href="https://www.ifct2017.com/" target="_blank" rel="noopener noreferrer" className="text-[#3AB1A0] underline">
              Indian Food Composition Tables (IFCT 2017, NIN)
            </a>,{' '}
            <a href="https://fdc.nal.usda.gov/" target="_blank" rel="noopener noreferrer" className="text-[#3AB1A0] underline">
              USDA FoodData Central
            </a>, and{' '}
            <a href="https://www.who.int/publications/i/item/9241546123" target="_blank" rel="noopener noreferrer" className="text-[#3AB1A0] underline">
              WHO/FAO dietary guidelines
            </a>.
            Plans are personalized and do not replace professional medical advice. Consult your healthcare
            provider before making significant dietary changes.
          </p>
        </div>

        {/* Nutritional Disclaimer & Citations */}
        <div className={`p-4 rounded-2xl ${isDarkMode ? 'bg-gray-800/50 ring-1 ring-white/5' : 'bg-gray-50'}`}>
          <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <span className="font-semibold">Disclaimer:</span> All diet plans and nutritional recommendations are prepared
            by certified dietitians at DTPS using evidence-based guidelines from{' '}
            <a href="https://www.ifct2017.com/" target="_blank" rel="noopener noreferrer" className="text-[#3AB1A0] underline">
              Indian Food Composition Tables (IFCT 2017, NIN)
            </a>,{' '}
            <a href="https://fdc.nal.usda.gov/" target="_blank" rel="noopener noreferrer" className="text-[#3AB1A0] underline">
              USDA FoodData Central
            </a>, and{' '}
            <a href="https://www.who.int/publications/i/item/9241546123" target="_blank" rel="noopener noreferrer" className="text-[#3AB1A0] underline">
              WHO/FAO dietary guidelines
            </a>.
            Plans are personalized and do not replace professional medical advice. Consult your healthcare
            provider before making significant dietary changes.
          </p>
        </div>

        {/* Purchase Button */}
        <div className={`sticky bottom-8 left-0 right-0 pt-4 pb-6 -mx-4 px-4 ${isDarkMode ? 'bg-linear-to-t from-gray-900 via-gray-900 to-transparent' : 'bg-linear-to-t from-white via-white to-transparent'}`}>
          <button
            onClick={handlePurchase}
            disabled={isPurchasing || selectedTier === null}
            className="w-full py-4 px-6 bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] text-white rounded-2xl font-bold text-lg hover:shadow-lg transition-all max-w-5xl mx-auto disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >


            {isPurchasing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <ShoppingCart className="w-5 h-5" />
                <span>
                  Purchase Now
                  {selectedTier !== null && service.pricingTiers && (
                    <span className="ml-2">- ₹{service.pricingTiers[selectedTier].amount}</span>
                  )}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
