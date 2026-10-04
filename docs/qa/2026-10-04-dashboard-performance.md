# Staff dashboard performance verification

## Result

On October 4, the largest dietitian scope contained 6,404 accessible clients. A matched, sequential local comparison of the previous calculation and the optimized calculation measured **25,140 ms versus 7,529 ms**, a 70% reduction. All 23 response fields matched, allowing a tolerance of 0.000001 for the revenue total: aggregation order introduced a difference of 0.0000000298, far below currency precision.

Two separate requests to the locally running production build, with Redis disabled and no retained response cache, took **6,387 ms and 12,175 ms**. These are local measurements against the live Firebase database, not production Vercel latency guarantees. Network/database variability remains material.

## Changes

- Added covering indexes for plan fields, payment fields, and compact client summary fields. Pipeline queries explicitly choose the verified indexes instead of allowing full document scans. One diagnostic query returning 37 plans previously scanned 1.21 GiB; its covering-index equivalent scanned 5.56 KiB.
- Split access-scope queries by primary, secondary, and creator assignment, preserving the original union. Array-contains branches use Core operations because Enterprise does not support forcing those indexes.
- Large scopes (at least 3,000 clients and at least half the client population) use compact summaries. Plan counts and payment aggregates run in Firebase; only expiring plans, recent payments, and required contact details are hydrated.
- Dense reads are bounded; reaching the 50,001-row sentinel falls back to complete scoped queries rather than returning truncated totals. Smaller scopes retain bounded membership queries. Legacy nonnumeric amount types fall back to the previous JavaScript conversion behavior.
- The client-population count is reused within each request to avoid a second billable aggregate query.
- Authorization is read fresh. Server-side filtering applies the exact authorized IDs before returning summary rows or fetching contact details. No result cache was added; overlapping refreshes only share in-flight work.
- Added a pinned Firestore 8.7.1 dependency for Pipeline support while retaining the existing Firebase Admin SDK. Both SDKs remain compatible with the current Node runtime. Timestamp values from the Pipeline SDK are explicitly converted to Dates. The SDK is externalized in Next.js server builds.

The three retained new indexes are recorded in `firestore.native.indexes.json`. A wider profile index created during diagnosis was removed after being superseded by the compact summary index; no pre-existing index was deleted.

## Verification

- 123 database suites / 413 tests passed, plus 9 migration tooling tests.
- TypeScript and the isolated production build passed.
- Before summary changes, a complete record comparison matched 21,931 plans and 6,229 payments with zero field differences.
- The final full-dashboard comparison matched every response field at currency precision.
- Dedicated tests cover authorization filtering, batch limits, concurrency, empty scopes, rejection of incomplete results, dense-read fallback, timestamp conversion, and legacy payment/expiry semantics.
- Git whitespace checks passed. Unrelated staged QA documents and Android build artifacts were preserved.

This change is prepared for GitHub release. The additive Firebase indexes are live and ready. Vercel application deployment must be verified separately. Private diagnostic scripts and logs remain under the ignored `.migration-backups/firebase/native/` directory and are not release artifacts.

Reference: [Firebase Enterprise query optimization](https://firebase.google.com/docs/firestore/enterprise/optimize-query-performance).

## Database structure and cost boundaries

The canonical user, plan, and payment records retain their existing IDs and relationships. Dashboard indexes are read structures over those records, not duplicate writable totals that can drift after an edit or deletion. Large private plan content stays outside summary reads; contact details are fetched only when the response needs them. Financial and allocation writes retain their transaction checks. No customer records are deleted or merged by this optimization.

Index definitions remain versioned in `firestore.native.indexes.json`. Runtime forced-index IDs refer to the verified production database; recreating the database requires resolving and updating these IDs before rollout. Indexes add storage and write-maintenance costs, so only measured query needs justify new covering indexes. The redundant experimental wide profile index was removed. The observed reduction in scanned bytes is evidence of lower read work, not a forecast of the monthly bill.

Remaining limitation: dashboards still calculate fresh scoped totals on demand. The largest account remains several seconds and can exceed ten seconds. Further latency reduction needs measured query tuning or an auditable incrementally maintained summary design with reconciliation, rather than caching potentially stale permissions or silently truncating results.
