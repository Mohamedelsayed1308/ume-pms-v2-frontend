# PHASE 3 — MODULE 4: INVOICES — DISCOVERY & DATA VALIDATION (STEP 1)

Read-only discovery + live reconciliation of the Accounts-Payable invoice model before any UI change.
No backend/entity/schema/API/logic changes. Live data via Railway (authenticated `admin@ume.com`).

## Invoice model (actual)
`Invoice`: `invoice_number`, `type` (preliminary|final), `status` (unpaid|partial|paid|cancelled),
`approval_status` (booking_waiting_payment|waiting_approval|waiting_po|send_to_pay|hold|delivery_missing|paid),
`approval_status_date`, `currency` (multi), `total_amount`, `paid_amount`, `remaining_amount` (getter = total−paid),
`invoice_date`, `due_date`, `description`, `comment`, `depreciation_months`, `item`/`item_id`,
`line_items` jsonb `[{item_id,item_name,amount}]`, `created_by_id/name`, `created_at/updated_at`.
Relations: `supplier` (required), `vessel` (nullable), `purchase_order` (nullable), `payments` (OneToMany), attachments (separate).

## 🔴 CRITICAL: approval_status = 'paid' couples approval → full payment (DO NOT CHANGE)
`invoices.service.ts`: on create (l.32-34) and update (l.42-44), when `approval_status === 'paid'` the backend sets
`status = PAID` and `paid_amount = total_amount` **without creating any Payment row**. Any other approval value → recompute
`paid_amount` = Σ linked payments (l.60-74). The quick-pay button uses `approval_status='paid'`.
**Live evidence:** 144 invoices are `paid`, but only **17 Payment rows** exist system-wide, and **128 invoices are `approval_status='paid'` with ZERO payment rows.**
Implications for the UI (must represent truth, add no logic):
- **Outstanding must use the stored `paid_amount`** (= total − paid_amount). Computing outstanding from the payments table would overstate it by ~millions.
- **Approval status, Payment status, and actual Payment transactions are three distinct things** and must be shown distinctly. An "approval-paid" invoice with no payment rows is normal and must NOT be shown as having a bank payment.

## Outstanding / Overdue / Due-soon (formulas used, matching backend)
- **Outstanding** = `total_amount − paid_amount` (stored paid_amount), per currency, for status ∈ {unpaid, partial}.
- **Overdue** = `due_date < today` AND status ∉ {paid, cancelled} AND outstanding > 0. (matches `getDueAlerts`: due_date ≤ date, status ≠ PAID.)
- **Due soon** = `today ≤ due_date ≤ today+7d` AND status ∉ {paid, cancelled}. Threshold **7 days** (documented; shown in tooltip).

## Live reconciliation (source of truth)
| Metric | Value |
|--------|-------|
| Total invoices | 218 |
| Status | unpaid 74 · partial 0 · paid 144 · cancelled 0 |
| Outstanding (per ccy) | USD 1,283,727.57 · EUR 110,873.03 · SAR 890 |
| Paid amount (per ccy) | USD 3,780,304.94 · EUR 207,057.31 · SAR 23,789.59 · CHF 25,384.94 |
| Overdue | 25 invoices · USD 1,097,732.67 · EUR 45,287.84 |
| Due soon (7d) | 7 |
| With PO / without PO | 27 / **191** (most have no PO — "missing PO" is normal, NOT an alert) |
| With vessel | 215 / 218 |
| Payment rows total | 17 |
| approval-paid with no payment row | **128** |
| Multi-item invoices | 6 |

## Duplicate control (existing)
Frontend uses a normalized supplier resolver + BUNKER keyword auto-classification. There is no hard invoice-duplicate block; the Suppliers module has duplicate detection. A frontend-only **warning** (same supplier + same invoice_number) can be added safely (warn, never block).

## AI assistant (existing — out of scope for Phase 3)
`InvoiceAssistant.tsx` + backend `invoices-assistant.controller.ts` (Claude over invoice data). **Not expanded**; no new external data flow. Security review deferred to Phase 5.

## Attachments
`POST/GET/DELETE /api/attachments/invoice/:id`. Preserved as-is; surfaced (view/upload) in the modernized UI using existing endpoints.

## Metric classification
A (direct): number, supplier, vessel, PO, dates, currency, total, paid, status, approval_status, line_items, created_by.
B (derivable): outstanding (per ccy), overdue, due-soon, status/approval counts, per-currency totals, invoiced value, duplicate-warning, payment history (from `/api/payments`).
C (backend): unified converted totals; server-side aggregation endpoint.
D (not available): tax, discount (no fields); cross-currency single total.

## Implementation scope (safety-first)
Modernize the **workspace/read layer** (header, financial summary per-currency, needs-attention, search, filters + preset views, sort, desktop table + mobile cards, detail drawer with distinct approval/payment/transaction sections, attachments view) using the Phase-1 design system + i18n.
**Preserve verbatim** (no logic/payload change): create/edit form incl. AI extraction, bulk upload, multi-item line editor + sum validation, manual-PO creation, charge-type/depreciation, quick-pay (`approval_status='paid'`), attachments upload, and the AI assistant.

## Post-implementation verification (DOM vs live API — recomputed, not copied)
| Metric | Rendered (DOM, modernized workspace) | Live source | Verdict |
|--------|--------------------------------------|-------------|---------|
| Total / unpaid / paid | 218 / 74 / 144 | identical | PASS |
| Outstanding (per ccy) | USD 1,283,727.57 · EUR 110,873.03 · SAR 890.00 | identical | PASS |
| Overdue | 25 · USD 1,097,732.67 · EUR 45,287.84 | identical | PASS |
| Case A — paid via approval, no payment row (inv `10567-1-2026`) | drawer: "مدفوعة عبر حالة الفاتورة / لا توجد معاملة دفع مسجّلة"; **no fabricated transaction** | 0 payment rows | PASS |
| Case B — real payment (inv `105302447`) | drawer: actual txn "2026-08-04 · bank_transfer · 25K USD" | 1 payment row | PASS |
| Case C — partial | none exist in system (partial=0) | — | N/A |
| Case D — quick-pay on QA invoice | unpaid→paid, paid_amount=total | matches | PASS |
| Case E — payment side-effects | **payments 17→17 (no row created), no orphan, QA invoice deleted, totals back to 218** | matches | PASS |

**Financial Workflow Technical Debt (documented, NOT fixed):**
`approval_status='paid' → status=PAID + paid_amount=total WITHOUT a Payment transaction.` To be redesigned later as a proper cycle: Invoice Approval → Payment Authorization → Actual Payment → Reconciliation. Out of scope for Phase 3.
