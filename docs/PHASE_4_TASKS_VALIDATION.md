# PHASE 4 / MODULE 2 — Team Tasks — DISCOVERY & VALIDATION

Branch: `phase-4-analytics-operations`. **Frontend only. Backend/entity/schema/auth NOT touched.**
Source inspected (read-only): `ume-pms-v2/src/modules/tasks/{task.entity.ts, task-comment.entity.ts, tasks.controller.ts, tasks.service.ts}` + `ume-frontend/app/dashboard/tasks/{page.tsx, TaskAssistant.tsx}`.

## 1. Actual Task model (authoritative)

`tasks` entity:
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| title | varchar(300) | **required** |
| reason | text nullable | "why" |
| notes | text nullable | description / notes |
| team | varchar default `UME` | picklist: UME, Badawi, Ittihad, Operations, Finance |
| owner | varchar nullable | **assignee** — free-text picklist: M.Elsayed, Bassel, Tarek, Shimaa, Other. **NOT a Users FK** |
| recommended_employee | varchar nullable | free text |
| priority | varchar default `medium` | **low \| medium \| high \| urgent** |
| status | varchar default `pending` | **pending \| in_progress \| done \| cancelled** |
| due_date | date nullable | |
| recurrence | varchar default `none` | **none \| daily \| weekly \| monthly** |
| recurrence_next | date nullable | stored; **not processed** by backend |
| comments | OneToMany | TaskComment (cascade) |
| created_at / updated_at | timestamps | no dedicated completion timestamp |

`task_comments`: id, task(FK cascade), author varchar default `M.Elsayed` (free text), body text, created_at.

## 2. API contract (reused verbatim — no change)
- `GET /api/tasks` (all, with comments, order created_at DESC)
- `GET /api/tasks/:id`
- `POST /api/tasks` (body = task fields)
- `PUT /api/tasks/:id` (partial update)
- `DELETE /api/tasks/:id`
- `POST /api/tasks/:id/comments` `{ body, author? }`
- `DELETE /api/tasks/comments/:commentId`
- `POST /api/tasks/assistant` `{ message, history }` (TaskAssistant — unchanged)

## 3. Critical behavior facts
- **Recurrence is descriptive metadata only.** `create` = save; `update` = update. Nothing generates future occurrences from `recurrence`/`recurrence_next`. UI must NOT imply auto-scheduling.
- **Assignee = `owner`**, a free-text picklist, not linked to the authenticated user.
- **No completion timestamp.** `updated_at` bumps on any edit → unreliable for "completed in period". "Completed" card shows count of `status='done'` (no fake period).
- Delete is a hard delete (cascades comments).

## 4. Feature classification
- **A — Available:** list; status/priority/owner/recurrence/due fields; create/edit/delete; comments add/delete; search (title/owner/notes/reason); filters (status/priority/owner/recurrence/due); Kanban over the 4 real statuses; Calendar by due_date; task drawer; summary counts.
- **B — Safely derivable:** overdue, due-today, upcoming(≤7d); team workload (open/overdue/high/done per owner); high-priority-open; recurring count.
- **C — Backend enhancement (NOT implemented):** auto-recurrence generation; real assignee FK; attachments; start/completion timestamps; "completed this period"; server pagination.
- **D — Not available (NOT implemented):** reliable "My Tasks" (owner is free-text, not the logged-in identity).

## 5. Overdue / date rules (documented, local-timezone safe)
- Date-only strings parsed as **local** midnight (`new Date(y, m-1, d)`) — avoids UTC/local shift misclassification.
- `active` = status ∉ {done, cancelled}.
- **Overdue** = `due_date < today` AND active.
- **Due Today** = `due_date === today` AND active.
- **Upcoming** = `0 < (due_date − today) ≤ 7 days` AND active.

## 6. Independent baseline (live production API, at validation time)
- Total: **3** · Status: pending 2, in_progress 1 · Priority: medium 2, urgent 1
- Recurrence: none 2, weekly 1 · Owners: Bassel 3
- Overdue: **3** (all due July 2026; today Aug 2026) · Due today: 0 · Recurring: 1 · With comments: 0
- Logged-in `full_name` = "System Admin" ∉ owners ⇒ confirms My Tasks not reliably mappable.

(UI-rendered metrics reconciled against these in `PHASE_4_TASKS_QA.md`.)
