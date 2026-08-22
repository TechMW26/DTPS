import { authOptions, PERSISTENT_SESSION_MAX_AGE_SECONDS } from '@/lib/auth/config';
import {
  buildCachedSessionResponse,
  LAST_VALID_SESSION_KEY,
  persistSessionPayload,
} from '@/lib/auth/session-recovery';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('persistent client sessions', () => {
  it('uses the maximum practical rolling browser-cookie lifetime', () => {
    expect(PERSISTENT_SESSION_MAX_AGE_SECONDS).toBe(400 * 24 * 60 * 60);
    expect(authOptions.session?.maxAge).toBe(PERSISTENT_SESSION_MAX_AGE_SECONDS);
    expect(authOptions.jwt?.maxAge).toBe(PERSISTENT_SESSION_MAX_AGE_SECONDS);
    expect(authOptions.cookies?.sessionToken?.options.maxAge)
      .toBe(PERSISTENT_SESSION_MAX_AGE_SECONDS);
  });

  it('recovers the last authenticated session during a transient request failure', async () => {
    const storage = new MemoryStorage();
    const session = {
      user: { id: 'client-1', role: 'client' },
      expires: '2099-01-01T00:00:00.000Z',
    };

    persistSessionPayload(storage, session);
    const response = buildCachedSessionResponse(storage);

    expect(response?.status).toBe(200);
    expect(response?.headers.get('X-DTPS-Session-Recovery')).toBe('last-known-good');
    await expect(response?.json()).resolves.toEqual(session);
  });

  it('clears recovery state when the server authoritatively returns no session', () => {
    const storage = new MemoryStorage();
    persistSessionPayload(storage, { user: { id: 'client-1' } });
    persistSessionPayload(storage, null);

    expect(storage.getItem(LAST_VALID_SESSION_KEY)).toBeNull();
    expect(buildCachedSessionResponse(storage)).toBeNull();
  });
});
