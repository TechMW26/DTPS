# DTPS client experience review

## Recommendation

Make the client application predictable at three moments: choosing where to go, waiting for information, and completing an action. Retain the existing DTPS identity, five primary destinations, and care workflows. Use one restrained motion system, screen-shaped loading states, and explicit feedback near the action that caused it. Preserve the current page and entered information whenever a background request can be completed without replacing them.

This review covers the client-facing `/user` application, including the web content served to the Android and iOS wrappers. It is an expert evaluation of the route structure, shared components, loading branches, and interaction behavior, supported by published guidance. It does not represent interviews, a controlled usability study, or an accessibility certification. Production patient records were not used for interaction testing.

## Evidence and interpretation

A short animation should explain a change, acknowledge an action, or maintain orientation. It should not become an additional task the client must wait for. Nielsen Norman Group distinguishes purposeful state communication from decorative motion; its response-time guidance is a useful heuristic, not a performance guarantee for this application. DTPS therefore uses a 220 ms route fade without delaying navigation or data rendering. Press feedback uses 140 ms transitions. These exact durations are implementation choices, rather than values established by DTPS user testing. [1][2]

Loading states should distinguish a page being fetched from an action being submitted. Skeletons preview the structure of unavailable content; they cannot replace actual speed improvements. Already-rendered results should remain available during a refresh. A saving button or a compact status message is more appropriate than replacing a completed form with a page skeleton. Fast operations must not be artificially delayed to showcase a loader. [3]

Motion accessibility is especially relevant to an application people may use every day. Reduced-motion preferences disable nonessential route, drawer, dialog, control, and skeleton motion. The recommendation follows WCAG 2.3.3, which is a Level AAA criterion; implementing this behavior alone does not establish WCAG conformance. The tracker counters also handle the preference in JavaScript, because a CSS media query cannot stop their animation loop. [4]

Keyboard users need visible focus, meaningful controls, and predictable dialog behavior. The navigation drawer now uses a modal primitive with focus trapping and Escape handling, restores focus to its opener after closing, and preserves background scroll state. Clear close controls and grouped destinations improve orientation independently of animation. The audit also added accessible names to 58 previously unnamed icon-only controls, including back, close, refresh, delete, attachment, bookmark, and tracker adjustment actions. [5]

Client buttons target at least 44 CSS pixels for touch interaction. This is a DTPS design target; WCAG 2.2's Level AA minimum criterion is 24 CSS pixels subject to its spacing and other exceptions. Primary navigation remains five destinations, with labels and active-page semantics. Status text is exposed to assistive technology without moving focus away from the active input. [6][7]

The animation implementation favors opacity and small control transforms over dimensions that cause layout work. Route containers remain untransformed so fixed dialogs continue to use the viewport as their containing block. Loading placeholders reserve representative content dimensions; image placeholders retain the space needed by the eventual cards. These decisions follow rendering-performance and layout-stability guidance. [8][9]

## Current journeys and changes

| Journey | Finding | Implemented response |
| --- | --- | --- |
| Open the app and choose a destination | The persistent shell had its own fade while page wrappers separately hid content and animated a transformed route. | One motion owner animates the persistent content surface. Nested wrappers do not add another animation or remount the screen. |
| Navigate through secondary pages | One long menu lacked useful grouping, fetched unused service-plan data, and used a custom modal without complete focus management. | Group destinations into Your care, Explore, and Your account. Add Help & support. Remove the unused request. Use a keyboard-accessible drawer with opening and closing motion. |
| View a meal plan | Page and date-change loading represent different scopes. | Use a meal-plan skeleton for the page; keep date-change loading within the meal content and label it for assistive technology. |
| Log water, sleep, activity, or steps | Four copies of one-second JavaScript animations could overlap and ignored reduced motion. | Share a cancelable 420 ms progress animation. Reduced motion applies the final value immediately. |
| Review tasks | Expand controls lacked expanded-state semantics. | Add expanded state, associated detail regions, and a short content reveal. |
| Search recipes | A new search cleared previous results. An aborted request could unset the current request's loading flag. Failures could resemble empty results. | Preserve results and input focus, cancel superseded requests, ignore late responses, show truthful search status, and provide explicit retry and clear-search actions. |
| Set up a profile | Saving replaced the final summary with a skeleton. Step position was not consistently visible. | Keep the summary and entered information mounted, disable duplicate submission, show saving status, and display a five-step progress label and indicator. |
| Confirm payment | Verification replaced the dashboard with a page loader. | Keep the dashboard visible with a payment-verification status message. Payment verification and entitlement decisions remain server-driven. |
| Read messages or book a visit | Conversation and appointment-slot loading used generic spinners. | Use conversation-shaped placeholders and a time-slot grid within their existing panels. |
| Sign out | The drawer disappeared before the operation completed. | Keep action feedback visible, disable duplicate submission, and allow retry if sign-out fails. |

## Loading coverage

The shared client route fallback derives its shape from the current route. Client-fetch loading branches use the same component, so route streaming and in-page fetching have a consistent vocabulary. Static content does not acquire a fabricated loading delay.

| Screen family | Routes | Placeholder structure |
| --- | --- | --- |
| Home | `/user` and dashboard alias | Greeting, summary, metric cards |
| Meal plan | `/user/plan` | Date strip, nutrition summary, meal cards |
| Trackers | Hydration, sleep, steps, activity, watch | Date strip, circular metric, summary and history |
| Progress | Progress and weight-tracker alias | Date controls, chart area, metrics, history |
| Messages | Messages | Search and conversation rows; bubble placeholders inside a conversation |
| Discovery | Recipes, blogs, services, subscriptions | Search area and responsive cards |
| Detail | Recipe, blog, service details | Hero area, title, metadata, content |
| Forms | Personal, medical, lifestyle, dietary recall, onboarding, booking | Field labels, controls, primary action |
| Profile | Profile | Avatar, identity, summary and detail sections |
| Lists | Tasks, appointments, billing, notifications, settings, payment receipt | Header and appropriately spaced content rows |
| Static support and policy pages | Help, policy, terms, refund, support settings | Shared route fallback only when navigation actually suspends |

Skeletons are not focusable controls. A single status label identifies what is loading while decorative shapes are hidden from assistive technology. Reduced motion leaves the shapes visible and static. The content area reserves space above the persistent bottom navigation.

## Motion and interaction specification

| Interaction | Behavior | Constraint |
| --- | --- | --- |
| Page change | 220 ms opacity fade | No keyed page remount, route transform, exit delay, or invisible initial render |
| Button/link press | Small scale and color response | Disabled actions do not respond; no new network work |
| Primary navigation | Active icon emphasis and delayed pending hint | Existing destinations remain usable; no fabricated percentage |
| Drawer | 240 ms enter, 180 ms exit | Focus trap, Escape dismissal, opener focus restoration |
| Shared dialog | 220 ms enter, 160 ms exit | Preserve portal positioning and modal semantics |
| Task details | 180 ms content reveal | Expanded state conveyed independently of color or motion |
| Tracker update | 420 ms progress interpolation | Cancel earlier frames and clean up on unmount |
| Reduced motion | Immediate state changes | Preserve visible content, focus indicators, and text status |

No animation library or runtime dependency was added. Existing React, CSS, Web Animations, and Radix components provide the behavior. The database and Redis changes from the earlier performance release remain independent of this presentation work.

## Validation and limitations

Automated interaction checks cover single-owner route animation, draft preservation, reduced-motion behavior, screen-specific skeleton semantics, stale recipe responses, retained results, and error recovery. Existing client-shell, loading-state, and onboarding-access regressions are also checked. Browser validation uses real components with synthetic data in an isolated local preview, allowing slow and failed responses without altering client records.

Validation passed: 8 behavioral UI tests, 20 existing regression checks, TypeScript checking, and the production build. Focused ESLint reported no errors; four existing unused-symbol/image warnings remain. Browser checks at 320, 390, and 1280 CSS pixels found no horizontal overflow. Primary navigation targets measured 48 pixels high and at least 57.6 pixels wide at the narrowest width. The drawer restored focus to its opener. The shared dialog remained fixed inside the 390 × 844 viewport, with focus inside it and no transformed route ancestor. Dark tracker skeletons stayed above the navigation; reduced-motion checks found zero animated skeleton elements. Failed recipe searches retained their previous results and focused input. Onboarding completion and failed-save recovery were verified with synthetic API responses in the behavioral tests. A successful web build or desktop browser check does not prove native-device behavior on every iOS and Android WebView version. The wrappers need no source change for these server-delivered screens, but physical-device acceptance remains a separate check.

For subsequent evaluation, observe five client tasks: find today's meal, record water, find a recipe, contact the dietitian, and review the next appointment. Track task completion, accidental taps, backtracking, retries, and abandonment. Measure navigation/API latency separately from time spent in the UI. Do not infer a conversion or adherence improvement from animations alone. Screen analytics should avoid collecting clinical text, message contents, or personal details.

## Sources

1. Nielsen Norman Group. [The Role of Animation and Motion in UX](https://www.nngroup.com/articles/animation-purpose-ux/). Published guidance on motion used to communicate interface changes.
2. Jakob Nielsen. [Response Times: The 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/). 1993; includes later web guidance. Historical heuristics, not DTPS measurements.
3. Samhita Tankala, Nielsen Norman Group. [Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/). June 4, 2023; page reviewed September 2, 2026.
4. W3C WAI. [Understanding SC 2.3.3: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html). WCAG 2.2 explanation, Level AAA.
5. W3C WAI. [Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). ARIA Authoring Practices Guide.
6. W3C WAI. [Understanding SC 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). WCAG 2.2 explanation, Level AA.
7. W3C WAI. [Understanding SC 4.1.3: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html). WCAG 2.2 explanation, Level AA.
8. Kayce Basques and Rachel Andrew, web.dev. [How to create high-performance CSS animations](https://web.dev/articles/animations-guide).
9. web.dev. [Optimize Cumulative Layout Shift](https://web.dev/articles/optimize-cls).
10. Next.js. Installed version 16 documentation: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md` and `template.md`. Checked locally for loading boundaries, persistent layouts, and template remount behavior.

Web sources checked September 13, 2026. Recommendations are tailored interpretations of the guidance, not claims that the sources evaluated DTPS.
