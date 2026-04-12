'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application Error:', error);
  }, [error]);

  const handleRetry = () => {
    try {
      reset();
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-blue-50 via-white to-blue-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-sm w-full text-center">
        {/* Cloud Icon with slash - exactly like the image */}
        <div className="flex justify-center mb-12">
          <div className="relative">
            {/* White circle background */}
            <div className="w-32 h-32 bg-white rounded-full shadow-xl flex items-center justify-center">
              {/* Cloud with slash icon */}
              <svg
                viewBox="0 0 64 64"
                className="w-16 h-16"
                fill="none"
              >
                {/* Cloud shape */}
                <path
                  d="M48 32c0-8.837-7.163-16-16-16-7.071 0-13.065 4.591-15.163 10.949C10.471 27.621 5 33.507 5 40.5 5 48.508 11.716 55 20 55h26c6.627 0 12-5.373 12-12 0-5.879-4.238-10.77-9.829-11.784A15.93 15.93 0 0 0 48 32z"
                  fill="#4285F4"
                />
                {/* Diagonal slash line */}
                <line
                  x1="20"
                  y1="20"
                  x2="48"
                  y2="48"
                  stroke="white"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            {/* Red notification dot */}
            <div className="absolute top-2 right-2 w-4 h-4 bg-red-500 rounded-full"></div>
          </div>
        </div>

        {/* Error Message */}
        <h1 className="text-2xl font-semibold text-gray-800 mb-10">
          Something went wrong.
        </h1>

        {/* Retry Button - exactly like the image */}
        <Button
          onClick={handleRetry}
          className="w-64 h-14 bg-blue-500 hover:bg-blue-600 text-white text-lg font-medium rounded-full shadow-lg"
        >
          <RefreshCw className="mr-2 h-5 w-5" />
          Retry
        </Button>
      </div>
    </div>
  );
}
