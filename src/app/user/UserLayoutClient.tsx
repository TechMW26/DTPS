'use client';

import { ReactNode, useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import BottomNavBar from '@/components/client/BottomNavBar';
import UserSidebar from '@/components/client/UserSidebar';
import { ClientPageSkeleton } from '@/components/ui/skeleton';
import { Menu, Bell } from 'lucide-react';
import { UnreadCountProvider, useUnreadCountsSafe } from '@/contexts/UnreadCountContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';
import { NotificationPermissionBanner } from '@/components/notifications/NotificationPermissionBanner';

interface UserLayoutClientProps {
  children: ReactNode;
}

// Pages that should NOT show the navigation (like onboarding)
const PAGES_WITHOUT_NAV = ['/user/onboarding'];

/**
 * UserLayoutClient - Client-side layout wrapper for user pages
 * 
 * This component provides:
 * - Persistent navigation (doesn't reload on route change)
 * - Smooth page transition animations
 * - Only the center content reloads
 * - Sidebar for desktop/tablet
 * - Bottom navigation for mobile
 */
export default function UserLayoutClient({ children }: UserLayoutClientProps) {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const redirectingRef = useRef(false);

  // Enable scroll restoration
  useScrollRestoration(!pathname.startsWith('/user/recipes'));

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect if not authenticated (in effect to avoid navigation flooding)
  useEffect(() => {
    if (!mounted) return;
    if (status !== 'unauthenticated') return;
    if (redirectingRef.current) return;

    redirectingRef.current = true;
    router.replace('/client-auth/signin');
  }, [mounted, status, router]);

  // Close the drawer after navigation. Route-level loading files handle slow
  // transitions without dimming content that is already interactive.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Check if current page should show navigation
  const showNavigation = !PAGES_WITHOUT_NAV.some(page => pathname.startsWith(page));

  // Show loading state only on initial mount, not on route changes
  if (!mounted || status === 'loading') {
    return <ClientPageSkeleton variant="home" />;
  }

  // Redirect if not authenticated - use replace to avoid back button issues
  if (status === 'unauthenticated') {
    return <ClientPageSkeleton variant="home" />;
  }

  // If navigation should be hidden (e.g., onboarding), still wrap in ThemeProvider
  if (!showNavigation) {
    return (
      <ThemeProvider>
        <UnreadCountProvider>
          {children}
        </UnreadCountProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <UnreadCountProvider>
        <UserLayoutContent
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        >
          {children}
        </UserLayoutContent>
      </UnreadCountProvider>
    </ThemeProvider>
  );
}

// Inner component that uses the UnreadCount context
function UserLayoutContent({
  children,
  sidebarOpen,
  setSidebarOpen,
}: {
  children: ReactNode;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}) {
  const { counts } = useUnreadCountsSafe();
  const { isDarkMode } = useTheme();
  const pathname = usePathname();

  const showAppHeader = pathname === '/user';

  return (
    <div className={`relative flex min-h-screen w-full flex-col overflow-x-clip transition-colors duration-300 ${isDarkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
      <NotificationPermissionBanner allowedRoles={['client']} />

      {/* Sidebar — self-contained overlay (handles its own backdrop + positioning) */}
      <UserSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area - this is what reloads on route change */}
      <main className="client-content-safe-bottom min-w-0 flex-1">
        {/* Mobile Header */}
        {showAppHeader && <div className={`client-header-safe-top sticky top-0 z-40 flex min-h-14 items-center justify-between border-b px-4 py-2 transition-colors duration-300 ${isDarkMode ? 'bg-gray-900/95 border-gray-800' : 'bg-white/95 border-gray-100'} shadow-sm backdrop-blur`}>
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
            className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-150 active:scale-95 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
          >
            <Menu className={`w-6 h-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
          </button>
          <div className="flex items-center gap-2">
            <Image
              src="/images/dtps-logo.png"
              alt="DTPS"
              width={28}
              height={28}
              className="h-7 w-auto object-contain"
            />
            <span className="text-lg font-bold text-[#E06A26]">DTPS</span>
          </div>
          {/* Bell Notification Icon */}
          <Link
            href="/user/notifications"
            aria-label="Open notifications"
            className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-150 active:scale-95 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
          >
            <Bell className={`w-6 h-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
            {counts.notifications > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
                {counts.notifications > 99 ? '99+' : counts.notifications}
              </span>
            )}
          </Link>
        </div>}

        {/* Page Content */}
        <div
          key={pathname}
          className="client-route-transition mx-auto min-h-[calc(100dvh-8rem)] w-full max-w-7xl"
        >
          {children}
        </div>
      </main>

      {/* Bottom Navigation - always visible on mobile, persists across route changes */}
      <BottomNavBar />
    </div>
  );
}
