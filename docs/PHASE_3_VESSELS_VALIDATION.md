# PHASE 3 — MODULE 2: VESSELS — DATA VALIDATION

Independent reconciliation of the modernized Vessels screen against live Railway APIs
(authenticated `admin@ume.com`). All money kept strictly per-currency; no cross-currency sums; no invented P&L.

## Metric classification
| Metric | Class | Source |
|--------|:----:|--------|
| Vessel master (name/imo/flag/type/owner/company/is_active) | A | `GET /api/vessels` |
| Active/inactive | A | is_active |
| Invoices per vessel | A/B | `GET /api/invoices` grouped by vessel_id |
| Payments per vessel | B | `GET /api/payments` (invoice→vessel) |
| POs per vessel | A/B | `GET /api/purchase-orders` |
| Suppliers per vessel | B | distinct supplier on vessel invoices |
| Outstanding costs (per ccy) | B | Σ(total−paid) open invoices, per currency |
| Hire revenue (per ccy) | B | `GET /api/hire-invoices` by vessel |
| Operational revenue/expenses/net (USD) | **C / partial** | `GET /api/fleet/dashboard`, name-matched to master (fuzzy), Google-sheet source |
| Company P&L / profit per vessel across currencies | **D** | not reliable (no FX conversion) → **not shown** |

## Reconciliation (DOM vs live API)
| Metric | DOM | Source | Verdict |
|--------|-----|--------|---------|
| Total vessels | 7 | 7 | PASS (master count is user-editable; a real vessel "SIVAMAR" was added live by the owner during QA → 8) |
| Active / inactive | 7 / 0 | 7 / 0 | PASS |
| With outstanding costs | 7 | 7 | PASS |
| Fleet operational (cumulative, USD) | 113,860,865.95 rev · ~80,850,042 net | identical (Σ all fleet-sheet months) | PASS — labeled **cumulative/all-periods** |
| Alcudia Express (drawer) | 127 invoices · 8 POs · 41 suppliers | matches invoices | PASS |
| CRUD contract | create/edit/delete via exact form payload | POST/PUT/DELETE all 200 | PASS (test record cleaned) |

## Financial-safety notes
- **Operational revenue/net is partial**: sourced only from the fleet Google sheet and matched to master vessels by fuzzy name; only the 5 sheet-tracked vessels (ALCUDIA/PELAGOS/POSEIDON/AMAL/DALEELA) get an operational figure; others show "no fleet-sheet data". Labeled with source + "partial operational".
- The fleet summary card is a **cumulative all-periods** total (the Vessels page has no period selector) — labeled as such to avoid current-period misreading. Period-filtered fleet lives on the Dashboard.
- No vessel-level accounting profit is shown (cross-currency, no FX → D).
