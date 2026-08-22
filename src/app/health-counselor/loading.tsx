import DashboardLayout from '@/components/layout/DashboardLayout';
import { DashboardContentSkeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <DashboardLayout>
      <DashboardContentSkeleton />
    </DashboardLayout>
  );
}
