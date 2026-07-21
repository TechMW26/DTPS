# Cross-Platform Sync Instructions — DTPS

## Architecture Overview

| Platform | Tech | How it works |
|---|---|---|
| Desktop Web | Next.js 15 App Router | Serves the full app at `https://dtps.tech` |
| iOS App | Swift + WKWebView | Loads `https://dtps.tech/user` in a WebView |
| Android App | Kotlin + WebView | Loads `https://dtps.tech/user` in a WebView |

**Key fact:** Both mobile apps are **WebView wrappers** — they have **zero native screens** beyond the splash. All content, routing, business logic, and UI lives in the Next.js web app. Any change to the web app automatically reflects in the mobile apps.

---

## When Changes Affect BOTH Platforms

These types of changes MUST be verified on ALL platforms (desktop web, iOS, Android):

### 1. Route Changes
Any change to Next.js routes (new pages, renamed paths, removed routes) affects mobile because the WebView loads the web URL.

**Checklist:**
- [ ] Verify new routes work in mobile WebView (especially auth-gated routes)
- [ ] Update deep-link handling if route paths change (`dtps://` scheme in `Info.plist`, `AndroidManifest.xml`)
- [ ] Update iOS auth redirect in `MainViewController.swift:384` (`/auth/signin` → `/client-auth/signin`)
- [ ] Verify WebView `decidePolicyFor` / `shouldOverrideUrlLoading` doesn't block new routes

### 2. External Domains (CDN, Payment, APIs)
Any new external domain the web app loads resources from must be allowlisted in native code.

| File | Location | What to update |
|---|---|---|
| `mobile-app/ios/DTPS/MainViewController.swift` | `allowedHosts` array (line ~20) | Add domain for WKWebView navigation |
| `mobile-app/android/.../MainActivity.kt` | `ALLOWED_HOSTS` list (line ~109) | Add domain for WebView navigation |
| `mobile-app/android/.../network_security_config.xml` | `<domain-config>` | Only if cleartext HTTP is needed |

**Current allowed hosts:**
- iOS: `dtps.tech`, `razorpay.com`, `api.razorpay.com`, `checkout.razorpay.com`, `paytm.com`, `phonepe.com`, `gpay.com`, `ik.imagekit.io`
- Android: `dtps.tech`, `ik.imagekit.io`

### 3. Authentication & Session
Changes to auth flow (NextAuth config, JWT, session handling, sign-in pages) directly affect both platforms.

**Checklist:**
- [ ] Test sign-in flow on mobile WebView (Google OAuth, credentials)
- [ ] Verify iOS auth redirect still works: `MainViewController.swift` line ~384 redirects `/auth/signin` → `/client-auth/signin`
- [ ] Test session expiry behavior on mobile
- [ ] Verify cookie/storage persistence in WebView (iOS uses `WKProcessPool`, Android uses `CookieManager`)

### 4. Push Notifications / FCM
Any change to FCM token registration, notification structure, or foreground handling affects mobile.

**Key files:**
| File | Role |
|---|---|
| `src/hooks/useNativeApp.ts` | Web-side bridge: receives FCM token, sends to `/api/fcm/token` |
| `src/app/api/fcm/token/route.ts` | API endpoint that stores FCM token |
| `iOS: AppDelegate.swift` | APNs → FCM token, notification tap → deep link |
| `Android: DTPSFirebaseMessagingService.kt` | FCM token, foreground notification broadcast |
| `Android: MainActivity.kt` | Receives broadcast → forwards to WebView via JS |

**Checklist:**
- [ ] Test push notification delivery on both iOS and Android
- [ ] Test foreground notification handling (WebView JS bridge)
- [ ] Test notification tap → deep link → correct page load
- [ ] Verify FCM token registration flow end-to-end

### 5. File Uploads & Media
Changes to upload API, file handling, or image URLs affect mobile (WebView file picker, image display).

**Key files:**
| File | Role |
|---|---|
| `src/app/api/upload/route.ts` | ImageKit-only upload API (no local/database fallback) |
| `src/components/chat/ChatBubble.tsx` | Image rendering with retry logic |
| `iOS: MainViewController.swift` | `WKScriptMessageHandler` for file upload |
| `Android: MainActivity.kt` | `onShowFileChooser` for WebView file picker |

**Checklist:**
- [ ] Test image upload from mobile WebView (camera & gallery)
- [ ] Verify uploaded images display correctly on all platforms
- [ ] Test audio/video upload and playback
- [ ] Verify local fallback URLs resolve correctly (absolute URL fix)

### 6. Deep Links & URL Schemes
Any change to client-facing URL paths affects deep-link routing.

**Files to update if routes change:**
| File | What |
|---|---|
| `mobile-app/ios/DTPS/Info.plist` | `dtps://` URL scheme, URL types |
| `mobile-app/ios/DTPS/DTPS.entitlements` | Universal Links (`applinks:dtps.tech`) |
| `mobile-app/android/.../AndroidManifest.xml` | Intent filters for `https://dtps.tech/user` and `dtps://user` |
| `mobile-app/ios/DTPS/AppDelegate.swift` | Deep link handling (line ~118: `dtps://` → `https://dtps.tech`) |
| `mobile-app/ios/DTPS/MainViewController.swift` | `handleDeepLink()` converts schemes (line ~319) |

### 7. Environment Variables & Config
Changes to env vars that affect client-side behavior need verification on mobile.

**Important:** Docker Compose uses `.env.local` for production — ensure new vars are added there too.

---

## Critical Hardcoded Values to Keep in Sync

| Value | iOS Location | Android Location | Web Location |
|---|---|---|---|
| App URL | `MainViewController.swift:18` | `MainActivity.kt:107` | — |
| Client signin path | `MainViewController.swift:384` | — | `src/app/client-auth/signin/` |
| FCM token API | — (native injects) | — (native injects) | `src/hooks/useNativeApp.ts:46` |
| Deep link scheme | `Info.plist` | `AndroidManifest.xml` | — |

---

## Pre-Release Verification Checklist

Before deploying to production or publishing a mobile app update:

### Web App Changes
- [ ] `npm run build` passes
- [ ] All routes render without errors
- [ ] Auth flows work (sign-in, sign-up, forgot password, onboarding)
- [ ] Image/media upload and display works
- [ ] Push notifications work end-to-end

### iOS Verification
- [ ] App launches and shows splash → WebView loads
- [ ] Auth signin works (credentials + Google)
- [ ] Deep links (`dtps://` and Universal Links) navigate correctly
- [ ] Push notifications arrive (foreground + background)
- [ ] Notification tap opens correct page
- [ ] File upload (camera + gallery) works
- [ ] Payment flow (Razorpay) works
- [ ] New external domains load (not blocked by `allowedHosts`)

### Android Verification
- [ ] App launches and shows splash → WebView loads
- [ ] Auth signin works (credentials + Google)
- [ ] Deep links (`dtps://` and App Links) navigate correctly
- [ ] Push notifications arrive (foreground + background)
- [ ] Notification tap opens correct page
- [ ] File upload (camera + gallery) works
- [ ] Payment flow (Razorpay) works
- [ ] New external domains load (not blocked by `ALLOWED_HOSTS`)

---

## Common Pitfalls

1. **Image loading fails on mobile:** Check `allowedHosts`/`ALLOWED_HOSTS` includes image CDN domain (`ik.imagekit.io`)
2. **Auth redirect loops on iOS:** Verify `MainViewController.swift` line ~384 redirects to correct client signin path
3. **Push notifications not arriving:** Check FCM token registration flow + APNs certificates (iOS)
4. **Deep links open wrong page:** Verify `dtps://` → `https://dtps.tech` conversion in native code matches new route paths
5. **File upload broken on Android:** Check `AndroidManifest.xml` has camera/storage permissions + FileProvider config
6. **WebView shows white screen:** Check URL is accessible and `allowedHosts` includes the domain

---

## Mobile App Build Commands

```bash
# iOS (requires Xcode + signing certs)
cd mobile-app/ios
xcodebuild -workspace DTPS.xcworkspace -scheme DTPS archive

# Android (requires Android SDK)
cd mobile-app/android
./gradlew assembleRelease
```
