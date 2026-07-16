'use client';

import { useEffect } from 'react';

/**
 * Hook to prevent body scrolling when a modal/popup is open
 * @param isOpen - Boolean indicating whether the modal is open
 */
export function useBodyScrollLock(isOpen: boolean) {
  useEffect(() => {
    if (isOpen) {
      // Store the original overflow style
      const originalStyle = window.getComputedStyle(document.body).overflow;
      const originalPaddingRight = window.getComputedStyle(document.body).paddingRight;
      
      // Get the scrollbar width to prevent layout shift
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      
      // Disable scrolling
      document.body.style.overflow = 'hidden';
      
      // Add padding to compensate for scrollbar removal (prevents layout shift)
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      
      // Cleanup function to restore original styles
      return () => {
        document.body.style.overflow = originalStyle;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  }, [isOpen]);
}

export default useBodyScrollLock;
