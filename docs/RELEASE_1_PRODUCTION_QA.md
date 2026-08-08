# RELEASE 1 — PRODUCTION QA (Phases 1–3)

Frontend-only release of the approved Phases 1–3 from `ui-modernization` → `main` → Vercel production.
No backend/database/security change. Verified live on the real production URL.

## Release references
| Item | Value |
|------|-------|
| Release commit (content) | `f9e16077` (tag `UME-PMS-V2-UI-RELEASE-1`) |
| Production `main` HEAD (merge) | `3f00f1e` |
| Previous production commit (rollback target) | `3fe2c846` (= baseline tag `UME-PMS-V2-STABLE-BEFORE-UI-MODERNIZATION`) |
| Pre-modernization baseline tag | `UME-PMS-V2-STABLE-BEFORE-UI-MODERNIZATION` (preserved) |
| Deployment date/time | 2026-08-08 |
| Production URL | https://ume-pms-v2-frontend.vercel.app |
| Merge type | `--no-ff` (no force, no history rewrite) |

## Pre-merge gate
- TypeScript: ✅ clean · Production build: ✅ (20 pages) · Live baselines re-read from API (not hard-coded): suppliers 72 · vessels 7 · POs 41 · invoices 218 (74 unpaid / 144 paid) · outstanding USD 1,283,727.57 · EUR 110,873.03 · SAR 890 · overdue 25 · payments 17.

## Production smoke test (real URL, authenticated System Admin)
| # | Item | Result |
|---|------|--------|
| 4 | Vercel production deployment | ✅ new build live (`lang="ar"`, "UME PMS —" title) |
| 5 | Login / session | ✅ authenticated session valid |
| 6 | Permissions | ✅ admin sees all; `canAccess` intact |
| 7 | Dashboard (cockpit) | ✅ KPIs, Needs Attention, Fleet snapshot, period selector |
| 8 | Suppliers | ✅ 72 |
| 9 | Vessels | ✅ 7 |
| 10 | Purchase Orders | ✅ 41 |
| 11 | Invoices | ✅ 218; outstanding 1,283,727.57 USD · 110,873.03 EUR · 890 SAR |
| 12 | Payments | ✅ 17 **actual transactions** (not 144 paid invoices) |
| 13 | Financial reconciliation | ✅ matches source, per currency |
| 14 | Currency separation | ✅ USD/EUR/SAR/CHF never summed |
| 15 | Arabic / RTL | ✅ |
| 16 | English / LTR | ✅ (dir=ltr, translated) |
| 17 | Mobile 375px | ✅ table→cards, drawer nav, no overflow |
| 18 | Console errors | ✅ none |
| 19 | Unexpected API errors | ✅ none |
| 24 | QA cleanup | ✅ production Supplier create→edit→delete (200/200/200), no stray, count back to 72 |

## Critical financial production checks
- **Invoices Outstanding = total − stored paid_amount** (NOT derived from payment rows). ✅ (1,283,727.57 USD etc.)
- **Payments = actual transactions from Payments API only** (17), not the 144 invoices marked paid. ✅
- **Currencies** USD/EUR/SAR/CHF kept separate. ✅
- **PO** shows invoiced value (labeled), not "PO value". ✅
- **Vessel operational profitability** labeled partial / source-limited. ✅

## Defects
- P0: **0** · P1: **0** · P2: **0** · P3: environmental only (validation performed via authenticated API + injected session in the emulation browser; no app defect).

## Rollback readiness
- Documented in `docs/ROLLBACK_PLAN.md`. Target: `git reset --hard 3fe2c846` (= baseline tag) + push, or promote previous Vercel deployment. Baseline & release tags preserved.

## Result
1. Release commit: `f9e16077` (tag `UME-PMS-V2-UI-RELEASE-1`)
2. Release tag: `UME-PMS-V2-UI-RELEASE-1`
3. Previous production commit: `3fe2c846`
4. Vercel production: ✅ deployed & serving new build
5. Login: ✅ · 6. Permissions: ✅ · 7. Dashboard: ✅
8. Suppliers: ✅ · 9. Vessels: ✅ · 10. Purchase Orders: ✅ · 11. Invoices: ✅ · 12. Payments: ✅
13. Financial reconciliation: ✅ · 14. Currency separation: ✅
15. Arabic/RTL: ✅ · 16. English/LTR: ✅ · 17. Mobile: ✅
18. Console errors: none · 19. Unexpected API errors: none
20. P0: 0 · 21. P1: 0 · 22. P2: 0 · 23. P3: environmental only
24. QA cleanup: ✅ complete (no residue)
25. Rollback readiness: ✅ documented & tags preserved

**GO — Release 1 stable in production**
