'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function ClientAuthPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) =>
        p >= 100 ? 100 : p + Math.floor(Math.random() * 5) + 1
      );
    }, 50);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress >= 100 && mounted) {
      const timer = setTimeout(() => {
        try {
          router.push('/client-auth/signin');
        } catch (error) {
          console.error('Navigation error:', error);
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [progress, router, mounted]);

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-linear-to-br from-[#61a035]/10 via-white to-[#3AB1A0]/10 overflow-hidden">

      {/* Glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-72 h-72 bg-[#61a035]/20 rounded-full blur-3xl" />
      </div>

      {/* ================= CENTER ANIMATION ================= */}
      <div className="relative z-10">
        <div className="pill-container">
          
          {/* Logo Section */}
          <div className="logo-wrapper">
            <img
              src="/images/dtps-logo.png"
              alt="DTPS Logo"
              className="logo-image"
            />
          </div>

          {/* Text Section */}
          <div className="text-wrapper">
            <div className="text-content">DTPS</div>
          </div>

        </div>
      </div>

      {/* ================= LOADER ================= */}
      <div className="absolute w-full max-w-sm px-8 bottom-16">
        <div className="flex justify-between mb-2 text-sm">
          <span className="text-[#E06A26] tracking-widest">LOADING</span>
          <span className="text-[#3AB1A0]">{progress}%</span>
        </div>

        <div className="h-1 overflow-hidden bg-gray-200 rounded-full">
          <div
            className="h-full bg-linear-to-r from-[#61a035] via-[#3AB1A0] to-[#E06A26]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ================= CSS ANIMATION ================= */}
      <style jsx>{`
        /* 
           The Main Pill Container 
           - Flexbox to align Logo and Text side-by-side
           - Rounded corners for pill shape
           - Teal background
        */
        .pill-container {
          display: flex;
          align-items: center;
          background-color: #3BA796;
          border-radius: 9999px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          overflow: hidden;
        }

        /* 
           The Logo Container
           - Z-index to sit on top (visually)
           - Fixed size (80px x 80px)
        */
        .logo-wrapper {
          position: relative;
          z-index: 10;
          width: 5rem;
          height: 5rem;
          border-radius: 9999px;
          overflow: hidden;
          flex-shrink: 0;
          opacity: 0;
          transform: scale(0.5);
          filter: blur(10px);
          animation: popIn 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        /* 
           The Image inside the Logo
           - White background to prevent transparency issues
           - Object fit to cover
        */
        .logo-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center top;
          background-color: white;
          display: block;
        }

        /* 
           The Text Container 
           - Starts with width 0 (hidden)
           - Expands to reveal text
        */
        .text-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          height: 5rem;
          width: 0;
          opacity: 0;
          animation: revealText 0.6s ease-out 0.8s forwards;
        }

        /* The Text Content */
        .text-content {
          padding: 0 2rem;
          white-space: nowrap;
          color: white;
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: 0.1em;
        }

        /* Keyframes for Logo Pop-In */
        @keyframes popIn {
          0% {
            opacity: 0;
            transform: scale(0.5);
            filter: blur(10px);
          }
          100% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0px);
          }
        }

        /* Keyframes for Text Reveal (Width Expansion) */
        @keyframes revealText {
          0% {
            width: 0;
            opacity: 0;
          }
          100% {
            width: 140px;
            opacity: 1;
          }
        }

        /* Responsive Styles (sm breakpoint) */
        @media (min-width: 640px) {
          .logo-wrapper {
            width: 6rem;
            height: 6rem;
          }
          
          .text-wrapper {
            height: 6rem;
          }
          
          .text-content {
            font-size: 1.875rem;
          }

          @keyframes revealText {
            0% {
              width: 0;
              opacity: 0;
            }
            100% {
              width: 180px;
              opacity: 1;
            }
          }
        }
      `}</style>
    </div>
  );
}

export default ClientAuthPage;