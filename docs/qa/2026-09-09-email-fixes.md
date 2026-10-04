# Email issue review — 9 September 2026

Source: Gmail conversation “Immediate Requirement: Dietitian IDs & App Glitch Details with Screenshots”, messages dated 22 August 2026. All expanded message bodies were reviewed; the calendar and failed-image screenshots were inspected.

## Changes in this review

- **Unused freeze allowance:** cancelling today’s or future frozen dates now credits those unused days back. Elapsed dates remain consumed. The response uses the purchased allowance and shared usage across phases, respects an explicit zero allowance, and reports the credited count. Replaying the same cancellation cannot credit it twice.
- **Overdue pending plans:** a completed phase older than 30 days no longer hides outstanding work on an otherwise eligible paid purchase. Expired purchases remain excluded by the existing entitlement check.
- **Regression stability:** the later-phase scheduling test now uses relative dates; its fixed September start date had elapsed and was correctly rejected by the API.

Both behavior defects were reproduced with failing assertions before their fixes.

## Report coverage

| Report | Client references | Finding / verification |
| --- | --- | --- |
| Next-phase date locked or blank | C-5278, C-3385, C-6575 | Existing September code allows deliberate later dates within the purchase window and recovery after an elapsed gap. Phase-policy and route regression tests pass, including the five-day remaining-plan example. |
| Missing Pending Plans entries | C-5278, C-3385, C-2287, C-4689, C-4743, C-6811 | Existing inactive-client inclusion and payment deduplication tests pass. Added a regression and fix for a completed phase overdue by more than 30 days with valid remaining entitlement. |
| Early-return freeze allowance | No specific CID supplied for this example | Added coverage for 15 reserved days, 8 consumed, 7 credited and reused; repeat cancellation, historical dates, shared phases, and zero allowance. |
| Template/diet upload | C-8370, C-7075, C-1268 | Existing template persistence, draft creation/replay, publishing and republishing integration tests pass. These are application-path checks, not confirmation from the affected devices. |
| Recipe visibility | C-7271, C-7814 | All 29 and 14 distinct referenced recipe IDs respectively exist in the configured database. Exact recipe lookup and historical-plan recipe enrichment tests pass. No missing source recipe IDs found in these clients’ non-deleted plans. |
| Meal photos/messages | C-7800, C-1044, C-7410, C-1765 | Upload resilience, meal-image completion, media recovery and chat history/message tests pass. Read-only HEAD checks returned HTTP 200 for all 21 sampled images sent during 15–22 August by C-7800, C-1044 and C-1765. No matching image attachments were found for C-7410 in that bounded sample. |
| Previous plans missing | C-303 | Eight non-deleted active plan records remain in the configured database, plus one soft-deleted record. Added API coverage proving that previous published plans and recipes are readable while drafts/deleted plans stay excluded. This does not establish why the original device showed only one plan. |
| Login failure | C-6739 | Account exists and is marked active. Current Firebase phone-auth and persistent-session regressions pass. No fresh device reproduction or login error details were available. |
| Published plan shows “No Plan” | C-7811 | Four non-deleted active plan records exist. Current-purchase selection and client-plan visibility regressions pass. Current account data alone does not prove the original device issue is resolved. |

## Validation

- 117 tests passed across 19 relevant integration suites.
- TypeScript check passed.
- Targeted ESLint: zero errors; 100 warnings in the checked files.
- Git whitespace check passed.
- Production build passed (`npm run build`).

## Delivery boundary

This initial review was completed locally. The subsequent performance release includes the source fixes; see the task response for GitHub and deployment verification. Database inspection was read-only. The affected clients’ individual devices were not used, and historical records were not rewritten. Existing September fixes were verified rather than reimplemented. Customer confirmation after deployment is still needed for the original device-specific reports.
