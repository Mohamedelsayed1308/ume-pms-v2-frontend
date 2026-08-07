# UI MODERNIZATION ROADMAP — UME PMS V2

Controlled, incremental modernization of the existing production system. No rebuild. No DB changes during UI phases. Test after every phase against `BASELINE_QA_REPORT.md`.

## Workflow
- `main` → production (Vercel/Railway auto-deploy). **Never edit directly.**
- `ui-modernization` → dev branch → Vercel **Preview** deployments. All work here.
- Merge to `main` only after a phase passes its QA gate.
- Baseline recovery point: tag `UME-PMS-V2-STABLE-BEFORE-UI-MODERNIZATION` + branch `production-baseline-before-ui-v3` (both repos).

## Phases
- **Phase 0 — Discovery & Safety Baseline** ✅ (this step): inspection report, baseline tag/branch pushed, rollback plan, QA scaffold.
- **Phase 1 — Foundation**: design tokens (globals.css @theme), design-system primitives (Button/Card/Input/Select/Table/Badge/Modal/Drawer/Toast/Skeleton/EmptyState), new App Shell (grouped collapsible sidebar + topbar + mobile drawer), i18n architecture (AR-RTL/EN-LTR, centralized strings), fix root `lang`/metadata. **No business-logic / API / DB changes.** → QA gate.
- **Phase 2 — Executive Dashboard**: management header, global period filter, KPI cards (real APIs only), charts, Needs-Attention, fleet snapshot, quick actions.
- **Phase 3 — Core Transaction Modules** (one at a time, test each): Suppliers → Vessels → Purchase Orders → Invoices → Payments.
- **Phase 4 — Analytics & Operations**: Reports center, Tasks (list/kanban/calendar), Notifications, advanced search/filtering, role-sensitive views, Command Palette (nav-only first).
- **Phase 5 — Intelligence** (separate security review): "Ask UME", anomaly detection, recommendations.

## Guardrails
- No `DROP` / rename / remove columns; no data deletion; `synchronize:true` means entity edits = live migrations → avoid during UI phases.
- Never expose secret values in docs or code.
- Preview-test before any `main` merge. Prefer small logical commits.
- On any critical regression: STOP and fix before continuing.
