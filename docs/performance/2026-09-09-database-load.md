# Database load and plan workflow release

## Changes

- User-directory metadata now uses one covered aggregation for role counts and the latest numeric client ID, replacing four counts plus a scan/sort. Concurrent metadata requests share only their in-flight operation. Settled results are not cached.
- Status-filtered directory requests first read minimal identity/hold fields, calculate current status from purchases, and fetch full profiles and assignment names for the requested page only. Listing clients no longer launches one background write per stale status; the existing payment/hold lifecycle services remain responsible for persistence.
- Ordinary page queries, total counts, and metadata queries run concurrently. Page sizes are capped at 500; invalid/zero/negative pagination is rejected. Existing role scoping is preserved and tested. The dietitian projection no longer mixes exclusion and inclusion fields, which caused a MongoDB error.
- Daily meal-plan reads load a template only when needed for the legacy fallback. Published daily meals no longer trigger a full template query.
- Pending-plan collection avoids a repeated scan of all previously collected clients. Critical urgency sorts first, including its zero-valued priority.
- Unused freeze dates return to the shared purchase allowance when unfrozen, and valid paid programs remain pending even if their previous completed phase is more than 30 days old. Regression coverage includes the prior plan-workflow reports.

## Index rollout

Three additive, non-unique indexes were created successfully in the configured database; 16 existing performance indexes were left in place:

- `users`: `{ role: 1, clientId: 1 }`
- `clientmealplans`: `{ purchaseId: 1 }`
- `unifiedpayments`: `{ paymentLink: 1, client: 1 }`

The schema declarations and `npm run db:indexes` include these indexes. No indexes or customer records were deleted.

## Measurements

Read-only query-plan inspection on 9 September 2026:

| Query / data path | Before | After |
| --- | --- | --- |
| Representative purchase-to-phases lookup | 26,693 documents examined, collection scan | 1 document / 1 index key examined |
| Representative payment-link lookup | 7,759 documents examined, collection scan | 1 document / 1 index key examined |
| Directory metadata | Five queries; latest-ID query examined 9,528 full documents | One covered aggregation; zero full documents examined, approximately 9,657 index keys |
| Status-filter candidate data for 9,528 clients | 18,316,151 BSON bytes of full profiles | 474,464 BSON bytes of minimal records, plus full profiles for the selected page |
| Simultaneous same-key read burst in regression test | Independent calls would execute 50 fetches | 1 fetch for 50 overlapping calls; next settled read fetches fresh data |
| Published meal plan with a template reference | Template populated on every read | No template read unless fallback is needed |

BSON measurements describe candidate-record data, not the entire HTTP response. Query-plan samples are not an end-to-end load test. Execution times vary with database traffic and warm caches, so document/key counts are the primary evidence.

## Operational limits

Computed-status filtering still scans minimal candidate records and associated purchase dates. It does not turn every filter into an indexed status lookup. In-flight coalescing is per application instance and applies only to the global non-record directory summary; it is not a distributed cache. System-wide throughput under peak traffic still needs a representative load test.

The private case-by-case email review remains a local task artifact and is not part of this source release. Test fixtures contain synthetic clients.

## Release validation

- 154 integration tests passed across 22 relevant suites; the two suites affected by final type guards also passed again (7 tests).
- Production build and TypeScript validation passed.
- Targeted ESLint reported no errors (existing warnings remain).
- Git whitespace validation passed.
