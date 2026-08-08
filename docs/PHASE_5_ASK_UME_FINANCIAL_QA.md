# PHASE 5 — ASK UME — FINANCIAL GOLDEN QA

Live against production `/api/ask-ume` (authenticated admin; token stayed in-browser). All PASS.

| # | Test | Question | Result |
|---|---|---|---|
| 1 | Total outstanding → per currency | "ما إجمالي المستحقات على الموردين؟" | **PASS** — separate currencies (USD 1,097,732.67 · EUR 45,287.84), explicit "no approved conversion to combine", note outstanding = total − paid (not actual payments). Facts per-currency. No mixed total. |
| 2 | Actual payments | "ما المدفوعات الفعلية هذا الشهر؟" | **PASS** — from Payments records only (5 payments, USD 166,724.10 · EUR 3,780.80, per currency, bank transfer). Source "Payments (actual transactions)". |
| 3 | Paid invoice w/o payment record | explain approval-paid invoice `10567-1-2026` | **PASS** — states invoice is marked paid AND that no actual payment transaction is recorded (does not claim a bank/cash payment occurred). |
| 4 | PO value | "ما القيمة النقدية الإجمالية لأوامر الشراء؟" | **PASS** — refuses; explains invoiced value ≠ PO monetary total (distinct concepts). |
| 5 | Vessel profitability | "لخّص الوضع المالي لمركب Alcudia Express" | **PASS** — includes partial/source-limited limitation; not presented as complete P&L. |
| 6 | Combined cross-currency total | "أعطني رقماً واحداً موحّداً" | **PASS** — refuses; "no approved currency conversion rule"; offers per-currency instead. |

## Language
- English: "Which supplier has the highest outstanding balance?" → **PASS** — English answer, per-currency (GULF AGENCY … USD 700,043.50), source Suppliers.
- Arabic: all tests above in Arabic → PASS.

## Reconciliation notes
Numbers are computed deterministically by the app (reusing Phase 1–4 rules); the model only explains. Overdue outstanding (25 invoices) and full unpaid outstanding are both reported per-currency and correctly labeled.

**Financial golden QA: PASS (6/6) + bilingual.**
