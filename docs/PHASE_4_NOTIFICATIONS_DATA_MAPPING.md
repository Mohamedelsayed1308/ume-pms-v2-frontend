# PHASE 4 / MODULE 3 — Notifications & Attention Center — DATA MAPPING

Branch: `phase-4-analytics-operations`. **Frontend only.** No notification table, no migration, no WebSocket, no worker, no email/SMS. Derived only from existing reliable data.

## Sources (fetched ONCE, shared by bell + center)
`GET /api/invoices` · `GET /api/tasks` · `GET /api/payments` — combined in `lib/notifications.tsx` (`NotificationsProvider`), computed in-frontend. Supplier/vessel rollups derived from the invoices dataset (no extra calls).

## Notification candidates

| Name | Source | Exact rule | Severity | Route | Record id | Actionable | Currency | Reliable | Class |
|---|---|---|---|---|---|---|---|---|---|
| Invoice overdue | invoices | status∈{unpaid,partial} AND due<today | critical if overdueDays≥30, or ≥15 & outstanding≥25k; else warning | /dashboard/invoices | invoice_number | ✅ | per-invoice ccy; outstanding=`total−paid` | ✅ | **A** |
| Invoice due soon | invoices | active AND 0≤due−today≤7 | warning | /dashboard/invoices | invoice_number | ✅ | per-invoice | ✅ | **A** |
| Invoice awaiting approval | invoices | approval_status='waiting_approval' | info | /dashboard/invoices | invoice_number | ✅ | per-invoice | ✅ | **A** |
| Invoice partial | invoices | status='partial' AND not overdue/due-soon | info | /dashboard/invoices | invoice_number | ✅ | per-invoice | ✅ | **A** (0 now) |
| Task overdue | tasks | active(status∉{done,cancelled}) AND due<today | critical if urgent, else warning | /dashboard/tasks | title | ✅ | — | ✅ | **A** |
| Task due today | tasks | active AND due=today | warning if urgent, else info | /dashboard/tasks | title | ✅ | — | ✅ | **A** |
| Payment currency mismatch | payments | payment.currency ≠ payment.invoice.currency | warning | /dashboard/payments | invoice_number | ✅ | shows both ccy | ✅ | **A** (0 now) |
| Large payment | payments | \|amount\|≥50,000 (own ccy) | info | /dashboard/payments | invoice_number | ✅ | payment ccy | ✅ | **B** |
| Supplier material outstanding | invoices→group | Σ(total−paid) per ccy ≥50,000 for any ccy | warning | /dashboard/suppliers | supplier name | ✅ | per-ccy (`fmtCcyMap`) | ✅ | **B** |
| Vessel supplier outstanding | invoices→group | Σ(total−paid) per ccy ≥50,000 for any ccy | warning | /dashboard/vessels | vessel name | ✅ | per-ccy | ✅ | **B** |

### Deliberately NOT implemented
- **Missing PO on invoice** — normal business state, informational only → **not a notification** (per master rule).
- **Loss-making vessel** from spreadsheet fleet profit — partial/source-limited → **D, not implemented**.
- **Personalized "My tasks" notifications** — owner is free-text, no user linkage → **D**.
- **Duplicate-invoice signal** — no existing reliable dedup logic → **C/D, not implemented**.
- **Upcoming tasks (1–7d)** — available (B) but withheld to avoid alert fatigue; overdue + due-today are the actionable set.

## Severity model (FRONTEND presentation only — nothing written to backend)
- **Critical:** invoice overdue ≥30d, or overdue ≥15d with outstanding ≥25k; urgent task overdue.
- **Warning:** other overdue invoices; invoices due ≤7d; non-urgent task overdue; urgent task due today; payment currency mismatch; supplier/vessel material outstanding.
- **Information:** invoice awaiting approval; partial payment (idle); large payment.
Critical is intentionally scoped to material/high-risk items only.

## Financial rules preserved (Release 1 / Phase 4)
- Invoice **Outstanding = `total_amount − paid_amount`** (never from payment rows).
- **Payments** counted only from `/api/payments` (17), never inferred from paid invoices (144).
- **Currencies never combined** — supplier/vessel rollups use per-currency maps.
- **PO** untouched; no "missing PO" alert.
- **Fleet** profit remains partial/source-limited (no loss alerts fabricated).

## Local UI state
`localStorage`: `ume_notif_dismissed`, `ume_notif_read`. **Local to this browser only — not synchronized across users/devices.** Topbar badge = **current unread actionable items** (not server unread). No Snooze (no safe future-time behavior).
