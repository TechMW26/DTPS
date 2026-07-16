'use client';

import { useState, useEffect } from 'react';

interface MobileDetectionState {
  isMobile: boolean;
  isPWA: boolean;
  isIOS: boolean;
  isAndroid: boolean;
}

/**
 * Hook to detect if the app is running on mobile device or in PWA mode
 * @returns Object containing mobile detection states
 */
export function useMobileDetection(): MobileDetectionState {
  const [state, setState] = useState<MobileDetectionState>({
    isMobile: false,
    isPWA: false,
    isIOS: false,
    isAndroid: false,
  });

  useEffect(() => {
    const checkMobile = () => {
      return window.innerWidth < 768; // Tailwind's md breakpoint
    };

    const checkPWA = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isIOSPWA = (window.navigator as any).standalone === true;
      return isStandalone || isIOSPWA;
    };

    const checkIOS = () => {
      return /iPad|iPhone|iPod/.test(navigator.userAgent);
    };

    const checkAndroid = () => {
      return /Android/.test(navigator.userAgent);
    };

    const updateState = () => {
      setState({
        isMobile: checkMobile(),
        isPWA: checkPWA(),
        isIOS: checkIOS(),
        isAndroid: checkAndroid(),
      });
    };

    // Initial check
    updateState();

    // Listen for resize events
    window.addEventListener('resize', updateState);

    return () => {
      window.removeEventListener('resize', updateState);
    };
  }, []);

  return state;
}

