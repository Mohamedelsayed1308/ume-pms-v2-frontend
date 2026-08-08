# PHASE 5 — ASK UME ARCHITECTURE

## Options
### Option A — Existing pattern: Backend controller → Anthropic (per-feature)
Like today's assistants: a controller builds context and calls Anthropic. Key stays server-side.
- ✅ Key safe; matches existing code.
- ❌ Today's versions dump full datasets, are write-capable, and lack permission filtering. Would repeat those issues if copied.

### Option B — Controlled AI orchestration endpoint + deterministic tools (RECOMMENDED)
A single new **read-only** endpoint (e.g. `POST /api/ask-ume`) that:
1. Authenticates (JwtAuthGuard) and **resolves the caller's `allowed_screens`** (add to JWT or DB lookup by `sub`).
2. Exposes a fixed set of **deterministic `AskUMETools`** (see below) — the model may only call these; each tool enforces the required screen permission and returns compact, currency-separated, precomputed facts.
3. Runs a bounded tool loop; the model explains/summarizes the returned facts. **No writes, no SQL, no raw DB access.**
- ✅ Permission filtering before the LLM; minimum-necessary context; key server-side; auditable; injection-resistant (typed tool params); read-only.
- ❌ Requires a new endpoint + the permission-resolution enhancement.

### Option C — Frontend → Anthropic directly
- ❌ **Rejected.** Would expose the API key in the browser and/or require sending data client-side without server permission control. Serious credential/data-exposure risk.

## Recommendation
**Option B.** Safest maintainable design: server-side key, server-side permission resolution, deterministic tools, read-only, minimum context.

## Proposed `AskUMETools` (deterministic, read-only, permission-checked) — DESIGN ONLY, not implemented
- `getDashboardSummary(period)` — permitted KPIs + attention, per currency.
- `getSupplierSummary(supplierId)` — outstanding per currency, overdue count, recent activity.
- `getInvoiceSummary(filter)` — top overdue / due-soon / largest unpaid; outstanding per currency (= total−paid).
- `getPaymentSummary(period|supplierId)` — actual payments from `/api/payments` only, per currency + method.
- `getVesselSummary(vesselId?)` — outstanding supplier costs per currency; operational figures flagged **partial/source-limited**.
- `getTaskAttention()` — overdue / due-today / urgent (no "my tasks").
- `getReportSummary(reportId)` — reuse validated report calculations.

Each tool: (1) checks `canAccess`; (2) computes deterministically (reusing Phase 1–4 logic); (3) returns compact JSON facts. The model never receives raw tables or arbitrary queries.

## Hard constraints (STEP 17/18)
- **No arbitrary SQL / no SQL generation-execution / no DB credentials to the AI / no direct table access from the browser.**
- **READ-ONLY** for the first release: Ask UME cannot create/update/delete invoices, payments, suppliers, tasks, or approvals. AI write-actions are a separate future security phase.
- Existing write-capable assistants remain separate; Ask UME does not reuse their tools.

## Data-flow zones (per injection doc)
SYSTEM (trusted) · USER QUESTION · AUTHORIZED DATA CONTEXT (tool output) · UNTRUSTED CONTENT (free-text fields, fenced) — model ignores instructions in the latter two.

## External data policy (STEP 11)
- **Allowed to leave environment:** minimum structured facts required for the authorized question (numbers, currency, counts, names of permitted entities).
- **Restricted:** large raw datasets, unneeeded personal data.
- **Never send:** passwords, JWTs, API keys, env vars, DB connection strings, Supabase/Railway secrets.

## Backend / DB change assessment
- **Backend changes required:** yes — (1) new read-only `ask-ume` endpoint + tools; (2) resolve `allowed_screens` server-side (JWT claim or DB lookup); (3) **guard the currently-unauthenticated `tasks*` / `profit-periods` endpoints** (P0/P1 prerequisite).
- **Database schema changes:** **none required** for the MVP (read-only over existing data). Optional later: lightweight audit-log table (see audit doc) and conversation memory (deferred).
