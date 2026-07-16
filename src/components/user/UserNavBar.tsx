'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Menu, User, Bell } from 'lucide-react';
import { useState, useEffect } from 'react';
import UserSidebar from './UserSidebar';

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
  showNotification = false,
  showDate = true,
  showGreeting = true,
  backHref = '/user',
  onBack
}: UserNavBarProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const today = new Date();
  const dayName = format(today, 'EEEE').toUpperCase();
  const dateStr = format(today, 'MMM d').toUpperCase();
  const userName = session?.user?.firstName || session?.user?.name?.split(' ')[0] || 'User';

  // Fetch unread notifications count
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await fetch('/api/client/notifications/unread-count');
        if (response.ok) {
          const data = await response.json();
          setUnreadNotifications(data.count || 0);
        }
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    };

    if (session?.user) {
      fetchNotifications();
    }
  }, [session]);

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
      <div className="px-5 pt-6 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back Button or Menu */}
            {showBack ? (
              <button
                onClick={handleBack}
                className="flex items-center justify-center w-10 h-10 transition-colors bg-gray-100 rounded-full hover:bg-gray-200"
              >
                <ArrowLeft className="w-5 h-5 text-gray-700" />
              </button>
            ) : showMenu ? (
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex items-center justify-center w-10 h-10 transition-colors bg-gray-100 rounded-full hover:bg-gray-200"
              >
                <Menu className="w-5 h-5 text-gray-700" />
              </button>
            ) : null}

            {/* Title/Greeting Section */}
            <div>
              {showDate && !title && (
                <p className="text-xs font-medium tracking-wider text-gray-500">
                  {dayName}, {dateStr}
                </p>
              )}
              {title ? (
                <>
                  <h1 className="text-xl font-bold text-gray-900">{title}</h1>
                  {subtitle && (
                    <p className="text-xs text-gray-500">{subtitle}</p>
                  )}
                </>
              ) : showGreeting ? (
                <h1 className="mt-1 text-2xl font-bold text-gray-900">
                  Hi, {userName}
                </h1>
              ) : null}
            </div>
          </div>

          {/* Right Side - Profile & Notifications */}
          <div className="flex items-center gap-2">
            {/* Notification Bell */}
            {showNotification && (
              <Link href="/user/notifications">
                <div className="relative flex items-center justify-center w-10 h-10 transition-colors bg-gray-100 rounded-full hover:bg-gray-200">
                  <Bell className="w-5 h-5 text-gray-700" />
                  {unreadNotifications > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-[#E06A26] text-white text-xs rounded-full flex items-center justify-center font-medium">
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </span>
                  )}
                </div>
              </Link>
            )}

            {/* Profile Avatar */}
            {showProfile && (
              <Link href="/user/profile">
                <div className="h-12 w-12 rounded-full bg-[#E06A26]/10 flex items-center justify-center overflow-hidden border-2 border-[#E06A26]/30">
                  {session?.user?.avatar ? (
                    <img
                      src={session.user.avatar}
                      alt="Profile"
                      className="object-cover w-full h-full rounded-full"
                    />
                  ) : (
                    <User className="h-6 w-6 text-[#E06A26]" />
                  )}
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
