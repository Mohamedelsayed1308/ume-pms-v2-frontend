# PHASE 5 — ASK UME MVP — QA SUMMARY

Backend: `ume-pms-v2` main (`/api/ask-ume` deployed to production Railway — authenticated, read-only). Frontend: `ume-frontend` branch `phase-5-intelligence` (Vercel Preview; production `main` untouched).
Validation: backend `tsc` + `nest build` ✅; frontend `tsc` + `next build` ✅ (`/dashboard/ask-ume` route). Live tests with authenticated admin (token in-browser).

## Results
| Area | Result |
|---|---|
| Endpoint auth (anonymous) | ✅ 401 |
| Backend build / Frontend build | ✅ / ✅ |
| Ask UME page loads | ✅ header, permission-aware suggestions |
| Response contract UI | ✅ answer + fact chips + source badges + limitation notices + action buttons ("Overdue invoices", "Tasks") |
| Management summary | ✅ permitted categories only, per-currency |
| Supplier questions | ✅ ranking + per-supplier outstanding per currency |
| Invoice/outstanding questions | ✅ per currency; outstanding = total − paid |
| Payment questions | ✅ actual Payments records only, per currency |
| Vessel questions | ✅ outstanding per currency + partial/source-limited caveat |
| Task questions | ✅ overdue/due-today/urgent; "My tasks" declined (owner free-text) |
| Financial golden tests (1–6) | ✅ PASS (see FINANCIAL_QA) |
| Prompt injection | ✅ PASS (see SECURITY_QA) |
| Permissions | ✅ Admin live; restricted enforced server-side (see PERMISSION_QA) |
| Arabic / English | ✅ both |
| 375px | ✅ no page overflow (mobile layout responsive) |
| Performance / token controls | ✅ minimum-context (app computes); typed tools; caps (question 1000, output 900, ≤4 tool steps); no per-keystroke; no full-dataset dumps |
| Provider failure | ✅ graceful (generic 500 / error bubble) by design |
| Audit | ✅ lightweight (user, tool sources, tokens); no sensitive bodies |
| Console | ✅ no errors on Ask UME page |

## Regression (Phases 1–4 + existing AI)
- Backend change is **additive** (new `ask-ume` module) plus the earlier auth hotfix (already QA'd). Existing controllers/services unchanged. Existing three assistants (task/invoice/fleet) + invoice extract **unchanged**.
- Frontend change is **additive**: new `/dashboard/ask-ume` page, one nav entry (`always`), a topbar button, one icon. No existing page/component modified except `layout.tsx` (added topbar link), `screens.ts` (added entry), `Icon.tsx` (added path). `tsc` + build clean.
- Production frontend (`main`) untouched → Phases 1–4 live behavior unaffected.

## Defects
- **P0:** 0 · **P1:** 0 · **P2:** 0
- **P3 (environmental):** authenticated test session token expired near the end of mobile testing (redirect to /login) — session timeout, not an app defect (mobile no-overflow confirmed before expiry; desktop UI fully validated). Screenshot pane compositing unavailable (validated via DOM/JS + API).

## Known limitations
- Live restricted-user permission test not run (would require prohibited account creation / password entry); enforcement guaranteed server-side by design + code review.
- Report tool is a minimal payables summary (reuses invoice logic); richer report coverage is future.
- No attachment/document analysis; no AI write-actions; no persistent conversation memory (short in-session only) — all per approved MVP scope.
- `getManagementSummary`/`getReportSummary` currently key off overdue payables; can be extended.

## Status
- **Backend production:** `/api/ask-ume` deployed (read-only, guarded).
- **Frontend production `main`:** untouched.
- **Preview:** `phase-5-intelligence` (frontend Ask UME UI).
