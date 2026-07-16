'use client';

import { ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { cn } from '@/lib/utils';
import { useMobileDetection } from '@/hooks/useMobileDetection';
import Image from 'next/image';

interface ClientsLayoutProps {
  children: ReactNode;
  className?: string;
  showSidebar?: boolean;
}

/**
 * Specialized layout for clients dashboard pages
 * Features:
 * - Fixed/sticky header and footer on mobile/PWA only
 * - Normal scrolling behavior on desktop
 * - Persistent across page navigation and refresh
 */
export default function ClientsLayout({
  children,
  className,
  showSidebar = true
}: ClientsLayoutProps) {
  const { data: session, status } = useSession();
  const { isMobile, isPWA } = useMobileDetection();

  // Determine if we should use fixed layout (mobile or PWA)
  const useFixedLayout = isMobile || isPWA;

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Image
          src="/images/spoon-loader.gif"
          alt="Loading..."
          width={150}
          height={225}
          className="object-contain"
          style={{ height: 'auto' }}
          unoptimized
          priority
        />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    redirect('/auth/signin');
  }

  // Mobile/PWA Layout - Fixed header and footer
  if (useFixedLayout) {
    return (
      <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
        {/* Fixed Header */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-white">
          <Navbar />
        </div>

        {/* Main Content - Scrollable */}
        <main className={cn(
          "flex-1 overflow-y-auto",
          "pt-16", // Space for fixed header (h-16 = 4rem = 64px)
          "pb-0", // No bottom padding as content manages its own spacing
          className
        )}>
          {children}
        </main>
      </div>
    );
  }

  // Desktop Layout - Normal scrolling
  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        {showSidebar && (
          <div className="hidden lg:block">
            <Sidebar />
          </div>
        )}
        <main className={cn(
          "flex-1 overflow-y-auto",
          className
        )}>
          {children}
        </main>
      </div>
    </div>
  );
}

