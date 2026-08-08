# PHASE 4 / MODULE 5 — Role-Sensitive UX — VALIDATION (QA profiles)

QA profiles injected **locally** (localStorage user object) — **no real production user/permission modified**. Live API (admin JWT for data; restricted profiles reuse the same token but the FRONTEND gates by the injected `allowed_screens`, proving UX/fetch gating).

## Profile A — Admin (`allowed_screens: null`)
| Aspect | Result |
|---|---|
| Dashboard API modules | invoices, hire-invoices, management-invoices, payments, tasks, fleet (all) |
| KPIs / sections | all present; no profile chip |
| Notifications total | 57 · tabs All(57) Financial(51) Tasks(3) Fleet(3) |
| Search | all categories; Ctrl/⌘K works (9 results for "Lloyd") |
| Reports | all 12 |
| Sidebar | all groups |

## Profile B — Finance-like (suppliers, purchase-orders, invoices, payments, reports)
| Aspect | Expected | Actual |
|---|---|---|
| Dashboard API | invoices, payments only | ✅ (no hire/mgmt/tasks/fleet) — **no restricted call** |
| KPIs | payables, overdue, payments; NO receivables | ✅ |
| Fleet snapshot | hidden | ✅ |
| Profile chip | "توجّه مالي / Finance view" | ✅ |
| Sidebar | dashboard, reports, suppliers, purchase-orders, invoices, payments | ✅ (no tasks/vessels) |
| Notifications | 51 (no task/vessel); fetch invoices+payments only | ✅ |
| Search | no Vessels/Tasks group/results (vessel search → only POs/invoices) | ✅ |
| Reports | supplier-statement, due-alerts, exchange-rates … ; NO fleet/vessel reports | ✅ |

## Profile C — Operations-like (tasks, vessels)
| Aspect | Result |
|---|---|
| Dashboard API | tasks, fleet only — **no invoices/payments/hire/mgmt** ✅ |
| Financial KPIs | none ✅ |
| Fleet snapshot | shown ✅ · Overdue-tasks attention shown ✅ |
| Profile chip | "توجّه تشغيلي / Operations view" ✅ |
| Sidebar | dashboard, vessels, tasks ✅ |

## Profile D — Limited (suppliers only)
| Aspect | Result |
|---|---|
| Unauthorized API calls | **0** ✅ (no invoices/payments/hire/mgmt/tasks/fleet) |
| Financial KPIs | none ✅ |
| Welcome experience | shown ✅ |
| Quick actions | "Add Supplier" only ✅ |
| Sidebar | dashboard, suppliers ✅ |
| Bell count | 0 (no accessible notifications) ✅ |

## Restricted-data leakage test
For B/C/D: no restricted KPI, notification, search result, quick action, report, or API call observed. **P0 leakage: none.**

## Regression (all PASS)
- Reports currency: Alcudia USD 302,448.17 · EUR 1,915.59 · SAR 890 (separate).
- Tasks: live count 3; views intact.
- Notifications (admin): total 57 unchanged; all category tabs.
- Search: Ctrl/⌘K + deep-link functional.
- Invoices: outstanding `total − paid_amount`.
- Payments: 17 actual vs 144 paid invoices (distinct).
- `canAccess` behavior unchanged.
- Mobile 375: dashboard no page overflow (finance profile).
- Console: no errors.
