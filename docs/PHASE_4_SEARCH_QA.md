# PHASE 4 / MODULE 4 — Global Search & Command Palette — QA

Branch: `phase-4-analytics-operations`. **Frontend only.** No backend/entity/schema/auth/API change; no search engine.
Validation: `tsc --noEmit` ✅ · `npm run build` ✅ (21 pages). Live smoke vs Railway API (admin JWT; never persisted).

## What was built
- `components/CommandPalette.tsx` — `CommandPaletteProvider` + `useCommandPalette()` + modal: Ctrl/Cmd+K, lazy permission-aware fetch, local filtering, grouped ranked results, keyboard + mouse nav, recent searches, empty/loading states, ARIA combobox/listbox, bilingual (incl. EN screen-name map).
- `lib/useInitialQuery.ts` — safe client-only `?q=` reader (no `useSearchParams` prerender bailout).
- Deep-link `?q=` seeding on suppliers, vessels, purchase-orders, invoices, payments, tasks.
- Topbar: desktop search button (with `Ctrl K`/`⌘K` hint) + mobile search icon → open palette.
- Small reusable improvement: Notification routes now deep-link via `?q=` (zero regression; counts unchanged).

## Test results

| Item | Result |
|---|---|
| Topbar search (desktop button + mobile icon) | ✅ opens palette |
| Ctrl/Cmd + K | ✅ opens/toggles |
| Open / close (Esc, backdrop) | ✅ |
| Keyboard navigation (↑ ↓ Enter) | ✅ active moves, Enter opens deep-link |
| Mouse navigation | ✅ hover sets active, click opens |
| Search matching (case-insensitive, partial, AR/EN) | ✅ |
| Exact-match ranking | ✅ exact invoice number → single top result |
| Supplier results | ✅ name/contact/country |
| Vessel results | ✅ name/imo/type |
| PO results | ✅ po_number/supplier/vessel |
| Invoice results | ✅ number/supplier/amount+ccy |
| Payment results | ✅ reference/invoice#/amount+ccy (Payments API only) |
| Task results | ✅ title/owner/status |
| Report results | ✅ → Analytics Center |
| Navigation commands | ✅ permission-gated; EN names in EN mode |
| Quick-create commands | ✅ permission-gated (Add Supplier/Vessel/PO/Invoice/Payment, Create Task) → module |
| Permissions | ✅ restricted user: forbidden categories/commands hidden, records blocked (no leak) |
| Deep linking | ✅ `?q=` filters target page (invoices, tasks verified) |
| Empty state | ✅ "no results" + hint |
| Arabic / RTL | ✅ default |
| English / LTR | ✅ placeholders/commands/hints English; restores RTL |
| Mobile 375px | ✅ dialog fits (351px), input visible, results readable, amounts fit, no page overflow |
| 768 / Desktop | ✅ |
| Performance | ✅ fetch once on open (accessible only); **0 API calls while typing**; 120ms debounce |
| Console | ✅ no errors |
| Network | ✅ no per-keystroke requests |

## Regression (all PASS)
- Reports currency separation — **PASS** (Alcudia USD/EUR/SAR separate)
- Tasks (count 3; views unaffected) — **PASS**
- Notifications (total 57 unchanged; now `?q=` deep-links) — **PASS**
- Invoice outstanding `total − paid_amount` — **PASS**
- Payments 17 actual vs 144 paid — **PASS**
- `canAccess` unchanged — **PASS**

## Defects
- **P0:** 0 · **P1:** 0 · **P2:** 0
- **P3 (environmental):** screenshot pane not compositing (validated via DOM/JS + API).

## Known limitations
- **Report results** navigate to the Analytics Center (reports open via in-page state; auto-select is future).
- **Quick-create** commands navigate to the module screen (auto-open form via `?new` not implemented; future).
- **Deep-link** filters the list (navigate + `?q=`); auto-opening a record's drawer/detail is not supported by current list pages. Re-seeding while already on the same page depends on remount.
- **Restricted-user QA** performed via a locally-injected user object (no real production user/permissions modified).

## Status
- **Production `main`:** untouched. **Preview:** `phase-4-analytics-operations` (Vercel Preview on push).
