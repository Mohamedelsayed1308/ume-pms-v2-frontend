# PHASE 4 / MODULE 1 — Reports & Analytics Center — DATA MAPPING (DISCOVERY)

Branch: `phase-4-analytics-operations` (from production Release 1 `d7f3ebd`). Frontend only.
Scope: modernize the Reports area into a **UME Analytics Center**. **No report removed. No calculation changed** (one currency-safety aggregation correction is documented explicitly below).

Source files inspected:
- `app/dashboard/reports/page.tsx` (797 lines) — orchestrator + filter-based reports
- `app/dashboard/reports/FleetDashboard.tsx` (+ `FleetAssistant.tsx`)
- `app/dashboard/reports/VesselProfitReport.tsx` (+ `VesselExecReport.tsx`)
- `app/dashboard/reports/GubalProfitReport.tsx`
- `app/dashboard/reports/ExchangeRatesCard.tsx`

---

## 1. Inventory (12 reports + 1 sub-view)

### R1 — Fleet Executive Dashboard
- **id/route:** `fleet-dashboard` · `FleetDashboard.tsx`
- **Purpose:** live fleet operational + financial trends, per-vessel comparison, movement counts, AI assistant.
- **Data source:** `GET /api/fleet/dashboard` (live Google Sheet, 5-min cache) + `POST /api/fleet/assistant`.
- **Filters:** period (in-component from/to), vessel multi-select.
- **Financial calc:** monthly aggregates from sheet; negatives handled as magnitude bars. No cross-currency sum.
- **Currency:** sheet is single-currency per its own design (USD-denominated fleet figures).
- **Vessel dep:** yes (ALCUDIA/PELAGOS/POSEIDON/AMAL/DALEELA). **Supplier dep:** no. **Period dep:** yes.
- **Permissions:** reports screen access. **Export:** none currently.
- **Limitations:** depends on external sheet availability (has last-good fallback).
- **Dashboard overlap:** Fleet snapshot on home = summarized subset.
- **Class:** Fleet / Operational Trends.

### R2 — Pelagos Profitability
- **id/route:** `vessel-profit` · `VesselProfitReport config={PELAGOS}`
- **Purpose:** monthly revenue/expense/liquidity income statement for Pelagos; Bassam agent-liquidity card.
- **Data source:** `GET/PUT /api/vessel-profit/Pelagos` + Excel upload parse (xlsx) + `GET /api/invoices/by-vessel/:id` + `GET /api/exchange-rates` + `BassamAccountPelagos` (localStorage).
- **Filters:** month selector; Excel import; exec summary modal (`VesselExecReport`).
- **Financial calc:** voyage-level net = income − expenses − bunker; balance col; Bassam liquidity col AK(36).
- **Currency:** USD (rates used only to normalize imported invoice lines).
- **Vessel dep:** Pelagos. **Supplier dep:** via linked invoices. **Period dep:** month.
- **Export:** Excel (`ربح-Pelagos-<month>`). **Permissions:** reports access.
- **Limitations:** **partial / source-limited** — depends on uploaded voyage Excel; labeled as such.
- **Class:** Fleet / Vessel Profitability.

### R3 — Alcudia Profitability
- Same component/engine as R2, `config={ALCUDIA}` (`Alcudia Express`, `hideAgentLiquidity`, bunker col 25, balance col 35, bassamLiq col 36). Store `BassamAccount` (default). **Class:** Fleet / Vessel Profitability.

### R4 — Gubal Profitability
- **id/route:** `gubal-profit` · `GubalProfitReport.tsx`
- **Data source:** `GET/PUT /api/vessel-profit/Gubal`. **Currency:** USD. Monthly / period-to-period income statement (Gubal Trader). **Export:** Excel/print. **Class:** Fleet / Vessel Profitability.

### R5 — Supplier Statement (multi)
- **id/route:** `supplier-statement`
- **Data source:** `GET /api/invoices/statement/supplier/:id` (one call per selected supplier).
- **Filters:** multi-supplier (search + select all).
- **Financial calc:** per-transaction debit/credit + running balance; per-supplier summary {total_debit,total_credit,balance}.
- **⚠ Currency:** grand-total row currently **sums debit/credit across all suppliers regardless of currency** (`gD`,`gC`). → corrected to per-currency-aware presentation (see §3).
- **Export:** multi-sheet Excel (one sheet/supplier). **Class:** Suppliers & Payables / Supplier Statement.

### R6 — Supplier Outstanding (multi)
- **id/route:** `unpaid-supplier`
- **Data source:** `GET /api/invoices/unpaid/by-supplier/:id` (per supplier) + attachments per invoice.
- **Financial calc:** per-invoice remaining = `total_amount − paid_amount` (matches Release 1 rule). Section + grand summary sum total & remaining.
- **⚠ Currency:** grand + section `total`/`remaining` currently summed across currencies. → per-currency (see §3).
- **Export:** multi-sheet Excel. **Class:** Suppliers & Payables / Supplier Outstanding.

### R7 — Vessel Suppliers (spend)
- **id/route:** `vessel-suppliers`
- **Data source:** `GET /api/vessels/:id/suppliers`. **Filter:** vessel.
- **Calc:** per-supplier invoice count, total, paid, remaining (`total−paid`). **Export:** Excel. **Class:** Suppliers & Payables / Supplier Spend.

### R8 — Due Alerts
- **id/route:** `due-alerts`
- **Data source:** `GET /api/invoices/alerts/due?days=<n>` + attachments. **Filter:** days ahead (7/15/30/60/90/overdue-only).
- **Calc:** per-invoice remaining `total−paid`; overdue flag + days_until_due (backend). Table lists per-invoice with own currency (no summed total). **Export:** Excel. **Class:** Cash & Payables / Payables Aging.

### R9 — Outstanding by Vessel
- **id/route:** `unpaid-vessel`
- **Data source:** `GET /api/invoices/unpaid/by-vessel/:id` + attachments. **Filter:** vessel.
- **Calc:** per-invoice remaining `total−paid`.
- **⚠ Currency:** header total/remaining summed across currencies. → per-currency (see §3). **Export:** Excel. **Class:** Cash & Payables / Outstanding Obligations.

### R10 — Department Delays
- **id/route:** `dept-delays`
- **Data source:** `GET /api/invoices/report/department-delays` + attachments. **Filter:** none.
- **Calc (backend):** invoices >3 days in same approval_status; days_delayed, responsible department. **Export:** Excel. **Class:** Operations & Team / Department Delays.

### R11 — User Activity
- **id/route:** `user-activity`
- **Data source:** `GET /api/invoices/report/by-user`. **Filter:** none.
- **Calc:** invoice count per user + by-vessel breakdown; **share %** of total invoice count (count metric — safe to show as %). **Export:** Excel. **Class:** Operations & Team / User Activity.

### R12 — Exchange Rates
- **id/route:** `exchange-rates` · `ExchangeRatesCard.tsx`
- **Data source:** `GET/POST /api/exchange-rates`. Per-month currency rates vs USD + editable defaults. **Class:** Tools & Settings.

### Sub-view — Vessel Executive Summary
- `VesselExecReport.tsx` — modal launched *inside* R2/R3; not a standalone catalog entry.

---

## 2. Final report groups (Analytics Center)

Only groups backed by real reports/data are used:

| Category | Reports |
|---|---|
| **الأسطول والأداء / Fleet & Performance** | R1 Fleet Dashboard, R2 Pelagos, R3 Alcudia, R4 Gubal |
| **الموردون والمستحقات / Suppliers & Payables** | R5 Statement, R6 Supplier Outstanding, R7 Vessel Suppliers |
| **النقدية والاستحقاق / Cash & Aging** | R8 Due Alerts, R9 Outstanding by Vessel |
| **العمليات والفريق / Operations & Team** | R10 Dept Delays, R11 User Activity |
| **أدوات / Tools** | R12 Exchange Rates |

(Groups from the master-prompt catalog with **no backing report** — e.g. Payment Methods, Cash Outflow, Hire/Management Revenue, Customer Receivables, Revenue Trends — are intentionally **NOT** created; no fake analytics.)

---

## 3. Financial safety decisions (Release 1 rules preserved)

- **No per-record calculation changes.** Every per-invoice/per-transaction value renders exactly as before.
- **Outstanding = `total_amount − paid_amount`** everywhere (unchanged).
- **Actual Payments** remain distinct from invoice paid status (no payment reports fabricated).
- **PO invoiced value** not touched by this module.
- **Vessel profitability** stays labeled partial / source-limited.
- **Currency-safety correction (aggregation only):** the summary/grand-total rows in R5/R6/R9 previously summed amounts **across currencies** into one number — a violation of the Release 1 "never combine currencies" rule. These summary rows are changed to present totals **grouped per currency** (`sumByCurrency` / `fmtCcyMap` from `lib/format.ts`). This corrects a real defect and touches **aggregate display only**, never a per-record value. Documented and validated in `PHASE_4_REPORTS_QA.md`.

---

## 4. Charts introduced (only where they answer a business question)

- R1 already has sparklines/line/comparison (kept).
- Analytics Center home: NO heavy datasets loaded (catalog only) — performance rule.
- No new decorative charts added to filter-based reports in this module; charts stay where data supports them (R1, R2–R4 existing). Aging distribution chart considered but deferred (needs per-currency bucketing verification) — noted as known limitation, not shipped.

---

## 5. Reuse map (no new backend)

- APIs reused verbatim: `/api/suppliers`, `/api/vessels`, `/api/invoices/*` (statement, unpaid/*, alerts/due, report/by-user, report/department-delays, by-vessel), `/api/vessels/:id/suppliers`, `/api/vessel-profit/*`, `/api/fleet/*`, `/api/exchange-rates`, `/api/attachments/invoice/:id`.
- UI reused: `components/ui`, `components/ui/Icon`, `lib/i18n`, `lib/format`, `lib/period`.
- **Zero backend/DB/entity/auth change.**
