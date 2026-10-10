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

Local `.env.local` supplies MongoDB credentials. The local preview preserves Firebase authentication/push and Vercel Blob configuration from `.env` / `.env.local`. Never commit credentials.

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

Production uses Vercel, MongoDB Atlas and the existing Vercel Blob stores. The local preview disables push, email, calendar and WhatsApp effects. Database tests use an isolated loopback replica set and cannot use the production database.

Historical migration tools and complete recovery archives are retained privately outside versioned runtime configuration. The source database is no longer an application dependency.

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


## MongoDB operations

The complete source baseline and sealed final change journal were independently verified before the production cutover. Recovery archives and their checksums are retained privately. Current production writes must be reconciled before restoring an older snapshot.

Compact relationship, timestamp, provider-ID and outbox indexes support the shared document repositories. Phone and email indexes are nonunique; customers are never merged by contact details. Only transient realtime events have automatic expiry.

Production requires `DATABASE_PROVIDER=mongodb`, `MONGODB_URI`, `MONGODB_DATABASE` and `MONGODB_PRODUCTION_ENABLED=true`. Blob access independently requires `NATIVE_BLOB_PRODUCTION_ENABLED=true`. Firebase Authentication and Cloud Messaging remain separate services.

Notification outbox jobs are bounded and duplicate-safe. MongoDB change streams deliver realtime updates without per-user database polling. Monitor pool utilization, query plans, outbox lag and provider errors. Reconcile uncertain external deliveries before retrying.
