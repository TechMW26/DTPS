'use client';

import { useMediaServiceStatus } from '@/hooks/useMediaServiceStatus';

/**
 * Wrapper component that checks media service status and shows
 * a toast on staff dashboards when the service is degraded.
 */
export function StaffSystemStatus() {
  useMediaServiceStatus(true);
  return null;
}
