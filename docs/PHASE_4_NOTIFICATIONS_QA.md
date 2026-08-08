# PHASE 4 / MODULE 3 — Notifications & Attention Center — QA

Branch: `phase-4-analytics-operations`. **Frontend only.** No backend/entity/schema/auth/API change; no notification table/WebSocket/worker.
Validation: `tsc --noEmit` ✅ · `npm run build` ✅ (21 pages incl. `/dashboard/notifications`). Live smoke vs Railway API (user's own JWT; **never persisted to any file/log/doc**).

## What was built
- `lib/notifications.tsx` — shared `NotificationsProvider` + `useNotifications()`: one combined fetch of invoices/tasks/payments, in-frontend derivation, severity model, local read/dismiss state, bilingual describe().
- `components/NotificationBell.tsx` — activated topbar bell: unread badge, dropdown (top 8 + mark-all-read + View all).
- `app/dashboard/notifications/page.tsx` — full Attention Center: summary, category + severity filters, search, cards with severity/category, navigate + dismiss, loading/empty/error states.
- Wired provider + bell into `app/dashboard/layout.tsx`.

## Test results

| Item | Result |
|---|---|
| Topbar bell | ✅ badge (unread), dropdown, mark-all-read, View all → center |
| Notification count | ✅ 57 total; badge = unread actionable (local) |
| Full center | ✅ renders, summary cards (13/30/14) |
| Categories | ✅ All 57 · Financial 51 · Tasks 3 · Fleet 3 |
| Severity | ✅ Critical 13 · Warning 30 · Info 14; critical filter shows only critical |
| Search / filters | ✅ category + severity + text search |
| Invoice alerts | ✅ overdue 25 / due-soon 8 / awaiting 11; readable invoice numbers, outstanding+ccy |
| Task alerts | ✅ overdue 3 (urgent flagged), due-today 0; done/cancelled never overdue |
| Payment alerts | ✅ large-payment 3, mismatch 0 — from Payments API only |
| Supplier alerts | ✅ 4 material (per-currency, ≥50k threshold documented) |
| Vessel alerts | ✅ 3 material (per-currency) |
| Direct navigation | ✅ invoice→invoices, task→tasks, payment→payments, supplier→suppliers, vessel→vessels |
| Local read/dismiss | ✅ dismiss 57→56 persisted; mark-read updates unread badge; **local-only** labeled |
| Arabic / RTL | ✅ default |
| English / LTR | ✅ dir=ltr, English titles ("Invoice … overdue by N days"); restores RTL |
| Mobile 375px | ✅ no page overflow, cards readable, amounts fit, filters usable, bell panel usable |
| 768 / Desktop | ✅ responsive grid |
| Loading / Empty / Error | ✅ spinner; empty ("no current attention items"); API-error state with retry (no raw errors) |
| Console | ✅ no errors |
| Performance | ✅ single fetch each (invoices/tasks/payments) shared; bell never refetches; no per-notification request |
| Permissions | ✅ within dashboard auth; no permission changes |

## Critical regression tests
- **Reports currency:** Alcudia USD 302,448.17 · EUR 1,915.59 · SAR 890 separate — **PASS**
- **Invoice outstanding = `total − paid_amount`** — **PASS**
- **Payment distinction** (17 actual vs 144 paid invoices) — **PASS**
- **Tasks completed/cancelled not flagged overdue** — **PASS**

## Defects
- **P0:** 0 · **P1:** 0 · **P2:** 0
- **P3 (environmental):** screenshot pane not compositing (validated via DOM/JS + API). No app defect.

## Known limitations
- No server-side persistence — read/dismiss is **local to the browser** (documented in UI + code). Badge = current unread actionable items, not server unread.
- No Snooze (no safe future-time model).
- Navigation lands on the relevant **screen**, not a deep-linked record (deep links need routing changes — out of scope).
- Missing-PO, loss-vessel, duplicate-invoice, personalized My-Tasks alerts intentionally excluded (C/D).

## Status
- **Production `main`:** untouched. **Preview:** `phase-4-analytics-operations` (Vercel Preview on push).
