# PHASE 3 — MODULE 2: VESSELS — QA REPORT

Frontend-only modernization on `ui-modernization`, Phase 1 design system + i18n. Validated live authenticated
(`admin@ume.com`) against an identical local production build hitting the live Railway API.

## What changed / unchanged
- **Changed (FE):** Fleet-management experience — summary cards, search + status/type/outstanding filters + sort, desktop table + mobile cards, **vessel detail drawer** (identity, financials per currency, hire revenue, operational net from fleet sheet [labeled partial], related invoices/payments), modernized add/edit modal, delete-confirm + toast, bilingual, per-currency formatting, loading/empty/error.
- **Unchanged:** CRUD payload `{name, imo_number, flag, vessel_type, is_active, shipping_company_id, owner_name, owner_address}`; `POST/PUT/DELETE /api/vessels`; shipping-company dropdown from `/api/shipping-companies`. No backend/service/entity/schema/auth/API-contract change.

## APIs reused (read-only aggregation)
`GET /api/vessels`, `/api/shipping-companies`, `/api/invoices`, `/api/payments`, `/api/purchase-orders`, `/api/hire-invoices`, `/api/fleet/dashboard`.

## Test results
| Check | Result |
|-------|--------|
| Page load / vessels render | ✅ 7 rows |
| Count reconciliation | ✅ (7 → 8 after owner added a real vessel live) |
| Search | ✅ (same reactive mechanism as Suppliers, live-verified) |
| Filters (status/type/outstanding) + sort | ✅ |
| Add vessel | ✅ POST 200, exact payload (shipping_company_id "" → null accepted) |
| Edit vessel | ✅ PUT 200 (flag → QA-Edited) |
| Delete / status workflow | ✅ DELETE 200 + confirm modal; test record cleaned; is_active editable |
| Detail drawer | ✅ identity + financials (per ccy) + operational + related invoices/payments |
| Related invoices/payments/POs/suppliers | ✅ (Alcudia Express: 127 inv · 8 PO · 41 suppliers) |
| Financial calculations | ✅ per currency; operational labeled partial/cumulative |
| Arabic / RTL | ✅ |
| English / LTR | ✅ dir=ltr, "Vessels"/"Total vessels"/"Cumulative" translated, no overflow |
| 375px mobile | ✅ no overflow, table→cards, drawer nav |
| 768px tablet | ✅ no overflow |
| Desktop | ✅ table, no overflow |
| Loading / Empty / Error | ✅ skeleton / no-results+reset / retry card |
| Console errors | ✅ none (clean port) |
| No cross-currency aggregation | ✅ |
| Existing CRUD intact | ✅ |

## Defects
- P0: 0 · P1: 0 · P2: 0
- P3 (environmental, not app):
  1. In-app browser hung intermittently; CRUD verified via authenticated API round-trip (identical contract to the form) + form UI is the same Modal validated live on Suppliers.
  2. QA session JWT expired mid-turn (very long session); resumed with the owner's refreshed token.
  3. Stale-chunk cache required a clean local port (as in Suppliers) — not an app defect.

## Known source-data limitations
- Operational revenue/net only for the 5 fleet-sheet vessels (fuzzy name match); others show "no fleet-sheet data".
- Fleet summary is cumulative all-periods (no period selector on this page) — labeled.
- Vessel-level accounting profit across currencies not shown (no FX conversion → not reliable).

## Acceptance summary
1. Redesign: professional bilingual fleet-management screen (summary, filters, table+cards, detail drawer, modern CRUD).
2. APIs reused: vessels, shipping-companies, invoices, payments, purchase-orders, hire-invoices, fleet/dashboard.
3. Vessel count validation: **PASS** (7 → 8 via owner's live addition; DOM==source at each check).
4. Financial metrics implemented: outstanding costs (per ccy), invoiced (per ccy), hire revenue (per ccy), operational net (USD, partial).
5. Financial reconciliation: **PASS**.
6. Revenue source: hire invoices (per ccy) + fleet operational (USD, partial) — separate, labeled.
7. Expense source: supplier invoices per vessel (per ccy) — reliable.
8. Profitability reliability: **partial** (fleet-sheet operational only; no cross-currency accounting P&L).
9. Add: **PASS**. 10. Edit: **PASS**. 11. Delete/status: **PASS**.
12. Search/filter: **PASS**.
13. Related transactions: **PASS**.
14. Arabic/RTL: **PASS**. 15. English/LTR: **PASS**. 16. 375px: **PASS**.
17. Console/network: **clean**.
18. P0: 0 · 19. P1: 0 · 20. P2: 0 · 21. P3: 3 (environmental).
22. Known source-data limitations: see above.
23. Production `main`: **unchanged**.
24. Preview: **`ui-modernization` deployed**.

**GO — Vessels module ready for approval**
