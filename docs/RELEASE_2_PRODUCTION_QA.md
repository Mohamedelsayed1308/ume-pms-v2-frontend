# RELEASE 2 — PRODUCTION QA (Phase 4)

Frontend-only production release of approved Phase 4 (Reports & Analytics, Team Tasks, Notifications, Global Search & Command Palette, Role-Sensitive UX) from `phase-4-analytics-operations` → `main` → Vercel production. No backend/database/Railway/security change. Verified live on the real production URL.

## Release references
| Item | Value |
|------|-------|
| Release 2 source commit | `dad1b30` (tag `UME-PMS-V2-RELEASE-2`) |
| Production `main` HEAD (merge) | `73a0371` |
| Previous production commit (rollback target) | `d7f3ebd` (Release 1, tag `UME-PMS-V2-UI-RELEASE-1` = content `f9e16077`) |
| Pre-modernization baseline (DR reference) | `UME-PMS-V2-STABLE-BEFORE-UI-MODERNIZATION` (`3fe2c846`) |
| Merge type | `--no-ff` (no force, no history rewrite) |
| Deployment date | 2026-08-08 |
| Production URL | https://ume-pms-v2-frontend.vercel.app |

Tags preserved: `UME-PMS-V2-STABLE-BEFORE-UI-MODERNIZATION`, `UME-PMS-V2-UI-RELEASE-1`, `UME-PMS-V2-RELEASE-2`.

## Pre-merge gate
- TypeScript ✅ clean · Production build ✅ (21 pages) · git tree clean, no debug/token/env/secret files · source commit matches `PHASE_4_FINAL_QA_REPORT.md` (`dad1b30`).

## Production smoke (real URL, authenticated System Admin)
| # | Item | Result |
|---|------|--------|
| 5 | Vercel deployment | ✅ active; new build live (`/dashboard/notifications` route 200 — Release-2 marker; bell 57; Ctrl-K search) |
| 6 | Authentication | ✅ session valid |
| 7 | Permissions | ✅ `canAccess` intact; restricted profile no leak |
| 8 | Dashboard | ✅ KPIs reconcile (1,283,727.57 USD · 110,873.03 EUR), fleet snapshot, no NaN/undefined |
| 9 | Reports & Analytics | ✅ center/categories/search/filters/export/drill-down; **Alcudia 302,448.17 USD · 1,915.59 EUR · 890 SAR** (mixed total absent) |
| 10 | Team Tasks | ✅ 3; List/Kanban/Calendar; no overflow |
| 11 | Notifications | ✅ total **57** (recomputed live); All(57)/Financial(51)/Tasks(3)/Fleet(3); deep-link |
| 12 | Global Search | ✅ topbar + Ctrl/⌘K; 9 results ("Lloyd"); **0 API calls while typing**; permission-gated |
| 13 | Role-Sensitive UX | ✅ Admin full; Finance profile → invoices+payments only, no fleet/receivables, finance chip, sidebar filtered, **no restricted API** |
| 14 | Suppliers | ✅ 72; per-currency; CRUD 201/200/200, count 72→72 (no residue) |
| 15 | Vessels | ✅ 7; per-currency; fleet profit labeled partial |
| 16 | Purchase Orders | ✅ 41; supplier/vessel + invoice links; invoiced value labeled (not "PO value") |
| 17 | Invoices | ✅ 218 (unpaid 74 / paid 144); overdue 25; due-soon 8; **Outstanding = total − paid_amount** |
| 18 | Payments | ✅ 17 actual (from `/api/payments`, not 144 paid); USD 499,941.17 · EUR 26,431.87 · CHF 25,384.94 · SAR 19,869.70 |
| 19 | Financial reconciliation | ✅ all live numbers match baseline |
| 20 | Currency separation | ✅ USD/EUR/SAR/CHF never combined (dashboard/reports/notifications/search/payments) |
| 21 | Arabic / RTL | ✅ |
| 22 | English / LTR | ✅ |
| 23 | 375px | ✅ dashboard no overflow, mobile search button |
| 24 | Console | ✅ no errors |
| 25 | Network | ✅ no unexpected 4xx/5xx; no per-keystroke calls; restricted profile no restricted calls |
| 26 | Restricted-data leakage | ✅ none |
| 27 | QA cleanup | ✅ production supplier create→edit→delete, count restored to 72 |

## Critical financial production checks
- **Outstanding = total − stored paid_amount** (not from payment rows). ✅
- **Payments = actual transactions from Payments API** (17), not 144 paid invoices. ✅
- **Currencies** kept separate everywhere. ✅
- **PO** shows invoiced value (labeled). ✅
- **Vessel operational profitability** labeled partial/source-limited. ✅
- **Notifications count recomputed from live data = 57** (not hard-coded). ✅

## Defects
- P0: **0** · P1: **0** · P2: **0** · P3: environmental only (emulation-pane screenshot compositing; validated via DOM/JS + API).

## Rollback readiness
- Primary target: `UME-PMS-V2-UI-RELEASE-1` (`d7f3ebd`) — `git reset --hard d7f3ebd` + push, or promote previous Vercel deployment. Secondary DR: `UME-PMS-V2-STABLE-BEFORE-UI-MODERNIZATION`. Plan: `docs/ROLLBACK_PLAN.md`. No incident; not invoked.

## Deferred technical debt (owner-approved — NOT touched)
- DB credential rotation (Supabase) — env prepared, rotation deferred.
- TypeORM `synchronize: true` — deferred.
- `approval_status='paid'` coupling — documented since Release 1.

## Result
`GO — Release 2 stable in production`
