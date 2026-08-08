# PHASE 5 — ASK UME MVP PLAN

Read-only, permission-filtered, minimum-context intelligence over verified UME data. **Design only — not implemented.**

## MVP scope (high-value, safe, A/B only)
1. **Ask Management Summary** — permitted overdue/due-soon/urgent tasks/significant payments/major supplier exposure/fleet indicators.
2. **Supplier Summary** — outstanding per currency, overdue invoices for a supplier.
3. **Invoice / Outstanding** — top overdue, due this week, largest unpaid, explain invoice (outstanding = total − paid).
4. **Payment questions** — actual payments (from `/api/payments` only), per currency/method.
5. **Vessel summary** — outstanding supplier costs per currency; operational figures with **partial/source-limited** disclaimer.
6. **Task attention** — overdue / due-today / urgent (no "my tasks").
7. **Navigation suggestions** — deep-link to the relevant screen (reuse `?q=`).

**Excluded from MVP:** attachment/document analysis, any AI write-actions, cross-currency totals, forecasts, employee performance rating, "my tasks", complete vessel P&L.

## Response format (STEP 14) — short, auditable
1. Direct answer · 2. Supporting numbers · 3. Currency · 4. Period · 5. Source/logic note when helpful · 6. Limitation warning when needed · 7. Suggested navigation/action. No long generic prose.

## Source traceability (STEP 15)
Answers state their basis, e.g. `استناداً إلى 4 فواتير مورد غير مدفوعة` / `Based on actual Payments records for August` / `Based on fleet spreadsheet operational data — partial`. No DB internals exposed.

## Blocked / qualified questions (STEP 8)
Safe patterns:
- Cross-currency total (no conversion rule): `لا يمكن جمع عملات مختلفة بدون سعر تحويل معتمد — إليك الإجمالي لكل عملة.`
- Complete vessel P&L from partial data: `هذه البيانات تشغيلية جزئية ولا تكفي لحساب نتيجة محاسبية كاملة.`
- Payments inferred from paid invoices: refuse — actual payments come from Payments records only.
- Unauthorized module: `لا تملك صلاحية الوصول لهذه البيانات.` (and send nothing).
- Missing value: say it's unavailable; never guess.

## Accuracy / hallucination policy (STEP 21)
Never guess financial values; important numbers are **deterministic (app-computed)**; if sources disagree, report the inconsistency; if a calculation is unsupported, don't invent a formula.

## Proposed UX (STEP 19)
- **Primary MVP entry:** topbar "Ask UME" button opening a command-palette-style panel (reuse Module 4 patterns) **and** a dedicated `/dashboard/ask-ume` page for longer sessions.
- **Contextual (later):** "Ask about this" buttons inside Supplier/Vessel/Invoice/Reports that prefill a scoped question.
- Bilingual AR/RTL + EN/LTR; mobile full-screen panel; permission-aware (entry hidden/limited per access).

## Conversation memory (STEP 20)
MVP = **short in-session context only** (last few turns of text). **No persistent storage** of financial conversations. Long-term memory deferred to a later, separately-approved design (privacy/retention review required).

## Audit strategy (STEP 22)
Optional lightweight metadata per request: timestamp, authenticated user id, question category, tools used, success/error, token usage. **Do not log full prompts/responses** (financial content) unless explicitly approved. (Optional audit table = only possible DB addition; not required for MVP.)

## QA strategy (STEP 25) — designed before implementation
Test suites: financial golden tests, permission tests, prompt-injection tests, cross-currency, paid-vs-payment, partial-vessel, missing-data, Arabic & English questions, mobile, cost/token limits, unauthorized queries, malformed AI response, provider-unavailable, timeouts.

### Critical golden financial tests (must always hold)
1. USD/EUR/SAR/CHF remain separate (never summed without an approved rule).
2. Outstanding = `total − paid_amount` (not from payment rows).
3. Actual Payments = `/api/payments` only.
4. A paid invoice with no Payment record is **not** described as an actual bank/cash payment.
5. PO invoiced value ≠ PO total.
6. Fleet operating result is labeled partial unless proven otherwise.
7. Permission-restricted data is **never sent to the model** (verify via captured outbound context in tests).

## Dependencies before build
1. Fix unauthenticated `tasks*` / `profit-periods` guards (P0/P1).
2. Server-side `allowed_screens` resolution (JWT claim or DB lookup).
3. Implement `AskUMETools` (read-only, permission-checked) per architecture doc.
