'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Menu, User, Bell } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useUnreadCountsSafe } from '@/contexts/UnreadCountContext';
import UserSidebar from './UserSidebar';
import Image from 'next/image';

interface UserNavBarProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  showMenu?: boolean;
  showProfile?: boolean;
  showNotification?: boolean;
  showDate?: boolean;
  showGreeting?: boolean;
  backHref?: string;
  onBack?: () => void;
}

export default function UserNavBar({
  title,
  subtitle,
  showBack = false,
  showMenu = true,
  showProfile = true,
  showNotification = true,
  showDate = true,
  showGreeting = true,
  backHref = '/user',
  onBack
}: UserNavBarProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { counts } = useUnreadCountsSafe();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const today = new Date();
  const dayName = format(today, 'EEEE').toUpperCase();
  const dateStr = format(today, 'MMM d').toUpperCase();
  const userName = session?.user?.firstName || session?.user?.name?.split(' ')[0] || 'User';

  const unreadNotifications = counts.notifications;

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.push(backHref);
    }
  };

  return (
    <>
      {/* Sidebar */}
      <UserSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Header */}
      <header className={`client-section-header-safe-top sticky top-0 z-30 border-b px-4 py-3 backdrop-blur transition-colors duration-300 ${isDarkMode ? 'bg-gray-900/95 border-gray-800' : 'bg-white/95 border-gray-100'}`}>
        <div className="mx-auto flex max-w-7xl min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* Back Button or Menu */}
            {showBack ? (
              <button
                onClick={handleBack}
                aria-label="Go back"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                <ArrowLeft className={`h-5 w-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`} />
              </button>
            ) : showMenu ? (
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation menu"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                <Menu className={`h-5 w-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`} />
              </button>
            ) : null}

            {/* Title/Greeting Section */}
            <div className="min-w-0">
              {showDate && !title && (
                <p className={`text-xs font-medium tracking-wider ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {dayName}, {dateStr}
                </p>
              )}
              {title ? (
                <>
                  <h1 className={`truncate text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{title}</h1>
                  {subtitle && (
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{subtitle}</p>
                  )}
                </>
              ) : showGreeting ? (
                <h1 className={`text-2xl font-bold mt-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Hi, {userName}
                </h1>
              ) : null}
            </div>
          </div>

          {/* Right Side - Profile & Notifications */}
          <div className="flex items-center gap-2">
            {/* Notification Bell */}
            {showNotification && (
              <Link href="/user/notifications" aria-label="Open notifications" className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 transition-colors hover:bg-gray-200">
                  <Bell className={`h-5 w-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`} />
                  {unreadNotifications > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-[#ff9500] text-white text-xs rounded-full flex items-center justify-center font-medium">
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </span>
                  )}
              </Link>
            )}

            {/* Profile Avatar */}
            {showProfile && (
              <Link href="/user/profile" aria-label="Open profile" className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border-2 ${isDarkMode ? 'bg-[#ff9500]/10 border-[#ff9500]/30' : 'bg-[#E06A26]/10 border-[#E06A26]/30'}`}>
                  {session?.user?.avatar ? (
                    <Image
                      src={session.user.avatar}
                      alt="Profile"
                      width={44}
                      height={44}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <User className="h-6 w-6 text-[#ff9500]" />
                  )}
              </Link>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
