export const LAST_VALID_SESSION_KEY = 'dtps:last-valid-session:v1';

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readLastValidSession(storage: SessionStorage): unknown | null {
  try {
    const stored = storage.getItem(LAST_VALID_SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function persistSessionPayload(storage: SessionStorage, payload: unknown): void {
  try {
    const session = payload as { user?: { id?: string } } | null;
    if (session?.user?.id) {
      storage.setItem(LAST_VALID_SESSION_KEY, JSON.stringify(session));
    } else {
      storage.removeItem(LAST_VALID_SESSION_KEY);
    }
  } catch { /* storage may be unavailable in private WebViews */ }
}

export function clearLastValidSession(storage: SessionStorage): void {
  try {
    storage.removeItem(LAST_VALID_SESSION_KEY);
  } catch { /* storage may be unavailable in private WebViews */ }
}

export function buildCachedSessionResponse(storage: SessionStorage): Response | null {
  const cached = readLastValidSession(storage);
  if (!cached) return null;

  return new Response(JSON.stringify(cached), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-DTPS-Session-Recovery': 'last-known-good',
    },
  });
}
