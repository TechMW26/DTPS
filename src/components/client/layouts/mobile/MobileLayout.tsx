'use client';

import { ReactNode, useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  Heart,
  TrendingUp,
  Calendar,
  MessageCircle,
  CreditCard,
  User,
  Settings,
  Bell,
  Menu,
  X,
  ChevronRight,
  LogOut,
  HelpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import BottomNavBar from '@/components/client/BottomNavBar';

interface MobileLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  showHeader?: boolean;
  showBottomNav?: boolean;
  headerAction?: ReactNode;
  className?: string;
}

// Navigation items for bottom nav
const bottomNavItems = [
  { href: '/user/dashboard', label: 'Home', icon: Home },
  { href: '/user/plan', label: 'My Plan', icon: Heart },
  { href: '/user/progress', label: 'Progress', icon: TrendingUp },
  { href: '/user/messages', label: 'Chat', icon: MessageCircle },
];

// Full menu items for slide-out menu
const menuItems = [
  { href: '/user/dashboard', label: 'Dashboard', icon: Home },
  { href: '/user/plan', label: 'My Meal Plan', icon: Heart },
  { href: '/user/progress', label: 'Progress', icon: TrendingUp },
  { href: '/user/appointments', label: 'Appointments', icon: Calendar },
  { href: '/user/notifications', label: 'Notifications', icon: Bell },
  { href: '/user/messages', label: 'Messages', icon: MessageCircle },
  { href: '/user/billing', label: 'Billing', icon: CreditCard },
  { href: '/user/profile', label: 'Profile', icon: User },
  { href: '/user/settings', label: 'Settings', icon: Settings },
  { href: '/user/help', label: 'Help & Support', icon: HelpCircle },
];

import { useUnreadCountsSafe } from '@/contexts/UnreadCountContext';

/**
 * MobileLayout - Mobile-first layout for client pages
 * Features:
 * - Fixed header with hamburger menu
 * - Slide-out navigation drawer
 * - Fixed bottom navigation
 * - Safe area handling for notch devices
 * - Smooth animations
 */
export function MobileLayout({
  children,
  title,
  subtitle,
  showBack = false,
  onBack,
  showHeader = true,
  showBottomNav = true,
  headerAction,
  className
}: MobileLayoutProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { counts } = useUnreadCountsSafe();

  const user = session?.user;
  const initials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : 'U';

  const isActive = (href: string) => {
    return pathname === href || pathname?.startsWith(href + '/');
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      {showHeader && (
        <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100 safe-area-top">
          <div className="flex items-center justify-between h-14 px-4">
            {/* Left: Menu or Back */}
            <div className="flex items-center gap-2">
              {showBack ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBack}
                  className="h-9 w-9"
                >
                  <ChevronRight className="h-5 w-5 rotate-180" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMenuOpen(true)}
                  className="h-9 w-9"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}

              {/* Title */}
              {title && (
                <div>
                  <h1 className="text-base font-semibold text-gray-900 line-clamp-1">
                    {title}
                  </h1>
                  {subtitle && (
                    <p className="text-xs text-gray-500">{subtitle}</p>
                  )}
                </div>
              )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {headerAction}

              {/* Notifications */}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 relative"
                onClick={() => router.push('/user/notifications')}
              >
                <Bell className="h-5 w-5 text-gray-600" />
                {counts.notifications > 0 && (
                  <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                    {counts.notifications > 9 ? '9+' : counts.notifications}
                  </span>
                )}
              </Button>

              {/* Profile Avatar */}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => router.push('/user/profile')}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.avatar || ''} />
                  <AvatarFallback className="bg-[#3AB1A0]/10 text-[#3AB1A0] text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </div>
          </div>
        </header>
      )}

      {/* Slide-out Menu Overlay */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Slide-out Menu */}
      <div className={cn(
        "fixed top-0 left-0 h-full w-70 bg-white z-50 transform transition-transform duration-300 ease-out safe-area-left",
        isMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Menu Header */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-bold text-[#E06A26]">DTPS</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMenuOpen(false)}
              className="h-8 w-8"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* User Info */}
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={user?.avatar || ''} />
              <AvatarFallback className="bg-[#3AB1A0]/10 text-[#3AB1A0]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-sm text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 overflow-y-auto py-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors",
                  active
                    ? "bg-[#3AB1A0]/10 text-[#3AB1A0]"
                    : "text-gray-700 hover:bg-gray-50"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-[#3AB1A0]")} />
                <span className="font-medium">{item.label}</span>
                {item.href === '/user/messages' && counts.messages > 0 && (
                  <Badge className="ml-auto bg-[#E06A26]/10 text-[#E06A26] text-xs">
                    {counts.messages > 99 ? '99+' : counts.messages}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sign Out */}
        <div className="p-4 border-t border-gray-100">
          <Button
            variant="ghost"
            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => {
              // Clear local storage
              if (typeof window !== 'undefined') {
                localStorage.removeItem('user-preferences');
                localStorage.removeItem('dtps-theme');
                sessionStorage.clear();
              }
              const fullSigninUrl = `${window.location.origin}/client-auth/signin`;
              signOut({ callbackUrl: fullSigninUrl, redirect: true });
            }}
          >
            <LogOut className="h-5 w-5 mr-3" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <main className={cn(
        "flex-1",
        showHeader && "pt-14",
        showBottomNav && "pb-24",
        className
      )}>
        {children}
      </main>

      {/* Bottom Navigation */}
      {showBottomNav && <BottomNavBar />}

    </div>
  );
}

export default MobileLayout;
