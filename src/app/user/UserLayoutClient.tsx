'use client';

import { ReactNode, useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import BottomNavBar from '@/components/client/BottomNavBar';
import UserSidebar from '@/components/client/UserSidebar';
import SpoonGifLoader, { FullPageLoader } from '@/components/ui/SpoonGifLoader';
import { Menu, Bell } from 'lucide-react';
import { UnreadCountProvider, useUnreadCountsSafe } from '@/contexts/UnreadCountContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import PageTransition from '@/components/animations/PageTransition';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';

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
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  const redirectingRef = useRef(false);
  const [sessionTimedOut, setSessionTimedOut] = useState(false);

  // Enable scroll restoration
  useScrollRestoration(!pathname.startsWith('/user/recipes'));

  useEffect(() => {
    setMounted(true);
  }, []);

  // Session loading timeout — don't show FullPageLoader forever
  // On WebViews, useSession can get stuck in 'loading' state if cookies are flaky
  useEffect(() => {
    if (status !== 'loading') {
      setSessionTimedOut(false);
      return;
    }
    const timeout = setTimeout(() => {
      setSessionTimedOut(true);
    }, 4000); // 4s max for session resolution

    return () => clearTimeout(timeout);
  }, [status]);

  // Redirect if not authenticated (in effect to avoid navigation flooding)
  useEffect(() => {
    if (!mounted) return;
    // If session timed out, redirect to sign in
    if (sessionTimedOut && status === 'loading') {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      router.replace('/client-auth/signin');
      return;
    }
    if (status !== 'unauthenticated') return;
    if (redirectingRef.current) return;

    redirectingRef.current = true;
    router.replace('/client-auth/signin');
  }, [mounted, status, router, sessionTimedOut]);

  // Handle route changes - show loader only after delay
  useEffect(() => {
    if (pathname !== prevPathname) {
      setPrevPathname(pathname);
      setIsNavigating(true);
      setSidebarOpen(false);
      setShowLoader(false);

      // Delay showing loader by 400ms - if page loads fast, no loader shown
      const loaderTimer = setTimeout(() => {
        if (isNavigating) {
          setShowLoader(true);
        }
      }, 400);

      // Content is ready after a short delay for smooth transition
      const contentTimer = setTimeout(() => {
        setIsNavigating(false);
        setShowLoader(false);
      }, 150);

      return () => {
        clearTimeout(loaderTimer);
        clearTimeout(contentTimer);
      };
    }
  }, [pathname]);

  // Check if current page should show navigation
  const showNavigation = !PAGES_WITHOUT_NAV.some(page => pathname.startsWith(page));

  // Show loading state only on initial mount, not on route changes
  // Cap at 4s to avoid infinite loader on WebViews with flaky cookies
  if (!mounted || (status === 'loading' && !sessionTimedOut)) {
    return <FullPageLoader size="lg" text="Loading..." />;
  }

  // Redirect if not authenticated - use replace to avoid back button issues
  if (status === 'unauthenticated') {
    return <FullPageLoader size="lg" />;
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
          showLoader={showLoader}
          isNavigating={isNavigating}
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
  showLoader,
  isNavigating
}: {
  children: ReactNode;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  showLoader: boolean;
  isNavigating: boolean;
}) {
  const { counts } = useUnreadCountsSafe();
  const { isDarkMode } = useTheme();

  return (
    <div className={`relative flex flex-col min-h-screen transition-colors duration-500 ${isDarkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
      {/* Sidebar — self-contained overlay (handles its own backdrop + positioning) */}
      <UserSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Navigation Loader - OUTSIDE main, true viewport center */}
      {showLoader && isNavigating && (
        <FullPageLoader size="lg" isDarkMode={isDarkMode} />
      )}

      {/* Main Content Area - this is what reloads on route change */}
      <main className="flex-1 pb-20">
        {/* Mobile Header */}
        <div className={`sticky top-0 z-40 flex items-center justify-between px-4 py-3 transition-colors duration-300 ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} border-b shadow-sm`}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 transition-all duration-150 rounded-lg hover:bg-gray-100 active:scale-95"
          >
            <Menu className={`w-6 h-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
          </button>
          <div className="flex items-center gap-2">
            <Image
              src="/images/dtps-logo.png"
              alt="DTPS"
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="text-lg font-bold text-[#E06A26]">DTPS</span>
          </div>
          {/* Bell Notification Icon */}
          <Link
            href="/user/notifications"
            className="relative p-2 transition-all duration-150 rounded-lg hover:bg-gray-100 active:scale-95"
          >
            <Bell className={`w-6 h-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
            {counts.notifications > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
                {counts.notifications > 99 ? '99+' : counts.notifications}
              </span>
            )}
          </Link>
        </div>

        {/* Page Content */}
        <div className="min-h-[calc(100vh-140px)]">
          <div className={`transition-opacity duration-300 ${isNavigating ? 'opacity-50' : 'opacity-100'}`}>
            {children}
          </div>
        </div>
      </main>

      {/* Bottom Navigation - always visible on mobile, persists across route changes */}
      <div className="fixed bottom-0 left-0 right-0 z-30">
        <BottomNavBar />
      </div>
    </div>
  );
}
