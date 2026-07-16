'use client';

import React from 'react';
import Image from 'next/image';

interface SpoonLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  text?: string;
  showText?: boolean;
}

export function SpoonLoader({ size = 'md', className = '', text = 'Loading...', showText = true }: SpoonLoaderProps) {
  const sizes = {
    sm: 60,
    md: 100,
    lg: 150,
    xl: 200,
  };
  const px = sizes[size] || sizes.md;

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <div 
        className="relative"
        style={{ width: px, height: px * 1.5 }}
      >
        <Image
          src="/images/spoon-loader.gif"
          alt="Loading..."
          fill
          priority
          unoptimized
          className="object-contain"
        />
      </div>
      {/* {showText && text && (
        <span className="text-[#E06A26] font-medium text-base mt-2">{text}</span>
      )} */}
    </div>
  );
}

// Full screen loader component
export function FullScreenSpoonLoader() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center">
      <SpoonLoader size="lg" />
    </div>
  );
}

export default SpoonLoader;
