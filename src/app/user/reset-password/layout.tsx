import { ReactNode } from 'react';

interface ResetPasswordLayoutProps {
  children: ReactNode;
}

/**
 * Reset Password Layout - No authentication required
 * This layout overrides the parent user layout for password reset flow
 */
export default function ResetPasswordLayout({ children }: ResetPasswordLayoutProps) {
  return <>{children}</>;
}
