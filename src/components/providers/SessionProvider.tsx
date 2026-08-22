'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import { type ReactNode } from 'react';
import { useLogoutNotification } from '@/hooks/useLogoutNotification';

interface SessionProviderProps {
  children: ReactNode;
}

/**
 * Wrapper component for logout notification hook
 * Runs inside SessionProvider so it has access to useSession
 */
function LogoutNotificationListener({ children }: { children: ReactNode }) {
  // This hook will listen for deactivation notifications
  useLogoutNotification();
  return <>{children}</>;
}

export default function SessionProvider({ children }: SessionProviderProps) {
  return (
    <NextAuthSessionProvider
      // A focus refresh rotates the long-lived cookie. Avoid interval polling:
      // NextAuth treats a transient failed poll as an unauthenticated session.
      refetchOnWindowFocus={true}
      refetchInterval={0}
      refetchWhenOffline={false}
    >
      <LogoutNotificationListener>
        {children}
      </LogoutNotificationListener>
    </NextAuthSessionProvider>
  );
}
