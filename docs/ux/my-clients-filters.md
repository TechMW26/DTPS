# My Clients filter review

13 September 2026 — `/dietician/clients`.

Uses the Manage Users filter style: persistent labels, 44px controls, muted groups, active chips, and an expanded-by-default More filters section. Search, client status, and tag are prominent. Care-team assignment, meal-plan criteria, and last team activity have separate headings. All groups adapt to narrow screens.

Advanced inputs are drafts until Apply filters is selected. The panel announces unapplied changes. Applied chips remain visible when collapsed; removing one updates only that criterion and preserves unrelated drafts. Clear all clears search and both draft/applied filters. Date pairs have bounds and inline validation; switching away from a plan date range clears its dates.

Client status now uses the existing API's status parameter before pagination, rather than filtering only the current page. Requests are aborted when superseded, and late responses are ignored. Failed loads are visible in the filter summary. No API or database schema was changed.

Removed the disconnected Freeze/Active dropdown. Also omitted the old Plan timing > Freeze and Plan sharing > General choices, which the existing API does not implement; they previously returned unfiltered results. Ongoing plans, date ranges, sharing, and supported plan/client statuses remain available.

## Verification

- Actual authenticated local page inspected at 1440, 390, and 320 CSS pixels; all controls measured 44px tall and mobile checks found no horizontal overflow.
- Selected Active, saw the unapplied notice, applied it, and verified 2,017 matching clients from the server. Cleared filters and restored the original viewport afterward.
- All 18 UI tests passed, including draft/application separation, collapsed chips, date validation, timing cleanup, server status requests, chip removal with unrelated drafts, and complete reset.
- TypeScript and production build passed.
