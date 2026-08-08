# PHASE 5 — ASK UME PERMISSION MODEL

## Current reality (from audit)
- Permission model = `role` + `allowed_screens` + `canAccess()` — **enforced only in the frontend**.
- Backend = **JWT authentication only**; no per-screen authorization (except admin-only user management). Three endpoints (`tasks`, `tasks-assistant`, `profit-periods`) have **no guard at all**.
- **`allowed_screens` is NOT in the JWT** (`{sub,email,role,full_name}`) — it lives in the `users` table and is returned at login.

## Core principle (mandatory)
**Permission filtering must happen BEFORE any data reaches Anthropic.** Never send everything and ask the model to hide it. The model must never receive unauthorized data.

## Question → required screen (gate before context build)
| Capability | Requires `canAccess` |
|---|---|
| Invoice / outstanding / overdue | `/dashboard/invoices` |
| Payments | `/dashboard/payments` |
| Suppliers / supplier outstanding | `/dashboard/suppliers` |
| Vessels / fleet | `/dashboard/vessels` |
| Purchase orders | `/dashboard/purchase-orders` |
| Tasks | `/dashboard/tasks` |
| Reports summaries | `/dashboard/reports` |
| Management brief | intersection — include only permitted sections |
Admin (`role==='admin'` or `allowed_screens===null`) → all.

## How Ask UME will enforce it (two viable designs)

**Design 1 — server resolves permissions (recommended, needs small backend change).**
A new AI orchestration endpoint resolves the caller's `allowed_screens` and filters which tools/data it will assemble. Because the JWT lacks `allowed_screens`, this needs **one** of:
- (a) add `allowed_screens` to the JWT claims at sign-time (`auth.service.ts`), or
- (b) look up the user by `sub` from the `users` table inside the AI endpoint.
Then the endpoint calls only the permitted deterministic tools; unauthorized categories are never fetched or sent.

**Design 2 — frontend supplies pre-permitted context (no backend change, weaker).**
The frontend (which already enforces `canAccess`) computes only permitted summaries and posts them to a thin AI endpoint. Simpler, but trusts the client to send only permitted data; a crafted client could over-send. Acceptable only as an interim if paired with the thin endpoint sending nothing it wasn't given.

**Recommendation:** Design 1 with option (a) or (b). Treat backend permission resolution as a **required Phase-5 backend enhancement**.

## Pre-requisite security fixes (blocking for tasks data)
1. **Add `JwtAuthGuard` to `tasks.controller.ts`, `tasks-assistant.controller.ts`, `profit-periods.controller.ts`** (P0/P1). Ask UME must not read task data until `/api/tasks` is authenticated.
2. Ask UME endpoint must reject unauthenticated requests and resolve `allowed_screens` server-side.

## Non-negotiables
- No permission bypass: e.g. a user without `/dashboard/payments` asking "show all payments" → Ask UME answers "لا تملك صلاحية الوصول للمدفوعات / You don't have access to Payments" and **fetches no payment data**.
- Restricted categories are excluded from the Management Brief silently (not mentioned as hidden).
- The model receives only the permitted, minimum-necessary structured facts.
