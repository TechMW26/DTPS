# Payment Flow Optimization Report (2026-04-14)

## Scope
This report documents the fixes applied to:
- Payment section reliability and status consistency
- Planning section meal-plan eligibility after payment
- Paid-vs-expired false state regressions
- End-to-end validation using Jest + Supertest

## 1) Payment Process Map (All Entry Paths)

### A. Razorpay payment link flow
1. Payment link is created via `POST /api/payment-links`.
2. Link is shared to the client and paid externally via Razorpay.
3. Payment completion can be captured by:
   - `POST /api/payment-links/webhook` (primary async source), or
   - `POST /api/payment-links/verify` (callback verification), or
   - `POST /api/payment-links/sync` (manual/repair sync), or
   - `GET /api/client-purchases/check?forceSync=true` / default pending sync behavior.
4. Unified purchase record is upserted in `UnifiedPayment` using `syncRazorpayPayment`.
5. Planning eligibility is computed via `GET /api/client-purchases/check`.
6. Planning UI (`PlanningSection`) enables `Create New Plan` when remaining paid days exist.

### B. Backfill flow (when paid link exists but purchase row is missing)
1. `GET /api/client-purchases` and `GET /api/client-purchases/check` inspect paid `PaymentLink` rows.
2. Missing `UnifiedPayment` rows are backfilled with normalized duration and plan metadata.
3. Eligibility is recalculated from effective purchased days vs consumed days.

### C. Other platform payment flow
1. Manual/off-platform entries are merged into unified purchase views.
2. Payment rows are displayed alongside payment-link rows in Payments UI.
3. Planning eligibility relies on paid purchase records (unified model), not just raw link status text.

## 2) Root Issues Found
- Some links could remain in stale non-paid statuses despite payment proof fields.
- Expiry updates could incorrectly mark rows expired when payment evidence was present.
- Duration parsing inconsistencies (`1 Month`, `2 Weeks`, etc.) reduced remaining-day accuracy.
- Planning refresh could lag behind payment updates.
- Planning create action was blocked when expected dates were missing, even after valid payment.

## 3) Fixes Applied

### API hardening
- `src/app/api/payment-links/route.ts`
  - Added paid reconciliation that treats payment proof (`paidAt`, `razorpayPaymentId`, `transactionId`) as authoritative.
  - Scoped reconciliation to client when `clientId` is provided for faster and safer updates.
  - Strengthened expiry update to skip links with any payment evidence.
  - Preserved `paid` status precedence over expired/cancelled transitions.

- `src/app/api/client-purchases/check/route.ts`
  - Added payment-proof healing pass before sync to auto-convert stale links to `paid`.
  - Included `expired` links in sync candidates to recover false-expired records.
  - Unified duration parsing and effective-day calculations.
  - Backfills missing unified purchase rows from paid links.

- `src/app/api/client-purchases/route.ts`
  - Normalized duration parsing for month/week/year labels.
  - Maintains fresh reads and no-store behavior for client-scoped requests.

### Frontend behavior fixes
- `src/components/clientDashboard/PaymentsSection.tsx`
  - Added canonical display status resolution using `resolvePaymentStatus` with linked purchase evidence.
  - Ensures UI shows `paid` when payment proof exists, preventing stale expired/pending badges.
  - Kept payment + purchase refresh synced on realtime payment events.

- `src/components/clientDashboard/PlanningSection.tsx`
  - Added no-store payment checks.
  - Subscribed to realtime payment events for immediate eligibility refresh.
  - Allows entering plan creation flow after payment even if expected dates are not yet set (shows informational toast instead of hard block).

## 4) Test Coverage Added (Jest + Supertest)

### New integration tests
- `tests/integration/payment-flow-supertest.integration.test.ts`

Test cases:
1. Reconciles paid-proof link to `paid` in `GET /api/payment-links`.
2. Backfills paid payment link into `UnifiedPayment` and enables planning in `GET /api/client-purchases/check`.
3. Preserves `paid` priority when unified payment is paid but link is stale expired.

### Supertest route harness
- `tests/utils/supertest-route.ts`

### Jest compatibility shim
- `tests/mocks/formidable.js`
- `jest.config.js` moduleNameMapper updated for `formidable` test safety.

## 5) Executed Validation Commands

1. Focused Supertest payment flow suite:
- `npm test -- --runTestsByPath tests/integration/payment-flow-supertest.integration.test.ts --coverage=false`
- Result: **PASS (3/3)**

2. Existing payment regression suites:
- `npm test -- --runTestsByPath tests/integration/payment-status-priority.integration.test.ts tests/integration/payment-webhook-protection.integration.test.ts --coverage=false`
- Result: **PASS (12/12)**

## 6) Outcome Summary
- Payment section now consistently prioritizes paid evidence over stale expired/pending states.
- Planning section updates faster and allows meal-plan creation flow after valid payment.
- Duration parsing is normalized, reducing false “expired/used up” interpretations.
- Jest + Supertest coverage now validates critical payment-to-planning paths and regressions.
