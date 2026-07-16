import { cn } from '@/lib/utils';
import { memo } from 'react';
import Image from 'next/image';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Memoized spinner to prevent unnecessary re-renders - using spoon-loader.gif
export const LoadingSpinner = memo(function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeConfig = {
    sm: { width: 40, height: 60 },
    md: { width: 60, height: 90 },
    lg: { width: 100, height: 150 },
  };

  const { width, height } = sizeConfig[size];

  return (
    <div
      className={cn('flex items-center justify-center', className)}
      role="status"
      aria-label="Loading"
    >
      <Image
        src="/images/spoon-loader.gif"
        alt="Loading..."
        width={width}
        height={height}
        className="object-contain"
        style={{ height: 'auto' }}
        unoptimized
        priority
      />
    </div>
  );
});

// Optimized loading page with fade-in animation
export const LoadingPage = memo(function LoadingPage() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn">
      <div className="text-center">
        <LoadingSpinner size="lg" />
      </div>
    </div>
  );
});

// Optimized skeleton loading with better performance
export const LoadingCard = memo(function LoadingCard() {
  return (
    <div className="animate-pulse animate-fadeIn">
      <div className="bg-gray-200 rounded-lg h-48 w-full"></div>
      <div className="mt-4 space-y-2">
        <div className="bg-gray-200 rounded h-4 w-3/4"></div>
        <div className="bg-gray-200 rounded h-4 w-1/2"></div>
      </div>
    </div>
  );
});

// New: Minimal loading dots for better performance
export const LoadingDots = memo(function LoadingDots({ className }: { className?: string }) {
  return (
    <div className={cn("flex space-x-1", className)} role="status" aria-label="Loading">
      <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
      <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
      <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
    </div>
  );
});
