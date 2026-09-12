# Local notification, login and purchase UI review

13 September 2026. Local changes only; not pushed or deployed.

## Changes

- One top-centered Sonner host for ordinary toasts, foreground push notifications and permission prompts. Consistent spacing, colors, dismissal and actions; dark theme, safe-area offsets and reduced motion are supported. Removed conflicting bottom-corner positions and old custom toast styles.
- Notification permission prompts are dismissible and remember dismissal. Enabling notifications has an explicit pending/result state and reports denied permissions without a browser alert dialog.
- Client sign-in now uses a centered responsive card with DTPS branding, clear copy and subtle form transitions. Phone/email/password controls have labels and autocomplete attributes, and the password reveal button is accessible. Existing OTP and credential verification logic is retained.
- Plan selection uses a Radix portal with focus containment, Escape dismissal, scroll locking and focus restoration. Header/footer stay visible, durations scroll within the available viewport, and the panel has rounded corners on every screen size. The external checkout temporarily owns focus; duplicate purchase submissions remain disabled until checkout completes or is dismissed.

## Verification

- `npx jest --config tests/ui/jest.config.cjs --runInBand --coverage=false`: 12 tests passed, including notification actions/dismissal, permission denial, phone/email state, password visibility, purchase selection and checkout pending state.
- Existing client shell, loading skeleton and onboarding access regression suites: 20 tests passed. The shell assertion now recognizes the purchase portal above navigation.
- `npx tsc --noEmit --pretty false`: passed.
- `npm run build`: passed (Next.js 16.3.0).
- Targeted ESLint: zero errors; 23 existing warnings in touched legacy files (unused values, explicit any types, unescaped apostrophe).
- `git diff --check`: clean.

Browser checks used the actual login on localhost:3002 and an isolated localhost:3137 fixture importing the actual plan and notification components. The fixture contains only synthetic plans and rejects mutation requests.

| Scenario | Observed result |
| --- | --- |
| Login, 390 × 844 | Card x=16, width=358, top≈91, bottom≈753; centered in viewport |
| Email login, 1280 × 900 | Card x=420, width=440, top≈56, bottom≈844; centered |
| Login, 320px width | No horizontal overflow; inputs compute to 16px text |
| Login, 320 × 400 | Body scrolls to lower form controls; keyboard focus reaches the email alternative |
| Purchase dialog, 320 × 568 | Bounds x=16–304, y=16–552; duration region scrolls; footer remains within viewport |
| Purchase selection | Three-month choice updates selected styling and displayed ₹15,000 total |
| Escape | Closes dialog and restores focus to Get Started |
| Notification, 320px width | Bounds x=16–304, top=12; close control remains inside notification |
| Light/dark appearance | Purchase dialog and notifications visually checked |
| Reduced motion | Purchase dialog computed animation is none |

Temporary viewport and reduced-motion overrides were restored. This validates responsive browser behavior, not a physical-device keyboard, a real OTP delivery, Firebase permission acceptance or a live Razorpay transaction. RTDB remains a proposal in `docs/architecture/realtime-database-plan.md`.
