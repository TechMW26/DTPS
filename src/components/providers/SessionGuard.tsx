'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

interface SessionGuardProps {
  children: ReactNode;
  /** Loading component to show while session is being determined */
  fallback?: ReactNode;
  /** Redirect path if user is not authenticated (default: /client-auth/signin) */
  redirectTo?: string;
  /** Role required to access this content (optional) */
  requiredRole?: string;
  /** Allow rendering even if unauthenticated (for partial auth pages) */
  allowUnauthenticated?: boolean;
}

/**
 * Component that guards content until session is confirmed.
 * Prevents race conditions by not rendering children until session status is determined.
 * 
 * Usage:
 * ```tsx
 * <SessionGuard fallback={<LoadingSpinner />}>
 *   <YourPageContent />
 * </SessionGuard>
 * ```
 */
export function SessionGuard({
  children,
  fallback = <DefaultLoadingFallback />,
  redirectTo = '/client-auth/signin',
  requiredRole,
  allowUnauthenticated = false,
}: SessionGuardProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Only redirect after session is determined (not loading)
    if (status === 'loading') return;

    // If unauthenticated and not allowed, redirect
    if (status === 'unauthenticated' && !allowUnauthenticated) {
      router.replace(redirectTo);
      return;
    }

    // If role is required, check it
    if (requiredRole && session?.user?.role !== requiredRole) {
      router.replace(redirectTo);
    }
  }, [status, session, requiredRole, allowUnauthenticated, redirectTo, router]);

  // Show fallback while loading
  if (status === 'loading') {
    return <>{fallback}</>;
  }

  // If unauthenticated and not allowed, show fallback while redirecting
  if (status === 'unauthenticated' && !allowUnauthenticated) {
    return <>{fallback}</>;
  }

  // If role check fails, show fallback while redirecting
  if (requiredRole && session?.user?.role !== requiredRole) {
    return <>{fallback}</>;
  }

  // Session is ready and authorized - render children
  return <>{children}</>;
}

function DefaultLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export default SessionGuard;
