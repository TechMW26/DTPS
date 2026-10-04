# Persistent dashboard aggregate summaries

This optional path reuses active-plan client IDs and payment status totals across
Vercel instances. It does not cache authorization, client profiles, schedules,
expiring-plan cards or recent-payment details. Current access scopes are resolved
before lookup and included in each cache key. It applies to the existing indexed
summary paths; other paths continue their current calculations.

## Consistency contract

Firestore change events invalidate by collection. They are asynchronous and can
be duplicated or out of order. Receipts make repeated delivery idempotent. A late
event invalidates again rather than applying an old delta. A revision check in a
transaction prevents storing a calculation across an observed invalidation.

A cache hit can be up to 30 seconds old, including when delivery is delayed or a
trigger is unavailable. This is **bounded-staleness caching**, not synchronously
maintained counters or a zero-staleness guarantee. After expiry the next request
computes live data. Missing revision state, malformed payloads, cache read errors,
cache write errors, and oversized results preserve live calculation behavior.
Live calculation errors still fail the request rather than serve expired data.

The switch `FIRESTORE_DASHBOARD_SUMMARIES_ENABLED=true` is OFF by default. It has
not been added to local/live environment files. No backfill or source-data change
is needed. A revision appears after the first relevant event; until then that
collection continues live calculations.

## Local verification

Install the isolated function dependencies with `npm ci --prefix
functions/dashboard-summaries`. Run Firestore and Functions with
`firebase.dashboard-summaries.local.json` and the `demo-dtps-native` project, using
`tools/firebase-migration/test-summary-triggers.cjs` as the emulators:exec script.
The script rejects non-emulator execution and verifies both collections' create,
update, and delete events. The function switches to the default database only
when FUNCTIONS_EMULATOR is true and rejects non-demo emulator project events.

`tests/database/persistent-dashboard-summary.test.ts` exercises durable reuse,
expiry, duplicate/out-of-order events, concurrent duplicate delivery, scope keys,
invalidation during calculation and failures through the Firestore emulator.

## Production activation sequence (not performed)

1. Verify the `dtps-2cbac` database's location and the configured function region
   (`asia-south1`) are appropriate. The production trigger database is explicitly
   `dtps-native-staging`; do not deploy against `(default)`.
2. Deploy only the dashboard-summaries functions codebase using
   `firebase.dashboard-summaries.json`. Verify both deployed trigger filters,
   retry behavior and event delivery before enabling application reuse.
3. Enable TTL on `expiresAt` for `_nativeDashboardSummaries` and
   `_nativeDashboardEvents`. Exempt `payload` and TTL fields from unnecessary
   single-field indexing. Do not replace the existing application index manifest.
4. Confirm the invalidation revisions advance for existing authorized test
   mutations, then enable the flag in a preview environment and compare totals
   against live calculations. Measure query reductions and function/receipt costs.
5. Enable production only after that verification. Disable the flag to immediately
   return to live calculations; no source-data rollback is required.

Each relevant event adds a receipt and revision write plus transaction reads.
Each cache lookup reads its revision and cached summary; a miss also computes and
stores the aggregate. Thus this primarily benefits repeat reads and is not an
unconditional cost reduction for write-heavy or rarely visited dashboards.

Reference: https://firebase.google.com/docs/functions/firestore-events
