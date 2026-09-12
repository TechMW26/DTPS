type RouteMetric = { requests: number; totalMs: number; maxMs: number; slowRequests: number };
const metrics = new Map<string, RouteMetric>();

export function apiPerformanceSnapshot() {
  return [...metrics].map(([route, value]) => ({ route, ...value, averageMs: Math.round(value.totalMs / value.requests) }));
}

// No request bodies, identifiers, or query strings enter performance logs.
export function measureApi<T extends (...args: any[]) => Promise<Response>>(route: string, handler: T): T {
  return (async (...args: Parameters<T>) => {
    const started = performance.now();
    let status = 500;
    try {
      const response = await handler(...args);
      status = response.status;
      response.headers.append('Server-Timing', `app;dur=${(performance.now() - started).toFixed(1)}`);
      return response;
    } finally {
      const durationMs = Math.round(performance.now() - started);
      const metric = metrics.get(route) || { requests: 0, totalMs: 0, maxMs: 0, slowRequests: 0 };
      metric.requests += 1;
      metric.totalMs += durationMs;
      metric.maxMs = Math.max(metric.maxMs, durationMs);
      if (durationMs >= 1_000) {
        metric.slowRequests += 1;
        console.info('[API_PERFORMANCE]', JSON.stringify({ route, durationMs, status }));
      }
      if (metrics.size < 128 || metrics.has(route)) metrics.set(route, metric);
    }
  }) as T;
}
