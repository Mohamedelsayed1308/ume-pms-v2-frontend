# UME Dashboard v2

Arabic, RTL frontend review implementation based on the supplied dashboard reference. All new dashboard business data is synthetic. No production data integration or financial writes have been added.

## Run

```sh
npm ci
npm run dev
```

- Standalone review: http://localhost:3000/preview/dashboard — does not require login, does not mount API-backed notification/search providers, and contains only fixtures.
- Integrated homepage: /dashboard — keeps the existing authenticated application shell, sidebar permissions, global search and notifications. The homepage content itself is explicitly marked as demo data.
- The standalone preview's navigation links open the existing authenticated application routes.

## Implemented

- One homepage combining fleet and finance. The market module is now a link with prefetch disabled; it is not mounted on the homepage.
- Shared sticky period and shipping-route controls. KPI totals, fleet, selected chart months, ledger, vendors, activities and assistant answers derive from the same scope.
- Month-over-month, quarter-over-quarter and matching prior-year YTD comparisons. Fixture date is September 25, 2026; it is intentionally not the current date.
- Review/unreview actions scoped to the current filters, with detail dialogs. Review never changes settlement or approval status.
- Vessel photos from the repository, selectable chart contributions, fleet totals and per-voyage profit. Inactive vessels show no activity instead of a misleading decline.
- Payables/receivables aging with bucket drilldowns and supplier/activity details.
- Executive, finance and operations presentation presets; sidebar collapse and assistant visibility. These settings never change authorization.
- Quick-create invoice/payment/purchase-order forms create session-only drafts. Drafts appear in filtered recent activity and do not alter posted KPI values. No API writes occur.
- Prepared assistant answers are calculated locally. Unsupported free questions clearly explain that AI is not connected.
- The new page is Arabic only; the EN control is disabled there when the current locale is Arabic. Existing translation behavior on other screens is retained.

## Files

- components/dashboard/DashboardV2.tsx: homepage and interactions.
- components/dashboard/dashboard.module.css: scoped responsive styling.
- components/dashboard/demo-data.ts: deterministic fixtures and shared selectors.
- components/dashboard/Preferences.tsx: presentation state and quick-create menu.
- components/dashboard/DashboardPreview.tsx: isolated demo shell.
- app/dashboard/page.tsx and layout.tsx: integration with existing application.
- app/preview/dashboard/page.tsx: standalone review route.

## Validation

- TypeScript: `npx tsc --noEmit` passed.
- Targeted ESLint for new dashboard components and routes passed.
- `node --test tests/dashboard-data.test.cjs`: 15 passing checks, including all nine period/route combinations, financial reconciliation, chart/table totals, zero baselines and voyage rounding.
- Production build: `npm run build` passed across 37 routes.
- Browser checks: filter updates, review and undo state, finance/operations presets, assistant visibility, sidebar collapse, calculated answers, vessel highlight, modal creation and local draft feedback.
- Responsive checks at desktop and 390px mobile width; main content does not overflow horizontally. The dense fleet table scrolls within its own container.

## Integration boundary

The existing report and management pages and their API integrations are preserved. This is a review frontend, not a replacement for production financial reporting until its fixtures are replaced with authenticated data. Browser storage is used only for the existing sidebar preference. Reviews and drafts reset on reload.

No dependency versions or lockfiles changed. The install reported existing dependency audit findings (1 moderate, 3 high, 1 critical); dependency upgrades are outside this UI change.
