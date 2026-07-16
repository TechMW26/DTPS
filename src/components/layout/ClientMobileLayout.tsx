'use client';

import { ReactNode } from 'react';
import { MobileHeader } from '@/components/mobile/MobileHeader';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';

interface ClientMobileLayoutProps {
  children: ReactNode;
  headerTitle: string;
  headerSubtitle?: string;
  showBack?: boolean;
  showNotification?: boolean;
  showSettings?: boolean;
  rightAction?: ReactNode;
  hideBottomNav?: boolean;
}

/**
 * Layout component for client mobile pages
 * Features:
 * - Fixed header at the top
 * - Fixed bottom navigation at the bottom
 * - Scrollable content area in between
 * - Proper spacing to prevent content from being hidden under fixed elements
 * - Persistent across navigation and refresh
 */
export function ClientMobileLayout({
  children,
  headerTitle,
  headerSubtitle,
  showBack = false,
  showNotification = false,
  showSettings = false,
  rightAction,
  hideBottomNav = false,
}: ClientMobileLayoutProps) {
  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
        <MobileHeader
          title={headerTitle}
          subtitle={headerSubtitle}
          showBack={showBack}
          showNotification={showNotification}
          showSettings={showSettings}
          rightAction={rightAction}
        />
      </div>

      {/* Scrollable Content Area */}
      <main className="flex-1 overflow-y-auto pt-[60px] pb-20">
        {children}
      </main>

      {/* Fixed Bottom Navigation */}
      {!hideBottomNav && <MobileBottomNav />}
    </div>
  );
}

