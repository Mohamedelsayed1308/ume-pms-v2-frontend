# PHASE 4 / MODULE 1 — Reports & Analytics Center — QA

Branch: `phase-4-analytics-operations` (from production Release 1 `d7f3ebd`). **Frontend only. No backend / DB / entity / auth change.**
Validation: `npx tsc --noEmit` ✅ clean · `npm run build` ✅ (20 pages, `/dashboard/reports` compiled).
Live smoke: local production build (`next start`) hitting **live Railway API**, authenticated as System Admin (user's own JWT). Financial reconciliation done independently via API and compared to rendered DOM.

---

## What changed
- `app/dashboard/reports/page.tsx` rebuilt as **UME Analytics Center**: searchable, categorized report catalog (home) + standardized report shell (icon, title, description, category badge, back button) + "recently used" (localStorage, safe).
- **All 12 reports preserved** — same routes/APIs/tables/exports/self-contained components (`FleetDashboard`, `VesselProfitReport` Pelagos/Alcudia, `GubalProfitReport`, `ExchangeRatesCard`) rendered unchanged under the new shell.
- **Currency-safety correction (aggregation display only):** summary/section totals in *Supplier Outstanding* (R6) and *Outstanding by Vessel* (R9) now group **per currency** via `sumByCurrency`/`fmtCcyMap`; *Supplier Statement* (R5) grand total carries an explicit mixed-currency caveat. No per-record value changed.
- Bilingual catalog + shell (AR/RTL, EN/LTR) via `lib/i18n`. Tables wrapped in `overflow-x-auto` for mobile.

---

## Test results

| # | Item | Result |
|---|------|--------|
| 1 | Every existing report accessible | ✅ 12/12 catalogued & openable |
| 2 | Existing calculations unchanged | ✅ per-invoice/per-txn values identical; outstanding = `total − paid_amount` |
| 3 | Report grouping | ✅ 5 categories (Fleet 4 · Suppliers 3 · Cash 2 · Ops 2 · Tools 1) |
| 4 | Report search | ✅ "ربح" → 3 profitability cards, other categories hidden; empty-state works |
| 5 | Recently used | ✅ localStorage `ume_report_recents`, max 4, dedup |
| 6 | Filters (supplier multi / vessel / days) | ✅ preserved verbatim |
| 7 | Period handling | ✅ Fleet dashboard from/to + month selectors intact |
| 8 | Currency handling | ✅ **per-currency** in R6/R9 (see reconciliation) |
| 9 | Charts | ✅ Fleet/vessel-profit charts intact; no fake charts added |
| 10 | Tables | ✅ render + `overflow-x-auto` scroll container |
| 11 | Exports (Excel/PDF) | ✅ all export handlers unchanged (single + multi-sheet) |
| 12 | Drill-down | ✅ user-activity by-vessel expand, statement/unpaid per-supplier sections intact |
| 13 | Permissions | ✅ reports screen gated by `canAccess` (layout guard); no change |
| 14 | Arabic / RTL | ✅ default, dir=rtl |
| 15 | English / LTR | ✅ toggle → dir=ltr, lang=en, English catalog; restores to RTL |
| 16 | Mobile 375px | ✅ single-column catalog, no page overflow, tables scroll in container |
| 17 | 768 / Desktop | ✅ 2–3 column responsive grid |
| 18 | Console | ✅ only 3 stale pre-auth 401s (injected-session artifact); **no new errors** |
| 19 | Network | ✅ authenticated calls 200; no unexpected calls on home (catalog only) |
| 20 | No financial regression | ✅ (reconciliation below) |

---

## Financial reconciliation (live API vs rendered DOM)

**Outstanding by Vessel — Alcudia Express** (independent API compute == UI):
- API per-currency: `USD 302,448.17 · EUR 1,915.59 · SAR 890.00` (6 invoices)
- UI header rendered: **`302,448.17 USD · 1,915.59 EUR · 890.00 SAR`** ✅ exact match
- Old (naive cross-currency sum): `305,253.76` — a genuine currency-mixing defect now corrected.

**Cross-check across all vessels:** every vessel with unpaid invoices carries **2–3 currencies** (USD/EUR/SAR) — confirming the summed figure was misleading fleet-wide; the per-currency view is materially more correct. Per-invoice rows unchanged (each shows its own currency).

Release 1 rules upheld: outstanding from stored `total − paid_amount`; actual Payments not synthesized; PO untouched; vessel profitability still labeled partial/source-limited; **no currency ever combined**.

---

## Defects
- **P0:** 0 · **P1:** 0 · **P2:** 0
- **P3 (environmental):** 3 stale `401` console entries from the initial pre-auth page load in the emulation browser (session injected after first render). Not an app defect — authenticated fetches return 200. Screenshot compositing unavailable in the pane (validated via DOM/JS + API, as in Phases 1–3).

## Known limitations
- Aging-distribution chart (per-currency bucketed) considered but **not shipped** this module (needs per-currency bucket verification) — deferred, documented, no fake chart added.
- Groups with no backing report (Payment Methods, Cash Outflow, Hire/Management Revenue, Customer Receivables, Revenue Trends) intentionally not created.

## Status
- **Production `main`:** untouched. **Preview:** `phase-4-analytics-operations` (Vercel Preview on push).
