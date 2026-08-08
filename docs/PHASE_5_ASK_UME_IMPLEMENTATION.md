# PHASE 5 — ASK UME MVP — IMPLEMENTATION

Read-only, permission-aware management/finance assistant. **App calculates → AI explains.**

## Architecture (as approved — Option B)
Frontend → `POST /api/ask-ume` (JwtAuthGuard) → **server-side permission resolution (DB)** → permitted deterministic read-only tools → minimum structured context → Anthropic → structured response. No frontend→Anthropic; no key in browser; no SQL; no DB access for the model.

## Backend (`ume-pms-v2`, deployed to production Railway)
- `src/modules/ask-ume/ask-ume.service.ts`
  - `resolvePermissions(userId)` → looks up `users` row by JWT `sub`, returns `{isAdmin, allowed, can(href)}`. **Does not trust the client.**
  - `canUseTool(ctx, tool)` + `toolScreen()` mapping (tool → required screen).
  - Deterministic read-only tools: `getManagementSummary`, `getOutstandingInvoices(scope)`, `getInvoiceSummary(invoiceNumber)`, `getSupplierSummary(name?)`, `getPaymentSummary({period,supplier})`, `getVesselSummary(name?)`, `getTaskAttention()`, `getReportSummary()`. Each returns `{source, facts[], limitations[], actions[], data}`.
  - Financial-truth helpers: outstanding = `total_amount − paid_amount`; per-currency grouping (`byCurrency`, never summed); overdue = due<today & status∈{unpaid,partial}; payments read only from the Payments repository; invoice-summary flags approval-paid-without-payment.
- `src/modules/ask-ume/ask-ume.controller.ts`
  - `POST /api/ask-ume` `{question, history?}` (JwtAuthGuard). Input caps (question ≤1000). 
  - Offers the model **only permission-permitted tools**; **re-authorizes every tool call** before execution (defense in depth). Bounded tool loop (≤4). 
  - Hardened 4-zone system prompt (system rules > everything; DB/doc text = data not instructions; read-only; no secrets; financial-truth + currency + PO + fleet rules; no guessing; permission cannot be overridden by conversation).
  - Returns `{answer, facts, sources, limitations, actions}` (facts/sources/limitations/actions built **server-side** from tool outputs; answer = model text).
  - Lightweight audit log: `user id, tool sources, token counts` — **no prompt bodies, no secrets**.
- `src/modules/ask-ume/ask-ume.module.ts` (TypeOrm.forFeature Invoice/Payment/Supplier/Vessel/Task/User); registered in `app.module.ts`.
- Model: `claude-opus-4-8` (accuracy/availability; app computes numbers so a lighter model is a documented future cost option), `max_tokens` 900.

## Frontend (`ume-frontend`, branch `phase-5-intelligence` → Vercel Preview; production `main` untouched)
- `app/dashboard/ask-ume/page.tsx` — chat UI: header, permission-aware suggested prompts (`canHref`), conversation, per-message **answer + fact chips + limitation notices + source badges + navigation action buttons**, loading/error states, short in-session history (last 6 turns), read-only footer note. Bilingual AR/RTL + EN/LTR.
- `lib/screens.ts` — Ask UME nav entry (overview, `always:true`).
- `app/dashboard/layout.tsx` — topbar Ask UME button.
- `components/ui/Icon.tsx` — `sparkle` icon.

## Guarantees
Read-only (no create/update/delete/approve/pay). Unauthorized data never enters the model (tools pre-filtered + re-checked by DB-resolved permissions). Currencies never combined. Outstanding from stored `total − paid`. Actual payments from Payments records only. PO/fleet caveats enforced. No secrets in code/logs/responses (`process.env.ANTHROPIC_API_KEY` server-side only).
