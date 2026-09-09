// Share only overlapping reads. Settled results are never retained, so the
// next request sees fresh data without cross-instance invalidation machinery.
const pendingReads = new Map<string, Promise<unknown>>();
const MAX_PENDING_READS = 256;

export function coalesceRead<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const pending = pendingReads.get(key);
  if (pending) return pending as Promise<T>;
  if (pendingReads.size >= MAX_PENDING_READS) return Promise.resolve().then(fetcher);

  const operation = Promise.resolve().then(fetcher).finally(() => {
    if (pendingReads.get(key) === operation) pendingReads.delete(key);
  });
  pendingReads.set(key, operation);
  return operation;
}
