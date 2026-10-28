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
FEEDBACK_CONFIRM_SECRET=... # shared secret for the Google Apps Script feedback webhook
FEEDBACK_TOKEN_SECRET=... # optional; signs feedback form tokens (falls back to NEXTAUTH_SECRET)
DTPS_FEEDBACK_TOKEN_ENTRY_ID=... # Google Forms entry ID for the pretoken short-answer question
```

Firebase Authentication must have the Phone provider enabled, `dtps.tech` and
`www.dtps.tech` authorized, and an SMS region policy configured. The client app
uses Firebase SMS first, verifies the Firebase ID token on the server, and uses
the existing AISensy WhatsApp OTP only for eligible Firebase service failures.
Realtime Database is not involved in SMS delivery.

## Client feedback (Google Forms)

Client feedback is collected through two Google Forms rather than an in-app form.
Eligibility is evaluated server-side in `src/lib/feedback/eligibility.ts` and exposed
at `GET /api/user/feedback/eligibility`.

| Stage | Condition | Action |
|---|---|---|
| `eligible_recurring` | Always (from day 1), no Form 2 in cooldown | Open Form 2 (recurring feedback) |
| `cooldown` | `< 30 × 24h` since the last Form 2 submission | Show remaining time |

Onboarding feedback (Form 1) is available from day 1 and can be completed once per
account lifetime, surfaced under **My Profile → Onboarding feedback**.

### How a submission is recorded

The Google Forms are not modified, so the click on **"Open feedback form"** is the
signal. Opening it starts a server-side 2-minute window
(`FEEDBACK_OPEN_LOCK_DELAY_MS`) via `POST /api/user/feedback` (recurring) or
`POST /api/user/onboarding-feedback` (onboarding). When the window elapses the server
records the submission, which starts the 30-day cooldown (recurring) or hides the form
permanently (onboarding). The lock is server-timed, so closing the tab does not cancel
it, and a second submission is rejected server-side.

### Why the form URL is generated on the server

Clicking the form never marks feedback as submitted. The form URL carries a signed,
24-hour token (`src/lib/feedback/token.ts`) naming the DTPS user. The token is
HMAC-signed with `FEEDBACK_TOKEN_SECRET` (falling back to `NEXTAUTH_SECRET`), so a
client cannot forge another user's ID. A prefilled user ID alone is never treated as
identity.

Submissions are written to the `user_feedback_submissions` collection, keyed by a
fingerprint of the token so the same submission cannot be credited twice.

### Optional manual Google setup

The in-app "Submitted" button is the default, zero-setup path and needs no Google
changes. The token/Apps Script bridge below is **optional**: use it only if you want
submissions verified automatically instead of self-reported.

1. **Add the token question to both forms.** In each form open *⋮ → Get pre-filled
   link*, or add a **Short answer** question named `dtps_feedback_token`. Note the
   question's entry ID from the pre-filled URL (`entry.<ID>`). Set the same ID in
   `DTPS_FEEDBACK_TOKEN_ENTRY_ID`. Make the question **required** so no response
   arrives unsigned.
2. **Link both forms to Google Sheets.** In each form open *Responses → Link to
   Sheets → Create*. Use **one sheet per form** so the form type is unambiguous.
3. **Create the Apps Script.** In each linked Sheet open *Extensions → Apps Script*,
   then use the script below. Set the other form's URL in `DTPS_ENDPOINT` only after
   deployment. Store the endpoint in *Script properties* rather than in source.
4. **Install the trigger.** In the Apps Script editor run `installTrigger()` once and
   approve the authorization prompt. This registers an `onFormSubmit` installable
   trigger.
5. **Set server configuration.** Add `FEEDBACK_CONFIRM_SECRET` (a long random value)
   to the Vercel environment, and the same value as the `DTPS_SECRET` script property.

```javascript
// Google Apps Script — bind to the Sheet linked from ONE form.
const DTPS_ENDPOINT = 'https://dtps.tech/api/internal/feedback-confirm';

function installTrigger() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'onFeedbackSubmit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onFeedbackSubmit').forSpreadsheet(sheet).onFormSubmit().create();
}

function onFeedbackSubmit(event) {
  const values = event.namedValues || {};
  const token = (values['dtps_feedback_token'] || [])
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0)[0];
  if (!token) return; // Unsigned response: nothing to verify against.

  const email = (values['Email address'] || values['Email'] || [])[0] || undefined;
  const date = (values['Timestamp'] || [])[0];

  UrlFetchApp.fetch(DTPS_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + PropertiesService.getScriptProperties().getProperty('DTPS_SECRET') },
    payload: JSON.stringify({ token: token, email: email, submittedAt: date }),
    muteHttpExceptions: true,
  });
}
```

The endpoint rejects requests without the shared secret, rejects tokens that fail
signature verification or have expired, and returns `duplicate` when the same response
is delivered twice. A form must be opened and submitted **within the 24-hour token
window**; otherwise the client must revisit *Feedback* to obtain a fresh link.

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
