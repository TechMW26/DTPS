'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { useIsMobile, useIsTablet } from '@/hooks/useMediaQuery';
import { MobileHeader } from '@/components/mobile/MobileHeader';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';
import Sidebar from '@/components/layout/Sidebar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ClientLayoutProps {
  children: ReactNode;
}

// Client routes that should have the responsive layout
const CLIENT_ROUTES = [
  '/client-dashboard',
  '/my-plan',
  '/progress',
  '/appointments',
  '/messages',
  '/billing',
  '/profile',
  '/settings',
  '/fitness',
  '/recipes',
];

// Helper functions
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

const getGreetingEmoji = () => {
  const hour = new Date().getHours();
  if (hour < 12) return '🌅';
  if (hour < 17) return '☀️';
  return '🌙';
};

// Page titles for different routes
const getPageInfo = (pathname: string, session: any) => {
  const firstName = session?.user?.firstName || 'Welcome';

  const routeMap: Record<string, { title: string; subtitle?: string }> = {
    '/client-dashboard': {
      title: firstName,
      subtitle: `${getGreeting()} ${getGreetingEmoji()}`
    },
    '/my-plan': {
      title: 'My Meal Plan',
      subtitle: format(new Date(), 'EEEE, MMM d')
    },
    '/progress': {
      title: 'My Progress',
      subtitle: 'Track your journey'
    },
    '/appointments': {
      title: 'Appointments',
      subtitle: 'Manage your sessions'
    },
    '/messages': {
      title: 'Messages',
      subtitle: 'Chat with your dietitian'
    },
    '/billing': {
      title: 'Billing',
      subtitle: 'Payments & Invoices'
    },
    '/profile': {
      title: 'My Profile',
      subtitle: firstName
    },
    '/settings': {
      title: 'Settings',
      subtitle: 'App preferences'
    },
    '/fitness': {
      title: 'Fitness',
      subtitle: 'Workouts & Activity'
    },
    '/recipes': {
      title: 'Recipes',
      subtitle: 'Healthy meal ideas'
    },
  };

  // Check for exact match first, then prefix match
  if (routeMap[pathname]) {
    return routeMap[pathname];
  }

  // Check for route prefix matches
  for (const route of Object.keys(routeMap)) {
    if (pathname.startsWith(route)) {
      return routeMap[route];
    }
  }

  return { title: 'DTPS Nutrition' };
};

/**
 * ClientLayout - Responsive layout wrapper for client pages
 * 
 * Features:
 * - Mobile: MobileHeader + MobileBottomNav (fixed positions)
 * - Tablet: Collapsible sidebar + content area
 * - Desktop: Full sidebar + content area
 * - Seamless page transitions without full reload
 */
export function ClientLayout({ children }: ClientLayoutProps) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  
  // Use hooks for responsive detection
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  
  // Track mounted state to prevent hydration mismatch
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Only apply to client users
  const isClient = session?.user?.role === 'client';

  // Only apply to client routes
  const isClientRoute = CLIENT_ROUTES.some(route => pathname.startsWith(route));

  // Should use responsive layout
  const shouldUseLayout = isClient && isClientRoute;

  // If not mounted yet, return children to avoid hydration mismatch
  if (!mounted) {
    return <>{children}</>;
  }

  // If not a client or not a client route, just render children
  if (!shouldUseLayout) {
    return <>{children}</>;
  }

  // Get page info for header
  const pageInfo = getPageInfo(pathname, session);

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Fixed Header */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
          <MobileHeader
            title={pageInfo.title}
            subtitle={pageInfo.subtitle}
            showBack={pathname !== '/client-dashboard'}
            showNotification={true}
            showProfile={true}
          />
        </div>

        {/* Scrollable Content Area */}
        <main className="flex-1 pt-19.5 pb-20">
          <div className="p-4">
            {children}
          </div>
        </main>

        {/* Fixed Bottom Navigation */}
        <MobileBottomNav />
      </div>
    );
  }

  // Tablet Layout (Sidebar with auto-collapse on smaller screens)
  if (isTablet) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar - will use its own collapse state */}
        <aside className="fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-40">
          <Sidebar />
        </aside>

        {/* Main Content - margin adjusts based on sidebar collapsed state */}
        <main className="flex-1 min-h-screen ml-16 lg:ml-64 transition-all duration-300">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    );
  }

  // Desktop Layout (Full Sidebar)
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Full Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 z-40">
        <Sidebar />
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 min-h-screen">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

export default ClientLayout;
