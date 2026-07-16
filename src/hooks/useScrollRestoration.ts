'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Store scroll positions by path
const scrollPositions: Record<string, number> = {};

export function useScrollRestoration(enabled: boolean = true) {
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled) return;
    // Restore scroll position when component mounts
    const savedPosition = scrollPositions[pathname];
    if (savedPosition !== undefined) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        window.scrollTo(0, savedPosition);
      });
    }

    // Save scroll position before leaving
    const handleBeforeUnload = () => {
      scrollPositions[pathname] = window.scrollY;
    };

    // Save scroll position on scroll (debounced)
    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        scrollPositions[pathname] = window.scrollY;
      }, 100);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      // Save scroll position when component unmounts (navigating away)
      scrollPositions[pathname] = window.scrollY;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [pathname, enabled]);
}

// Export a function to manually save scroll position
export function saveScrollPosition(path: string) {
  scrollPositions[path] = window.scrollY;
}

// Export a function to get saved scroll position
export function getScrollPosition(path: string): number {
  return scrollPositions[path] || 0;
}
