# PHASE 5 — EXISTING AI AUDIT (read-only discovery)

Branch: `phase-5-intelligence` (from production `main` `242df18`, tag `UME-PMS-V2-RELEASE-2`). **No code modified.** Backend AI code lives in the separate repo `ume-pms-v2` (production on Railway). This audit is read-only.

## 1. Existing AI features
Three chat assistants + one document extractor, all **backend → Anthropic** (server-side SDK):
| Feature | Frontend | Backend endpoint | Guard | Writes? |
|---|---|---|---|---|
| Task assistant | `app/dashboard/tasks/TaskAssistant.tsx` | `POST /api/tasks/assistant` | **NONE** ⚠ | create/update task, add comment |
| Invoice assistant | `app/dashboard/invoices/InvoiceAssistant.tsx` | `POST /api/invoices/assistant` | JwtAuthGuard | update invoice workflow fields |
| Fleet assistant | `app/dashboard/reports/FleetAssistant.tsx` | `POST /api/fleet/assistant` | JwtAuthGuard | read-only |
| Invoice OCR extract | invoices page (upload) | `POST /api/invoices/extract` | JwtAuthGuard | none (returns parsed JSON) |

## 2. Frontend entry points
Floating assistant panels inside Tasks, Invoices, Fleet dashboard; extract triggered on invoice file upload. All call the backend via `@/lib/api` (JWT attached). **Frontend never holds the Anthropic key.**

## 3. Model / provider
`@anthropic-ai/sdk`, model **`claude-opus-4-8`**, `max_tokens` 1500–2048, key from `process.env.ANTHROPIC_API_KEY` (Railway env). Manual agentic tool loop (≤6 steps) in task/invoice assistants.

## 4–8. Data currently sent to Anthropic
- **Task assistant:** system prompt + **snapshot of ALL tasks** (`id,title,owner,status,priority,due_date,recommended_employee`) + last 10 history turns + user message.
- **Invoice assistant:** system prompt + **up to 400 invoices** with full financial detail (`invoice_number, supplier, vessel, po_number, currency, total, paid, remaining, status, approval_status, dates, comment, created_by_name`) + history + message.
- **Fleet assistant:** system prompt + monthly fleet performance rows (filtered by screen filters) + history + message.
- **Extract:** the **uploaded invoice document itself** (PDF/image, base64) + extraction instructions.
- **Raw financial records sent:** yes (invoice/fleet figures). **Attachments/doc text sent:** yes (extract only). **User/task/invoice data sent:** yes.

## 9–11. Prompt structure / system instructions / output validation
- System prompt (Arabic) sets role + rules; data embedded as JSON inside the system prompt; tools defined via `input_schema`.
- Invoice assistant rules already enforce: **no currency mixing**, overdue = due<today & not paid, **no amount edits / no payment creation / no invoice create-delete**; `remaining` precomputed server-side (`total-paid`). Tool writes are **field-whitelisted** (`pick()` → tasks: 10 safe fields; invoices: `approval_status/comment/notes/due_date` only).
- Output: assistants return `{reply, actions, changed}`; extract parses JSON (regex + fence fallback) and the user reviews fields before saving. No schema-validation of the model's free-text reply.

## 12. Permission enforcement — **KEY FINDING**
- Backend guard coverage: **all controllers JwtAuthGuard EXCEPT** `tasks.controller.ts`, `tasks-assistant.controller.ts`, `profit-periods.controller.ts` (no guard). No global `APP_GUARD`.
- **Backend enforces authentication only — NOT screen authorization.** `allowed_screens`/`canAccess` is enforced **only in the frontend**. Any authenticated user can call any guarded API regardless of `allowed_screens`.
- **JWT payload = `{sub,email,role,full_name}`** — `allowed_screens` is **not in the token** (stored in `users` table, returned at login). So server-side permission filtering for AI requires either adding `allowed_screens` to the JWT or a DB lookup by `sub`.

## 13. Logging
`console.log`/`console.error` of filenames, sizes, error messages, and a **300-char preview of the extract response** (may contain invoice content). No secrets logged. Financial content in logs = minor privacy concern.

## 14–17. Risk register
| Risk | Severity | Detail |
|---|---|---|
| `/api/tasks/*` + `/api/tasks/assistant` unauthenticated | **P0** | Anyone can read/create/update/delete tasks and drive the AI write-tools (create/update/comment) without a token. Pre-existing (predates Phase 4). |
| `profit-periods` unauthenticated | **P1** | Data endpoint without guard. |
| Assistants not permission-filtered | **P1** | JWT-authenticated only; a user without invoices/fleet screen access can still read/modify that data via the assistant (backend ignores `allowed_screens`). |
| Full-dataset egress to Anthropic | **P1** | Invoice assistant sends up to 400 full invoices; task assistant sends all tasks — violates minimum-necessary-context; cost + privacy. |
| Write-capable assistants | **P1** | Existing task/invoice assistants perform DB writes via LLM tool calls — contradicts the Phase 5 "Ask UME read-only" mandate; keep Ask UME separate & read-only. |
| Prompt injection | **P1** | DB text (invoice `comment`, supplier/vessel/`created_by_name`, task `notes`, and **extracted document content**) is embedded into prompts with no explicit data/instruction separation; a crafted comment/document could attempt to steer tool calls (bounded by whitelist, but e.g. could set `approval_status='paid'`). |
| Document egress (extract) | **P2** | Uploaded invoice PDFs/images leave the environment to Anthropic; retention/privacy not documented. |
| Log content | **P2** | Extract response preview logged. |
| API key exposure | **None found** | Key is server-side (`process.env`) only; never sent to frontend. ✅ |

## Secrets check (STEP 12)
No Anthropic key, DB password, JWT, Supabase/Railway secret, or env value is printed or returned to the client in any AI code path. Frontend has zero AI-provider credentials. ✅

## Implications for Ask UME
1. Ask UME must be a **new, separate, READ-ONLY** capability — do not extend the existing write-capable assistants.
2. **Permission filtering must be solved server-side** (the backend currently can't see `allowed_screens`) → requires a backend enhancement (add `allowed_screens` to JWT or DB lookup).
3. The unauthenticated `tasks*` endpoints are a **P0 that should be fixed before** Ask UME reads task data (and regardless, as a live production issue).
4. Adopt minimum-necessary structured context, not full-dataset dumps.
