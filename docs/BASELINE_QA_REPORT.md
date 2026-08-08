# BASELINE QA REPORT — UME PMS V2 (pre-modernization)

Reference snapshot of the CURRENT production system. Every future phase is tested against this.

- Baseline commit (frontend): `3fe2c84` · (backend): `aca8e554`
- Legend: ✅ pass · ❌ fail · ⚠️ issue · ⏳ pending live verification

> Structural discovery is complete (routes, APIs, components exist and build passes `tsc`).
> Runtime cells below marked ⏳ need a live login pass — to be filled by a guided browser smoke test
> against production (or a preview) before Phase 1 sign-off.

| # | Route | Loads | API | Data | Create | Edit | Delete | Search | Filters | Responsive | Notes |
|---|-------|:----:|:---:|:----:|:------:|:----:|:------:|:------:|:-------:|:----------:|-------|
| 1 | `/login` | ✅ | ✅ | ✅ | — | — | — | — | — | ✅ | 200; assets 200; 0 console errors; renders on mobile 375px |
| 2 | `/dashboard` | ⏳ | ⏳ | ⏳ | — | — | — | — | — | ⏳ | current home |
| 3 | `/dashboard/vessels` | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| 4 | `/dashboard/suppliers` | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | merge/dedupe exists |
| 5 | `/dashboard/purchase-orders` | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| 6 | `/dashboard/invoices` | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | multi-item, quick-pay, bulk |
| 7 | `/dashboard/items` | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| 8 | `/dashboard/payments` | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| 9 | `/dashboard/reports` | ⏳ | ⏳ | ⏳ | — | — | — | ⏳ | ⏳ | ⏳ | fleet dashboard default |
| 10 | `/dashboard/customers` | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| 11 | `/dashboard/hire-invoices` | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| 12 | `/dashboard/shipping-companies` | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| 13 | `/dashboard/management-invoices` | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | pay modal |
| 14 | `/dashboard/profit-distribution` | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| 15 | `/dashboard/tasks` | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | AI assistant |
| 16 | `/dashboard/users` (admin) | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — | — | ⏳ | permissions screen |

## Smoke test — session 1 (unauthenticated surface)
- Backend reachable post security-deploy: `/` → 404 (no root route), `/api/vessels` → 401, `/api/fleet/dashboard` → 401. Clean 401s + `synchronize:true` (which needs a live DB at boot) ⇒ **backend booted and DB connection succeeded**.
- Frontend `/login`: 200, all `_next` assets 200, **0 console errors**, form renders on desktop and mobile (375px).
- Confirmed issue: browser tab title is "Create Next App" (default metadata) — cosmetic.

## Blocked — needs an authenticated session (routes 2–16 + CRUD)
The 15 dashboard routes and CRUD flows require login. Claude will not enter passwords. To complete this section, choose one:
1. You log in yourself and walk the checklist, or
2. Authorize a Claude-in-Chrome session where you are already logged in (Claude drives read-only page loads), or
3. Provide a disposable test account via your password manager (values never shown to Claude).
CRUD smoke tests will use clearly-labeled disposable test records only (e.g. `TEST-QA-<timestamp>`), never real production records.

## Known issues observed during static discovery
- Root `app/layout.tsx` sets `lang="en"` and default `metadata` ("Create Next App") while the app is Arabic/RTL — cosmetic/SEO/i18n inconsistency.
- No mobile navigation: sidebar is fixed-width, no drawer → likely horizontal overflow / poor mobile UX.
- Wide financial tables (invoices/payments) rely on horizontal scroll only.
