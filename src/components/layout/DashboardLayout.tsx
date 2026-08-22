'use client';

import { ReactNode, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { cn } from '@/lib/utils';
import { NotificationPermissionBanner } from '@/components/notifications/NotificationPermissionBanner';
import { StaffUnreadCountProvider } from '@/contexts/StaffUnreadCountContext';
import { useTheme } from '@/contexts/ThemeContext';
import { StaffAppSkeleton } from '@/components/ui/skeleton';

interface DashboardLayoutProps {
  children: ReactNode;
  className?: string;
  showSidebar?: boolean;
}

export default function DashboardLayout({
  children,
  className,
  showSidebar = true
}: DashboardLayoutProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isDarkMode } = useTheme();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <StaffAppSkeleton />;
  }

  if (status === 'unauthenticated') {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? 'bg-gray-950' : 'bg-white'}`}>
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 border-4 border-[#E06A26] border-t-transparent rounded-full animate-spin" />
          <p className={`mt-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <StaffUnreadCountProvider>
      <div className={`h-screen flex overflow-hidden ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        {/* Sidebar - Full Height on Dashboard */}
        {showSidebar && (
          <div className="hidden lg:block h-screen shrink-0">
            <Sidebar isDarkMode={isDarkMode} />
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <Navbar isDarkMode={isDarkMode} />
          {/* Notification Permission Banner for staff dashboard roles */}
          <NotificationPermissionBanner
            allowedRoles={['admin', 'dietitian', 'health_counselor']}
          />
          <main className={cn(
            "flex-1 overflow-y-auto",
            isDarkMode && "bg-gray-900",
            className
          )}>
            {children}
          </main>
        </div>
      </div>
    </StaffUnreadCountProvider>
  );
}
