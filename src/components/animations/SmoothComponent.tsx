'use client';

import { ReactNode } from 'react';

interface SmoothComponentProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  animation?: 'fade-in' | 'slide-up' | 'scale-fade' | 'slide-left' | 'card-enter' | 'none';
}

export default function SmoothComponent({
  children,
  className = '',
  delay = 0,
  animation = 'fade-in',
}: SmoothComponentProps) {
  const animationMap = {
    'fade-in': 'animate-fadeIn',
    'slide-up': 'animate-slide-up',
    'scale-fade': 'animate-scale-fade-in',
    'slide-left': 'animate-slide-in-left',
    'card-enter': 'animate-card-enter',
    'none': '',
  };

  return (
    <div
      className={`${animationMap[animation]} ${className}`}
      style={{
        animationDelay: delay ? `${delay}ms` : undefined,
      }}
    >
      {children}
    </div>
  );
}
