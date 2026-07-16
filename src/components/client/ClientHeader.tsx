'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { 
  Bell, 
  Menu, 
  X, 
  User, 
  Settings, 
  LogOut,
  CreditCard,
  Calendar,
  ChevronRight,
  Heart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUnreadCountsSafe } from '@/contexts/UnreadCountContext';

interface ClientHeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
}

export default function ClientHeader({ title, showBack, onBack }: ClientHeaderProps) {
  const { data: session } = useSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { counts } = useUnreadCountsSafe();

  const user = session?.user;
  const initials = user?.name 
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  // Handle logout with proper cookie clearing
  const handleLogout = useCallback(async () => {
    try {
      // First clear cookies via our custom logout API
      await fetch('/api/auth/logout', { method: 'POST' });
      
      // Clear local storage (but preserve meal drafts for later)
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user-preferences');
        localStorage.removeItem('theme');
        localStorage.removeItem('onboarding-data');
        sessionStorage.clear();
      }
      
      // Then call NextAuth signOut - use absolute URL to ensure domain is used
      const fullSigninUrl = `${window.location.origin}/client-auth/signin`;
      await signOut({ callbackUrl: fullSigninUrl, redirect: true });
    } catch (error) {
      console.error('Error during logout:', error);
      // Force redirect even on error
      const fullSigninUrl = `${window.location.origin}/client-auth/signin`;
      await signOut({ callbackUrl: fullSigninUrl, redirect: true });
    }
  }, []);

  const menuItems = [
    { href: '/user/appointments', label: 'Appointments', icon: Calendar },
    { href: '/user/billing', label: 'Billing', icon: CreditCard },
    { href: '/user/profile', label: 'Profile', icon: User },
    { href: '/user/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 lg:hidden">
        <div className="flex items-center justify-between h-14 px-4">
          {/* Left - Logo or Back */}
          <div className="flex items-center gap-2">
            {showBack ? (
              <button onClick={onBack} className="p-1 -ml-1">
                <ChevronRight className="h-6 w-6 rotate-180 text-gray-600" />
              </button>
            ) : (
              <Link href="/client-dashboard" className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-linear-to-br from-green-500 to-teal-600 flex items-center justify-center">
                  <Heart className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-lg text-gray-900">DTPS</span>
              </Link>
            )}
            {title && showBack && (
              <span className="font-semibold text-gray-900">{title}</span>
            )}
          </div>

            {/* Right - Actions */}
          <div className="flex items-center gap-2">
            {/* Notifications */}
            <Link href="/user/notifications">
              <Button variant="ghost" size="icon" className="relative h-9 w-9">
                <Bell className="h-5 w-5 text-gray-600" />
                {counts.notifications > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                    {counts.notifications > 9 ? '9+' : counts.notifications}
                  </span>
                )}
              </Button>
            </Link>            {/* Profile Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.avatar || ''} />
                    <AvatarFallback className="bg-green-100 text-green-700 text-sm">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="font-medium">{user?.name}</span>
                    <span className="text-xs text-gray-500 font-normal">{user?.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {menuItems.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href} className="flex items-center gap-2 cursor-pointer">
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleLogout}
                  className="text-red-600 cursor-pointer"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Slide-out Menu for additional items */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsMenuOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-72 bg-white shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-semibold">Menu</span>
              <Button variant="ghost" size="icon" onClick={() => setIsMenuOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="p-4 space-y-2">
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 text-gray-700"
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
