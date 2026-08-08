# PHASE 5 — ASK UME COST CONTROL

## Current cost drivers (from audit)
- Invoice assistant ships up to **400 full invoices** per call; task assistant ships **all tasks**; fleet ships monthly rows. Large input tokens per request, repeated every turn (history + full snapshot). This is the main avoidable cost.

## Design controls for Ask UME
1. **Minimum-necessary context.** Send only the structured facts the question needs (e.g. one supplier's per-currency outstanding + overdue count), not the whole dataset. Deterministic tools return compact JSON.
2. **App computes, model explains.** No raw-record dumps for aggregation the app can do; drastically fewer input tokens.
3. **Per-request caps.** `max_tokens` output ~800–1200 (answers are short/structured). Cap total context (e.g. ≤ ~6k input tokens) and truncate/paginate tool results.
4. **Model choice.** Default to a cost-appropriate current model for summarization; reserve the largest model only if quality requires. (Existing code uses `claude-opus-4-8`; MVP can evaluate a lighter model for summarization since the app does the math.)
5. **No full-history resend of data.** Keep short session context (last few turns of text only); never re-embed the full dataset each turn — re-fetch minimal facts per question instead.
6. **Bounded tool loop.** Cap tool-call iterations (≤3–4) to prevent runaway loops.
7. **Optional usage logging** of token counts per request (no prompt/response bodies) for monitoring — see audit strategy.
8. **Rate limiting / debounce** on the Ask UME entry point to avoid accidental request storms.

## Architecture-level cost estimate (qualitative)
- With minimum-context design, a typical question ≈ small system prompt + one compact JSON fact block + short question ≈ low-thousands input tokens + ≤~1k output — an order of magnitude cheaper than the current full-snapshot assistants.
- Cost scales with question volume, not dataset size (because the app pre-aggregates). No exact monetary forecast at this stage (per spec).
