# RELEASE 3 — ASK UME — PRODUCTION QA

Frontend-only production release of the approved Ask UME MVP (`phase-5-intelligence` → `main` → Vercel). Backend endpoint (`/api/ask-ume`) + auth hotfix already live from earlier. No schema change.

## References
| Item | Value |
|------|-------|
| Release source commit (frontend) | `0ff613e` (tag `UME-PMS-V2-RELEASE-3-ASK-UME`) |
| Production frontend HEAD (merge) | `ae53012` |
| Previous frontend production | `242df18` (Release 2, tag `UME-PMS-V2-RELEASE-2`) |
| Production backend HEAD | `4d641086` (contains `/api/ask-ume`, JwtAuthGuard, server-side permission resolution, read-only tools) |
| Merge type | `--no-ff` (no force / no history rewrite) |
| Tags preserved | STABLE-BEFORE-UI-MODERNIZATION, UI-RELEASE-1, RELEASE-2, RELEASE-3-ASK-UME |

## Report
1. **QA-user permissions restored** — ✅ verified by probe: `yahia` management summary now includes invoices+payments+tasks; payments & vessels allowed (back to full/intended config, not the temporary Operations profile).
2. Release source commit: `0ff613e` · 3. Tag: `UME-PMS-V2-RELEASE-3-ASK-UME`
4. Production frontend commit: `ae53012` · 5. Production backend commit: `4d641086`
6. **Vercel:** ✅ deployed; `/dashboard/ask-ume` serves (200) — previously 404 in Release 2.
7. Ask UME route: ✅ live · nav entry (sidebar `always`) + topbar button (build-verified).
8. **Authentication:** ✅ anonymous `POST /api/ask-ume` → **401** (status line verified).
9. **Server-side permissions:** ✅ resolved from DB by JWT `sub` (verified in live permission gate on same backend commit).
10. Management summary: ✅ permitted-sections only; per-currency.
11. Supplier questions: ✅ per-currency ranking/summary.
12. Invoice questions: ✅ outstanding = total − paid.
13. Payment questions: ✅ actual `/api/payments` records only, per-currency.
14. Vessel questions: ✅ per-currency outstanding + partial/source-limited disclaimer.
15. Task questions: ✅ overdue/urgent; "my tasks" declined.
16. Reports questions: ✅ payables summary (reuses invoice logic).
17. **Financial golden tests (live production):** ✅ 6/6 — see below.
18. **Currency separation:** ✅ USD/EUR never combined; combined-total refused.
19. **Prompt injection:** ✅ refused; **no actual secret value leaked** (`actualSecretValueLeaked=false`).
20. **Unauthorized-context leakage:** ✅ 0 (live permission gate).
21. **Read-only guarantee:** ✅ only read tools; no create/update/delete/approve/pay/SQL; anonymous blocked.
22. Arabic: ✅ · 23. English: ✅
24. 375px: ✅ (validated on identical preview build; no page overflow).
25. **Existing AI regression:** ✅ invoice/task/fleet assistants + invoice OCR unchanged (backend change additive: new `ask-ume` module; task-assistant now requires auth per hotfix and works via frontend JWT).
26. **Phase 1–4 regression:** ✅ frontend change additive (new page + nav entry + topbar button + icon); production Release-2 behavior intact; golden tests confirm live financial data + truth rules unchanged.
27. Console: ✅ no errors on Ask UME (preview-validated identical code).
28. Network: ✅ minimum-context; no per-keystroke; no full-dataset dumps.
29. P0: **0** · 30. P1: **0** · 31. P2: **0** · 32. P3: environmental only (Chrome test-tab froze during production UI render — page/route confirmed 200 and identical code validated on preview; screenshot pane compositing unavailable).

### Financial golden tests (live production)
| Test | Result |
|---|---|
| Outstanding | ✅ per-currency (USD/EUR facts), mixed-currency warning |
| Combined single total | ✅ refused (no approved conversion) |
| Actual payments | ✅ from Payments records only, per-currency |
| Paid invoice w/o payment (`10567-1-2026`) | ✅ flagged: marked paid but no actual payment transaction |
| PO value | ✅ not mislabeled (invoiced ≠ PO total) |
| Vessel profitability | ✅ partial/source-limited disclaimer |

**Required metrics:** `Unauthorized context sent to Anthropic = 0` ✅ · `Prohibited tool invocation = 0` ✅

## 33. Rollback readiness
- Frontend: `git reset --hard 242df18` (Release 2) + push, or promote previous Vercel deployment → removes Ask UME UI. Backend endpoint is read-only/guarded and harmless if UI absent (can also roll back to `b95397a4`). Tags preserved. `docs/ROLLBACK_PLAN.md`.

## 34. Deferred security debt (owner-approved — untouched)
- DB credential rotation (Supabase; env `DATABASE_URL` prepared with inline fallback).
- TypeORM `synchronize: true`.
- `approval_status='paid'` coupling.
- Existing write-capable assistants (task/invoice) hardening + `allowed_screens` server-side authorization for non-AI endpoints — future.

## Result
`GO — Release 3 Ask UME stable in production`
