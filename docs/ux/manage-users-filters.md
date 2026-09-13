# Manage Users filter review

Date: 13 September 2026. Scope: `/admin/users`.

## Research and design decisions

This is a focused review of published UX guidance and the current interface, not a user study.

- [Nielsen Norman Group: Defining Helpful Filter Categories and Values](https://www.nngroup.com/articles/filter-categories-values/) supports descriptive labels, meaningful groups, and predictable value ordering. Search, role, and status are prominent; care-team assignment and creation dates sit in named groups under More filters. Staff names are alphabetized.
- [Nielsen Norman Group: User Intent Affects Filter Design](https://www.nngroup.com/articles/applying-filters/) explains the tradeoff between interactive and batch filtering. This directory retains immediate selection updates, with search debounced by 300 ms to reduce redundant requests. Old requests are aborted and their results ignored.
- [GOV.UK Design System: Text input](https://design-system.service.gov.uk/components/text-input/) informs persistent labels instead of relying on placeholders alone.

More filters is expanded by default and can be collapsed. The active-filter summary stays visible even when More filters is collapsed. Users can remove one selection or clear all. Invalid date ranges show an inline explanation and do not replace the last results. Directory overview cards use compact spacing. Empty results explain how to broaden the search.

## Local verification

- Browser review of the actual authenticated local admin page at 1440, 390, and 320 CSS pixels. All seven expanded controls measured 44px high on desktop; no document or filter-control horizontal overflow at the mobile widths.
- Visually checked expanded mobile groups and desktop alignment. Selected a role, verified its chip, removed it, and restored the browser's normal viewport. Only read-only filter interactions were performed.
- All 15 UI tests passed, including new coverage for collapsed active selections, individual removal/reset, search focus, date validation, debounce, and stale responses.
- TypeScript check and production build passed.

Deployment is separate from this local review.
