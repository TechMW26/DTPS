import { TRANSIENT_HTTP_STATUSES } from "@/lib/api/resilient-fetch";

const STORAGE_KEY = "dtps:mutation-outbox:v1";
const OUTBOX_EVENT = "dtps:mutation-outbox";
const MAX_ENTRY_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 100;

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
]);

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface MutationOutboxEntry {
  id: string;
  queueKey: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  nextAttemptAt: number;
}

export interface PreparedMutation {
  entry: MutationOutboxEntry;
  init: RequestInit;
}

export interface MutationFlushResult {
  attempted: number;
  synced: number;
  pending: number;
  discarded: number;
}

type OutboxEventPhase = "pending" | "synced";

let flushPromise: Promise<MutationFlushResult> | null = null;

function createOperationId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `mutation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function emitOutboxEvent(
  phase: OutboxEventPhase,
  detail: Partial<MutationOutboxEntry> = {},
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OUTBOX_EVENT, { detail: { phase, ...detail } }),
  );
}

function parseEntries(storage: StorageLike | null): MutationOutboxEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - MAX_ENTRY_AGE_MS;
    return parsed.filter(
      (entry): entry is MutationOutboxEntry =>
        entry &&
        typeof entry.id === "string" &&
        typeof entry.url === "string" &&
        typeof entry.body === "string" &&
        Number(entry.updatedAt) >= cutoff,
    );
  } catch {
    return [];
  }
}

function writeEntries(
  entries: MutationOutboxEntry[],
  storage: StorageLike | null,
): void {
  if (!storage) return;
  try {
    if (entries.length === 0) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch (error) {
    console.warn("[MutationOutbox] Unable to persist recovery payload:", error);
  }
}

function normalizedPathname(url: string): string {
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    return new URL(url, base).pathname;
  } catch {
    return url;
  }
}

function isSameOriginApi(url: string): boolean {
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(url, base);
    return parsed.origin === base && parsed.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function safePostPath(pathname: string): boolean {
  return (
    /^\/api\/users\/[^/]+\/(lifestyle|medical|recall)$/.test(pathname) ||
    pathname === "/api/drafts"
  );
}

function serializableJsonBody(init: RequestInit, headers: Headers): string | null {
  if (typeof init.body !== "string") return null;
  const contentType = headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  try {
    JSON.parse(init.body);
    return init.body;
  } catch {
    return null;
  }
}

function storableHeaders(headers: Headers): Record<string, string> {
  const stored: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (!SENSITIVE_HEADERS.has(key.toLowerCase())) stored[key] = value;
  });
  return stored;
}

function retryDelay(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
}

function isPermanentFailure(status: number): boolean {
  return status >= 300 && !TRANSIENT_HTTP_STATUSES.has(status);
}

function removeEntryIfCurrent(
  entryId: string,
  queueKey: string,
  storage: StorageLike | null,
): boolean {
  const entries = parseEntries(storage);
  const current = entries.find((entry) => entry.queueKey === queueKey);
  if (!current || current.id !== entryId) return false;
  writeEntries(
    entries.filter((entry) => entry.id !== entryId),
    storage,
  );
  return true;
}

export function prepareDurableMutation(
  url: string,
  init: RequestInit,
  storage: StorageLike | null = browserStorage(),
): PreparedMutation | null {
  if (!storage || !isSameOriginApi(url)) return null;

  const method = String(init.method || "GET").toUpperCase();
  if (method !== "PUT" && method !== "PATCH" && method !== "POST") {
    return null;
  }

  const headers = new Headers(init.headers);
  if (headers.get("x-dtps-outbox-replay") === "1") return null;

  const body = serializableJsonBody(init, headers);
  if (body === null) return null;

  const pathname = normalizedPathname(url);
  const explicitDurable = headers.get("x-dtps-durable") === "1";
  const existingIdempotencyKey = headers.get("x-idempotency-key");
  const replaySafe =
    method === "PUT" ||
    method === "PATCH" ||
    explicitDurable ||
    Boolean(existingIdempotencyKey) ||
    safePostPath(pathname);
  if (!replaySafe) return null;

  const operationId =
    headers.get("x-dtps-outbox-id") ||
    existingIdempotencyKey ||
    createOperationId();
  const queueKey =
    headers.get("x-dtps-durable-key") || `${method}:${pathname}`;
  headers.set("x-dtps-outbox-id", operationId);
  if (!headers.has("x-idempotency-key")) {
    headers.set("x-idempotency-key", operationId);
  }

  const entries = parseEntries(storage);
  const previous = entries.find((entry) => entry.queueKey === queueKey);
  const now = Date.now();
  const entry: MutationOutboxEntry = {
    id: operationId,
    queueKey,
    url,
    method,
    headers: storableHeaders(headers),
    body,
    createdAt:
      previous?.id === operationId ? previous.createdAt : now,
    updatedAt: now,
    attempts: previous?.id === operationId ? previous.attempts : 0,
    nextAttemptAt: now,
  };

  writeEntries(
    [...entries.filter((candidate) => candidate.queueKey !== queueKey), entry],
    storage,
  );

  return { entry, init: { ...init, headers } };
}

export function settleDurableMutation(
  entry: MutationOutboxEntry,
  response: Response,
  storage: StorageLike | null = browserStorage(),
): "synced" | "pending" | "discarded" {
  if (response.ok) {
    const removed = removeEntryIfCurrent(entry.id, entry.queueKey, storage);
    if (removed && entry.attempts > 0) emitOutboxEvent("synced", entry);
    return "synced";
  }
  if (isPermanentFailure(response.status)) {
    removeEntryIfCurrent(entry.id, entry.queueKey, storage);
    return "discarded";
  }
  markDurableMutationPending(entry, storage);
  return "pending";
}

export function markDurableMutationPending(
  entry: MutationOutboxEntry,
  storage: StorageLike | null = browserStorage(),
): void {
  const entries = parseEntries(storage);
  const current = entries.find(
    (candidate) =>
      candidate.queueKey === entry.queueKey && candidate.id === entry.id,
  );
  if (!current) return;
  const attempts = current.attempts + 1;
  current.attempts = attempts;
  current.updatedAt = Date.now();
  current.nextAttemptAt = Date.now() + retryDelay(attempts);
  writeEntries(entries, storage);
  emitOutboxEvent("pending", current);
}

export function getMutationOutboxEntries(
  storage: StorageLike | null = browserStorage(),
): MutationOutboxEntry[] {
  return parseEntries(storage);
}

export function clearMutationOutbox(
  storage: StorageLike | null = browserStorage(),
): void {
  writeEntries([], storage);
}

export async function flushMutationOutbox(
  sender: typeof fetch = fetch,
  storage: StorageLike | null = browserStorage(),
): Promise<MutationFlushResult> {
  if (flushPromise) return flushPromise;

  flushPromise = (async () => {
    const result: MutationFlushResult = {
      attempted: 0,
      synced: 0,
      pending: 0,
      discarded: 0,
    };
    const now = Date.now();
    const entries = parseEntries(storage).filter(
      (entry) => entry.nextAttemptAt <= now,
    );

    for (const entry of entries) {
      result.attempted += 1;
      try {
        const headers = new Headers(entry.headers);
        headers.set("x-dtps-outbox-replay", "1");
        const response = await sender(entry.url, {
          method: entry.method,
          headers,
          body: entry.body,
          credentials: "same-origin",
          cache: "no-store",
        });
        const status = settleDurableMutation(entry, response, storage);
        result[status] += 1;
      } catch {
        markDurableMutationPending(entry, storage);
        result.pending += 1;
      }
    }

    return result;
  })().finally(() => {
    flushPromise = null;
  });

  return flushPromise;
}

export const mutationOutboxEventName = OUTBOX_EVENT;
