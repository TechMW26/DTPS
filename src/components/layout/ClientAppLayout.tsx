'use client';

import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { ReactNode, useState, useEffect } from 'react';
import { MobileHeader } from '@/components/mobile/MobileHeader';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';
import { format } from 'date-fns';
import { Moon, Sun, Sunrise } from 'lucide-react';

interface ClientAppLayoutProps {
  children: ReactNode;
}

// Client routes that should have the persistent layout
const CLIENT_ROUTES = [
  '/client-dashboard',
  '/progress',
  '/profile',
  '/fitness',
  '/recipes',
  '/messages',
  '/appointments',
  '/settings',
  '/my-plan'
];

// Helper functions
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

const getGreetingIcon = () => {
  const hour = new Date().getHours();
  const Icon = hour < 12 ? Sunrise : hour < 17 ? Sun : Moon;
  return <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />;
};

// Page titles for different routes
const getPageInfo = (pathname: string, session: any) => {
  const firstName = session?.user?.firstName || 'Welcome';

  switch (pathname) {
    case '/client-dashboard':
      return {
        title: firstName,
        subtitle: getGreeting(),
        subtitleIcon: getGreetingIcon(),
      };
    case '/progress':
      return {
        title: 'Progress Tracking',
        subtitle: getGreeting(),
        subtitleIcon: getGreetingIcon(),
      };
    case '/profile':
      return {
        title: 'Profile',
        subtitle: `${firstName}`
      };
    default:
      return { title: 'DTPS Nutrition' };
  }
};

/**
 * Client App Layout - Provides persistent header and footer for client pages
 * Only renders for client users on client routes
 * Prevents full page refresh by keeping header/footer mounted
 */
export function ClientAppLayout({ children }: ClientAppLayoutProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile on client side
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Only apply to client users
  const isClient = session?.user?.role === 'client';

  // Only apply to client routes
  const isClientRoute = CLIENT_ROUTES.some(route => pathname.startsWith(route));

  // Only apply on mobile
  const shouldUseLayout = isClient && isClientRoute && isMobile;

  if (!shouldUseLayout) {
    return <>{children}</>;
  }

  // Get page info
  const pageInfo = getPageInfo(pathname, session);

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
        <MobileHeader
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
          subtitleIcon={pageInfo.subtitleIcon}
          showBack={false}
          showNotification={true}
          showProfile={true}
        />
      </div>

      {/* Scrollable Content Area */}
      <main className="flex-1 overflow-y-auto pt-19.5 pb-20">
        <div className="p-4">
          {children}
        </div>
      </main>

      {/* Fixed Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}
