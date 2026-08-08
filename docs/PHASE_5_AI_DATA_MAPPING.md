# PHASE 5 — ASK UME DATA MAP

What Ask UME can safely answer from existing reliable sources. Classification: **A** = answerable now from reliable structured data · **B** = answerable after deterministic app aggregation (no new backend) · **C** = requires backend/API enhancement · **D** = not currently reliable / must not answer.

All figures computed **deterministically by the app** (reusing Phase 1–4 logic in `lib/format`, `lib/period`, `lib/notifications`, dashboard/report calcs) before reaching the LLM.

## Sources & questions

### Dashboard / Management
| Question | Source | Class |
|---|---|---|
| What needs my attention today? | notifications engine + dashboard Needs-Attention (overdue/due-today/urgent) | **A/B** |
| Today's management summary | aggregate of below (permitted only) | **B** |
| What changed vs previous period? | `lib/period` prev-range deltas (payments count etc.) | **B** |

### Suppliers
| Question | Source | Class |
|---|---|---|
| Supplier with largest outstanding | group unpaid invoices by supplier, per currency | **B** |
| Summarize supplier X / overdue invoices for X | `/api/invoices` filtered by supplier + `/api/invoices/unpaid/by-supplier/:id` + statement | **A/B** |
| Supplier spend / PO count | invoices grouped; `/api/vessels/:id/suppliers` | **B** |

### Vessels
| Question | Source | Class |
|---|---|---|
| Outstanding supplier costs by vessel (per currency) | unpaid invoices grouped by vessel | **B** |
| Compare vessels (operational) | `/api/fleet/dashboard` (Google Sheet) — **partial/source-limited** | **A (with disclaimer)** |
| Complete vessel accounting P&L | not available (partial data) | **D** |
| Vessel master data | `/api/vessels` | **A** |

### Purchase Orders
| Question | Source | Class |
|---|---|---|
| PO details / linked invoices / invoiced value | `/api/purchase-orders`, `/api/invoices?po` | **A/B** |
| PO monetary total | **not in model** (only invoiced value exists) | **D** |

### Invoices
| Question | Source | Class |
|---|---|---|
| Top overdue / due this week / largest unpaid | `/api/invoices` + deterministic filters (overdue, ≤7d, remaining) | **A/B** |
| Outstanding by currency | `sumByCurrency(total − paid)` | **A/B** |
| Explain invoice X | single invoice record | **A** |
| Approval vs payment status | invoice fields (kept distinct) | **A** |

### Payments
| Question | Source | Class |
|---|---|---|
| Actual payments this month / largest / for supplier X | **`/api/payments` only** | **A/B** |
| Payment methods breakdown | payments grouped, per currency | **B** |
| "Payments" = paid invoices | **forbidden** (must not conflate) | **D** |

### Reports
| Question | Source | Class |
|---|---|---|
| Summarize payables / explain fleet report | reuse validated report calculations (Analytics Center) | **A/B** |

### Tasks
| Question | Source | Class |
|---|---|---|
| Tasks needing attention / overdue / urgent / due today | `/api/tasks` + local-timezone logic | **A/B** |
| My tasks (by logged-in user) | owner is free-text, no user FK | **D** |

### Notifications
| Question | Source | Class |
|---|---|---|
| Current actionable attention items | `computeNotifications()` (permission-filtered) | **A/B** |

## Rules
- Only **A/B** capabilities may be built in the MVP.
- Every A/B figure is **precomputed by the app**; the LLM only explains/summarizes.
- **C** (e.g. server-side permission-filtered aggregation endpoint, PO totals) is documented as future backend work.
- **D** questions get a safe refusal/qualification (see MVP plan §blocked).
