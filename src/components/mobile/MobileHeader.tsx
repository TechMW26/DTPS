'use client';

import { ArrowLeft, Bell, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useUnreadCountsSafe } from '@/contexts/UnreadCountContext';

interface MobileHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  showNotification?: boolean;
  showSettings?: boolean;
  rightAction?: React.ReactNode;
  showProfile?: boolean;
}

export function MobileHeader({
  title,
  subtitle,
  showBack = false,
  showNotification = false,
  showSettings = false,
  rightAction,
  showProfile = true
}: MobileHeaderProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const { counts } = useUnreadCountsSafe();

  // Get user's first name or initials for avatar
  const firstName = session?.user?.firstName || session?.user?.name || 'User';
  const initials = firstName.charAt(0).toUpperCase();

  return (
    <div className="bg-white shadow-sm border-b border-gray-200 safe-area-top">
      <div className="px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Left side - Profile Avatar */}
          <div className="flex items-center space-x-3">
            {showProfile && (
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                <span className="text-gray-700 font-semibold text-lg">{initials}</span>
              </div>
            )}
            {showBack && !showProfile && (
              <button
                onClick={() => router.back()}
                className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors active:scale-95 border border-gray-200"
              >
                <ArrowLeft className="h-5 w-5 text-gray-700" />
              </button>
            )}
          </div>

          {/* Center - Title and Subtitle */}
          <div className="flex-1 text-center">
            <h1 className="text-lg font-bold text-gray-900 truncate">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500 truncate">{subtitle}</p>}
          </div>

          {/* Right side - Notification */}
          <div className="flex items-center space-x-2">
            {showNotification && (
              <Link href="/user/notifications" className="relative h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors active:scale-95 border border-gray-200">
                <Bell className="h-5 w-5 text-gray-700" />
                {counts.notifications > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {counts.notifications > 9 ? '9+' : counts.notifications}
                  </span>
                )}
              </Link>
            )}
            {showSettings && (
              <button className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors active:scale-95 border border-gray-200">
                <Settings className="h-5 w-5 text-gray-700" />
              </button>
            )}
            {rightAction}
          </div>
        </div>
      </div>
    </div>
  );
}

