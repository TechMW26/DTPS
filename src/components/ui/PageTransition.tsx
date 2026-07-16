'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * PageTransition - Adds smooth animation when page content changes
 * Uses CSS animations for better performance
 */
export default function PageTransition({ children, className = '' }: PageTransitionProps) {
  const pathname = usePathname();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // When pathname changes, trigger animation
    setIsAnimating(true);
    
    // Small delay to allow exit animation before changing content
    const timer = setTimeout(() => {
      setDisplayChildren(children);
      setIsAnimating(false);
    }, 50);

    return () => clearTimeout(timer);
  }, [pathname, children]);

  return (
    <div 
      className={`
        ${className}
        ${isAnimating ? 'opacity-0' : 'animate-page-enter'}
        transition-opacity duration-150
      `}
    >
      {displayChildren}
    </div>
  );
}

/**
 * AnimatedCard - Wrapper for cards with staggered entrance animation
 */
export function AnimatedCard({ 
  children, 
  index = 0, 
  className = '' 
}: { 
  children: ReactNode; 
  index?: number; 
  className?: string; 
}) {
  const staggerClass = index <= 5 ? `animate-stagger-${index + 1}` : 'animate-stagger-6';
  
  return (
    <div className={`${staggerClass} ${className}`}>
      {children}
    </div>
  );
}

/**
 * SlideInPanel - For sidebars and slide-out panels
 */
export function SlideInPanel({ 
  children, 
  isOpen, 
  direction = 'left',
  onClose,
  className = '' 
}: { 
  children: ReactNode; 
  isOpen: boolean;
  direction?: 'left' | 'right' | 'bottom';
  onClose?: () => void;
  className?: string;
}) {
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
    } else {
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  const slideClasses = {
    left: isOpen ? 'animate-slide-in-left' : 'animate-slide-out-left',
    right: isOpen ? 'animate-slide-in-right' : 'animate-slide-out-left',
    bottom: isOpen ? 'animate-slide-in-bottom' : 'animate-slide-out-bottom',
  };

  return (
    <>
      {/* Overlay */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 ${isOpen ? 'animate-overlay-fade-in' : 'opacity-0'}`}
        onClick={onClose}
      />
      {/* Panel */}
      <div className={`fixed z-50 ${slideClasses[direction]} ${className}`}>
        {children}
      </div>
    </>
  );
}

/**
 * FadeIn - Simple fade-in wrapper
 */
export function FadeIn({ 
  children, 
  delay = 0,
  className = '' 
}: { 
  children: ReactNode; 
  delay?: number;
  className?: string;
}) {
  return (
    <div 
      className={`animate-fadeIn ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/**
 * ScaleIn - Scale and fade in animation
 */
export function ScaleIn({ 
  children, 
  className = '' 
}: { 
  children: ReactNode; 
  className?: string;
}) {
  return (
    <div className={`animate-scale-fade-in ${className}`}>
      {children}
    </div>
  );
}
