# DTPS — Dietitian & Client Platform

Multi-role health & nutrition platform connecting dietitians, health counselors, and clients with meal planning, messaging, progress tracking, and appointment management.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) · React 19 |
| Styling | Tailwind CSS v4 · shadcn/ui (new-york) |
| Database | Native Cloud Firestore |
| Auth | NextAuth v4 (JWT, Credentials + Google) · Firebase Phone Auth (SMS) |
| Realtime | Firestore events + authenticated SSE |
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
npm run dev        # Local native staging preview on localhost:3002
npm run test:firebase:local # Firestore emulator regression suite
npm run test:unit  # Provider-mocked and pure unit tests
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Lint check
```

## Environment

Local `.env` / `.env.local` must configure the dedicated native staging database separately from the Firebase push project. Never place source-database credentials in the app environment:

```
FIRESTORE_NATIVE_PROJECT_ID=...
FIRESTORE_NATIVE_DATABASE_ID=dtps-native-staging
FIRESTORE_NATIVE_CLIENT_EMAIL=...
FIRESTORE_NATIVE_PRIVATE_KEY=...
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

The target runtime is Vercel plus native Firestore and the existing Vercel Blob store. The migration remains local-only: native database access rejects production execution, and real push, email, calendar, and WhatsApp effects stay disabled locally. Do not deploy until source reconciliation, media verification, and local acceptance are complete.

One-time source audit tools are isolated from application dependencies. Their private runner and backups are kept outside versioned runtime configuration. The app does not load a source database adapter.

## Architecture

- **API:** App Router API routes in `src/app/api/**` — no separate server
- **DB:** `src/lib/db/firestore-native.ts` supplies native Firestore; explicit domain repositories enforce current roles, ownership, idempotency, and transactional state changes.
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


## Native database indexes

Firestore Enterprise Native does not create indexes automatically. `firestore.native.indexes.json` defines the indexes used by the application for client plans, templates, recipes, users, payments, messaging, notifications, tasks, appointments, and the outbox.

Inspect their state with `node tools/firebase-migration/ensure-native-indexes.mjs`. To create missing indexes in the isolated staging database, run `node tools/firebase-migration/ensure-native-indexes.mjs --execute --use-cli-account` with an authorized Firebase CLI account. The tool is additive, never deletes indexes, and rejects production or any database other than `dtps-native-staging`. Wait for every index to report `READY` before measuring performance. A later production cutover must provision and verify the same index definitions through a separately authorized process.

Template summary metadata and creator enrichment are reused for 30 seconds within each server process. Authorization is checked on every request, mutations invalidate the metadata snapshot, and failed enrichment requests are not retained.

## Native migration acceptance and later cutover

Local acceptance does not activate production. Keep the source database available until the final reconciliation and media reports are verified. All source reads run in the isolated private migration runner; its credentials do not belong in the application environment.

Before an explicitly authorized cutover:

1. Pause source writes, finish the journal reconciliation, and record its stable watermark. Refresh conversation, push-token ownership, and media reference indexes against that same watermark. Check the readback reports, including the additive legacy-upload references. Preserve the source snapshot and journal for rollback.
2. Verify copied Blob bytes and document hydration. Keep confirmed missing source files in the exception report instead of inventing replacements. Test current-user and assigned-staff media access, revoked references, and range/download responses using the existing Blob store.
3. Select the intended production native database and explicitly review the staging-only guards in `src/lib/db/firestore-native.ts` and `src/lib/storage/migration-blob-storage.ts`. Set `FIRESTORE_NATIVE_PRODUCTION_ENABLED=true` only for the accepted cutover. Production private storage uses `NATIVE_BLOB_STORE_ID` and `NATIVE_BLOB_READ_WRITE_TOKEN` for the existing private store; the public `BLOB_*` configuration remains separate. The database retains its original migration name to avoid copying verified data again. Keep database service-account credentials separate from FCM sender credentials. Configure the existing Blob store credentials and a server-only `CRON_SECRET` in the deployment environment.
4. The prepared Vercel cron configuration runs notification outbox processing every minute and transient cleanup every five minutes. Vercel authenticates these requests with `Authorization: Bearer <CRON_SECRET>`. Both endpoints remain disabled locally. Production native access requires `FIRESTORE_NATIVE_PRODUCTION_ENABLED=true` with the verified `dtps-2cbac / dtps-native-staging` database. The local configuration edit does not deploy or activate these schedules. The existing meal-engagement schedule remains every minute.
5. Outbox processing selects at most 50 jobs per invocation with eight concurrent jobs; transient cleanup removes at most 100 expired records per collection per invocation. Monitor oldest pending jobs, expired backlog, provider errors and `uncertain` delivery outcomes. Tune capacity from observed load. Never automatically retry uncertain external effects: reconcile provider outcomes first to avoid duplicate messages or calendar changes.
6. After explicit release authorization, verify deployment health and perform controlled real-device push/chat/meal reminders, email and calendar acceptance. Mocked providers and emulator tests establish application behavior but do not establish actual delivery or provider account configuration. No real provider sends occur during local migration acceptance.

Keep the production source application unchanged until these release steps are separately authorized. Rollback must restore the prior application and reconcile writes made after cutover; it cannot be implemented by silently discarding native changes.
