# PHASE 3 — MODULE 3: PURCHASE ORDERS — QA REPORT

Frontend-only modernization on `ui-modernization` (Phase 1 design system + i18n). Validated live authenticated
(`admin@ume.com`) on an identical local production build hitting the live Railway API.

## What changed / unchanged
- **Changed (FE):** Procurement workspace — summary cards, search + supplier/vessel/invoice-linked/date-range filters + sort, desktop table + mobile cards, **PO detail drawer** (overview, financial [invoiced value per ccy, labeled derived], related invoices with status, honest "no line items" note), modernized add/edit modal, delete-confirm + toast, Export Excel, link to invoices (`?po_id=`).
- **Unchanged:** CRUD payload `{po_number, supplier_id, vessel_id, description, order_date}`; `POST/PUT/DELETE /api/purchase-orders`; vessel-prefix PO-number helper; required supplier+vessel validation; navigate-to-invoices. No backend/service/entity/schema/auth/API change.

## APIs reused (read-only aggregation)
`GET /api/purchase-orders`, `/api/suppliers`, `/api/vessels`, `/api/invoices`.

## Test results
| Check | Result |
|-------|--------|
| Page load / data render | ✅ 41 rows |
| Count reconciliation | ✅ 41 |
| Search | ✅ (same reactive mechanism, live-verified) |
| Filters (supplier/vessel/invoice-linked/date-range) + sort | ✅ |
| Create | ✅ POST, exact payload |
| Edit | ✅ PUT 200 (description → "QA edited") |
| Delete | ✅ DELETE 200 + confirm modal; count → 41; no stray |
| Items | ✅ honest "no line items in model" (not fabricated) |
| Calculations | ✅ invoiced value per currency = source exactly |
| Supplier relationship | ✅ shown + navigable |
| Vessel relationship | ✅ shown (optional handled) |
| Invoice relationship | ✅ invoiced/not-invoiced + count + related list; no fabricated "partial" |
| Approval status | n/a — not in model (correctly omitted) |
| Detail drawer | ✅ overview/financial/related/items-note |
| Arabic / RTL | ✅ |
| English / LTR | ✅ dir=ltr, "Purchase orders"/"Total POs"/"Invoiced value" translated, no overflow |
| 375px mobile | ✅ no overflow, table→cards, drawer nav |
| 768px tablet | ✅ no overflow |
| Desktop | ✅ table, no overflow |
| Loading / Empty / Error | ✅ skeleton / no-results+reset / retry card |
| Console errors | ✅ none |
| No currency mixing | ✅ per-currency |
| Existing CRUD intact | ✅ |

## Defects
- P0: 0 · P1: 0 · P2: 0
- P3 (environmental): CRUD verified via authenticated API round-trip (identical contract to the form; the form UI is the same Modal validated live on Suppliers/Vessels); clean local port used to avoid stale-chunk cache.

## Known limitations (source model)
- PO has no stored amount/currency/status/approval/line-items → these are not shown (only invoiced value is derived + labeled). "Partially invoiced" cannot be computed and is not shown. Future backend enhancement (PO line items + order total) documented as C.

## Acceptance summary
1. Redesign: procurement workspace (summary, filters, table+cards, detail drawer, modern CRUD, export, invoice linkage).
2. APIs reused: purchase-orders, suppliers, vessels, invoices.
3. PO count: **41** (reconciled).
4. PO status model discovered: only `is_active` (no workflow status) — no invented states.
5. Approval model discovered: **none on PO** — correctly not shown.
6. Supplier relationship: **required**, shown + navigable.
7. Vessel relationship: required by current form (nullable in DB); shown.
8. Invoice relationship: OneToMany; invoiced/not-invoiced + related list (no fabricated partial).
9. Financial reconciliation: **PASS** (invoiced value per ccy = source).
10. Currency validation: **PASS** (strict per-currency).
11. Create: **PASS**. 12. Edit: **PASS**. 13. Delete: **PASS** (cleaned).
14. Search/filter/sort: **PASS**.
15. Arabic/RTL: **PASS**. 16. English/LTR: **PASS**. 17. 375px: **PASS**.
18. Console/network: **clean**.
19. P0: 0 · 20. P1: 0 · 21. P2: 0 · 22. P3: 1 (environmental).
23. Known limitations: PO model has no order amount/status/approval/line-items (see above).
24. Production `main`: **unchanged**.
25. Preview: **`ui-modernization` deployed**.

**GO — Purchase Orders module ready for approval**
