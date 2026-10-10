# DTPS — Dietitian & Client Platform

Multi-role health & nutrition platform connecting dietitians, health counselors, and clients with meal planning, messaging, progress tracking, and appointment management.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) · React 19 |
| Styling | Tailwind CSS v4 · shadcn/ui (new-york) |
| Database | MongoDB Atlas |
| Auth | NextAuth v4 (JWT, Credentials + Google) · Firebase Phone Auth (SMS) |
| Realtime | MongoDB change streams + authenticated SSE |
| Media | Vercel Blob |
| Mobile | Native iOS (Swift/WebKit) + Android (Kotlin/WebView) |
| Payments | Razorpay · Stripe |
| Notifications | Firebase Cloud Messaging |
| Monitoring | Sentry |

## Roles

| Role | Web Route | API Route |
|---|---|---|
| Admin | `/admin` | `/api/admin/` |
| Dietitian | `/dietician`, `/dashboard/dietitian` | `/api/dietitian-panel/` |
| Health Counselor | `/health-counselor` | shared |
| Client | `/user` (30+ sub-routes) | `/api/client/` (26 routes) |

## Quick Start

```bash
npm install
npm run dev        # Local MongoDB preview on localhost:3002
npm run test:mongodb:local # Isolated MongoDB replica-set regression suite
npm run test:unit  # Provider-mocked and pure unit tests
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Lint check
```

## Environment

Local `.env.mongodb-migration.local` supplies dedicated MongoDB credentials. The local preview preserves Firebase authentication/push and Vercel Blob configuration from `.env` / `.env.local`. Never commit credentials or put source Firestore credentials into the new deployment.

```
DATABASE_PROVIDER=mongodb
MONGODB_URI=...
MONGODB_DATABASE=dtps
MONGODB_PRODUCTION_ENABLED=true # only after complete import and verification
NATIVE_BLOB_PRODUCTION_ENABLED=true
NATIVE_BLOB_STORE_ID=...
NATIVE_BLOB_READ_WRITE_TOKEN=...
NEXTAUTH_URL=http://localhost:3002
NEXTAUTH_SECRET=...
BLOB_READ_WRITE_TOKEN=...
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
AISENSY_API_KEY=... # WhatsApp fallback only
```

Firebase Authentication must have the Phone provider enabled, `dtps.tech` and
`www.dtps.tech` authorized, and an SMS region policy configured. The client app
uses Firebase SMS first, verifies the Firebase ID token on the server, and uses
the existing AISensy WhatsApp OTP only for eligible Firebase service failures.
Realtime Database is not involved in SMS delivery.

## Local acceptance and deployment

The target runtime is Vercel plus MongoDB Atlas and the existing Vercel Blob store. The migration remains local-only: native database access rejects production execution, and real push, email, calendar, and WhatsApp effects stay disabled locally. Do not deploy until source reconciliation, media verification, and local acceptance are complete.

One-time source audit tools are isolated from application dependencies. Their private runner and backups are kept outside versioned runtime configuration. The app does not load a source database adapter.

## Architecture

- **API:** App Router API routes in `src/app/api/**` — no separate server
- **DB:** `src/lib/db/database.ts` supplies MongoDB through the shared document facade; explicit domain repositories enforce current roles, ownership, idempotency, and transactional state changes.
- **Auth:** JWT carries `role` (UserRole enum), `onboardingCompleted`, `isNewUser`
- **Path alias:** `@/*` → `./src/*`
- **Mobile:** iOS and Android are WebView wrappers loading `https://dtps.tech/user`

## Cross-Platform

See [CROSS_PLATFORM_SYNC.md](./CROSS_PLATFORM_SYNC.md) for mobile sync instructions covering allowed hosts, deep links, notification handling, and pre-release checklists.

## Key Files

| File | Purpose |
|---|---|
| `middleware.ts` | Auth gating, role-based routing |
| `next.config.ts` | Build config, headers, CSP |
| `vercel.json` | Function duration and deployment configuration |
| `src/lib/db/repository/` | Native domain repositories |
| `src/lib/realtime/native-events.ts` | Durable realtime event stream |
| `src/lib/storage/` | Existing Vercel Blob storage and document hydration |
| `src/app/api/` | All API routes |
| `mobile-app/` | iOS and Android native code |

## Naming

| Entity | Convention | Example |
|---|---|---|
| Repository | `native-kebab-case.ts` | `native-plans.ts` |
| API route | `kebab-case/` | `food-logs/` |
| Hook | `use{Feature}` | `useNativeApp` |
| Display ID | `generateShortId()` | `Dt-AB12` |


## MongoDB indexes and migration

See [the migration procedure](tools/mongodb-migration/README.md). `indexes.mjs` provisions compact relationship, timestamp, provider-ID and outbox indexes. It defaults to a dry run. Phone/email indexes are deliberately nonunique; customers are never merged by contact details.

Import every operational record and media reference, then verify every decoded record and collection count against a stable source snapshot. Migration-only historical backups may be excluded with the explicit archive flag while retained in the local recovery copy. Do not delete the source or its recovery files during cutover.

Before enabling production MongoDB, drain source writers and pause application mutations/crons for the final snapshot. Reconcile every document, including deleted paths, before switching credentials. Retain the existing public/private Blob stores and test authorized media retrieval. A local build or passing fixture test does not establish migration completion.

Firestore credentials, deployment rules, indexes and summary-trigger configuration are no longer application runtime configuration. Keep source credentials only in the private one-time exporter until final reconciliation. Firebase Authentication and Cloud Messaging remain separate services.

The production cutover uses `DATABASE_PROVIDER=mongodb`, `MONGODB_URI`, `MONGODB_DATABASE`, and the explicit `MONGODB_PRODUCTION_ENABLED=true` guard. Blob access uses its separate `NATIVE_BLOB_PRODUCTION_ENABLED=true` guard. Do not deploy the Mongo-only application before the target is fully verified.

Notification outbox jobs remain bounded and duplicate-safe. Existing authorization, assignment, medical forms, entitlement, payment and media repository contracts are retained. MongoDB change streams deliver realtime updates without per-user database polling. Monitor pool utilization, query plans, outbox lag and provider errors after cutover. Uncertain external deliveries must be reconciled before retrying.

Rollback requires reconciling writes made after cutover; do not silently replace current data with the older snapshot.
