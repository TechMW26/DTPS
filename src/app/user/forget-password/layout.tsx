import { ReactNode } from 'react';

interface ForgetPasswordLayoutProps {
  children: ReactNode;
}

/**
 * Forget Password Layout - No authentication required
 * This layout overrides the parent user layout for password reset flow
 */
export default function ForgetPasswordLayout({ children }: ForgetPasswordLayoutProps) {
  return <>{children}</>;
}
