import { ClientPageSkeleton } from '@/components/ui/skeleton';

export default function Loading() {
  // This fallback renders inside the persistent user shell, so it must not
  // duplicate the app header or reserve space for a second viewport.
  return <ClientPageSkeleton variant="list" showHeader={false} embedded />;
}
