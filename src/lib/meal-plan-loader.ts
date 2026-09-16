/** Per-screen read coalescing: failures and unpublished days are never cached. */
export function createMealPlanLoader<T extends { hasPlan: boolean }>(cache: Map<string, T>, fetcher: (key: string) => Promise<T>) {
  const pending = new Map<string, Promise<T>>();
  const expires = new Map<string, number>();
  return (key: string): Promise<T> => {
    const cached = cache.get(key);
    if (cached && (expires.get(key) || 0) > Date.now()) return Promise.resolve(cached);
    const existing = pending.get(key);
    if (existing) return existing;
    const request = fetcher(key).then(plan => {
      if (plan.hasPlan) {
        cache.set(key, plan);
        expires.set(key, Date.now() + 30_000);
      } else {
        cache.delete(key);
        expires.delete(key);
      }
      return plan;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
