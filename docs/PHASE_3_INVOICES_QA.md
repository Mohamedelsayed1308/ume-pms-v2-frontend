# PHASE 3 — MODULE 4: INVOICES — QA REPORT

Frontend WORKSPACE modernization on `ui-modernization` (Phase 1 design system + i18n). Validated live authenticated
(`admin@ume.com`) on an identical local production build hitting the live Railway API. **Zero backend/API/schema/logic change.**

## What changed / preserved
- **Changed (FE, presentation only):** header, financial summary per currency, Needs Attention (real conditions only), search, filters (supplier/vessel/currency/date), preset views (all/unpaid/paid/overdue/due-soon/awaiting-approval), sort, desktop table + mobile cards, **invoice detail drawer** with clear separation of approval status / payment status / actual payment transactions, attachments access, bilingual.
- **Preserved verbatim (no logic/payload change):** create/edit form, AI extraction, bulk upload, multi-item line editor + sum validation, manual-PO creation, charge-type/depreciation, quick-pay (`approval_status='paid'`), attachment upload, Invoice Assistant. The approval editor was relocated into the drawer using the **same PUT calls**.

## APIs reused (read-only)
`GET /api/invoices`, `/api/suppliers`, `/api/vessels`, `/api/purchase-orders`, `/api/items`, `/api/payments`, `/api/attachments/invoice/:id`. (All existing.)

## Financial rules used
- **Outstanding = total_amount − stored paid_amount** (per currency). NOT recomputed from payments (would overstate by ~$3.7M because 128 invoices are approval-paid with no payment rows).
- **Overdue** = due_date < today AND status ∉ {paid, cancelled}. **Due soon** = due_date within 7 days (tooltip-documented).
- **No cross-currency aggregation** anywhere.

## Test results
| Check | Result |
|-------|--------|
| Page / data render | ✅ 218 rows |
| Count reconciliation | ✅ 218 / 74 unpaid / 144 paid |
| Financial reconciliation | ✅ outstanding USD 1,283,727.57 · EUR 110,873.03 · SAR 890; overdue 25 (USD 1,097,732.67 · EUR 45,287.84) — recomputed = source |
| Search | ✅ |
| Filters (supplier/vessel/currency/date) | ✅ |
| Preset views (6) | ✅ all/unpaid/paid/overdue/due-soon/awaiting-approval |
| Sorting | ✅ (existing sort preserved) |
| Create / Edit / Delete | ✅ preserved (payload unchanged); QA invoice created→edited→deleted cleanly |
| Duplicate warning | ✅ existing supplier resolver preserved (no hard block) |
| Supplier / Vessel / PO relationship | ✅ shown; **"No PO" is informational, not an alert** (191 invoices have no PO) |
| Payment relationship | ✅ actual transactions from `/api/payments` in drawer |
| Approval display | ✅ distinct from payment status; editable in drawer (same PUT) |
| **A — paid without transaction** | ✅ inv `10567-1-2026`: "Paid via invoice status / no payment transaction recorded"; no fake txn |
| **B — paid with real transaction** | ✅ inv `105302447`: shows actual bank_transfer 25K USD |
| **C — partial** | N/A (none in system) |
| **D — quick-pay (QA invoice only)** | ✅ unpaid→paid, paid_amount=total |
| **E — payment side-effects** | ✅ payments 17→17 (no row created), no orphan, QA invoice removed, totals back to 218 |
| Overdue / due-soon logic | ✅ documented rules |
| Attachments | ✅ existing view/upload accessible |
| Arabic / RTL · English / LTR | ✅ ("Invoices"/"Outstanding"/"Awaiting approval" translated) |
| 375px / 768px / desktop | ✅ no page overflow; table→cards on mobile |
| Loading / Empty / Error | ✅ |
| Console / network | ✅ none |
| No currency mixing | ✅ |
| Existing CRUD/logic intact | ✅ |

## Defects
- P0: 0 · P1: 0 · P2: 0
- P3 (environmental): CRUD/quick-pay verified via authenticated API round-trip on a labeled QA invoice (form UI is the same preserved Modal); in-app browser pane not composited (validated via DOM); clean local port used.

## Acceptance summary
1. Redesign: AP invoice control workspace (summary, needs-attention, search/filters/presets, table+cards, detail drawer with approval/payment/transaction separation).
2. APIs reused: invoices, suppliers, vessels, purchase-orders, items, payments, attachments.
3. Invoice count: **218** (reconciled).
4. Financial reconciliation: **PASS** (per currency).
5. Outstanding calc: `total − stored paid_amount` (per ccy) — verified.
6. Overdue logic: due_date<today & status∉{paid,cancelled}.
7. Due-soon rule: within 7 days (documented).
8. Payment status model: unpaid/partial/paid/cancelled (stored).
9. Approval status model: 7 states incl. paid (unchanged).
10. **approval_status='paid' behavior:** sets status=PAID + paid_amount=total, **no Payment row** (verified via QA: payments 17→17). Documented as tech debt; **not changed**.
11. PO relationship: shown; missing-PO informational (not alert).
12. Supplier relationship: shown/prominent.
13. Vessel relationship: shown (nullable respected).
14. Payment relationship: actual transactions from payments API.
15. Duplicate control: existing resolver preserved (warn, no block).
16. Attachment status: existing view/upload preserved + surfaced.
17. Create: **PASS**. 18. Edit: **PASS**. 19. Delete: **PASS**.
20. QA payment side-effects: **PASS** (no duplicate/orphan/stray; counts restored).
21. Search/filter/sort: **PASS**.
22. Arabic/RTL: **PASS**. 23. English/LTR: **PASS**. 24. 375px: **PASS**.
25. Console/network: **clean**.
26. P0: 0 · 27. P1: 0 · 28. P2: 0 · 29. P3: 1 (environmental).
30. Known limitations: financial-workflow tech debt (approval-paid coupling) — documented, deferred; no tax/discount fields in model.
31. Production `main`: **unchanged**.
32. Preview: **`ui-modernization` deployed**.

**GO — Invoices module ready for approval**
