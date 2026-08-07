# BASELINE QA REPORT — UME PMS V2 (pre-modernization)

Reference snapshot of the CURRENT production system. Every future phase is tested against this.

- Baseline commit (frontend): `3fe2c84` · (backend): `aca8e554`
- Legend: ✅ pass · ❌ fail · ⚠️ issue · ⏳ pending live verification

> Structural discovery is complete (routes, APIs, components exist and build passes `tsc`).
> Runtime cells below marked ⏳ need a live login pass — to be filled by a guided browser smoke test
> against production (or a preview) before Phase 1 sign-off.

| # | Route | Loads | API | Data | Create | Edit | Delete | Search | Filters | Responsive | Notes |
|---|-------|:----:|:---:|:----:|:------:|:----:|:------:|:------:|:-------:|:----------:|-------|
| 1 | `/login` | ⏳ | ⏳ | — | — | — | — | — | — | ⏳ | JWT → localStorage |
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

## Known issues observed during static discovery
- Root `app/layout.tsx` sets `lang="en"` and default `metadata` ("Create Next App") while the app is Arabic/RTL — cosmetic/SEO/i18n inconsistency.
- No mobile navigation: sidebar is fixed-width, no drawer → likely horizontal overflow / poor mobile UX.
- Wide financial tables (invoices/payments) rely on horizontal scroll only.
