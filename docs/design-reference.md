# Design Reference

| Field | Value |
|---|---|
| Version | 1.4. Supersedes 1.3. Adds accounts, organization onboarding, and join requests to the Built tier, and records the scaffolding decisions ([implementation plan](implementation-plan.md), section 2). |
| Role | Appendix. Holds the detail that [1.2-data-model.md](1.2-data-model.md) summarizes. |
| Delivery tiers | Built, Designed, and Later, as defined in the [README](../README.md) |
| Review decisions | [1.3-analysis.md](1.3-analysis.md) |

Test ids keep their original numbers so they match the review record. T9, T11, T12, T20, and T26 moved to Later with their features. T28 is new in 1.3. T29 to T33 are new in 1.4.

## 1. Scope

### 1.1 In scope for v1

| Area | Included |
|---|---|
| Organizations | Created by any signed-in user, who becomes owner. Settings (timezone, priority display names), one status template |
| People | Global users with email and password accounts, one membership per org, four fixed roles, join by request with owner or admin approval, deactivation instead of deletion |
| Projects | Immutable keys, archive and restore |
| Statuses | Freeform per-project columns seeded from the org template; each is open, completed, or canceled |
| Tasks | Per-project numbers, single assignee, fixed priority scale, required due date, org-scoped labels, manual ordering, archive and restore |
| Comments | Flat comments with edit, soft delete, and mention tokens |
| History | Typed, append-only activity events, kept forever |
| Aggregates | Computed at query time |

### 1.2 Later

Each item has an additive path. None requires a rewrite.

| Item | Additive path |
|---|---|
| Project re-key | Transfer design in section 9. Adds `project_state` value `rekeyed`, `successor_project_id`, `PROJECT_REKEYED`, and `project.rekeyed`. Tests T9, T20. |
| Org soft delete and purge | `organizations.deleted_at`, the `app_maintenance` role, a 30-day purge job, and `org.deleted` and `org.restored`. Restore needs its own root mutation, because a deleted org has no tenant context. |
| Auto-archive of closed tasks | `organization_settings.auto_archive_closed_after_days`, the `app_jobs` and `app_discovery` roles, and `tasks_auto_archive (org_id, updated_at)`. That index makes every task edit non-HOT. Tests T11, T12. |
| Domain events | `outbox_events` written in the mutation transaction, holding ids and event types only. A relay on the `app_relay` role sends and deletes rows, at least once. Consumers ignore duplicates by id. Serves search, cache invalidation, webhooks, and realtime. Test T26. |
| Cross-project move | `task_aliases (org_id, project_id, number)` pointing at the task, plus a move mutation that assigns a new number. No backfill: numbers are never reused, so the first alias is written at the first move. |
| Email invitations for non-users | `org_invitations` table. Also removes the member-lookup oracle (section 2). |
| Email verification and password reset | `email_verified_at` on `users` and a single-use token table owned by `app_identity` |
| External identity provider | `users.auth_subject` is reserved for it. Sign in maps the provider subject to the user. |
| A read-only role | `viewer` value added to the role enum. Metadata-only. |
| Persisted GraphQL operations | Registered at UI build time. No schema change. |
| Private projects, project-level roles | `projects.visibility` plus `project_members` |
| Enforced status transitions | `status_transitions` table |
| Multiple status templates | Template parent table |
| Multiple assignees, watchers | `task_assignees`, backfilled from `assignee_id` (worked example in 1.2, section 6.4) |
| Description version history | `task_description_versions` table |
| Threads, reactions, attachments, comment edit history | Nullable `parent_comment_id`, new tables |
| Mention index and notifications | `comment_mentions`, backfilled by parsing body tokens |
| Subtasks, task relations | `parent_task_id`; `task_relations` with cycle prevention |
| Custom fields, estimates, cycles, sprints, saved views | New tables or nullable columns |
| Aggregate counter tables | Escalation design in 1.2, section 4.4 |
| Global account deletion | Anonymize the `users` row in place |

### 1.3 Never

Schema-per-tenant or database-per-tenant. Hard deletion of any row that history references. Reuse of a project key or a task number. Client-supplied primary keys. Priority or role stored as free text. Renaming or removing an activity type value. Hand-editing a Prisma-generated migration. `prisma db push` against any shared database.

## 2. Database Roles

| Role | Tier | Row-level security | Purpose |
|---|---|---|---|
| `app_owner` | Built | Forced | Owns every object. Runs migrations and partition maintenance. Needs `CREATEROLE`. Never a superuser, because a superuser bypasses row-level security. |
| `app_runtime` | Built | Not applicable | The API's only login. Holds no privileges of its own. Granted `app_user` and `app_identity` `WITH INHERIT FALSE, SET TRUE`, so every transaction must `SET LOCAL ROLE` first. |
| `app_user` | Built | Forced | API runtime. Not an owner. Cannot update project keys, identity columns, or history. |
| `app_membership_reader` | Built | Forced, policy-scoped | Cannot log in. Owns `app.viewer_memberships()`, the only entry point for `viewer.memberships`. `SELECT (id, slug, name)` on `organizations` and `SELECT (org_id, user_id, role, status)` on `org_memberships`. Policies return only the caller's memberships and those orgs. |
| `app_join` | Built | Forced, policy-scoped | Cannot log in. Owns `app.submit_join_request`, `app.cancel_join_request`, and `app.viewer_join_requests`. `SELECT (id, slug, name)` on `organizations` and the caller's own rows in `org_join_requests`. |
| `app_identity` | Built | Forced, policy-scoped | Sign up, sign in, refresh tokens, and member lookup. `SELECT (id, auth_subject, email, password_hash)`, `INSERT`, and `UPDATE (email, display_name, password_hash)` on `users`, and all of `refresh_tokens`. Owns `app.lookup_user_id_by_email`. No tenant tables. |
| `app_jobs` | Later | Forced | Auto-archive |
| `app_discovery` | Later | Bypassed | Cannot log in. Owns the job discovery function. |
| `app_maintenance` | Later | Forced | Org purge. The only role that can delete history. |
| `app_relay` | Later | Forced, policy-scoped | Outbox relay. `SELECT` and `DELETE` on `outbox_events` only. |

The API connects only as `app_runtime`. GraphQL transactions start with `SET LOCAL ROLE app_user`, and the `/auth` routes with `SET LOCAL ROLE app_identity`. A request never switches role mid-transaction. Each cross-tenant need is one `SECURITY DEFINER` function owned by a scoped role that cannot log in. Local setup and Testcontainers give `app_runtime` its login and password, so no secret lives in a migration.

Member lookup (`addMember(email)`) runs through `app_identity`. It is open to owners and admins of the current org, limited to 30 lookups per org per hour, and returns an id only. Until invitations exist it is an account-existence oracle for org admins. That risk is accepted and bounded.

Join requests run through `app_join`. A requester names an org by slug and learns whether it exists. That is accepted and bounded at 10 requests per user per hour. The requester never reads the org's data, only their own requests.

Policy shapes for the built roles:

```sql
-- Org switcher
CREATE POLICY membership_reader ON org_memberships FOR SELECT TO app_membership_reader
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY membership_reader ON organizations FOR SELECT TO app_membership_reader
  USING (EXISTS (SELECT 1 FROM org_memberships m
                 WHERE m.org_id = organizations.id
                   AND m.user_id = (SELECT app.current_user_id())));

-- users, API role: self, plus members of the current org in any status
CREATE POLICY self ON users FOR ALL TO app_user
  USING      (id = (SELECT app.current_user_id()))
  WITH CHECK (id = (SELECT app.current_user_id()));

CREATE POLICY org_peer_read ON users FOR SELECT TO app_user
  USING (EXISTS (SELECT 1 FROM org_memberships m
                 WHERE m.org_id = (SELECT app.current_org_id()) AND m.user_id = users.id));

-- password_hash and auth_subject are never readable by the API role (T17).
GRANT SELECT (id, email, display_name, created_at, updated_at), UPDATE (display_name) ON users TO app_user;

-- users, identity role: global lookup, provisioning, identity-provider sync
CREATE POLICY identity ON users FOR ALL TO app_identity USING (true) WITH CHECK (true);
GRANT SELECT (id, auth_subject, email, password_hash), INSERT, UPDATE (email, display_name, password_hash)
  ON users TO app_identity;

-- Join requests, join role: only the caller's own requests; org lookup by slug
CREATE POLICY own_requests ON org_join_requests FOR ALL TO app_join
  USING      (user_id = (SELECT app.current_user_id()))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND status IN ('pending', 'canceled'));

CREATE POLICY join_lookup ON organizations FOR SELECT TO app_join USING (true);
GRANT SELECT (id, slug, name) ON organizations TO app_join;
```

## 3. Entity Rules

| Entity | Rules |
|---|---|
| `users` | Unique email. Unique identity-provider subject when present. Local accounts carry an argon2id `password_hash`. A check requires a hash or a subject. Never deleted. Created and synced only by `app_identity`. |
| `refresh_tokens` | Global. Stored as a SHA-256 hash, grouped in families. Rotated on every refresh. Reuse of a revoked token revokes its family. Only `app_identity` reads or writes it. |
| `organizations` | Slug unique |
| `organization_settings` | Timezone is a valid IANA name. Priority display names only; the scale is fixed. |
| `org_memberships` | One row per user per org. Re-adding reactivates the row. A live org always has one active owner. |
| `org_template_statuses` | Exactly one default status, which must be open (`is_default`); it becomes each new project's default. Copied into each new project. The standard template is Backlog, Todo (default), In Progress, In Review, Done (completed), Canceled (canceled). |
| `projects` | Key `^[A-Z][A-Z0-9]{1,9}$`, unique per org, never updated. Holds the task-number counter and the rank epoch. Default status is its own, open, and live. |
| `project_statuses` | Copied from the template with provenance. Live names unique per project, case-insensitive. At most 30 live. Archiving requires a replacement. |
| `tasks` | Number unique per project, never reused. Rank unique per project, base-62, at most 128 characters, never ending in `0`. Due date required. Assignee may be any active member while the task is open and visible. |
| `labels` | Live names unique per org, case-insensitive. Color is one of ten tokens: slate, red, orange, amber, green, teal, blue, indigo, purple, pink. Archived labels stay on tasks but cannot be applied. At most 500 live per org and 20 per task. |
| `task_labels` | Composite key, tenant-scoped on both sides |
| `org_join_requests` | One pending request per user per org. `decided_at` and `decided_by` are set exactly when the status is approved or rejected. The requester reads and cancels only their own. Owners and admins decide. |
| `comments` | The author edits. The author, an owner, or an admin deletes. Deletion removes the body. |
| `activity_events` | Insert-only for the API. Partitioned monthly. Scope matches the type prefix. |

| Value set | Storage | Values |
|---|---|---|
| Role | Enum | owner, admin, member, contributor |
| Membership status | Enum | active, deactivated |
| Project state | Enum | active, archived |
| Closed kind | Nullable enum | completed, canceled; null means open |
| Priority | `smallint`, nullable | 1 urgent, 2 high, 3 medium, 4 low; null is `NONE`. Display names are `organization_settings.priority_labels`, four entries, default Urgent, High, Medium, Low. |
| Actor kind | Enum | user, system |
| Join request status | Enum | pending, approved, rejected, canceled |
| Activity type | Enum, grow-only | 30 types (section 7.4) |

| Field | Rule |
|---|---|
| Org slug | 3 to 6 characters: lowercase letters, digits, inner hyphens. Not a reserved word (admin, api, auth, app, o, signin, signup, onboarding, settings, www). |
| Project key | Exactly 3 characters, `^[A-Z][A-Z0-9]{2}$` |
| Names | Org and project 1 to 80, display name 1 to 80, label and status 1 to 40 |
| Long text | Project description up to 2,000, task title 1 to 200, task description up to 20,000, comment 1 to 10,000 |
| Timezone | A name from `pg_timezone_names`, default `UTC` |

Database checks enforce every rule. `@taskloom/contracts` exports the same rules, and a parity test keeps the two in step.

## 4. Derived Data

| Column | Written by | Rule |
|---|---|---|
| `tasks.number` | Insert trigger | Always allocated from the project counter. The default 0 exists for Prisma. Any other value on create fails with `DERIVED_COLUMN_WRITE`. |
| `tasks.rank` on create | Insert trigger | Generated after the project counter lock: before the column's first live rank, and unused anywhere in the project. The default `''` exists for Prisma. Any other value on create fails with `DERIVED_COLUMN_WRITE`. |
| `tasks.is_closed` | Trigger | Copied from the status, which the trigger reads `FOR SHARE`. An archived target status fails with `STATUS_ARCHIVED`. A direct write is rejected. |
| `tasks.closed_at` | Trigger | Set on the task's own move into a closed status. Kept on its own move between closed statuses. Cleared whenever the task becomes open. A flip of a status to closed leaves it empty, so no date is invented. |
| `project_statuses.is_closed`, `org_template_statuses.is_closed` | Trigger | Always `closed_kind IS NOT NULL` |
| `*.updated_at` | Trigger | User-visible edits only. Rank moves and rebalances do not count. |
| `tasks.rank` on move | API (Designed) | Generated from neighbor ids. Clients never send ranks. |
| Activity events | API | Written in the mutation transaction. `from` and `to` come from `UPDATE ... RETURNING OLD, NEW`. A save that changes nothing writes no event. |

`closed_at` is a display field. Completion metrics read `task.status_changed` and `status.closed_kind_changed` events, because a status flip closes tasks without a real completion time.

## 5. Invariants and Tests

### 5.1 Invariants

| Invariant | Enforced by | Tests |
|---|---|---|
| Child rows share their parent's `org_id` | Composite foreign keys | T4 |
| No tenant row is readable or writable outside the current org | Forced row-level security, fail-closed context | T4 |
| Assignees, authors, actors, and creators belong to the org | Foreign keys to memberships, guard trigger | T4 |
| A live org has at least one active owner | Deferred constraint trigger | T6 |
| A project's default status is its own, open, and not archived | Deferred constraint trigger | T7 |
| An archived status has no tasks | Deferred trigger on statuses, plus a shared-lock check in every task create, move, and restore | T7 |
| `is_closed` matches the status definition | Triggers | T2, T3, T14 |
| `closed_at` is empty while open and set only by the task's own move into a closed status | Trigger | T2, T3 |
| No open, visible task is assigned to an inactive member | Guard trigger with a shared row lock | T5, T18 |
| A bulk reopen clears inactive assignees first | API bulk reopen routine; the guard trigger rejects any path that skips it | T8, T18 |
| Task numbers are unique, never reused, and assigned by the database | Counter row, unique constraint, insert trigger | T2, T19 |
| Project keys never change | Column grants, unique per org | T28 |
| Rank is unique per project | Deferrable unique constraint | T10 |
| History is append-only and its scope matches its type | Grants, policies, check constraint | T10 |
| Archived labels cannot be applied | Trigger with a shared lock on the label row | T7, T10 |
| A comment has a body exactly when it is not deleted | Check constraint | T28 |
| Every task has a due date | `NOT NULL` | T25 |
| Only the switcher and join roles read across tenants, each through definer functions | Role-scoped policies and column grants | T16, T29 |
| `app_user` reads only itself and current-org members in `users` | Forced row-level security on `users` | T17 |
| Identity columns change only through `app_identity` | Column grants | T17 |
| One pending join request per user per org; a requester reads only their own requests and no tenant data | Partial unique index, role-scoped policies, definer functions | T29 |
| A reused refresh token revokes its family | API, unique hash index | T31 |
| `app_runtime` has no privileges without `SET ROLE` | Grants `WITH INHERIT FALSE` | T32 |
| Member lookup returns at most one id and nothing else | Definer function with a fixed return type | T33 |

API-enforced by design: the role matrix, approval roles (never owner), rate limits on sign in, member lookup, join requests, and org creation, the bulk reopen routine, status and label caps, read-only archived projects, mention validation, rank generation, and one event per mutation.

### 5.2 Tests

| Id | Scenario | Tier |
|---|---|---|
| T1 | Two tenants bootstrapped through the org and project creation procedures | Built |
| T2 | Number allocation; derived `is_closed` and `closed_at`; direct writes rejected | Built |
| T3 | A flip updates `is_closed`; a flip to open clears `closed_at`; a flip to closed leaves it empty; closed, flipped open, flipped closed shows no `closedAt` | Built |
| T4 | Row-level security isolation for reads and writes; fail-closed context; foreign assignee rejected | Built |
| T5 | Inactive assignee rejected on assign and reopen (Built). Deactivation clears open assignments only (Designed). | Split |
| T6 | A live org cannot lose its last active owner | Built |
| T7 | Invalid default status rejected; a status with tasks cannot be archived directly; create, move, or restore into an archived status fails with `STATUS_ARCHIVED`; a concurrent move and archive never leave a task in the archived status; an archived label fails with `LABEL_ARCHIVED` under the same race | Built |
| T8 | Status archive moves tasks, reopens them where needed, and clears inactive assignees | Designed |
| T10 | History append-only and scope-checked; rank uniqueness; archived label rejected | Built |
| T13 | Prisma diff of the migrated database against `schema.prisma` is empty | Built |
| T14 | Status `is_closed` follows `closed_kind` whatever value is written | Built |
| T15 | Due dates round-trip unchanged on servers in UTC+14 and UTC-7 | Built |
| T16 | As `app_membership_reader`, the caller reads exactly their own memberships and those orgs, zero rows elsewhere, and no write succeeds; as `app_user`, a user in two orgs reads one membership row | Built |
| T17 | `app_user` cannot read a user outside the current org, update another user, insert users, or change identity columns; `app_identity` reads and writes only `users` | Built |
| T18 | A flip that skips the bulk reopen routine fails with `ASSIGNEE_INACTIVE` and changes nothing (Built). A flip through the API clears the departed assignee and writes one event (Designed). | Split |
| T19 | A create with `number` other than 0 fails with `DERIVED_COLUMN_WRITE`; the next normal create still gets the next number | Built |
| T21 | Two concurrent status changes produce events where the second `from` equals the first `to`; no-op saves and duplicate labels write no event | Designed |
| T22 | Inside one read request, a task saved by another session between the list and the summary appears in neither | Built |
| T23 | `first: 101` fails with `VALIDATION_FAILED`; a query over the cost or depth limit fails with `QUERY_TOO_COMPLEX`; `organization.projects` returns pages | Built |
| T24 | The default task query on a large project reads one page; its plan shows an index scan and no full sort; the same for priority and due-date order | Built |
| T25 | Creating a task without a due date fails; clearing a due date fails | Built |
| T27 | Tasks in archived projects never count as overdue; the plans for the overdue query and the summary do not read `projects` | Built |
| T28 | `app_user` cannot update `projects.key`; a comment with both a body and a deletion time, or with neither, is rejected | Built |
| T29 | A requester sees only their own join requests and no tenant rows; a second pending request for the same org fails; another org's owner cannot read the request | Built |
| T30 | Approval inserts or reactivates exactly one membership with the chosen role and writes `member.added` with `via: join_request`; rejection writes `member.join_request_rejected`; a decided request fails with `JOIN_REQUEST_NOT_PENDING`; no path grants owner | Built |
| T31 | Refresh rotates the token; presenting a rotated token revokes the whole family; sign out revokes it | Built |
| T32 | As `app_runtime` without `SET ROLE`, every tenant table and `users` read fails | Built |
| T33 | `app.lookup_user_id_by_email` returns one id or none, for exact matches only | Built |

## 6. Mutation Behavior

### 6.1 Built flows

| Flow | Behavior |
|---|---|
| Sign up, sign in | `/auth` routes under `app_identity`. argon2id hashes. Unknown email and wrong password return the same `INVALID_CREDENTIALS` in the same time. The access token is a 15-minute JWT whose subject is the user id. |
| Refresh, sign out | The refresh token is an `HttpOnly`, `SameSite=Strict` cookie on `/auth`. Every refresh rotates it. Reuse of a rotated token revokes the family. Sign out revokes the family and clears the cookie. |
| Create organization | Any signed-in user, 5 per day. `app.create_organization` sets its own org context and inserts the org, its settings, the owner membership, and the default status template in one transaction. |
| Request to join | `app.submit_join_request(slug)` resolves the slug, rejects an existing member with `ALREADY_MEMBER` or a pending duplicate with `JOIN_REQUEST_PENDING`, and inserts the request. The requester can cancel a pending request. |
| Approve or reject | Owner or admin. Approval inserts or reactivates the membership with the chosen role (admin, member, or contributor), marks the request, and writes `member.added` with `via: join_request`. Rejection writes `member.join_request_rejected`. |
| Add member | Owner or admin. `app.lookup_user_id_by_email` matches the exact email, 30 lookups per org per hour, then the same membership path with `via: direct`. |
| Create project | Owner, admin, or member. `app.create_project` copies the template statuses, sets the default status, and writes `project.created`. |
| Create task | Every role. Title, description, status (the project default unless chosen), priority, assignee, due date, and up to 20 labels. The insert trigger allocates the number and the rank. Writes `task.created`. |

### 6.2 Designed flows

| Flow | Behavior |
|---|---|
| Project lifecycle | Active and archived. Archived projects are read-only; mutations fail with `PROJECT_ARCHIVED`. |
| Task lifecycle | Archive is independent of open and closed. Restore returns the task to the state its status defines. Reopen and restore clear an inactive assignee in the same statement. |
| Close work | A move into a closed status sets `is_closed` and stamps `closed_at`. The task leaves overdue counts at once. |
| Change a workflow | A rename touches one row. A flip to closed updates `is_closed` on its tasks. A flip to open, or an archive into a replacement, runs the bulk reopen routine: lock the affected assignees' memberships in `user_id` order, clear departed assignees on live tasks that will reopen, apply the change, and write one `task.assignee_changed` event per cleared task with reason `status_reopened`. Archive also moves every task, with one event each. |
| Remove a teammate | Deactivation clears open assignments with one event each, attributed to the admin. Comments, history, and closed-task assignments stay attributed to the member. Deactivation always wins against a concurrent assignment. |
| Board move | `moveTask(taskId, statusId, afterTaskId, beforeTaskId)`. Key-share lock on the project row, read the neighbor ranks, compute a key between them plus a random suffix, update `status_id` and `rank`, retry once on collision. An event is written only if the status changed. A key longer than 64 characters enqueues a rebalance. |
| Rank rules | Base-62 keys with `COLLATE "C"`, so database order equals JavaScript order. New tasks go to the top of their column. A status change without a drop position keeps the rank. A drop on a filtered board may interleave with hidden cards. Rebalance rewrites every rank of a project in one transaction under an exclusive project lock, bumps `rank_epoch`, and writes no history. |
| Task updates | One SQL statement through parameterized `$queryRaw` with `RETURNING OLD, NEW`. Event `from` values come only from `OLD`. Label events record the rows actually inserted and deleted. `$queryRawUnsafe` and `$executeRawUnsafe` are banned by lint. |
| Role changes | Checked in the API only. The database guards only the last owner. A resolver bug that writes `role = owner` is an org takeover, so API tests cover every role transition. |

| Operation | Lock | Waits for |
|---|---|---|
| Task create | Row lock on the project counter | Other creates in the same project, rebalance |
| Board move | Key-share lock on the project row | Rebalance |
| Task create, move, restore | Shared lock on the target status row | Archive or flip of that status |
| Label apply | Shared lock on the label row | Archive of that label |
| Rank rebalance | Exclusive lock on the project row | Everything holding the row |
| Assign, reopen, restore | Shared lock on the assignee's membership row | Deactivation of that member |
| Status flip to open, status archive | Shared locks on the affected memberships in `user_id` order, then task row locks | Deactivation of those members |

Moves and creates never wait for each other. The bulk reopen routine locks memberships before tasks, in the same order as deactivation, so the two cannot deadlock.

## 7. GraphQL Contract

### 7.1 Operations

**Org selection.** `viewer`, `createOrganization`, `requestToJoinOrganization`, and `cancelJoinRequest` run without an org. Every other operation requires the selected org id in the `X-Org-Id` header. An operation that mixes org-less mutations with org-scoped fields fails with `VALIDATION_FAILED`.

**Authentication.** REST routes `/auth/signup`, `/auth/signin`, `/auth/refresh`, and `/auth/signout` (Built). GraphQL takes the access token as a bearer header.

**Queries (Built).** `viewer` (user, memberships, own join requests), `organization` (with `members` and `joinRequests` connections), `project`, `projectByKey`, `task`, `taskByIdentifier`, `tasks(filter, orderBy, first, after)`, `taskSummary(filter)`, `board(projectId, filter, first)`, `labels`.

**Mutations (Built).** `createOrganization`, `requestToJoinOrganization`, `cancelJoinRequest`, `approveJoinRequest(id, role)`, `rejectJoinRequest`, `addMember(email, role)`, `createProject`, `createTask`.

**Mutations (Designed).** Org settings and template; change role, deactivate, reactivate member; update, archive, restore project; create, update, reorder, archive status and set default; update, move, bulk move, archive, restore task and change labels; create, update, archive label; add, edit, delete comment.

**Filter.** Fields combine with AND; lists combine with OR, except `labelsAll`. Fields: projects, statuses, assignees plus `includeUnassigned`, priorities (including `NONE`), inclusive due-date range, `labelsAny`, `labelsAll`, `isClosed`, `overdueOnly`, `includeArchived`. `taskSummary` accepts the same filter.

**Summary shape.** `total`, `open`, `closed`, `overdue`; `byStatus` when the filter scopes one project, zero-filled; `byPriority`, always five entries; `byAssignee`, with one entry for unassigned.

### 7.2 Ordering and limits

| Order | Executed as | Index within one project |
|---|---|---|
| `RANK` (board order, exactly one project) | `rank` | `tasks_board`, `tasks_rank_unique` |
| `CREATED_AT` (default, newest first) | `id` (UUIDv7, time-ordered and unique) | `tasks_project_created` |
| `DUE_DATE` | `due_date`, then `id` | `tasks_project_due` |
| `PRIORITY` | `coalesce(priority, 5)`, then `id` | `tasks_project_priority` |

"Recently updated" is not offered in v1. `first` defaults to 50, maximum 100. Every list that can grow without limit is a connection, including `organization.projects`. Lists with a hard cap stay plain lists: live statuses per project and live labels per org. The server estimates cost (each connection costs `first` times its children) and depth before execution. Initial limits are depth 10 and cost 10,000, tuned against the UI's queries.

### 7.3 Resolver contracts

1. `Priority.NONE` is SQL `NULL`. A filter containing it becomes `priority IS NULL OR priority = ANY(...)`.
2. The `Date` scalar is a `YYYY-MM-DD` string end to end. It is never converted through local time. `dueDate` is required on create and cannot be cleared.
3. In nullable inputs, an absent key means unchanged and an explicit `null` means clear.
4. `Task.closedAt` is returned only when `isClosed` is true.
5. Every nested field reachable from a list is batched through a request-scoped DataLoader.
6. Cursors are opaque base64 of the sort key plus id. `RANK` ordering requires exactly one project in the filter.
7. Task timelines bound history reads by the task's creation time.
8. The API never writes task numbers, `is_closed`, or `closed_at`, and never updates or deletes history.
9. `User.email` resolves for the requesting user and for owners and admins of the current org; for everyone else it is `null`.

### 7.4 Activity history

Every payload stores ids plus snapshots of anything renamable (status, label). User names are not snapshotted. Consequences of a human action are attributed to that human. The task timeline merges comments and task events by `(created_at, id)` at read time.

| Family | Types |
|---|---|
| Task | created, title, description (text not stored), status (with reason), priority, assignee (with reason), due date, labels, archived, restored |
| Comment | edited, deleted |
| Project | created, updated, archived, restored |
| Status | created, updated, closed kind changed (with affected and cleared counts), archived (with replacement, moved count, and cleared count) |
| Label | created, updated, archived |
| Member | added (with `via`: direct or join request), join request rejected, role changed, deactivated (with cleared count), reactivated |
| Org | settings changed, template changed |

### 7.5 Error codes

Errors carry `extensions.code`.

| Group | Codes |
|---|---|
| Access | `UNAUTHENTICATED`, `NOT_FOUND`, `FORBIDDEN`, `RATE_LIMITED` |
| Accounts | `EMAIL_TAKEN`, `INVALID_CREDENTIALS` |
| Organizations | `ORG_SLUG_TAKEN`, `ALREADY_MEMBER`, `JOIN_REQUEST_PENDING`, `JOIN_REQUEST_NOT_PENDING` |
| Input | `VALIDATION_FAILED`, `INVALID_ORDER`, `INVALID_MENTION`, `QUERY_TOO_COMPLEX` |
| Projects | `PROJECT_ARCHIVED`, `PROJECT_KEY_TAKEN` |
| Statuses | `STATUS_NOT_IN_PROJECT`, `STATUS_ARCHIVED`, `STATUS_IN_USE`, `STATUS_NAME_TAKEN`, `STATUS_LIMIT_REACHED`, `DEFAULT_STATUS_INVALID` |
| People | `ASSIGNEE_NOT_MEMBER`, `ASSIGNEE_INACTIVE`, `LAST_OWNER`, `MEMBER_NOT_ACTIVE` |
| Labels | `LABEL_NAME_TAKEN`, `LABEL_ARCHIVED`, `LABEL_LIMIT_REACHED` |
| Tasks | `TASK_ARCHIVED`, `RANK_CONFLICT` |
| Bugs | `DERIVED_COLUMN_WRITE` |

## 8. Other Queries and Indexes

| Operation | Shape | Index |
|---|---|---|
| Task timeline | `UNION ALL` of comments and task events, each keyset-limited on `(created_at, id)`; events also bounded by `created_at >= task.created_at` | `comments_timeline`, `activity_by_task` |
| Project feed | Events with `project_id = $project`, keyset on `(created_at, id)` | `activity_by_project` |
| Deactivate member | Clear open assignments and return them for one event each | `tasks_open_by_assignee` |

| Index | Serves |
|---|---|
| `tasks_org_created (org_id, id)` live | Default order across projects, newest first |
| `tasks_by_status (org_id, project_id, status_id)` | Status foreign key, status flips, status archive checks |
| `tasks_open_by_assignee (org_id, assignee_id)` open, assigned | Deactivation |
| `tasks_archived (org_id, project_id, archived_at DESC)` archived | Archived view |
| `tasks_rank_unique (org_id, project_id, rank)` deferrable | Rank uniqueness |
| `comments_timeline`, `comments_live_count` | Timeline, comment counts |
| `activity_by_task`, `activity_by_project`, `activity_by_org` | Timelines and feeds, per partition |
| `org_memberships_by_user (user_id)` active | Org switcher |
| `org_join_requests_pending (org_id, user_id)` pending, unique | One pending request per user; the approval queue |
| `org_join_requests_by_user (user_id, created_at DESC)` | The requester's own list |
| `refresh_tokens_hash (token_hash)` unique | Refresh lookup |
| Case-insensitive unique name indexes | Status, template status, and label names |

History partitions are monthly and live in schema `history_parts`, which Prisma does not model, so the drift check (T13) ignores them. `app.ensure_activity_partitions(months_ahead)` creates missing partitions idempotently. The initial migration and the seed call it for 12 months ahead. A maintenance job run as `app_owner` calls it monthly (Designed). The default partition must stay empty.

## 9. Re-key Design (Later)

A re-key renames a project key while every existing link keeps working. One transaction runs under an exclusive lock on the project row. A new project row takes the new key and copies the counter, rank epoch, and creation time. Statuses and tasks move to it with numbers, ranks, and ids unchanged, so `ENG-123` becomes `PLAT-123`. Older tombstones are repointed to the new project. The old row becomes a tombstone that holds its key forever. Queries swap a tombstone's id for its successor before they run. Mutations against a tombstone fail with `PROJECT_REKEYED`. Re-keying back to an old key fails with `PROJECT_KEY_TAKEN`.

The cost is a rewrite of every status and task of the project under an exclusive lock, a new project id, and project history split across tombstones. A `project_keys` history table was reviewed as an alternative and not adopted. Re-key is an admin-only action with a UI warning.
