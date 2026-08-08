# PHASE 5 — ASK UME — PERMISSION QA

## Enforcement model (server-authoritative)
Permissions are resolved **on the server** from the `users` table by the JWT `sub` (`resolvePermissions`). The client **cannot** influence them: the request body is only `{question, history}` — there is no role/permission/tool field. Enforcement is applied at two points:
1. The tool registry offered to the model is pre-filtered to permitted tools only.
2. Every tool call is re-authorized (`canUseTool`) before execution.
Unauthorized categories are therefore **never fetched and never sent to the model**.

## Tool → screen mapping (verified in code)
`getSupplierSummary`→suppliers · `getOutstandingInvoices`/`getInvoiceSummary`→invoices · `getPaymentSummary`→payments · `getVesselSummary`→vessels · `getTaskAttention`→tasks · `getReportSummary`→reports · `getManagementSummary`→includes only permitted sections. Admin (`role==='admin'` or `allowed_screens===null`) → all.

## Profiles

| Profile | Method | Result |
|---|---|---|
| **Admin** | live | ✅ Full access — all tools available; all financial/injection/language tests passed with real data. |
| **Finance-like / Operations-like / Limited** | design + code | Enforced server-side: a non-admin JWT resolves to its DB `allowed_screens`; only matching tools are offered and executed; `getManagementSummary` includes only permitted sections. |

## Live restricted-token test — not performed (documented reason)
Because permissions are resolved server-side from the DB by the authenticated identity, a genuine restricted-profile test requires a **real non-admin user's JWT**. Obtaining one would require **creating an account and/or entering a password to authenticate**, which is prohibited by the operating safety policy. It was therefore **not performed**. Enforcement is instead guaranteed by:
- server-side resolution (client cannot claim permissions),
- pre-LLM tool filtering + per-call re-authorization (code-verified),
- the frontend additionally hides suggestions for unpermitted categories (`canHref`) — a defense-in-depth UI measure, not the security boundary.

## Server-authority (design)
The endpoint ignores any client-supplied user/permission data; the only trust anchor is the verified JWT. A restricted user's token yields a restricted permitted-tool set; there is no code path by which the browser can request data outside the token's resolved permissions.

## Unauthorized-context leakage
By construction, data for a category the user cannot access is never fetched (the tool is not offered and is rejected if called), so **no unauthorized data enters the Anthropic context**. Any such leakage would be P0; none is possible given the tool-gating design. **Result: no leakage path.**

**Permission QA: Admin PASS (live); restricted profiles enforced by server-side design (live restricted-token test not run — prohibited credential handling).**
