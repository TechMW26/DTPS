# Copilot instructions (DTPS)

## Project overview
- **Stack:** Next.js 15 App Router · React 19 · Tailwind CSS v4 · shadcn/ui (new-york style) · MongoDB/Mongoose · NextAuth v4 (JWT)
- Multi-role platform (admin / dietitian / health_counselor / client) with role gating in `middleware.ts` and client onboarding redirects.
- Backend is entirely App Router API routes (`src/app/api/**`) — no separate server process.
- Native mobile shell in `mobile-app/` (iOS/Android) wraps the web app via WebView; the `useNativeApp` hook bridges JS ↔ native.

## Architecture & data flow
- **DB:** Singleton connection in `src/lib/db/connection.ts`. Call `connectDB()` once per API request. 45+ Mongoose models live in `src/lib/db/models/` (PascalCase singular files, default exports). All models are auto-registered via barrel import in the connection module.
- **Auth:** `src/lib/auth/config.ts` — Credentials + Google providers. JWT carries `role` (UserRole enum), `onboardingCompleted`, `isNewUser`, calendar fields. Session strategy is JWT, 30-day max age.
- **Base URLs:** Always use `getBaseUrl()` / `getPaymentCallbackUrl()` from `src/lib/config.ts` — never raw `NEXTAUTH_URL`.
- **Middleware** (`middleware.ts`): Adds `X-App-Version` + `Cache-Control: no-store` on API responses. Enforces role-based route access and redirects clients with `onboardingCompleted === false` to `/user/onboarding`.
- **Path alias:** `@/*` → `./src/*` (the only alias).

## API route conventions
- **Skeleton (manual pattern — dominant):**
  ```ts
  import { getServerSession } from 'next-auth';
  import { authOptions } from '@/lib/auth/config';
  import connectDB from '@/lib/db/connection';
  import User from '@/lib/db/models/User';

  export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await connectDB();
    // ... query ...
    return NextResponse.json({ data });
  }
  ```
- **Wrapper pattern (preferred for new routes):** `withAPIHandler()` from `src/lib/api/utils.ts` auto-handles auth, DB connect with timeout, and `errorResponse()` with codes (`AUTH_REQUIRED`, `VALIDATION_ERROR`, `DB_ERROR`, etc.).
- **Caching:** `withCache` / `clearCacheByTag` from `src/lib/cache/memoryCache.ts` (in-process, TTL-based, max 1000 entries). Use `CacheTTL` and `CachePrefix` constants. **Never cache `/api/client/**`** — conditional caching (ETag/304) is admin/internal only.
- **Role access:** Compare against `UserRole` enum (`admin`, `dietitian`, `health_counselor`, `client`) from `@/types`, never raw strings.

## Roles & route mapping
| Role | Pages root | API root |
|---|---|---|
| Admin | `src/app/admin/` | `src/app/api/admin/` |
| Dietitian | `src/app/dietician/`, `src/app/dashboard/` | `src/app/api/dietitian-panel/` |
| Health Counselor | `src/app/health-counselor/` | shared APIs |
| Client | `src/app/user/` (30+ sub-routes) | `src/app/api/client/` (26 sub-routes) |

## UI & component patterns
- **shadcn/ui** primitives in `src/components/ui/` (35+ components). Add new ones with the shadcn CLI.
- **Feature components** organized by domain: `src/components/admin/`, `client/`, `chat/`, `recipes/`, `payments/`, etc.
- **Providers** nest in this order in `src/app/layout.tsx`: `SessionProvider → SocketProvider → GlobalFetchInterceptor → ThemeProvider → PushNotificationProvider → ClientAppLayout → {children} → Toaster`.
- **Toasts:** Use `sonner` (`<Toaster />` from `src/components/ui/sonner`).
- **Class merging:** Always use `cn()` from `@/lib/utils` (clsx + tailwind-merge).
- **Contexts** in `src/contexts/`: `ThemeContext`, `UnreadCountContext`, `StaffUnreadCountContext`, `StabilityContext`. Each exports a `use{X}` hook.

## Realtime & messaging
- **Socket.io** for all real-time communication. Server: `src/lib/realtime/socket-manager.ts` (singleton on `globalThis.__socketManager`, lazy-init from `globalThis.__socketIO`). Client: `src/lib/realtime/socket-client.ts` (singleton with exponential backoff 1s → 30s, 15 retries). Shared event constants in `src/lib/realtime/socket-events.ts`.
- Custom server entry: `server.js` (project root) creates HTTP server + Socket.io, passes HTTP to Next.js handler. Auth middleware on Socket.io decodes NextAuth JWT from cookie.
- Room architecture: `user:<userId>` for personal events, `role:<role>` for role-based broadcasts.
- React context: `SocketProvider` in `src/contexts/SocketContext.tsx` wraps the app.
- `useRealtime()` hook in `src/hooks/useRealtime.ts` provides `{isConnected, onlineUsers, connectionError, connect, disconnect, sendTyping, forceReconnect}`.
- Unread counts delivered via socket events (`UNREAD_COUNTS`, `STAFF_UNREAD_COUNTS`), consumed by `UnreadCountContext` and `StaffUnreadCountContext`.

## File uploads & images
- Upload component: `src/components/ui/file-upload.tsx` — drag-and-drop, typed by purpose (`avatar`, `medical-report`, `recipe-image`, etc.), POSTs `FormData` to `/api/upload`.
- **ImageKit** CDN (`src/lib/imagekit.ts`) for storage — lazy-initialized singleton.
- Client-side compression: `src/lib/imageCompression.ts` (canvas resize 1200×1200, JPEG 0.8) before upload.

## Notifications & push
- **Firebase Cloud Messaging** for push; admin SDK in `src/lib/firebase/firebaseAdmin.ts`, client in `src/lib/firebase/client.ts`.
- `PushNotificationProvider` is role-aware: admin → web push; client → native FCM token; dietitian/counselor → skipped.
- Service worker: `public/firebase-messaging-sw.js`.

## Mobile app shell
- iOS: WebView wrapper loading `https://dtps.tech/user`. JS → native bridges in `mobile-app/ios/DTPS/MainViewController.swift`. Shared `WKProcessPool` warm-up in `AppDelegate.swift`.
- Deep links / notification taps relayed via `NotificationCenter` (see `Notification.Name` extensions).
- `useNativeApp` hook detects WebView and communicates with native layer.

## Key workflows
- **Dev:** `npm run dev` · **Build:** `npm run build` · **Start:** `npm run start` · **Lint:** `npm run lint`
- **Production:** `docker-compose.prod.yml` + `Dockerfile` (app + nginx). Healthcheck hits `/api/health`.
- **Environment:** `.env.local` in production compose; keep `NEXTAUTH_URL` aligned with production domain.
- **Error monitoring:** Sentry (edge + server configs at project root, `instrumentation.ts`).

## Naming conventions
| Entity | Convention | Example |
|---|---|---|
| Mongoose model file | PascalCase singular | `MealPlan.ts`, `ProgressEntry.ts` |
| API route directory | kebab-case | `meal-plan-templates/`, `food-logs/` |
| Hook | `use{Feature}` camelCase | `useSSE`, `useNativeApp`, `useAutoSave` |
| Context | `{Feature}Context` + `use{Feature}` | `ThemeContext`, `useTheme()` |
| Component directory | camelCase domain folder | `clientDashboard/`, `dietplandashboard/` |
| Display IDs | `generateShortId()` | `Dt-AB12`, `C-CD34`, `HC-EF56` |

## Types
- All domain types/enums in `src/types/index.ts`: `UserRole`, `UserStatus`, `ClientStatus`, `AppointmentStatus`, `MessageType`, etc.
- NextAuth session/JWT augmented in `src/types/next-auth.d.ts`.
- Validation schemas in `src/lib/validations/auth.ts` (Zod).

## Services (server-only)
- `src/lib/services/email.ts` — Nodemailer transporter + rich HTML template factories.
- `src/lib/services/googleCalendar.ts` — Google Calendar API.
- `src/lib/services/zoom.ts` — Zoom meeting CRUD.
- Import directly in API routes; these are not client-importable.
