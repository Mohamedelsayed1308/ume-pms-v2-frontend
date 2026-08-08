# PHASE 4 / MODULE 4 — Global Search & Command Palette — DATA MAPPING

Branch: `phase-4-analytics-operations`. **Frontend only.** No backend search engine; local filtering over existing datasets. Permission-aware.

## Searchable sources

| Source | API | Searchable fields | Volume | Permission (canAccess) | Nav target | Deep-link now? | Class |
|---|---|---|---|---|---|---|---|
| Suppliers | `/api/suppliers` | name, contact_person, email, phone, country | ~72 | `/dashboard/suppliers` | suppliers | ✅ `?q=name` | **A** |
| Vessels | `/api/vessels` | name, imo_number, vessel_type, shipping_company.name | ~7 | `/dashboard/vessels` | vessels | ✅ `?q=name` | **A** |
| Purchase Orders | `/api/purchase-orders` | po_number, supplier.name, vessel.name, description | ~41 | `/dashboard/purchase-orders` | POs | ✅ `?q=po_number` | **A** |
| Invoices | `/api/invoices` | invoice_number, supplier.name, vessel.name, po_number | ~218 | `/dashboard/invoices` | invoices | ✅ `?q=invoice_number` | **A** |
| Payments | `/api/payments` | reference, invoice.invoice_number, payment_method | ~17 | `/dashboard/payments` | payments | ✅ `?q=ref/inv#` | **A** |
| Tasks | `/api/tasks` | title, owner, team, notes | ~3 | `/dashboard/tasks` | tasks | ✅ `?q=title` | **A** |
| Reports | static catalog | report title (ar/en) + keywords | 9 | `/dashboard/reports` | Analytics Center | ⚠ screen only | **A/B** |
| Navigation | `SCREENS` (lib/screens) | screen label (ar) + EN name + href | ~15 | per-screen canAccess | screen href | ✅ | **A** |
| Quick-create | mapped | "Add/Create X" | 6 | per-screen canAccess | module screen | ⚠ screen only | **B** |

## Deep-link mechanism (safe, reusable, no backend)
Each list page seeds its existing search state from `?q=` on mount via `lib/useInitialQuery.ts` (client-only `window.location.search` read — avoids `useSearchParams` static-prerender bailout). Implemented on suppliers, vessels, purchase-orders, invoices (`q`), payments, tasks. Result → navigates to the module **with the record filtered in view**.
- **Exact-record deep-link (auto-open drawer/detail):** not currently supported by list pages → navigate + filter is the safe equivalent. Documented.
- **Reports auto-select** and **quick-create auto-open-form**: navigate to the screen only (in-page state, no route) → **future enhancement**.

## Fetch / cache strategy (`Search fetch strategy`)
- Datasets fetched **once on first palette open**, only for categories the user `canAccess` (Promise.all). Cached for the session (`loaded` flag). Re-open = no fetch.
- **Typing triggers ZERO API calls** (local filtering); 120 ms debounce on the filter term only.
- The bell/notifications provider and dashboard already load invoices/tasks/payments; the palette's one-time fetch is independent (kept simple; still one-time). No per-keystroke or per-render fetching.

## Matching & ranking
- Normalize: lowercase, collapse whitespace, trim. Arabic/English compatible (`includes`).
- Rank per field: exact(0) < starts-with(1) < contains(2); best across fields.
- Groups ordered by **best rank within group** (so an exact invoice/PO number floats its group to top — not buried), tie-broken by fixed priority (commands, suppliers, vessels, POs, invoices, payments, tasks, reports). Top 8 per group.

## Financial safety
Amounts always shown **with their currency**, never aggregated; no new totals computed; payments shown from Payments API only (not inferred from paid invoices).

## Permissions (critical)
Every category, record, navigation command, and quick-create is gated by existing `canAccess(user, screen)`. Inaccessible categories are **not fetched and not shown**. Verified with a restricted user (see VALIDATION).

## Local state
`localStorage: ume_search_recent` — **query strings only** (no financial result details), max 6, with Clear. Local to browser.
