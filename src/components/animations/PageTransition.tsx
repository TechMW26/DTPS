'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export default function PageTransition({ children, className = '' }: PageTransitionProps) {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(false);
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div
      className={`${isVisible ? 'animate-page-enter' : 'opacity-0'} ${className}`}
      style={{
        animation: isVisible ? 'page-enter 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards' : 'none',
      }}
    >
      {children}
    </div>
  );
}
