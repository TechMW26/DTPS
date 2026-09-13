# All Clients filter review

13 September 2026 — `/admin/allclients`.

Applied the Manage Users filter style to All Clients: search, client status, and assignment are prominent; care-team, onboarding, and joined-date options sit in named groups. More filters starts expanded and remains collapsible. Every input has a persistent label and a consistent 44px height. Active selections have individually removable chips, and Clear all resets them together. Staff options are alphabetical. Overview cards have more compact padding.

The existing immediate server filtering and 300ms search debounce are preserved. Changes reset pagination atomically and clear stale bulk selections. Superseded requests are aborted and late results ignored. Invalid joined-date ranges show an inline error and retain prior results. API semantics and database behavior are unchanged.

## Local checks

- Browser inspection at 1440, 390, and 320 CSS pixels: controls aligned on desktop; no mobile document or filter-control horizontal overflow.
- Selected Unassigned and verified 2,119 matching clients; removed the chip and restored the default viewport. More filters remained expanded.
- All 21 UI tests passed, including expanded/collapsed behavior, chip removal/reset, date validation, debounce, and rejection of stale responses.
- TypeScript and production build passed.
