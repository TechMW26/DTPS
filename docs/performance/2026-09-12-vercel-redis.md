# DTPS performance work — 12 September 2026

## Production evidence before the change

Vercel Observability, production, trailing 12 hours:

| Route / metric | Observed value |
| --- | ---: |
| All function invocations | 787,000 |
| `/api/webrtc/signal` | 327,000 |
| `/api/realtime/status` | 81,000 |
| `/api/progress` | 47,000 |
| `/api/client/notifications` | 44,000 |
| `/api/client/meal-plan` | 30,000 |
| `/api/admin/system-refresh` | 24,000 |
| Cold starts | <0.1% |
| Active CPU p75 | 11 ms |
| CPU throttle p75 | 20.3% |

Fluid Compute was already enabled. The deployed region was already `bom1`
(Mumbai); the project-level fallback setting was `iad1`. The repository's explicit
Mumbai region remains authoritative. No paid Vercel upgrade was applied.

Two authenticated Chrome recipe-list loads had response-header times of 885 ms
and 611 ms. These are individual browser measurements, not a fleet percentile.
The available Observability view did not expose numeric p75 request durations;
aggregate active CPU time must not be mistaken for individual request latency.

A read-only MongoDB sample of 100 active meal plans transferred 2,327,679 BSON
bytes with full documents, versus 11,662 bytes using the service-plan summary
projection: a 99.5% reduction for this lookup, not the whole API response.
A recipe-list explain examined 25 documents for 25 results in 3 ms: that query
already had a suitable index. All 21 checked performance indexes, including the
signaling TTL and recipient indexes, already existed.

## Changes

- Share one signaling poll and presence heartbeat per authenticated browser tab.
  Previously each `useRealtime` consumer started both. Five mounted consumers
  made up to 245 idle signaling reads/minute; the deterministic test now makes
  13, with two shared heartbeats. Message screens and call negotiation retain
  1.25-second fallback polling; other visible idle screens use 5 seconds, or
  15 seconds when the socket is connected. Hidden/offline tabs pause signaling;
  focus/visibility/network recovery resumes it. Requests never overlap, have
  abort deadlines, back off on failure, and stop after the last subscriber leaves.
- Keep durable Mongo signaling and the existing recipient authorization. Remove
  the redundant global expiry delete from every signal POST; TTL cleanup and the
  GET expiry filter already enforce expiry. Defer notification/socket imports
  to POST, and skip local SocketManager startup on Vercel.
- Fetch client assignment, purchases, and active-plan summary concurrently.
  Exclude diet contents and tracking data from the active-plan summary lookup.
- Execute appointment list/count and recipe filter/count queries concurrently.
- Add an opt-in Redis JSON cache for recipe search results and directory summary
  counts. The old general `withCache` remains disabled: enabling it globally
  would cache authorization lookups and mutable Mongoose documents unsafely.
- Cache keys include the effective recipe query, authenticated role/user, and all
  request parameters. Patient data, payment windows, permissions, sessions and
  clinical records are not added to Redis. Model writes invalidate versioned
  catalog keys across instances. Generation keys isolate reads racing a write.
  Cache entries expire after at most 30 seconds and are capped at 512 KB.
  Direct collection/bulk import operations may bypass model middleware; TTL is
  the upper bound on stale entries after those operations or invalidation failure.
- Redis connections are reused, require TLS certificate verification, warm
  without delaying the first read, and disable offline command queues/retries.
  Ready-connection operations have a 150 ms deadline and a 30-second outage
  circuit breaker. Cache failure returns to the database; failed loads are never
  cached. The cache is disabled when `REDIS_URL` is absent.
- Attach MongoDB pools to Vercel's Fluid lifecycle, release idle sockets after
  10 seconds, retain a 10-connection maximum per Vercel instance, and use native
  Atlas SRV/TXT discovery on Vercel. Keep the DNS workaround for local development.
- Use reproducible `npm ci --legacy-peer-deps` installations.
- Add `Server-Timing: app;dur=...` to nine busy/expensive GET routes and sanitized
  `[API_PERFORMANCE]` logs for requests taking at least one second. Log route
  templates, duration and status only, never query strings, credentials or data.

## Redis activation and operations

The Redis Cloud setup was prepared in Chrome as `dtps-production-cache`, AWS
Mumbai, Essentials 250 MB (125 MB dataset + replica), 1,000 ops/sec, 256 maximum
connections, quoted at $9/month plus applicable taxes. Provisioning requires the
account owner to complete the subscription/payment step; preparing the form is
not evidence that a database exists.

After provisioning:

1. Enable TLS and use the server-verified `rediss://` connection URI. Download
   the Redis Cloud CA bundle and set `REDIS_CA_PEM` if its issuer is not already
   publicly trusted. The free Redis Cloud tier does not support TLS and is not
   suitable for this production connection.
2. Set `REDIS_URL` as a sensitive production Vercel environment variable. Never
   place it in `NEXT_PUBLIC_*`, source files, logs, or this report. Keep preview
   credentials separate. Keys are namespaced by Vercel environment.
3. Deploy and check authenticated admin `/api/admin/performance` twice: the first
   request may warm the connection, the second must return `redis.ping: true`.
4. Exercise a recipe search twice and confirm cached reads, then edit a test
   recipe and verify invalidation. Monitor Redis memory, evictions, latency and
   connections against the chosen plan; a 250 MB plan is not unlimited capacity.
5. Set `REDIS_CACHE_ENABLED=false` and redeploy for a cache-only rollback.

The admin diagnostics endpoint exposes per-instance counters only; it does not
claim to aggregate the entire Vercel fleet. Vercel request logs provide the
cross-instance slow-request view. Production traffic must be observed after
release before claiming a fleet-wide latency or cost reduction.

References: [Vercel pool lifecycle guidance](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute),
[Redis Node connection guidance](https://redis.io/docs/latest/develop/clients/nodejs/connect/).

## Validation

62 focused tests passed across 12 suites: shared polling, call delivery, Redis
connection deadlines/circuit recovery, scoped JSON caching, actual model-write
invalidation, recipe visibility, service-plan/payment display, directory reads,
appointments and diagnostics authorization. Production compilation and TypeScript
checks passed. Targeted ESLint reported no errors (85 existing/style warnings).
`git diff --check` passed. `npm run db:indexes` confirmed all 21 indexes existed;
no index or customer-record changes were needed for this release.

## Follow-up from live timing verification

The first release exposed ~729 ms of server work for the admin recipe list.
The numeric-UUID sorting branch was loading all matching recipes, sorting in
Node.js, and slicing only afterward. It now sorts projected IDs inside MongoDB,
applies skip/limit, and joins full documents only for that page. Stable `_id`
ties and legacy leading-decimal UUID behavior are preserved.

A paired read-only database check on the production catalog measured:

| Numeric recipe listing | Before | After |
| --- | ---: | ---: |
| Full documents returned to application | 4,656 | 25 |
| BSON bytes returned | 9,328,333 | 43,321 |
| Local query + transfer + decode wall time | 1,861 ms | 107 ms |

These measurements are a single paired database read, not an end-user latency
percentile or a guaranteed speedup. Three focused suites (11 tests) passed for
numeric sorting, ascending/descending pages, tie handling, visibility filters,
recipe integrity and cache invalidation. The existing API response shape is kept.
