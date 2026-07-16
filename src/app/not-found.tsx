import Link from 'next/link';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800">Calorie Tracker</h2>
        </div>

        {/* Plate Image with Fork and Spoon */}
        <div className="flex justify-center mb-8">
          <div className="relative w-72 h-56 bg-amber-100 rounded-2xl flex items-center justify-center overflow-hidden">
            {/* Plate */}
            <div className="relative">
              {/* Outer plate */}
              <div className="w-40 h-40 bg-white rounded-full shadow-lg flex items-center justify-center">
                {/* Inner plate ring */}
                <div className="w-32 h-32 border-4 border-amber-200 rounded-full flex items-center justify-center">
                  {/* Food stain circle */}
                  <div className="w-24 h-24 border-4 border-amber-300 rounded-full"></div>
                </div>
              </div>
              {/* Fork */}
              <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-6 h-32 flex flex-col items-center">
                <div className="w-1 h-10 bg-amber-600 rounded-t-full"></div>
                <div className="flex gap-0.5">
                  <div className="w-0.5 h-6 bg-amber-600"></div>
                  <div className="w-0.5 h-6 bg-amber-600"></div>
                  <div className="w-0.5 h-6 bg-amber-600"></div>
                  <div className="w-0.5 h-6 bg-amber-600"></div>
                </div>
                <div className="w-2 h-16 bg-amber-600 rounded-b-full"></div>
              </div>
              {/* Spoon */}
              <div className="absolute -right-8 top-1/2 -translate-y-1/2 w-6 h-32 flex flex-col items-center">
                <div className="w-6 h-10 bg-amber-600 rounded-t-full"></div>
                <div className="w-2 h-20 bg-amber-600 rounded-b-full"></div>
              </div>
            </div>
          </div>
        </div>

        {/* 404 with cookie icon in middle */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-7xl font-black text-blue-500">4</span>
          {/* Cookie/donut icon */}
          <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center relative">
            <div className="absolute top-2 left-3 w-2 h-2 bg-blue-300 rounded-full"></div>
            <div className="absolute top-4 right-4 w-1.5 h-1.5 bg-blue-300 rounded-full"></div>
            <div className="absolute bottom-3 left-4 w-1.5 h-1.5 bg-blue-300 rounded-full"></div>
            <div className="absolute bottom-4 right-3 w-2 h-2 bg-blue-300 rounded-full"></div>
            <div className="w-4 h-4 bg-white rounded-full"></div>
          </div>
          <span className="text-7xl font-black text-blue-500">4</span>
        </div>

        {/* Error Message */}
        <h1 className="text-2xl font-bold text-gray-800 mb-3">
          Oops! That page is off the menu.
        </h1>
        <p className="text-gray-500 text-base mb-8 px-4">
          We can't seem to find the page you're looking for. It might have been moved, deleted, or eaten by mistake.
        </p>

        {/* Go to Dashboard Button */}
        <Button
          asChild
          className="w-72 h-14 bg-blue-500 hover:bg-blue-600 text-white text-lg font-medium rounded-full shadow-lg mb-4"
        >
          <Link href="/user">
            <Home className="mr-2 h-5 w-5" />
            Go to Dashboard
          </Link>
        </Button>

        {/* Report a Problem Link */}
       
      </div>
    </div>
  );
}
