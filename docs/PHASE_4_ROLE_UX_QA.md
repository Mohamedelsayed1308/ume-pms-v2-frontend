# PHASE 4 / MODULE 5 — Role-Sensitive UX — QA

Branch: `phase-4-analytics-operations`. **Frontend only.** No backend/entity/schema/JWT/permission-field change; no new roles.
Validation: `tsc --noEmit` ✅ · `npm run build` ✅ (21 pages). Live smoke with 4 locally-injected QA profiles (no real user modified).

## What changed
- `lib/profile.ts` — `canHref`, `deriveProfile` (admin/management/finance/operations/limited), `kpiOrder`, profile labels. **Display/emphasis only — never authorization.**
- **Dashboard** (`app/dashboard/page.tsx`): permission-check→fetch (only accessible modules); every KPI/section/quick-action gated by `canHref`; KPI order + greeting chip by profile; limited-user welcome.
- **Notifications** (`lib/notifications.tsx`): fetch gated (invoices/tasks/payments); output filtered by category→screen access. **Notifications center**: empty category tabs hidden.
- **Reports** (`app/dashboard/reports/page.tsx`): catalog filtered by `REPORT_REQUIRES` data-source access; `openReport` guarded.
- **Global Search**: Module-4 gating preserved (no change needed; re-verified).

## Test results

| Item | Result |
|---|---|
| Admin experience | ✅ full (all modules/KPIs/reports/notifications/search) |
| Finance-like experience | ✅ finance emphasis; no fleet/receivables; only invoices+payments fetched |
| Operations-like experience | ✅ tasks+fleet; no financial KPIs; ops chip |
| Limited-user experience | ✅ welcome, 1 quick action, **0 unauthorized API** |
| Sidebar filtering | ✅ per `canAccess` |
| Empty-group hiding | ✅ (sidebar + notification category tabs) |
| Dashboard personalization | ✅ KPI order + greeting chip by profile |
| KPI permission filtering | ✅ each KPI gated by data screen |
| Quick Actions | ✅ gated; card hidden if none |
| Notifications filtering | ✅ no restricted category/data; fetch gated |
| Bell count | ✅ reflects only visible actionable items (Limited=0, Finance=51, Admin=57) |
| Global Search filtering | ✅ categories/records/commands/quick-create gated (vessel search shows no vessel group for finance) |
| Command filtering | ✅ Open/Add commands gated |
| Reports filtering | ✅ vessel/fleet reports hidden for finance; supplier/invoice shown |
| API fetch behavior | ✅ permission→fetch; no restricted calls (Limited=0, Finance=invoices+payments, Ops=tasks+fleet) |
| Users page | ✅ **unchanged** (no regression; recommendation documented) |
| Arabic / RTL | ✅ |
| English / LTR | ✅ (profile labels + welcome bilingual) |
| Mobile 375 / 768 / Desktop | ✅ dashboard no page overflow (finance profile) |
| Console | ✅ no errors |
| Network | ✅ no unnecessary restricted-module calls |
| Security / data leakage | ✅ none |

## Regression (all PASS)
- Reports currency separation — PASS
- Tasks list/kanban/calendar — PASS (count 3)
- Notifications logic (admin) — PASS (57)
- Search Ctrl/⌘K + deep-link — PASS
- Invoice outstanding `total − paid_amount` — PASS
- Payments actual-only (17 vs 144) — PASS
- Suppliers/Vessels/PO Phase-3 behavior — PASS

## Defects
- **P0 (unauthorized exposure / permission bypass / wrong financial visibility):** 0
- **P1:** 0 · **P2:** 0
- **P3 (environmental):** screenshot pane not compositing (validated via DOM/JS + API).

## Known limitations
- Reports page loads vessel/supplier **name lists** for its filter dropdowns even for users lacking those screens (required by accessible invoice-based reports, e.g. unpaid-vessel). Names only, not restricted financial data — documented.
- Derived profiles are frontend emphasis only; not persisted; do not alter authorization.
- Users management screen intentionally unchanged.
- Restricted-profile QA via locally-injected user objects (no real production permissions changed).

## Status
- **Production `main`:** untouched (do NOT merge — awaiting Release 2 approval). **Preview:** `phase-4-analytics-operations`.
