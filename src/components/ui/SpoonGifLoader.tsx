// SpoonGifLoader.tsx — lightweight CSS-based loader (replaces 267KB GIF)
'use client';

interface SpoonGifLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  showText?: boolean;
}

export default function SpoonGifLoader({ 
  size = 'md', 
  text = 'Loading...', 
  showText = true 
}: SpoonGifLoaderProps) {
  const sizes = {
    sm: 40,
    md: 60,
    lg: 80,
    xl: 100,
  };
  
  const px = sizes[size] || sizes.md;
  const borderWidth = Math.max(3, Math.round(px / 16));
  
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      {/* Animated spoon/plate spinner — pure CSS, < 1KB */}
      <div 
        className="relative flex items-center justify-center"
        style={{ width: px, height: px }}
      >
        {/* Outer spinning ring */}
        <div
          className="absolute inset-0 rounded-full animate-spin"
          style={{
            border: `${borderWidth}px solid #f3e8e0`,
            borderTopColor: '#E06A26',
            animationDuration: '0.8s',
          }}
        />
        {/* Inner pulsing dot */}
        <div 
          className="rounded-full animate-pulse"
          style={{
            width: px * 0.3,
            height: px * 0.3,
            backgroundColor: '#E06A26',
            animationDuration: '1s',
          }}
        />
      </div>
    </div>
  );
}

// Full page centered loader - use this for page loading states
interface FullPageLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isDarkMode?: boolean;
  text?: string;
}

export function FullPageLoader({ size = 'lg', isDarkMode = false, text }: FullPageLoaderProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center ${
        isDarkMode ? 'bg-gray-950' : 'bg-white'
      }`}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999,
      }}
    >
      <SpoonGifLoader size={size} />
      {text && (
        <p className={`mt-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          {text}
        </p>
      )}
    </div>
  );
}
