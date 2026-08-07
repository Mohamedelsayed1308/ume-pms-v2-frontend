# PHASE 2 — DATA MAPPING & FINANCIAL DEFINITIONS

Read-only discovery of what reliable data exists before building the executive/finance dashboard.
Sources: NestJS backend (`ume-pms-v2`) entities/controllers/services + existing frontend API usage.

## 0. The single most important constraint — CURRENCY
**There is NO currency-conversion logic anywhere in the backend.** Exchange rates ARE stored
(`exchange_rates.rates` monthly `{EGP,SAR,EUR,…}` per 1 USD; `currencies.rate_to_usd`) but **no code ever applies them**.
Multi-currency entities: supplier `Invoice` (USD default), `Payment` (USD), `HireInvoice` (EUR default),
`HirePayment` (EUR), `ManagementInvoice` (USD), `ManagementPayment` (USD). Values are free-text `varchar(10)`.

➡ **Rule for Phase 2: never add different currencies into one figure.** Every money KPI is shown **per currency**
(subtotals grouped by currency). A single converted-to-USD figure is classified **C** and requires business
confirmation of the conversion rule (which rate, which date for multi-month ranges) — deferred, not built now.

## 1. The system has THREE separate invoice models (do not conflate)
| Model | Amount field | Currency default | Status source | Meaning |
|-------|-------------|------------------|---------------|---------|
| `Invoice` (supplier) | `total_amount` | USD | enum + `approval_status='paid'` shortcut* | **Payables / expenses** |
| `HireInvoice` (customer) | `total_amount` | EUR | string, payments only | **Receivables / hire revenue** |
| `ManagementInvoice` | `amount` (⚠ not total_amount) | USD | string, payments only | Management fees per vessel (nature: **flag**) |

*Supplier invoices can be marked fully paid via `approval_status='paid'` with **no Payment rows** — `paid_amount` is set = `total_amount` (invoices.service.ts:32-34, 42-44). Consequence: a "payments this period" figure built only from the `payments` table **undercounts** settled amounts.

Separate operational sources: **Fleet dashboard** (`/api/fleet/dashboard`, USD, live from Google Sheet — per vessel/month voyages, revenue, expenses, net) and **ProfitPeriod** (ferry P&L ledger). These are NOT in the invoicing tables.

## 2. Metric classification (A = available now · B = derivable in FE · C = backend/biz enhancement · D = not reliable)
| Metric | Class | Source & formula (per currency unless noted) |
|--------|:----:|----------------------------------------------|
| Outstanding **Payables** | **A/B** | `GET /api/invoices` → Σ(`total_amount`−`paid_amount`) where status∈{unpaid,partial}, grouped by `currency` |
| Outstanding **Receivables** | **A/B** | `GET /api/hire-invoices` → Σ(`total_amount`−`paid_amount`) where status∈{unpaid,partial}, by `currency` |
| Management fees outstanding | **A/B** | `GET /api/management-invoices` → Σ(`amount`−`paid_amount`) unpaid/partial, by `currency` |
| **Overdue** payables (amount+count) | **A** | `GET /api/invoices/alerts/due?days=0` → `is_overdue` items; hire/management have **no due_date** → overdue N/A for them (**D**) |
| Invoices **due soon** | **A** | `GET /api/invoices/alerts/due?days=30` |
| **Payments recorded** in period | **B** | supplier `GET /api/payments` filter `payment_date`∈period, Σ by `currency` (⚠ excludes approval-paid; excludes hire/mgmt unless fetched nested) |
| Invoice **status distribution** | **A/B** | count-by-`status` from `GET /api/invoices` |
| **Top suppliers by spend** | **B** | Σ `total_amount` per supplier (by currency) from `GET /api/invoices`; or per-vessel via `/api/vessels/:id/suppliers` |
| **Approval bottlenecks** (dept delays) | **A** | `GET /api/invoices/report/department-delays` (>3 days) |
| **Overdue tasks** | **A/B** | `GET /api/tasks` where `due_date` < today & status≠done/cancelled |
| **Fleet** revenue/expenses/net per vessel (operational) | **A** | reuse `GET /api/fleet/dashboard` (USD, already aggregated) |
| **Recent activity** (invoices/payments/hire/tasks) | **B** | sort existing list endpoints by `created_at` |
| Per-supplier totals | **A** | `GET /api/suppliers/:id/stats` (total_invoiced/paid/outstanding) |
| Per-vessel expense totals | **A** | `GET /api/vessels/:id/stats`, `/api/vessels/:id/suppliers` |
| Company-wide **Total Revenue** (one figure) | **C/D** | fragmented (hire EUR + fleet USD + ferry) & multi-currency → **flag** |
| Company-wide **Total Expenses** (one figure) | **C/D** | supplier + management + fleet, multi-currency → **flag** |
| **Net Profit / Profit Margin** (company) | **D** | needs common-currency revenue−expenses; not reliable now. Fleet-only net IS available (USD) and shown separately |
| Converted-to-USD unified totals | **C** | needs confirmed conversion rule + rates application |

## 3. Financial definitions to CONFIRM (flagged — will not build until confirmed)
1. **Currency presentation** — show every money KPI split **per currency** (recommended, 100% accurate), OR convert everything to USD using stored monthly rates (needs your OK on: use the invoice-date month's rate? the selected-period rate? `rate_to_usd` vs `exchange_rates`?).
2. **What is "Revenue" for the cockpit?** Options: (a) Hire/charter invoices only (customer A/R); (b) Fleet operational revenue (Google-sheet, USD); (c) both shown as separate streams. They live in different tables/currencies and cannot be summed reliably.
3. **What is "Expenses"?** Supplier invoices only, or + Management invoices, or + Fleet operational expenses? (different currencies/sources).
4. **Management invoices (`فواتير الإدارة`) nature** — are they an **expense/charge to vessels** or **revenue to UME**? Determines which KPI they feed.
5. **"Payments this period"** — accept the recorded-payments-table view (excludes approval-paid settlements), or should approval-paid amounts count as settled on `approval_status_date`?

## 4. Proposed Phase 2 scope (build only A/B, accurate, per-currency)
- **Layer 1 KPIs:** Outstanding Payables (per ccy), Outstanding Receivables (per ccy), Overdue payables (amount+count), Payments recorded this period (per ccy), Open invoices count/status split. Fleet operational Net/Revenue/Expenses shown as a **clearly-labeled USD "Fleet (operational)" group** (reuse fleet endpoint). No single mixed-currency "Net Profit".
- **Layer 2 Needs Attention:** overdue invoices, due-soon, approval bottlenecks (dept-delays), overdue tasks — all real endpoints, with counts + navigation.
- **Layer 3 Charts:** Payables aging (per ccy), hire-revenue trend by invoice_date, fleet net trend (reuse) — each with loading/empty/error + tooltips.
- **Layer 4 Fleet Snapshot:** reuse `/api/fleet/dashboard` per-vessel (USD) — the only reliable per-vessel P&L.
- **Layer 5 Cash & Payments:** payments this period (per ccy), top suppliers by spend (per ccy), status distribution.
- **Layer 6 Recent Activity:** recent invoices/payments/hire/tasks by `created_at`.
- **Layer 7 Quick Actions:** Add Invoice/Payment/Supplier/PO/Task/Reports — gated by `canAccess()`.
- **Period selector:** Today/Week/Month/Quarter/Year/Custom (default Month). Filters payments (payment_date), invoices (invoice_date/due_date), tasks (due_date). Fleet uses its own month range.

## 5. Performance & endpoints
Reuse existing list endpoints (`/api/invoices`, `/api/hire-invoices`, `/api/management-invoices`, `/api/payments`, `/api/tasks`, `/api/fleet/dashboard`) and aggregate in the frontend (datasets are modest: ~218 invoices, ~17 payments, etc.). **No new backend endpoints** in Phase 2. Future recommendation (documented, not built): a backend `/api/dashboard/summary` that returns pre-aggregated, currency-normalized totals to avoid multiple client fetches.

## 6. Guardrails honored
No DB/entity/schema/backend change. No production deploy. No secrets exposed. No new data sent to external AI. All new components bilingual (Phase 1 i18n) + per-currency formatting + loading/empty/error states.
