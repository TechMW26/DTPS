'use client';

import { memo, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

// Optimized page transition component
export const PageTransition = memo(function PageTransition({ 
  children, 
  className 
}: PageTransitionProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Use requestAnimationFrame for better performance
    const timer = requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => cancelAnimationFrame(timer);
  }, []);

  return (
    <div 
      className={cn(
        'transition-opacity duration-300 ease-out',
        isVisible ? 'opacity-100 animate-slideUp' : 'opacity-0',
        className
      )}
    >
      {children}
    </div>
  );
});

// Lazy loading wrapper for heavy components
export const LazyWrapper = memo(function LazyWrapper({ 
  children, 
  fallback = null 
}: { 
  children: React.ReactNode; 
  fallback?: React.ReactNode; 
}) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (!isLoaded) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
});
