import type { ReactNode } from 'react';
import { StaffSystemStatus } from '@/components/providers/StaffSystemStatus';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function HealthCounselorLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StaffSystemStatus />
      {children}
    </>
  );
}
