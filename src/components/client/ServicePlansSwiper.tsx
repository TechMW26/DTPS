'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Clock, Star, Check, ArrowRight, X, CreditCard, Shield, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

declare global {
    interface Window {
        Razorpay: any;
    }
}

interface PricingTier {
    _id: string;
    durationDays: number;
    durationLabel: string;
    amount: number;
    maxDiscount: number;
    isActive: boolean;
}

interface ServicePlan {
    _id: string;
    name: string;
    category: string;
    description?: string;
    pricingTiers: PricingTier[];
    features?: string[];
}

interface ServicePlansSwiperProps {
    onPlanSelect?: (plan: ServicePlan, tier: PricingTier) => void;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    'weight-loss': { bg: 'from-green-500 to-emerald-600', text: 'text-green-600', border: 'border-green-200' },
    'weight-gain': { bg: 'from-blue-500 to-indigo-600', text: 'text-blue-600', border: 'border-blue-200' },
    'muscle-gain': { bg: 'from-purple-500 to-violet-600', text: 'text-purple-600', border: 'border-purple-200' },
    'diabetes': { bg: 'from-teal-500 to-cyan-600', text: 'text-teal-600', border: 'border-teal-200' },
    'pcos': { bg: 'from-pink-500 to-rose-600', text: 'text-pink-600', border: 'border-pink-200' },
    'thyroid': { bg: 'from-amber-500 to-orange-600', text: 'text-amber-600', border: 'border-amber-200' },
    'general-wellness': { bg: 'from-green-500 to-teal-600', text: 'text-green-600', border: 'border-green-200' },
    'detox': { bg: 'from-lime-500 to-green-600', text: 'text-lime-600', border: 'border-lime-200' },
    'sports-nutrition': { bg: 'from-red-500 to-orange-600', text: 'text-red-600', border: 'border-red-200' },
    'custom': { bg: 'from-gray-500 to-slate-600', text: 'text-gray-600', border: 'border-gray-200' },
};

const getCategoryLabel = (category: string): string => {
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
        'custom': 'Custom',
    };
    return labels[category] || category;
};

export default function ServicePlansSwiper({ onPlanSelect }: ServicePlansSwiperProps) {
    const router = useRouter();
    const [plans, setPlans] = useState<ServicePlan[]>([]);
    const [hasAnyPurchase, setHasAnyPurchase] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeIndex, setActiveIndex] = useState(0);
    const [selectedTiers, setSelectedTiers] = useState<Record<string, string>>({});
    const [showPurchaseModal, setShowPurchaseModal] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<ServicePlan | null>(null);
    const [purchasing, setPurchasing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchPlans();
        loadRazorpayScript();
    }, []);

    const loadRazorpayScript = () => {
        
        if (document.getElementById('razorpay-script')) return;
        const script = document.createElement('script');
        script.id = 'razorpay-script';
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.body.appendChild(script);
    };

    const fetchPlans = async () => {
        try {
            const response = await fetch('/api/client/service-plans');
            if (response.ok) {
                const data = await response.json();
                setPlans(data.plans || []);
                // Use hasAnyPurchase to hide swiper if user has any purchase (active or pending)
                setHasAnyPurchase(data.hasAnyPurchase || data.hasActivePlan);
                const defaultTiers: Record<string, string> = {};
                (data.plans || []).forEach((plan: ServicePlan) => {
                    const activeTiers = plan.pricingTiers.filter(t => t.isActive);
                    if (activeTiers.length > 0) {
                        defaultTiers[plan._id] = activeTiers[0]._id;
                    }
                });
                setSelectedTiers(defaultTiers);
            }
        } catch (error) {
            console.error('Error fetching plans:', error);
        } finally {
            setLoading(false);
        }
    };

    const scrollTo = (direction: 'left' | 'right') => {
        if (containerRef.current) {
            const cardWidth = containerRef.current.offsetWidth * 0.85;
            const newIndex = direction === 'left'
                ? Math.max(0, activeIndex - 1)
                : Math.min(plans.length - 1, activeIndex + 1);
            setActiveIndex(newIndex);
            containerRef.current.scrollTo({
                left: newIndex * cardWidth,
                behavior: 'smooth'
            });
        }
    };

    const handleScroll = () => {
        if (containerRef.current) {
            const cardWidth = containerRef.current.offsetWidth * 0.85;
            const newIndex = Math.round(containerRef.current.scrollLeft / cardWidth);
            setActiveIndex(newIndex);
        }
    };

    const handleGetStarted = (plan: ServicePlan) => {
        setSelectedPlan(plan);
        setShowPurchaseModal(true);
    };

    const handlePurchase = async () => {
        if (!selectedPlan) return;

        const selectedTierId = selectedTiers[selectedPlan._id];
        const tier = selectedPlan.pricingTiers.find(t => t._id === selectedTierId);
        
        if (!tier) {
            toast.error('Please select a duration');
            return;
        }

        setPurchasing(true);
        
        try {
            const response = await fetch('/api/client/service-plans/purchase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planId: selectedPlan._id,
                    tierId: tier._id,
                    amount: tier.amount,
                    durationDays: tier.durationDays,
                    durationLabel: tier.durationLabel,
                    planName: selectedPlan.name,
                    planCategory: selectedPlan.category
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create order');
            }

            const data = await response.json();

            if (data.paymentLink) {
                window.location.href = data.paymentLink;
            } else if (data.orderId && window.Razorpay) {
                const options = {
                    key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
                    amount: tier.amount * 100,
                    currency: 'INR',
                    name: 'DTPS',
                    description: `${selectedPlan.name} - ${tier.durationLabel}`,
                    image: '/images/dtps-logo.png',
                    order_id: data.orderId,
                    handler: async function (response: any) {
                        try {
                            const verifyResponse = await fetch('/api/client/service-plans/verify', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    razorpay_order_id: response.razorpay_order_id,
                                    razorpay_payment_id: response.razorpay_payment_id,
                                    razorpay_signature: response.razorpay_signature,
                                    paymentId: data.paymentId
                                })
                            });

                            if (verifyResponse.ok) {
                                toast.success('Payment successful!');
                                setShowPurchaseModal(false);
                                setHasAnyPurchase(true);
                                // Redirect to payment success page with receipt
                                router.push(`/user/payment-success?payment_id=${data.paymentId}&razorpay_payment_id=${response.razorpay_payment_id}`);
                            } else {
                                toast.error('Payment verification failed. Please contact support.');
                            }
                        } catch (error) {
                            toast.error('Payment verification failed');
                        }
                    },
                    prefill: {
                        name: '',
                        email: '',
                        contact: ''
                    },
                    theme: {
                        color: '#E06A26'
                    },
                    modal: {
                        ondismiss: function() {
                            setPurchasing(false);
                        }
                    }
                };

                const razorpay = new window.Razorpay(options);
                razorpay.open();
            } else {
                toast.success('Order created! You will be contacted for payment details.');
                setShowPurchaseModal(false);
            }
        } catch (error: any) {
            console.error('Purchase error:', error);
            toast.error(error.message || 'Failed to process purchase');
        } finally {
            setPurchasing(false);
        }
    };

    // Hide swiper if user has any purchase (active or pending)
    if (hasAnyPurchase) {
        return null;
    }

    if (loading) {
        return (
            <div className="mb-6">
                <div className="flex items-center justify-between px-1 mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Choose your plan</h2>
                        <p className="text-sm text-gray-500">Loading available plans...</p>
                    </div>
                </div>
                <div className="bg-gray-100 rounded-3xl p-6 animate-pulse">
                    <div className="h-32 bg-gray-200 rounded-xl mb-4"></div>
                    <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
            </div>
        );
    }

    if (plans.length === 0) {
        return (
            <div className="mb-6">
                <div className="flex items-center justify-between px-1 mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Choose your plan</h2>
                        <p className="text-sm text-gray-500">Start your nutrition journey</p>
                    </div>
                </div>
                <div className="bg-linear-to-br from-[#E06A26] to-[#DB9C6E] rounded-3xl p-6 text-white">
                    <div className="flex flex-col items-center text-center">
                        <div className="h-16 w-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
                            <Star className="h-8 w-8" />
                        </div>
                        <h3 className="text-lg font-bold mb-2">No plans available yet</h3>
                        <p className="text-white/80 text-sm mb-4">
                            Contact your dietitian to create a personalized nutrition plan for you.
                        </p>
                        <div className="bg-white/20 px-4 py-2 rounded-full text-sm font-medium">
                            Coming soon
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="mb-6">
                <div className="flex items-center justify-between px-1 mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Choose your plan</h2>
                        <p className="text-sm text-gray-500">Select a nutrition plan to get started</p>
                    </div>
                    {plans.length > 1 && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => scrollTo('left')}
                                disabled={activeIndex === 0}
                                aria-label="Show previous plan"
                                className="p-2 rounded-full bg-white border-2 border-[#E06A26] disabled:opacity-40 hover:bg-[#E06A26]/10 transition-colors"
                            >
                                <ChevronLeft className="h-4 w-4 text-[#E06A26]" />
                            </button>
                            <button
                                onClick={() => scrollTo('right')}
                                disabled={activeIndex === plans.length - 1}
                                aria-label="Show next plan"
                                className="p-2 rounded-full bg-white border-2 border-[#E06A26]  disabled:opacity-40 hover:bg-[#E06A26]/10 transition-colors"
                            >
                                <ChevronRight className="h-4 w-4 text-[#E06A26]" />
                            </button>
                        </div>
                    )}
                </div>

                <div
                    ref={containerRef}
                    onScroll={handleScroll}
                    className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {plans.map((plan, index) => {
                        const activeTiers = plan.pricingTiers.filter(t => t.isActive);
                        const selectedTierId = selectedTiers[plan._id];
                        const selectedTier = activeTiers.find(t => t._id === selectedTierId) || activeTiers[0];

                        return (
                            <div
                                key={plan._id}
                                className="shrink-0 w-70 min-w-70 max-w-70 snap-center animate-scale-fade-in"
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <div className="rounded-3xl overflow-hidden border-2 border-[#3AB1A0]/30 transition-all duration-300 h-80 flex flex-col">
                                    <div className="bg-linear-to-r from-[#E06A26] to-[#DB9C6E] p-4 text-white shrink-0">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded-full">
                                                    {getCategoryLabel(plan.category)}
                                                </span>
                                                <h3 className="text-lg font-bold mt-2 line-clamp-1">{plan.name}</h3>
                                            </div>
                                            <div className="h-10 w-10 rounded-xl overflow-hidden bg-white/20 flex items-center justify-center shrink-0">
                                                <Image
                                                    src="/images/dtps-logo.png"
                                                    alt="DTPS"
                                                    width={36}
                                                    height={36}
                                                    className="object-cover"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white p-4 flex-1 flex flex-col justify-between">
                                        {plan.description && (
                                            <div
                                                className="text-sm text-gray-600 mb-3 line-clamp-2"
                                                dangerouslySetInnerHTML={{ __html: plan.description }}
                                            />
                                        )}
                                        {!plan.description && (
                                            <p className="text-sm text-gray-500 mb-3">Personalized nutrition plan tailored for your goals.</p>
                                        )}

                                        <div className="flex items-center justify-between mb-3 bg-[#3AB1A0]/5 p-3 rounded-xl">
                                            <div>
                                                <p className="text-xs text-[#3AB1A0] font-semibold">STARTING FROM</p>
                                                <div className="flex items-baseline">
                                                    <span className="text-2xl font-bold text-[#E06A26]">
                                                        ₹{Math.min(...activeTiers.map(t => t.amount)).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-gray-500">{activeTiers.length} duration{activeTiers.length > 1 ? 's' : ''}</p>
                                                <p className="text-xs text-gray-400">available</p>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => router.push(`/user/services/${plan._id}`)}
                                                className="flex-1 py-3 rounded-2xl border-2 border-[#3AB1A0] text-[#3AB1A0] font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] hover:bg-[#3AB1A0]/10"
                                            >
                                                View Details
                                            </button>
                                            <button
                                                onClick={() => handleGetStarted(plan)}
                                                className="flex-1 py-3 rounded-2xl bg-linear-to-r from-[#E06A26] to-[#DB9C6E] text-white font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                                            >
                                                Get Started
                                                <ArrowRight className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {plans.length > 1 && (
                    <div className="flex justify-center gap-2 mt-4">
                        {plans.map((_, index) => (
                            <div
                                key={index}
                                className={`h-2 rounded-full transition-all duration-300 ${index === activeIndex ? 'w-6 bg-[#3AB1A0]' : 'w-2 bg-gray-300'}`}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Purchase Modal */}
            {showPurchaseModal && selectedPlan && (
                <div className="client-popup-above-nav fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
                    <div 
                        className="client-bottom-sheet-panel max-h-full w-full max-w-md overflow-y-auto rounded-t-3xl bg-white sm:rounded-3xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sticky top-0 bg-linear-to-r from-[#E06A26] to-[#DB9C6E] p-5 text-white">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-14 w-14 rounded-xl overflow-hidden bg-white/20 flex items-center justify-center">
                                        <Image
                                            src="/images/dtps-logo.png"
                                            alt="DTPS"
                                            width={48}
                                            height={48}
                                            className="object-cover"
                                        />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold">{selectedPlan.name}</h3>
                                        <p className="text-white/80 text-sm">{getCategoryLabel(selectedPlan.category)}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowPurchaseModal(false)}
                                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="p-5 space-y-5">
                            <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-3">Select Duration</h4>
                                <div className="space-y-2">
                                    {selectedPlan.pricingTiers.filter(t => t.isActive).map((tier) => {
                                        const isSelected = selectedTiers[selectedPlan._id] === tier._id;
                                        return (
                                            <button
                                                key={tier._id}
                                                onClick={() => setSelectedTiers({ ...selectedTiers, [selectedPlan._id]: tier._id })}
                                                className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                                                    isSelected 
                                                        ? 'border-[#E06A26] bg-[#E06A26]/5' 
                                                        : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                                                        isSelected ? 'bg-[#E06A26]' : 'bg-gray-100'
                                                    }`}>
                                                        <Clock className={`h-5 w-5 ${isSelected ? 'text-white' : 'text-gray-500'}`} />
                                                    </div>
                                                    <div className="text-left">
                                                        <p className={`font-semibold ${isSelected ? 'text-[#E06A26]' : 'text-gray-900'}`}>
                                                            {tier.durationLabel}
                                                        </p>
                                                        <p className="text-xs text-gray-500">{tier.durationDays} days plan</p>
                                                    </div>
                                                </div>
                                                <div className="text-right flex items-center gap-2">
                                                    <p className={`text-lg font-bold ${isSelected ? 'text-[#E06A26]' : 'text-gray-900'}`}>
                                                        ₹{tier.amount.toLocaleString()}
                                                    </p>
                                                    {isSelected && (
                                                        <Check className="h-5 w-5 text-[#E06A26]" />
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-4 bg-[#3AB1A0]/10 rounded-2xl">
                                <Shield className="h-6 w-6 text-[#3AB1A0]" />
                                <div>
                                    <p className="text-sm font-medium text-gray-900">Secure Payment</p>
                                    <p className="text-xs text-gray-500">Powered by Razorpay</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                                <span className="text-gray-600">Total Amount</span>
                                <span className="text-2xl font-bold text-[#E06A26]">
                                    ₹{(selectedPlan.pricingTiers.find(t => t._id === selectedTiers[selectedPlan._id])?.amount || 0).toLocaleString()}
                                </span>
                            </div>

                            <button
                                onClick={handlePurchase}
                                disabled={purchasing}
                                className="w-full py-4 rounded-2xl bg-linear-to-r from-[#E06A26] to-[#DB9C6E] text-white font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-70 active:scale-[0.98]"
                            >
                                {purchasing ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <CreditCard className="h-5 w-5" />
                                        Pay & Subscribe
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
