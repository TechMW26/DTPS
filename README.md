# DTPS — Dietitian & Client Platform

Multi-role health & nutrition platform connecting dietitians, health counselors, and clients with meal planning, messaging, progress tracking, and appointment management.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) · React 19 |
| Styling | Tailwind CSS v4 · shadcn/ui (new-york) |
| Database | MongoDB with Mongoose |
| Auth | NextAuth v4 (JWT, Credentials + Google) |
| Realtime | Socket.io |
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
npm run dev        # Development on localhost:3000
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Lint check
```

## Environment

Single `.env` file for both local dev and Docker production:

```
MONGODB_URI=...
NEXTAUTH_URL=https://dtps.tech
NEXTAUTH_SECRET=...
BLOB_READ_WRITE_TOKEN=...
```

## Deployment

```bash
docker-compose -f docker-compose.prod.yml up -d  # Production Docker
./deploy-hostinger.sh                             # Hostinger VPS
```

## Architecture

- **API:** App Router API routes in `src/app/api/**` — no separate server
- **DB:** Singleton Mongoose connection in `src/lib/db/connection.ts`, called once per request
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
| `server.js` | Custom HTTP + Socket.io |
| `docker-compose.prod.yml` | Production stack (app + nginx) |
| `nginx.conf` | SSL, reverse proxy, rate limiting |
| `src/lib/db/models/` | 45+ Mongoose models |
| `src/app/api/` | All API routes |
| `mobile-app/` | iOS and Android native code |

## Naming

| Entity | Convention | Example |
|---|---|---|
| Model | `PascalCase.ts` | `MealPlan.ts` |
| API route | `kebab-case/` | `food-logs/` |
| Hook | `use{Feature}` | `useNativeApp` |
| Display ID | `generateShortId()` | `Dt-AB12` |
