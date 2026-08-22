export const SYSTEM_REFRESH_STORAGE_KEY = "dtps:system-refresh-revision:v1";
export const SYSTEM_REFRESH_BROWSER_EVENT = "dtps:system-refresh-requested";

export interface SystemRefreshPayload {
  revision: number;
  requestedAt: string;
  notBefore: string;
  reason?: string;
}

export function shouldApplySystemRefresh(
  revision: unknown,
  storedRevision: string | null,
): boolean {
  const nextRevision = Number(revision);
  const appliedRevision = Number(storedRevision || 0);

  return (
    Number.isSafeInteger(nextRevision) &&
    nextRevision > 0 &&
    nextRevision > appliedRevision
  );
}
