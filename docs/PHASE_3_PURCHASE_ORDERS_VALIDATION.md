# PHASE 3 — MODULE 3: PURCHASE ORDERS — DATA VALIDATION

Independent reconciliation against live Railway APIs (authenticated `admin@ume.com`). Strict per-currency; no invented amount/status/approval.

## Discovered PO model (actual)
`PurchaseOrder` entity columns: `po_number` (unique), `supplier_id`, `vessel_id` (nullable in DB; the current form requires it), `description`, `order_date`, `is_active`, timestamps. Relation: `invoices` (OneToMany). **NOT present:** amount, currency, line items, quantity, unit price, tax, discount, status, approval_status, creator. PO total is **neither stored nor calculable as an "order value"** — only an **invoiced value** can be derived from linked invoices.

- One PO → many invoices (OneToMany). One invoice → one PO (`po_id`). So "invoiced / not invoiced" is provable; **"partially invoiced" is NOT** (no PO amount to compare) → not shown.
- PO number generation: manual, with a vessel-based prefix helper in the form (`VESSEL_PREFIX`). Preserved.

## Metric classification
| Metric | Class | Source |
|--------|:----:|--------|
| po_number, supplier, vessel, description, order_date, is_active | A | `GET /api/purchase-orders` |
| Invoice count per PO | A/B | `GET /api/invoices` grouped by po_id |
| Invoiced value per currency | B | Σ invoice.total_amount for the PO, per currency (labeled "invoiced value", not order value) |
| Invoiced / not-invoiced | B | has ≥1 linked invoice |
| Order amount / currency / status / approval / line items / tax / discount | **D** | not in model → **not shown, not fabricated** |
| "Partially invoiced" | **D** | unprovable (no PO amount) → not shown |
| Creator/user | D | not on entity |

## Reconciliation (DOM vs live API)
| Metric | DOM | Source | Verdict |
|--------|-----|--------|---------|
| Total POs | 41 | 41 | PASS |
| With invoice | 24 | 24 | PASS |
| Without invoice | 17 | 17 | PASS |
| Invoiced value | 251,603.68 USD · 70,950.35 EUR | identical | PASS — per currency |
| CRUD contract | create/edit/delete via exact payload | POST/PUT 200, DELETE 200, count → 41, no stray | PASS |
| Drawer sample (05-030/2026d-O003) | 1 invoice · ELCOME EUROPE · Wasa Express | matches invoices | PASS |

## Financial-safety notes
- The only monetary figure is **invoiced value** (Σ of linked-invoice totals), explicitly labeled "derived from linked invoices — the PO stores no amount/currency". No order amount is invented.
- Invoice status shown is binary (invoiced / not invoiced); PO status, invoice payment status, and approval are kept conceptually separate (approval/status don't exist on the PO model and are not displayed).
- No line items exist on the model → the drawer's Items section states this honestly rather than showing empty/zero.
