'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import { ArrowLeft, Star, Check, Sparkles, Clock, Users, ChevronRight, Zap, Award, TrendingUp, Tag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';

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
  isPopular?: boolean;
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

const getCategoryIcon = (category: string) => {
  switch (category?.toLowerCase()) {
    case 'weight loss':
      return '🏃';
    case 'muscle gain':
      return '💪';
    case 'general wellness':
      return '🌿';
    case 'sports nutrition':
      return '⚡';
    case 'medical diet':
      return '🏥';
    default:
      return '🥗';
  }
};

const getCategoryColor = (category: string) => {
  switch (category?.toLowerCase()) {
    case 'weight loss':
      return 'from-[#E06A26]/20 to-[#DB9C6E]/20';
    case 'muscle gain':
      return 'from-blue-100 to-indigo-100';
    case 'general wellness':
      return 'from-[#3AB1A0]/20 to-[#2D8A7C]/20';
    default:
      return 'from-purple-100 to-pink-100';
  }
};

export default function ServicesPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const [services, setServices] = useState<ServicePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/service-plans');
      if (response.ok) {
        const data = await response.json();
        setServices(data.plans || []);
      }
    } catch (error) {
      console.error('Error fetching services:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get unique categories
  const categories = ['All', ...Array.from(new Set(services.map(s => s.category).filter(Boolean)))];
  
  const filteredServices = selectedCategory === 'All' 
    ? services 
    : services.filter(s => s.category === selectedCategory);

  if (loading) {
    return (
      <div className={`fixed inset-0 flex items-center justify-center z-100 ${isDarkMode ? 'bg-gray-950' : 'bg-white'}`}>
        <SpoonGifLoader size="lg" />
      </div>
    );
  }

  return (
      <div className={`min-h-screen pb-24 transition-colors duration-300 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        {/* Header */}
        <div className={`sticky top-0 z-40 transition-colors duration-300 border-b ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
        <div className="relative flex items-center justify-center px-4 py-4">
          <button
            onClick={() => router.back()}
            className="absolute left-4 flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#3AB1A0]/10 transition-colors"
          >
            <ArrowLeft className={`w-5 h-5 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`} />
          </button>
          <h1 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-black'}`}>Our Services</h1>
        </div>

        {/* Category Filter - Horizontal Scroll */}
        {categories.length > 1 && (
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  selectedCategory === category
                    ? 'bg-[#3AB1A0] text-white shadow-md'
                    : isDarkMode
                      ? 'bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {category !== 'All' && <span className="mr-1">{getCategoryIcon(category)}</span>}
                {category}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hero Banner */}
      <div className="px-4 py-4">
        <div className="bg-linear-to-r from-[#3AB1A0] to-[#2D8A7C] rounded-2xl p-5 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Award className="h-5 w-5" />
              <span className="text-sm font-medium opacity-90">Expert Dietitians</span>
            </div>
            <h2 className="text-xl font-bold mb-1">Transform Your Health</h2>
            <p className="text-sm opacity-90">Get personalized diet plans from certified nutritionists</p>
            <div className="flex items-center gap-4 mt-4">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span className="text-xs font-medium">1000+ Clients</span>
              </div>
              
            </div>
          </div>
        </div>
      </div>

      {/* Service Plans - Horizontal Scrollable Layout */}
      <div className="px-4 py-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#E06A26]/10 rounded-lg">
              <Zap className="h-4 w-4 text-[#E06A26]" />
            </div>
            <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Service Plans</h2>
          </div>
          <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>{filteredServices.length} plans available</span>
        </div>
        
        <div className="overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
          <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
            {filteredServices.map((service, index) => (
              <Link
                key={service._id}
                href={`/user/services/${service._id}`}
                className={`block w-80 shrink-0 rounded-2xl border hover:border-[#3AB1A0] hover:shadow-xl transition-all group overflow-hidden ${
                  isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
                }`}
              >
                {/* Card Header with Gradient */}
                <div className={`bg-linear-to-br ${getCategoryColor(service.category)} p-5 relative`}>
                  {service.maxDiscountPercent && service.maxDiscountPercent > 0 && (
                    <div className="absolute top-3 right-3 bg-[#E06A26] text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {service.maxDiscountPercent}% OFF
                    </div>
                  )}
                  {index === 0 && (
                    <div className="absolute top-3 left-3 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                      <Star className="h-3 w-3 fill-current" />
                      Popular
                    </div>
                  )}
                  <div className="text-4xl mb-2 mt-4">{getCategoryIcon(service.category)}</div>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${isDarkMode ? 'bg-gray-900/60 text-gray-200' : 'bg-white/80 text-gray-700'}`}>
                    {service.category || 'General'}
                  </span>
                </div>

                <div className="p-5">
                  <h3 className={`text-lg font-bold mb-2 group-hover:text-[#3AB1A0] transition-colors line-clamp-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {service.name}
                  </h3>
                  <p className={`text-sm mb-4 line-clamp-2 leading-relaxed min-h-10 ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                    {stripHtmlTags(service.description || '') || 'Premium nutrition and diet plan customized for your goals.'}
                  </p>
                  
                  {/* Pricing Tiers - Horizontal */}
                  {service.pricingTiers && service.pricingTiers.length > 0 && (
                    <div className="mb-4">
                      <p className={`text-xs mb-2 font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>PRICING OPTIONS</p>
                      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                        {service.pricingTiers.slice(0, 3).map((tier, idx) => (
                          <div
                            key={idx}
                            className={`shrink-0 rounded-xl p-2 text-center min-w-20 border ${
                              isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-100'
                            }`}
                          >
                            <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>{tier.durationLabel}</p>
                            <p className="text-sm font-bold text-[#E06A26]">₹{tier.amount.toLocaleString()}</p>
                          </div>
                        ))}
                        {service.pricingTiers.length > 3 && (
                          <div
                            className={`shrink-0 rounded-xl p-2 text-center min-w-15 border flex items-center justify-center ${
                              isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-100'
                            }`}
                          >
                            <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-400'}`}>+{service.pricingTiers.length - 3}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Features Preview */}
                  {service.features && service.features.length > 0 && (
                    <div className={`border-t pt-4 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                      <div className="space-y-2">
                        {service.features.slice(0, 3).map((feature, idx) => (
                          <div key={idx} className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                            <Check className="w-4 h-4 text-[#3AB1A0] shrink-0" />
                            <span className="line-clamp-1">{feature}</span>
                          </div>
                        ))}
                        {service.features.length > 3 && (
                          <p className="text-xs text-[#3AB1A0] font-medium">+{service.features.length - 3} more features</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* CTA */}
                  <div className="mt-4 flex items-center justify-between">
                    <div className={`flex items-center gap-1 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-400'}`}>
                      <Clock className="h-3 w-3" />
                      Starts from {service.pricingTiers?.[0]?.durationLabel || '1 Month'}
                    </div>
                    <span className="flex items-center gap-1 text-sm font-bold text-[#3AB1A0] group-hover:translate-x-1 transition-transform">
                      View <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

    

        {services.length === 0 && (
          <div className="py-20 text-center">
            <Star className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
            <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-500'} font-medium`}>No services available</p>
          </div>
        )}
    </div>
  );
}
