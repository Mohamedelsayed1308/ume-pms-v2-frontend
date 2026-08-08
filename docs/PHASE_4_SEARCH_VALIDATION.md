# PHASE 4 / MODULE 4 — Global Search — VALIDATION (live data)

Representative searches run against the live API-backed palette (authenticated admin; token never persisted).

## Category searches

| Query | Category matched | Business identifier | Navigation | Result |
|---|---|---|---|---|
| `Alcudia` | Vessels (+POs/Invoices/Payments/Report) | `Alcudia Express` (RORO · 9010151) first | `/dashboard/vessels?q=Alcudia Express` | ✅ correct, grouped, currency-tagged |
| `500-106305` | Invoices (exact) | `500-106305` — Lloyd's Register · 560.00 USD | `/dashboard/invoices?q=500-106305` | ✅ single exact match, not buried |
| `Lloyd` | Suppliers (+ their invoices) | `Lloyd's Register Egypt LLC` first | `/dashboard/suppliers?q=Lloyd's Register Egypt LLC` | ✅ supplier ranked first |
| `invoices` (AR) | Navigation command | `فتح الفواتير` | `/dashboard/invoices` | ✅ |
| `invoices` (EN) | Navigation command | `Open Invoices` | `/dashboard/invoices` | ✅ fully English (EN screen map) |
| PO number (06-…) | Purchase Orders | `06-0002/2026…` | `/dashboard/purchase-orders?q=…` | ✅ |
| Payment (Magnus/MTB…) | Payments | reference / invoice# · amount+ccy | `/dashboard/payments?q=…` | ✅ from Payments API only |
| `American` | Tasks | `The American Club` | `/dashboard/tasks?q=The American Club` | ✅ |
| `ربح` / `Pelagos` | Reports | `ربحية Pelagos` → Analytics Center | `/dashboard/reports` | ✅ |
| `zzzznotarealthing` | — | — | — | ✅ empty state shown |

## Deep-link verification
- `/dashboard/invoices?q=500-106305` → invoices page filtered to that invoice ✅
- `/dashboard/tasks?q=American` → tasks list filtered to 1 (The American Club) ✅
- Seed mechanism: `useInitialQuery` (client-only) on all 6 list pages.

## Keyboard
- `Ctrl/Cmd + K` opens ✅ · Arrow Up/Down moves active (0 → 2 verified) ✅ · Enter opens active → `?q=` deep-link ✅ · Esc closes ✅ · mouse click opens ✅ · `aria-selected` tracks active ✅.

## Permission handling (restricted user, injected locally — no real user modified)
User: role=`user`, allowed_screens = suppliers, vessels, reports.
| Check | Result |
|---|---|
| "Open Payments" command | ❌ hidden ✅ |
| "Open Invoices" command | ❌ hidden ✅ |
| "Open Suppliers" command | ✅ shown |
| "Open Vessels" command | ✅ shown |
| "Add Payment" command | ❌ hidden ✅ |
| "Add Supplier" command | ✅ shown |
| Invoice record search (`500-106305`) | ❌ 0 results — dataset not fetched ✅ |
| Supplier record (`Lloyd`) | ✅ shown |
**No permission leak.**

## Performance
- API calls when opening (first time): one-time fetch of accessible datasets (Promise.all).
- **API calls while typing: 0** (measured across 5 keystrokes) ✅.
- Debounce 120 ms on filter term; local filtering only.

## Regression (all PASS)
- Reports currency: Alcudia USD 302,448.17 · EUR 1,915.59 · SAR 890 (separate) — **PASS**
- Tasks: live count 3; list/kanban/calendar unaffected — **PASS**
- Notifications: total 57 unchanged (routes gained `?q=`, counts identical); deep-link now `/dashboard/invoices?q=500-106305` — **PASS**
- Invoices: outstanding `total − paid_amount` — **PASS**
- Payments: 17 actual vs 144 paid invoices — **PASS**
- `canAccess` behavior unchanged — **PASS**
