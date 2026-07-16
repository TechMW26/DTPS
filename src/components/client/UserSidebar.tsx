'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { X, LayoutDashboard, Heart, Utensils, TrendingUp, Calendar, MessageCircle, CreditCard, User, Settings, HelpCircle, LogOut, BookOpen, Package, ChevronRight, Bell } from 'lucide-react';
import { useUnreadCountsSafe } from '@/contexts/UnreadCountContext';
import { useTheme } from '@/contexts/ThemeContext';

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
}

interface UserSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSidebar({ isOpen, onClose }: UserSidebarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [services, setServices] = useState<ServicePlan[]>([]);
  const { counts } = useUnreadCountsSafe();
  const { isDarkMode } = useTheme();

  // Fetch services when sidebar opens
  useEffect(() => {
    if (isOpen) {
      fetchServices();
    }
  }, [isOpen]);

  const fetchServices = async () => {
    try {
      const response = await fetch('/api/service-plans');
      if (response.ok) {
        const data = await response.json();
        setServices(data.plans || []);
      }
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  // Close sidebar when pressing escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const menuItems = [
    { href: '/user', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/user/plan', label: 'My Meal Plan', icon: Heart },
    { href: '/user/services', label: 'Services', icon: Package },
    { href: '/user/recipes', label: 'Recipes', icon: BookOpen },
    { href: '/user/progress', label: 'Progress', icon: TrendingUp },
    { href: '/user/appointments', label: 'Appointments', icon: Calendar, badge: (session as any)?.user?.upcomingAppointmentsCount || "" },
    { href: '/user/notifications', label: 'Notifications', icon: Bell, badge: counts.notifications > 0 ? counts.notifications : "" },
    { href: '/user/messages', label: 'Messages', icon: MessageCircle, badge: counts.messages > 0 ? counts.messages : "" },
    { href: '/user/billing', label: 'Billing', icon: CreditCard },
    { href: '/user/profile', label: 'Profile', icon: User },
    { href: '/user/settings', label: 'Settings', icon: Settings },
    
  ];

  const userName = session?.user?.firstName && session?.user?.lastName 
    ? `${session.user.firstName} ${session.user.lastName}` 
    : session?.user?.name || 'User';
  const userEmail = session?.user?.email || '';
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const handleSignOut = async () => {
    onClose();
    const fullSigninUrl = `${window.location.origin}/client-auth/signin`;
    await signOut({ callbackUrl: fullSigninUrl });
  };

  // Handle link click - close sidebar
  const handleLinkClick = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 transition-opacity duration-700 ease-in-out bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transform shadow-2xl w-72 transition-all duration-700 ease-in-out motion-reduce:duration-300 motion-reduce:ease-out ${
          isDarkMode ? 'bg-gray-950' : 'bg-white'
        }`}
      >
        {/* Header with Logo */}
        <div
          className={`flex items-center justify-between px-4 py-4 border-b animate-in fade-in slide-in-from-top-2 duration-500 delay-75 ${
            isDarkMode ? 'border-gray-800' : 'border-gray-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl overflow-hidden bg-[#3AB1A0]/10 flex items-center justify-center">
              <Image
                src="/images/dtps-logo.png"
                alt="DTPS"
                width={40}
                height={40}
                className="object-cover"
              />
            </div>
            <h2 className="text-xl font-bold text-[#E06A26]">DTPS</h2>
          </div>
          <button 
            onClick={onClose}
            className={`flex items-center justify-center w-8 h-8 transition-colors rounded-full active:scale-95 ${
              isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`}
          >
            <X className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`} />
          </button>
        </div>

        {/* User Info */}
        <div
          className={`flex items-center gap-3 px-4 py-4 border-b animate-in fade-in slide-in-from-top-2 duration-500 delay-100 ${
            isDarkMode ? 'border-gray-800' : 'border-gray-100'
          }`}
        >
          <div className="h-12 w-12 rounded-full bg-[#E06A26]/10 flex items-center justify-center">
            {session?.user?.avatar ? (
              <img 
                src={session.user.avatar} 
                alt="Profile" 
                className="object-cover w-full h-full rounded-full"
              />
            ) : (
              <span className="text-[#E06A26] font-semibold">{userInitials}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{userName}</p>
            <p className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{userEmail}</p>
          </div>
        
        </div>

     

        {/* Menu Items */}
        <nav className="flex-1 py-2 overflow-y-auto animate-in fade-in duration-500 delay-150">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleLinkClick}
                className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-xl transition-all duration-200 active:scale-[0.98] ${
                  isActive 
                    ? 'bg-[#3AB1A0]/10 text-[#E06A26]' 
                    : isDarkMode
                      ? 'text-gray-200 hover:bg-white/10'
                      : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon
                  className={`h-5 w-5 transition-colors ${
                    isActive ? 'text-[#E06A26]' : isDarkMode ? 'text-gray-500' : 'text-gray-400'
                  }`}
                />
                <span className={`flex-1 text-sm ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
                {item.badge && (
                  <span className="h-5 min-w-5 px-1.5 rounded-full bg-[#E06A26] text-white text-xs font-medium flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sign Out */}
        <div
          className={`p-4 border-t animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 ${
            isDarkMode ? 'border-gray-800' : 'border-gray-100'
          }`}
        >
          <button
            onClick={handleSignOut}
            className={`flex items-center gap-3 w-full px-4 py-3 text-red-500 rounded-xl transition-all duration-200 active:scale-[0.98] ${
              isDarkMode ? 'hover:bg-red-500/10' : 'hover:bg-red-50'
            }`}
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </div>

      <style jsx>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </>
  );
}
