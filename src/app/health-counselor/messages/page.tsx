'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useRealtime } from '@/hooks/useRealtime';

// Import the desktop version for messages
const DesktopMessagesPage = dynamic(() => import('@/app/messages/page-old-desktop'), { ssr: false });

function HealthCounselorMessagesContent() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    // Verify user is health counselor
    if (session.user.role !== 'health_counselor') {
      router.push('/auth/signin');
      return;
    }
  }, [session, status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  // Use the desktop messages page for health counselors (same as dietitians)
  return <DesktopMessagesPage />;
}

export default function HealthCounselorMessagesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    }>
      <HealthCounselorMessagesContent />
    </Suspense>
  );
}
