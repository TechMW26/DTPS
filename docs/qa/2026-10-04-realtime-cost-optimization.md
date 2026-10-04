# Realtime request and database cost reduction

## Changes

- While the authenticated SSE connection is healthy, the shared polling service skips its redundant 30-second presence POST. The SSE endpoint already updates presence on connection and every 30 seconds. The fallback POST resumes when disconnected. Call signaling polling is unchanged.
- System-refresh checks pause in hidden/offline tabs, resume through existing activation events, and do not overlap a slow request. Realtime system-refresh events remain subscribed.
- Presence authorization fetches only the fields used by `canSendNativeMessage`, with fresh reads on each request. Realtime actor checks similarly fetch only role, status, and deletion state.
- The online-presence query results are reused within that request instead of reading the same allowed presence records a second time. Explicit-ID requests still fetch current presence directly. Typing and presence fetches run concurrently after authorization.

## Expected cost effect and limits

The duplicate heartbeat removal eliminates two HTTP requests per minute (120 per connected tab-hour while this poller is mounted), together with their server-side session/actor checks and presence writes. This is a deterministic request-count reduction, not a claimed percentage reduction in the total bill. Hidden-tab refresh checks previously ran every two minutes; those timer-triggered requests are now skipped. Indexes, cron frequencies, notification delivery, and data retention are unchanged.

Projection reduces transferred payload; it does not by itself establish a particular Firestore billing reduction. Reusing already-fetched presence rows eliminates actual duplicate database operations. There is no shared authorization cache. Revoking a staff assignment takes effect on the next request.

## Validation

- Five shared-polling tests pass, including connected/disconnected heartbeat behavior, signal delivery, hidden tabs, and overlapping consumers.
- Two system-refresh UI tests pass for hidden/offline behavior and request coalescing.
- Six emulator database tests pass for audience isolation, revoked accounts/assignments, secondary assignments, and duplicate presence-read prevention. The local runner also passes nine migration utility tests.
- TypeScript and production build validation are recorded in local test logs.

No production latency comparison or billing-report comparison has been performed for these changes. Local request-count tests do not prove a production deployment.

## References

- https://firebase.google.com/docs/firestore/enterprise/optimize-query-performance
- https://firebase.google.com/docs/firestore/enterprise/pricing
- https://vercel.com/docs/pricing/manage-and-optimize-usage

## Client-list follow-up

The advanced My Clients filter path now reuses its already-loaded plan rows for the visible page and reuses computed statuses when a status filter is active. Reuse lasts only for the request, so later requests recheck current data and assignments. Payments are grouped by client once before plan-name matching, replacing a full payment-array scan for each client; per-client plan grouping also avoids repeated array copying.

A synthetic filtered-list regression verifies purchase-name matching, exact pagination totals, deleted-plan exclusion, and visible plan details. With two clients and one page row, the path issues one `clientmealplans` query instead of two and one `unifiedpayments` query instead of three. Larger scopes still require bounded batches; this does not remove the need to read candidates for arbitrary substring searches. Ten emulator workflow/support tests and TypeScript pass. No new indexes or persistent caches were added.

## Broader bottleneck pass

- The staff search payment projection now includes the status-computation fields, allowing search and status filtering to use the same read. Directory status batching uses continuous bounded workers, deduplicated IDs, and the existing client relationship index.
- Client-list plan metadata reads use the existing covering index, including drafts and history. Large scopes use a bounded dense scan only when covering at least half the client population; results are filtered to authorized IDs, and reaching the row sentinel falls back to complete scoped reads. No new indexes are required.
- Group-chat fallback polling, staff notifications, staff-detail fallback refreshes, and client weight refreshes pause while hidden/offline, resume on activation, coalesce simultaneous focus/visibility events, and avoid overlapping scheduled refreshes. Explicit user actions and realtime subscriptions remain separate.
- All 53 UI tests passed, including three foreground polling tests. Read-only full-response comparisons use the largest dietitian scope and a combined search/status filter; no customer records are modified by the harness.

Arbitrary substring search still needs to evaluate candidate user, plan, and purchase metadata to preserve current matching semantics. It is not an indexed exact lookup. A dedicated search read model would require synchronization across all writers and an audited backfill before replacing this behavior. These changes do not claim every production bottleneck has been eliminated.

### Final measured result

A sequential read-only comparison on October 4, 2026 using the largest dietitian account and `search=weight&status=active&limit=20` measured the prior implementation at **27,672 ms** and the final implementation at **13,231 ms** (about 52% faster). The entire response matched, including 1,495 matching clients and the same 20 page rows. This is a local measurement against Firebase, not a Vercel latency guarantee. Independent plan/payment reads now overlap with bounded worker pools; queues no longer wait for every request in a wave to finish before starting the next batch.

Validation: the full database run passed 124 suites / 418 tests; all 53 UI tests passed; 17 focused database tests were rerun after the final read-path edits. The isolated production build passed with TypeScript checks. The database runner reported an open-handle warning but exited successfully. Source whitespace checks passed. Changes remain local and have not been pushed or deployed.

## Selective search and editor loading follow-up

For name-only searches (optionally combined with client status), Firebase now filters plan-name substrings using the existing covering index before returning metadata. Legacy non-string names pass through to the original JavaScript conversion/filtering. The final application predicate and authorized client-ID scope remain authoritative. Complete plan summaries are fetched only for the displayed page, preserving last-diet and program dates even when the matching name belongs to a purchase. Date, plan-status, and sharing filters retain the full-plan path. This still scans index entries; it is not a new full-text search index.

Candidate users now project only names, search fields when needed, role/hold status, and applicable assignment-date fields. Assignment arrays, tags, and full hold objects are fetched with the page profiles rather than for every candidate. Large payment/status scopes use bounded Pipeline membership batches (300 IDs, at most three RPCs); small lists retain Core queries. Directory payment fields are not fully covered by the dashboard index, so these still fetch primary payment records. No extra indexes or denormalized data were introduced.

The optional diet-plan editor is loaded through Next.js dynamic import with an accessible loading placeholder, reducing eager editor loading on planning views. Build manifests confirm separate editor chunks; no numeric browser bundle-speed claim is made.

The final sequential reference comparison measured **25,476 ms versus 6,393 ms**, approximately **75% faster**, with an identical full response (1,495 matches and the same 20 displayed rows). An earlier selective-query run measured 29,981 ms versus 8,552 ms; network/database variation remains visible. Tests: 22 focused database tests and all 53 UI tests passed, followed by a separate projection/hold/date regression run. Production build and TypeScript checks passed. These remain local changes, not a production release or billing comparison.

## Typing, unread counts, and visible dashboard tasks

Typing updates now consolidate keystroke bursts, renew active indicators at most once every four seconds, serialize a stop after any pending start, and cancel queued work when the session changes. Both connected and disconnected paths send the endpoint's required `receiverId`; the previous disconnected fallback sent `conversationId` instead. A 100-keystroke test produces one start request. Failed requests remain retryable. Server authorization is unchanged.

Staff unread refreshes count only messages, avoiding the unused notification aggregation. Simultaneous refreshes for the same account share one count and broadcast; subsequent refreshes remain fresh and different accounts remain isolated. Dashboard summaries hydrate client details only for the ten displayed tasks after cancelling/filtering/sorting, rather than every returned task.

Validation: all 56 UI tests and nine focused database tests passed, including recipient-specific unread counts, overlapping refreshes, account isolation, unauthenticated rejection, typing renewal, stop ordering, retries, and disposal. TypeScript passed. A read-only largest-dashboard comparison returned matching values across 23 fields (revenue tolerance 1e-6): reference 18,699 ms, optimized 8,190 ms. This compares the cumulative local optimizations with the reference, not the marginal benefit of task hydration alone. No production latency or billing reduction is claimed. Changes remain local.

The isolated production build also completed successfully after these changes. The database runner emitted its existing open-handle warning and exited with code 0.

## Dashboard read reuse follow-up

Dashboard appointment summaries reuse the schedule already loaded for today's response to derive total, confirmed and pending counts. This removes three aggregation requests per refresh for both dietitians and health counselors without loading additional appointment records. Historical/future counts still use database aggregations. The task query now runs alongside independent summaries, and displayed task clients join the same deduplicated hydration request. Health-counselor summary responses hydrate only their ten recent clients, because they do not return birthday, expiry, payment-detail or task cards.

The design follows Firebase's guidance that aggregation work scales with index entries matched; no dollar savings are inferred from request counts: https://firebase.google.com/docs/firestore/query-data/aggregation-queries . Persistent counters and a dedicated substring search index remain separate work requiring complete writer synchronization and migration validation.

Twelve focused database tests passed. New regressions assert three remaining appointment count requests, exact schedule counts, exclusion of other staff appointments, deduplication of dual dietitian/health-counselor assignments, and task ordering/cancellation/limit behavior. Read-only largest-dashboard comparison matched all 23 fields (revenue tolerance 1e-6), measuring 26,315 ms reference versus 6,431 ms optimized. These figures compare cumulative changes, not just this pass, and remain local measurements against Firebase. Source whitespace checks passed. No production records were changed and nothing was pushed or deployed.

The production build and its TypeScript validation completed successfully after correcting a test-only optional-property type assertion.

## Selective summary queries

Plan/payment summary helpers now accept whether the dashboard displays detail cards. Health-counselor responses request totals only: eligible scopes skip the expiring-plan, recent-payment and expired-payment queries. Small totals-only scopes (up to 300 authorized IDs) use scoped distinct/aggregate queries instead of transferring all records. Dense summaries retain the existing verified scope policy. Empty scopes return without opening a database connection. Legacy string payment amounts retain the full-row numeric-conversion fallback; later requests still read current data.

An initial attempt also used aggregates for small detail dashboards. Read-only checks showed more requests and no speed benefit, so that branch was removed. Small dashboards that need records keep their original row-query path. Sixteen focused tests passed, including exact scope membership, empty scopes, defaults, legacy amounts, and confirmation that small detail dashboards do not add aggregate requests.

Read-only reference comparisons matched all checked output fields: health counselor 3,070 ms versus 2,701 ms (16 fields); small dietitian 1,058 ms versus 1,309 ms (23 fields). Timings include cumulative local changes and network variation. The small-account result is slower; no speedup is claimed for it. Production billing was not measured. No persistent counters or dedicated search index were introduced: synchronizing all mutation paths remains outstanding. No production records were written and no changes were pushed/deployed.

## Persistent aggregate cache implementation

Implemented an opt-in Firestore-backed cache for the existing indexed active-plan
IDs and payment-group aggregations. Keys include the fresh authorized client IDs.
Detailed client records and schedules remain live. Gen-2 Firestore triggers cover
all creates/updates/deletes to clientmealplans and unifiedpayments regardless of
which application repository wrote them. Event receipts are idempotent; late
out-of-order events invalidate rather than applying deltas. A transactional
revision check prevents saving across observed invalidation. Maximum reuse is 30
seconds, so delayed event delivery implies bounded staleness, not strict real-time
consistency. No source records were changed.

Validation: 23 focused tests passed; actual Functions + Firestore emulator delivery
passed all six create/update/delete cases; production build and TypeScript passed.
The isolated functions dependency tree reports zero npm audit vulnerabilities.
The new deployment config and activation/TTL/rollback steps are documented in
functions/dashboard-summaries/README.md. The feature flag remains off; triggers,
TTL policies and Vercel configuration have not been deployed. There is no claim
of a live speedup or billing reduction from this new cache yet. Dedicated search
and fully incremental write-time counters remain separate work.
