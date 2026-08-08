# PHASE 4 / MODULE 3 — Notifications — VALIDATION (live source vs UI)

Independent counts computed from `/api/invoices`, `/api/tasks`, `/api/payments` (authenticated) and matched to the rendered Attention Center.

## Counts (validated)

| Metric | Source (API) | UI Center | Match |
|---|---|---|---|
| **Total actionable** | 57 | 57 | ✅ |
| Financial category | 51 | 51 | ✅ |
| Tasks category | 3 | 3 | ✅ |
| Fleet category | 3 | 3 | ✅ |
| Severity Critical | 13 | 13 | ✅ |
| Severity Warning | 30 | 30 | ✅ |
| Severity Info | 14 | 14 | ✅ |
| Invoice overdue | 25 | — | ✅ |
| Invoice due-soon (≤7d) | 8 | — | ✅ |
| Invoice awaiting approval | 11 | — | ✅ |
| Invoice partial | 0 | — | ✅ |
| Task overdue | 3 (1 urgent) | 3 | ✅ |
| Task due today | 0 | 0 | ✅ |
| Payment mismatch | 0 | 0 | ✅ |
| Large payment (≥50k) | 3 | 3 | ✅ |
| Supplier material (≥50k/ccy) | 4 | 4 | ✅ |
| Vessel material (≥50k/ccy) | 3 | 3 | ✅ |

**Cross-check:** Financial 44(invoice)+3(payment)+4(supplier)=51 ✅ · Info 11(awaiting)+3(large)+0(partial)=14 ✅ · Critical 12(material-overdue invoices)+1(urgent task)=13 ✅ · Warning 13(overdue non-critical)+8(due-soon)+2(task overdue)+4(supplier)+3(vessel)=30 ✅.

## Currency values
- Supplier/vessel rollups shown **per currency** (`fmtCcyMap`), never summed across USD/EUR/SAR.
- Sample sort (critical-first, most overdue): Invoice 500-106305 overdue 90d · F-26060 67d · 2280421 58d — outstanding shown with each invoice's own currency.

## Navigation targets (existing routes)
invoice_* → `/dashboard/invoices` · task_* → `/dashboard/tasks` · payment_* → `/dashboard/payments` · supplier_outstanding → `/dashboard/suppliers` · vessel_outstanding → `/dashboard/vessels`. All verified reachable; deep-link to a specific record would need routing changes (not in scope).

## Regression checks
- **Reports currency:** Alcudia unpaid = USD 302,448.17 · EUR 1,915.59 · SAR 890 (separate) — **PASS**.
- **Invoice outstanding:** engine uses `total_amount − paid_amount` — **PASS**.
- **Payment distinction:** 17 actual payments vs 144 paid invoices; alerts use only the 17 — **PASS**.
- **Tasks:** compute skips status∈{done,cancelled}; no completed/cancelled task flagged overdue — **PASS**.
