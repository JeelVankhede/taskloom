# Design Reference: API

| Field | Value |
|---|---|
| Version | 1.5. Split from the single design reference (1.4) with the same section numbers; no content changed. 1.4 supersedes 1.3 and Adds accounts, organization onboarding, and join requests to the Built tier, and records the scaffolding decisions ([implementation plan](implementation-plan.md), section 2). |
| Role | Appendix. Holds the detail that [1.2-data-model.md](1.2-data-model.md) summarizes. |
| Delivery tiers | Built, Designed, and Later, as defined in the [README](../README.md) |
| Review decisions | [1.3-analysis.md](1.3-analysis.md) |

Test ids keep their original numbers so they match the review record. T9, T11, T12, T20, and T26 moved to Later with their features. T28 is new in 1.3. T29 to T33 are new in 1.4.

Sections 1 to 5, 8, and 9 (scope, roles, entity rules, derived data, invariants and tests, other queries, re-key) are in [design-reference-data.md](design-reference-data.md). Section numbers are shared across both files.

## 6. Mutation Behavior

### 6.1 Built flows

| Flow | Behavior |
|---|---|
| Sign up, sign in | `/auth` routes under `app_identity`. argon2id hashes. Passwords are 10 to 128 characters and not the email. Unknown email and wrong password return the same `INVALID_CREDENTIALS` in the same time. The access token is a 15-minute HS256 JWT with `sub` (user id), `iss: taskloom-api`, and `aud: taskloom-web`. Sign up returns a session. |
| Refresh, sign out | The refresh token is the `tl_refresh` cookie: `HttpOnly`, `SameSite=Strict`, `Path=/auth`, `Secure` outside development. `/auth` also requires `Origin` to be the web app. Every refresh rotates the token; a family lives 30 days from sign in (absolute). Rotation is strict: reuse of a rotated token revokes the family. Sign out revokes the family and clears the cookie. |
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
| Rank rules | Fractional-indexing keys (length-prefixed integer part plus fraction, base 62) with `COLLATE "C"`, so database order equals JavaScript order. New tasks go to the top of their column, with a key before the project's lowest rank. A status change without a drop position keeps the rank. A drop on a filtered board may interleave with hidden cards. Rebalance rewrites every rank of a project in one transaction under an exclusive project lock, bumps `rank_epoch`, and writes no history. |
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

**Queries (Built).** `viewer` (user, memberships, own join requests), `organization` (with `timezone`, which decides today and overdue for clients, and `members` and `joinRequests` connections), `project`, `projectByKey`, `task`, `taskByIdentifier`, `tasks(filter, orderBy, first, after)`, `taskSummary(filter)`, `board(projectId, filter, first)`, `boardColumn(projectId, statusId, filter, first, after)`, `labels(includeArchived)`. Missing or hidden rows are `NOT_FOUND`. Tasks in archived projects are excluded unless the filter sets `includeArchived`.

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
| Unexpected | `INTERNAL_SERVER_ERROR`: the message is masked for the client and the full error is logged with the request id |

Invalid or missing GraphQL variables are `VALIDATION_FAILED`, and an id argument that is not a uuid is `NOT_FOUND`. Database failures map to these codes in one place: codes the database raises (SQLSTATE `P0001`) pass through, check and unique violations become `VALIDATION_FAILED`, and foreign key, permission, and row-level security violations become `NOT_FOUND`, so nothing about hidden rows leaks. Lifecycle failures carry an HTTP status: 401 for `UNAUTHENTICATED`, 429 for `RATE_LIMITED`, 400 for `VALIDATION_FAILED` and `QUERY_TOO_COMPLEX`.
