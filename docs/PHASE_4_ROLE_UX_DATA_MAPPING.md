# PHASE 4 / MODULE 5 — Role-Sensitive UX — DATA MAPPING

Branch: `phase-4-analytics-operations`. **Frontend only.** No new roles, no DB/schema/JWT/permission-field change. Uses existing `role` + `allowed_screens` + `canAccess()`.

## 1. Current permission model
- **User object:** `{ id, email, full_name, role, allowed_screens }`.
- **role:** `'admin'` or `'user'` (only two present).
- **admin:** sees everything (`canAccess` returns true for all).
- **allowed_screens:** `string[]` of screen hrefs, or `null`. `null` = no restriction (backward-compat → treated as full access).
- **canAccess(user, screen):** admin→true; `adminOnly`→admin only; `always`→true (Dashboard); `allowed_screens` not an array→true; else `allowed.includes(href)`.

## 2. Permission-controlled screens (`SCREENS`, `PERMISSION_SCREENS`)
suppliers, purchase-orders, invoices, items, payments, vessels, customers, hire-invoices, shipping-companies, management-invoices, profit-distribution, tasks, reports. **Always:** `/dashboard` (home). **adminOnly:** `/dashboard/users`. Not individually gated: `/dashboard/notifications` (utility, respects underlying data permissions).

## 3. Derived frontend experience profiles (`lib/profile.ts` — display/emphasis only, NOT security)
`deriveProfile(user)`:
- `admin` — role admin OR allowed_screens null.
- `limited` — very few allowed screens (≤2) and not matching below.
- `finance` — ≥3 of {invoices, payments, suppliers, purchase-orders}.
- `management` — has reports and ≤1 finance screen.
- `operations` — ≥1 of {tasks, vessels} and ≤1 finance screen.
- fallback → `finance`.
Profiles affect **KPI order, section emphasis, greeting chip** only. Access is always enforced by `canAccess`.

## 4. Personalization applied (all permission-gated)
| Surface | Rule |
|---|---|
| Sidebar | already `canAccess`-filtered; empty groups hidden (existing) |
| Dashboard fetch | **check permission → then fetch**; only accessible modules called |
| Dashboard KPIs | payables/overdue (invoices), receivables (hire), payments (payments) — each gated; ordered by `kpiOrder(profile)` |
| Needs Attention | invoice items gated by invoices; task item by tasks |
| Revenue streams | hire row (hire access), fleet row (vessels access) |
| Status distribution / Top suppliers / Recent invoices | invoices access |
| Fleet snapshot | vessels access |
| Recent payments | payments access |
| Quick actions | `canAccess` per action; card hidden if none |
| Limited welcome | shown when no financial/fleet data accessible |
| Notifications | fetch gated (invoices/tasks/payments); output filtered by category→screen access; empty category tabs hidden |
| Global Search | Module-4 gating preserved (categories/records/commands/quick-create all `canAccess`) |
| Reports (Analytics Center) | each report gated by data-source screen (`REPORT_REQUIRES`) |

## 5. Report → required access (`REPORT_REQUIRES`)
- vessels: fleet-dashboard, vessel-profit, alcudia-profit, gubal-profit, vessel-suppliers
- suppliers: supplier-statement, unpaid-supplier
- invoices: due-alerts, unpaid-vessel, dept-delays, user-activity
- reports: exchange-rates

## 6. Existing limitations / notes
- **Reports page** still loads vessel + supplier **name lists** to populate its filter dropdowns (needed by accessible invoice-based reports such as unpaid-vessel). These are names only, not restricted financial figures. Documented; not treated as a leak.
- **Users screen** left **unchanged** (recommendation: could add read-only permission summaries later; modifying it now adds risk with no functional need).
- Profiles are inferred each session from `allowed_screens`; they are **not persisted** anywhere.

## 7. API fetch safety
Pattern is **permission-check → fetch** on Dashboard and Notifications. A user with no access to a module triggers **no API call** to it (verified: Limited profile made zero restricted calls).
