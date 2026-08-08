# PHASE 3 — MODULE 5: PAYMENTS — DISCOVERY & DATA VALIDATION

Read-only discovery + live reconciliation. Payments = **ACTUAL payment transactions** from `/api/payments` only.
No backend/entity/schema/API/logic change.

## Payment model (actual, from code)
`Payment`: `amount`, `currency` (own, default USD), `payment_date`, `payment_type` (advance|installment|full),
`payment_method` (bank_transfer|cheque|cash), `reference`, `notes`, `created_at`. Relation: `invoice` (ManyToOne, `invoice_id`).
- **No `status` column** on Payment → "payment status" is D (not shown; the table shows *invoice* status, labeled as such).
- **No PUT endpoint** → editing a payment is **not supported** (documented; delete + re-record).
- Endpoints: `GET /api/payments` (all, with invoice→supplier/vessel), `GET /by-invoice/:id`, `GET /:id`, `POST`, `DELETE`.

## Side-effect behavior (from `payments.service.ts`, verified live on QA data)
- **Create Payment → `updatePaidAmount(invoice)`**: invoice `paid_amount` = Σ payments; status recomputed (unpaid/partial/paid).
- **Delete Payment → `updatePaidAmount`**: reverses paid_amount + status.
- **No edit** (no PUT).
- Multiple payments per invoice: supported (OneToMany). Partial: supported by backend.
- Overpayment: backend does not block (sum ≥ total ⇒ status paid). No new block added in UI (warn-only if implemented).
- Payment currency may differ from invoice currency (no conversion) → flagged informationally.

## Metric classification
A: amount, currency, date, method, type, reference, notes, invoice link. B: per-currency totals, per-method counts, suppliers-paid, per-period, high-value, currency-mismatch, invoice financial context (total/paid/outstanding via stored paid_amount), other-transactions-per-invoice. D: payment status (no field), edit (no endpoint).

## Live reconciliation (recomputed, not hard-coded)
| Metric | Value |
|--------|-------|
| **Actual payment transactions** | **17** (NOT the 144 invoices marked paid) |
| Total paid by currency | USD 499,941.17 · EUR 26,431.87 · CHF 25,384.94 · SAR 19,869.70 |
| By method | bank_transfer: 17 |
| Suppliers paid | 11 |
| Invoices with multiple payments | 0 (Case C = N/A) |

## Critical sample tests
- **A — invoice paid without payment record:** the workspace shows only 17 real rows; approval-paid invoices (128 of them) do NOT appear as payments. No synthetic payment created. **PASS.**
- **B — invoice with real payment:** e.g. inv SIN 26418 → transaction shown in table + drawer. **PASS.**
- **C — multiple payments:** none exist → N/A.
- **D — partial (QA invoice):** created QA invoice (100) → payment 40 ⇒ invoice partial/paid_amount 40; payment 60 ⇒ paid/100; delete both ⇒ unpaid/0. **PASS.**
- **E — currency integrity:** USD/EUR/CHF/SAR kept separate everywhere; never summed. **PASS.**

## Side-effect QA (create/edit/delete) — live on QA records, cleaned
| Step | Invoice status | Invoice paid_amount | Payment count |
|------|----------------|---------------------|---------------|
| QA invoice created | unpaid | 0.00 | 17 |
| + payment 40 | **partial** | 40.00 | 18 |
| + payment 60 | **paid** | 100.00 | 19 |
| delete both payments | **unpaid** | 0.00 | 17 |
| delete QA invoice | — | — | 17 (invoices 218) |
**Result:** create updates paid_amount + status; delete reverses; no orphan/duplicate; counts restored (payments 17, invoices 218). Edit not tested (no PUT).
