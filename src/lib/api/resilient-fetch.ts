export const TRANSIENT_HTTP_STATUSES = new Set([
  408, 425, 429, 500, 502, 503, 504,
]);

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

export type RequestRecoveryPhase =
  "attempting" | "waiting-for-connection" | "retrying" | "recovered";

export interface RequestRecoveryState {
  phase: RequestRecoveryPhase;
  attempt: number;
  maxAttempts: number;
  delayMs?: number;
  reason?: string;
  requestId: string;
}

export interface ResilientFetchPolicy {
  /** Total attempts, including the first request. */
  attempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Required before POST/PATCH requests are replayed. */
  idempotencyKey?: string;
  /** Only enable when the receiving route is independently idempotent. */
  retryUnsafe?: boolean;
  waitForOnlineMs?: number;
  onRecoveryState?: (state: RequestRecoveryState) => void;
}

export interface ApiFailureDiagnosis {
  code:
    | "offline"
    | "timeout"
    | "rate-limited"
    | "authentication"
    | "permission"
    | "validation"
    | "payload-too-large"
    | "conflict"
    | "service-unavailable"
    | "network"
    | "unknown";
  message: string;
  retryable: boolean;
  requestId?: string;
}

export class ResilientRequestError extends Error {
  readonly diagnosis: ApiFailureDiagnosis;
  readonly attempts: number;

  constructor(
    message: string,
    diagnosis: ApiFailureDiagnosis,
    attempts: number,
  ) {
    super(message);
    this.name = "ResilientRequestError";
    this.diagnosis = diagnosis;
    this.attempts = attempts;
  }
}

function createRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timeoutId = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abort);
      reject(
        signal?.reason || new DOMException("Request aborted", "AbortError"),
      );
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function waitForOnline(
  maxWaitMs: number,
  signal?: AbortSignal | null,
): Promise<boolean> {
  if (!isBrowserOffline()) return true;
  if (typeof window === "undefined" || maxWaitMs <= 0) return false;

  return new Promise((resolve, reject) => {
    const finish = (online: boolean) => {
      clearTimeout(timeoutId);
      window.removeEventListener("online", handleOnline);
      signal?.removeEventListener("abort", handleAbort);
      resolve(online);
    };
    const handleOnline = () => finish(true);
    const handleAbort = () => {
      clearTimeout(timeoutId);
      window.removeEventListener("online", handleOnline);
      reject(
        signal?.reason || new DOMException("Request aborted", "AbortError"),
      );
    };
    const timeoutId = setTimeout(() => finish(false), maxWaitMs);
    window.addEventListener("online", handleOnline, { once: true });
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function canReplayBody(body: BodyInit | null | undefined): boolean {
  return !(
    typeof ReadableStream !== "undefined" && body instanceof ReadableStream
  );
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now());
}

function retryDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exponential = Math.min(
    maxDelayMs,
    baseDelayMs * 2 ** Math.max(0, attempt - 1),
  );
  return Math.round(exponential * (0.8 + Math.random() * 0.4));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

export function diagnoseApiFailure(input: {
  response?: Response;
  error?: unknown;
  requestId?: string;
}): ApiFailureDiagnosis {
  const status = input.response?.status;
  const requestId =
    input.response?.headers.get("x-request-id") || input.requestId;

  if (isBrowserOffline()) {
    return {
      code: "offline",
      message:
        "You are offline. Your work is safe and will sync when the connection returns.",
      retryable: true,
      requestId,
    };
  }
  if (isTimeoutError(input.error) || isAbortError(input.error)) {
    return {
      code: "timeout",
      message: "The server took too long to respond. Please try again.",
      retryable: true,
      requestId,
    };
  }
  if (status === 401) {
    return {
      code: "authentication",
      message:
        "Your session could not be verified. Refresh the page and try again.",
      retryable: false,
      requestId,
    };
  }
  if (status === 403) {
    return {
      code: "permission",
      message: "You do not have permission to save this change.",
      retryable: false,
      requestId,
    };
  }
  if (status === 409) {
    return {
      code: "conflict",
      message: "This record changed elsewhere. Refresh it before saving again.",
      retryable: false,
      requestId,
    };
  }
  if (status === 413) {
    return {
      code: "payload-too-large",
      message:
        "This file or update is too large. Reduce its size and try again.",
      retryable: false,
      requestId,
    };
  }
  if (status === 429) {
    return {
      code: "rate-limited",
      message: "The service is busy. The request was retried automatically.",
      retryable: true,
      requestId,
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: "validation",
      message:
        "Some information is invalid. Review the highlighted fields and try again.",
      retryable: false,
      requestId,
    };
  }
  if (status && status >= 500) {
    return {
      code: "service-unavailable",
      message:
        "The service is temporarily unavailable. The request was retried automatically.",
      retryable: true,
      requestId,
    };
  }
  if (input.error instanceof TypeError || input.error instanceof Error) {
    return {
      code: "network",
      message:
        "The network request failed. Check your connection and try again.",
      retryable: true,
      requestId,
    };
  }
  return {
    code: "unknown",
    message: "The request could not be completed.",
    retryable: false,
    requestId,
  };
}

export async function readApiError(
  response: Response,
  fallback?: string,
): Promise<string> {
  try {
    const data = (await response.clone().json()) as {
      error?: string;
      message?: string;
    };
    return (
      data.message ||
      data.error ||
      fallback ||
      diagnoseApiFailure({ response }).message
    );
  } catch {
    return fallback || diagnoseApiFailure({ response }).message;
  }
}

export async function resilientFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  policy: ResilientFetchPolicy = {},
): Promise<Response> {
  const method = String(
    init.method || (input instanceof Request ? input.method : "GET"),
  ).toUpperCase();
  const requestId = createRequestId();
  const requestedAttempts = Math.max(1, policy.attempts ?? 3);
  const headers = new Headers(init.headers);
  const idempotencyKey =
    policy.idempotencyKey || headers.get("x-idempotency-key") || undefined;
  const replayAllowed =
    IDEMPOTENT_METHODS.has(method) ||
    Boolean(policy.retryUnsafe) ||
    Boolean(idempotencyKey);
  const maxAttempts =
    replayAllowed && canReplayBody(init.body) ? requestedAttempts : 1;
  const timeoutMs = Math.max(1_000, policy.timeoutMs ?? 30_000);
  const baseDelayMs = Math.max(50, policy.baseDelayMs ?? 500);
  const maxDelayMs = Math.max(baseDelayMs, policy.maxDelayMs ?? 8_000);
  const waitForOnlineMs = Math.max(0, policy.waitForOnlineMs ?? 10_000);
  if (!headers.has("x-request-id")) headers.set("x-request-id", requestId);
  // This request already has a complete retry policy. Mark it so the global
  // fetch interceptor does not wrap each attempt in another retry loop.
  headers.set("x-dtps-retry-managed", "1");
  if (idempotencyKey && !headers.has("x-idempotency-key")) {
    headers.set("x-idempotency-key", idempotencyKey);
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (isBrowserOffline()) {
      policy.onRecoveryState?.({
        phase: "waiting-for-connection",
        attempt,
        maxAttempts,
        reason: "offline",
        requestId,
      });
      await waitForOnline(waitForOnlineMs, init.signal);
    }

    policy.onRecoveryState?.({
      phase: "attempting",
      attempt,
      maxAttempts,
      requestId,
    });
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(init.signal?.reason);
    init.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("Request timed out", "TimeoutError"));
    }, timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        headers,
        signal: controller.signal,
      });
      if (
        !TRANSIENT_HTTP_STATUSES.has(response.status) ||
        attempt >= maxAttempts
      ) {
        if (attempt > 1 && response.ok) {
          policy.onRecoveryState?.({
            phase: "recovered",
            attempt,
            maxAttempts,
            requestId,
          });
        }
        return response;
      }

      const delayMs = Math.min(
        maxDelayMs,
        parseRetryAfter(response.headers.get("retry-after")) ??
          retryDelay(attempt, baseDelayMs, maxDelayMs),
      );
      policy.onRecoveryState?.({
        phase: "retrying",
        attempt,
        maxAttempts,
        delayMs,
        reason: `http-${response.status}`,
        requestId,
      });
      await sleep(delayMs, init.signal);
    } catch (error) {
      lastError = timedOut
        ? new DOMException("Request timed out", "TimeoutError")
        : error;
      if (init.signal?.aborted) throw error;
      if (attempt >= maxAttempts) break;

      const delayMs = retryDelay(attempt, baseDelayMs, maxDelayMs);
      policy.onRecoveryState?.({
        phase: isBrowserOffline() ? "waiting-for-connection" : "retrying",
        attempt,
        maxAttempts,
        delayMs,
        reason: timedOut ? "timeout" : "network",
        requestId,
      });
      if (isBrowserOffline()) await waitForOnline(waitForOnlineMs, init.signal);
      else await sleep(delayMs, init.signal);
    } finally {
      clearTimeout(timeoutId);
      init.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  const diagnosis = diagnoseApiFailure({ error: lastError, requestId });
  throw new ResilientRequestError(diagnosis.message, diagnosis, maxAttempts);
}
