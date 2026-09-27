# Implementation Plan

| Field    | Value                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| Status   | Approved 27 September 2026. Each phase is detailed and its questions resolved with the reviewer before it is built. |
| Date     | 26 September 2026                                                                                                |
| Baseline | `chore/scaffold` (monorepo, agent rules, CI) on top of the design documents                                      |
| Sources  | [README](../README.md), [1.2](1.2-data-model.md), [design reference](design-reference.md) v1.4, [2.1](2.1-api-design.md), [2.2](2.2-ui-architecture.md), [3.1](3.1-rfc-board-performance.md) |

This plan turns the design documents into code. Each phase is one branch and one pull request. A phase is done only when its exit criteria hold with evidence, and it updates any document its code contradicts.

## 1. Scope

### 1.1 What gets built

| Area | Built in v1 |
| --- | --- |
| Database | Every v1 table, four API roles plus the runtime login role and the join-request role, forced row-level security, triggers, monthly history partitions, and the Built-tier invariant tests |
| Request lifecycle | JWT verification, one transaction per GraphQL operation, `SET LOCAL ROLE`, tenant context, membership read once, pure `authorize`, cost and depth limits, DataLoaders |
| Accounts | Email and password sign up and sign in, a 15-minute access token, a rotating refresh token in an `HttpOnly` cookie, sign out |
| Organizations | Create an organization (the creator becomes owner), request to join by slug, owner or admin approval or rejection, add an existing user by exact email, create a project from the dashboard |
| Tasks | Create a task (Q1): title, description, status (the project default unless chosen), priority, assignee, due date, labels. The database allocates the number and the top-of-column rank. |
| Read API (Task 2.1) | `viewer`, `organization`, `project`, `projectByKey`, `task`, `taskByIdentifier`, `tasks`, `taskSummary`, `board`, `labels` |
| Web | Design system, sign in and sign up, onboarding, org switcher, dashboard with projects, members and join requests, and the Task Board (Task 2.2) |
| Seed | Demo organizations, users for every role, a pending join request, and one project with 2,500 tasks |

### 1.2 What stays designed or later

Task edits, moves, and archive, status, label, and comment mutations, rank generation for moves and rebalance, bulk reopen, member deactivation, and partition maintenance stay **Designed**. Re-key, org deletion, auto-archive, the outbox, invitations for non-users, email verification, and password reset stay **Later**. The design reference specifies each.

## 2. Decisions Carried Into the Build

These were settled in the scaffolding session. The design documents now reflect them.

| # | Decision | Why |
| --- | --- | --- |
| B1 | Modular monolith: one NestJS API with hard module boundaries | Composite tenant keys, one read snapshot per request, and row-level security all need one database and one transaction. Microservices would split them. |
| B2 | One Prisma client and one pool. The API logs in as `app_runtime`, which holds no privileges of its own, and runs `SET LOCAL ROLE app_user` or `app_identity` inside each transaction | Four clients would mean four pools. A query outside a request transaction fails loudly (critique X7). |
| B3 | Cross-tenant reads run through `SECURITY DEFINER` functions owned by `NOLOGIN` roles (`app_membership_reader`, `app_join`, `app_identity`) | The request never switches roles mid-transaction, and each crossing has one narrow entry point |
| B4 | One transaction per GraphQL operation, with no external I/O inside it, explicit `timeout` and `maxWait`, and connection hold time logged per request | Row-level security context and the list-summary snapshot need it. The three rules keep PgBouncer connections short (critique S2). |
| B5 | Monthly `activity_events` partitions live in schema `history_parts`. `app.ensure_activity_partitions(months_ahead)` creates 12 months ahead plus a DEFAULT partition | Prisma models only `public`, so the drift check (T13) stays clean. Partitioning stays cheap for the MVP. |
| B6 | New index `tasks_org_created (org_id, id)` on live tasks | The default newest-first order across projects had no index |
| B7 | Accounts: argon2id password hashes, readable only by `app_identity`. The access JWT (`sub` = user id) lives in memory. The refresh token rotates, is stored hashed, and is revoked with its whole family on reuse | Agreed security rules: no tokens in browser storage |
| B8 | Join by request: the user enters an org slug, and an owner or admin approves or rejects the request. Owners and admins can also add an existing user by exact email | Agreed onboarding flow. Browsing orgs is not offered, because it would list tenants. |
| B9 | NestJS 12 is ESM-only, so the API is ESM and API tests run on Vitest with SWC | Jest's ESM support is experimental. Web and API now share one test runner. |
| B10 | `graphql` pinned to 16 | Apollo Server 5 requires `^16.11`, and a second copy breaks schema identity |
| B11 | MUI X Charts replaces Recharts for the priority chart | One component system |
| B12 | Stack: Node 24, TypeScript 6.0, NestJS 12, Apollo Server 5, Prisma 7.10, PostgreSQL 18, PgBouncer, React 19, Vite, MUI 9, Apollo Client 4, React Router, React Hook Form, Vitest, Testcontainers, Storybook, Playwright | TypeScript 7 is not yet supported by typescript-eslint. Prisma's `latest` npm tag is an 8.0 release candidate. |

## 3. Cross-Cutting Design for the New Scope

### 3.1 Database roles

| Role | Login | Privileges | Used for |
| --- | --- | --- | --- |
| `postgres` | Yes | Superuser | Local bootstrap only. Never used by the app. |
| `app_owner` | Yes | Owns every object, `CREATEROLE`, not a superuser, forced row-level security | Migrations |
| `app_runtime` | Yes | None of its own. Granted `app_user` and `app_identity` `WITH INHERIT FALSE, SET TRUE` | Every API connection, through PgBouncer |
| `app_user` | No | Tenant tables under the tenant policy | GraphQL operations |
| `app_identity` | No | `users` and `refresh_tokens` only | `/auth/*` routes. Owns `app.lookup_user_id_by_email`. |
| `app_membership_reader` | No | The caller's own memberships and those orgs | Owns `app.viewer_memberships()` |
| `app_join` | No | Resolves an org slug, and reads and writes the caller's own join requests | Owns `app.submit_join_request`, `app.cancel_join_request`, `app.viewer_join_requests` |

Migrations create the `NOLOGIN` roles and `app_runtime` as `NOLOGIN`. The local init script and Testcontainers setup then run `ALTER ROLE app_runtime LOGIN PASSWORD ...`, so no secret lives in a migration. PgBouncer authenticates `app_runtime`, and migrations connect straight to PostgreSQL as `app_owner`.

**Fix to the scaffold:** `POSTGRES_USER` is currently `app_owner`, which the Docker image makes a superuser. A superuser bypasses row-level security, even when it is forced. Phase 1 moves the superuser to `postgres` and creates `app_owner` without superuser rights in an init script.

### 3.2 New and changed tables

| Table | Change |
| --- | --- |
| `users` | Adds `password_hash`. `auth_subject` becomes nullable and is reserved for a future identity provider. A check requires one of the two. |
| `refresh_tokens` | New global table: `id`, `user_id`, `family_id`, `token_hash` (unique), `expires_at`, `revoked_at`, `replaced_by_id`, `created_at`. Forced row-level security. Only `app_identity` has access. |
| `org_join_requests` | New tenant table: `(org_id, id)` primary key, `user_id`, `status` (`pending`, `approved`, `rejected`, `canceled`), `created_at`, `decided_at`, `decided_by`. One pending request per user per org. The decision columns are set exactly when the status is `approved` or `rejected`. |
| `activity_events` | `member.added` gains `via` (`direct` or `join_request`). New type `member.join_request_rejected`. |

### 3.3 Request lifecycle

1. Passport verifies the JWT. `sub` is the user id. A missing or invalid token returns `UNAUTHENTICATED`.
2. An Apollo server plugin opens one Prisma interactive transaction when the operation resolves, stores it in the request scope (`nestjs-cls`), and commits or rolls back when the response is sent. Queries run `REPEATABLE READ READ ONLY`. Mutations run `READ COMMITTED`.
3. The first statements are `SET LOCAL ROLE app_user` and `set_config` for the user id and the org id from the `X-Org-Id` header.
4. **Org-scoped operations** read the caller's own membership once. With no active membership the response is `NOT_FOUND`. The role is stored for `authorize`.
5. **Org-less operations** send no header. They are `viewer`, `createOrganization`, `requestToJoinOrganization`, and `cancelJoinRequest`. An operation that mixes org-less mutations with org-scoped fields fails with `VALIDATION_FAILED`.

### 3.4 GraphQL additions

```graphql
type Viewer {
  user: User!
  memberships: [Membership!]!
  joinRequests: [ViewerJoinRequest!]!
}

type Mutation {
  createOrganization(input: CreateOrganizationInput!): Organization! # org-less
  requestToJoinOrganization(slug: String!): ViewerJoinRequest! # org-less
  cancelJoinRequest(id: ID!): ViewerJoinRequest! # org-less, own request
  approveJoinRequest(id: ID!, role: Role = MEMBER): Membership! # owner, admin
  rejectJoinRequest(id: ID!): JoinRequest! # owner, admin
  addMember(email: String!, role: Role = MEMBER): Membership! # owner, admin
  createProject(input: CreateProjectInput!): Project! # owner, admin, member
  createTask(input: CreateTaskInput!): Task! # every role (Q1)
}
```

Approval and direct add can grant `admin`, `member`, or `contributor`, never `owner`. New error codes: `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `ORG_SLUG_TAKEN`, `ALREADY_MEMBER`, `JOIN_REQUEST_PENDING`, `JOIN_REQUEST_NOT_PENDING`, `RATE_LIMITED`.

### 3.5 Auth routes

| Route | Behavior |
| --- | --- |
| `POST /auth/signup` | Email, password, display name. Returns the access token and user, and sets the refresh cookie. `EMAIL_TAKEN` on a duplicate. |
| `POST /auth/signin` | Unknown email and wrong password take the same time and return the same `INVALID_CREDENTIALS` |
| `POST /auth/refresh` | Rotates the refresh token. Reuse of a revoked token revokes the whole family. |
| `POST /auth/signout` | Revokes the family and clears the cookie |

The cookie is `HttpOnly`, `SameSite=Strict`, `Path=/auth`, and `Secure` outside development. Auth routes have strict throttling.

### 3.6 Web routes

| URL | Screen | Access |
| --- | --- | --- |
| `/signin`, `/signup` | Account forms | Public |
| `/onboarding` | Create an organization, or request to join by slug, with pending requests listed | Signed in |
| `/o/:orgSlug` | Dashboard: projects, and create project for member and above | Member of the org |
| `/o/:orgSlug/p/:projectKey` | Task Board | Member of the org |
| `/o/:orgSlug/members` | Members, add by email, and join requests for owners and admins | Member of the org |

After sign in, the app loads `viewer.memberships`. With no membership it opens onboarding. Otherwise it opens the last organization, or the first one. The org slug in the URL maps to the org id sent in `X-Org-Id`.

## 4. Phases

Each phase lists its deliverables, the tests that prove it, and its exit criteria. Test ids match design reference section 5.2. The relative sizes are S, M, and L.

### Phase 1: Database foundation (L)

Branch `feat/db-schema`.

- Docker: the superuser fix from section 3.1, an init script for `app_owner` and the `app_runtime` login, and PgBouncer authenticating `app_runtime`.
- `schema.prisma`: every v1 table and enum from 1.2 section 2.2 plus section 3.2 above. Composite `org_id` relations use explicit `onDelete: NoAction, onUpdate: NoAction` (critique F4). Partial indexes are included.
- Hand-written migrations, in order:
  1. Roles and grants.
  2. Context functions `app.current_user_id()` and `app.current_org_id()`: `STABLE`, `PARALLEL SAFE`, and `NULL` without context.
  3. Forced row-level security and the tenant policy on every tenant table. Policies on `users` and `refresh_tokens`.
  4. Derive and guard triggers: task number allocation, `is_closed` and `closed_at` with the `FOR SHARE` status read, status `is_closed`, `updated_at`, the assignee guard, the last-owner and default-status deferred constraint triggers, the archived-label guard, and the history scope check.
  5. `activity_events` partitioned in `history_parts`, plus `app.ensure_activity_partitions`.
  6. Expression indexes, such as priority `coalesce`, and the new `tasks_org_created`.
  7. Procedures `app.create_organization` and `app.create_project`, the definer functions from section 3.1, and the join-request policies.
- Test harness: one PostgreSQL 18 Testcontainer per test run, the migration chain applied once, and a helper `asRole(role, { userId, orgId }, fn)` that runs each test in a rolled-back transaction.
- **Tests:** T1, T2, T3, T4, T5 (Built part), T6, T7, T10, T13, T14, T16, T17, T18 (Built part), T19, T25, T28. New:
  - **T29:** Join-request isolation. A requester sees only their own requests and never the org's data, and only one request can be pending per user per org.
  - **T32:** `app_runtime` can read nothing without `SET ROLE`.
  - **T33:** Email lookup returns one id and nothing else.
- **Exit:**
  - `npm run migrate` on an empty database, and the migrate job in CI passes.
  - T13 reports no drift.
  - All listed tests pass as `app_user`, never as a superuser.

### Phase 2: Request lifecycle and API platform (M)

Branch `feat/request-lifecycle`.

- `PrismaModule`: a single client on `@prisma/adapter-pg` through PgBouncer.
- `DbContext` in the request scope, the transaction plugin from section 3.3, and a startup check that the runtime role has no direct grants.
- A capability enum in `@taskloom/contracts`, and `authorize(role, capability)` as a pure function over the 1.2 section 2.3 matrix.
- Domain errors mapped to `extensions.code`, and unknown errors masked.
- Cost and depth limits (`graphql-query-complexity`, `graphql-depth-limit`) and the `first <= 100` check.
- `nestjs-pino` with a correlation id and redacted secrets, plus `@nestjs/throttler`.
- A DataLoader registry per request.
- **Early spike:** prove the plugin-held transaction against PgBouncer with `SET LOCAL`, the timeouts, and rollback on error before building on it. Report back if it fails.
- **Tests:**
  - T22: the list and the summary see one snapshot.
  - T23: limits and `QUERY_TOO_COMPLEX`.
  - Lifecycle cases: no token, a foreign org, an inactive membership, a transaction timeout, and a mixed operation.
  - A table-driven test of the role matrix.
- **Exit:** every resolver reaches the database only through the request transaction. The lint rule and a test prove it.

### Phase 3: Accounts and authentication (M)

Branch `feat/auth`.

- An `identity` module with the four routes from section 3.5, argon2id hashing, refresh rotation with reuse detection, the Passport JWT strategy for GraphQL, and cookie handling.
- `@taskloom/contracts` exports the shared account rules: email length, password policy, and display name length.
- **Tests:**
  - **T31:** Refresh rotation, and family revocation when a token is reused.
  - Sign up with a duplicate email.
  - Equal-timing failure paths.
  - The throttling limit.
  - A missing or expired access token.
- **Exit:** a curl script can sign up, sign in, refresh, sign out, and call `viewer`. Tokens never appear in logs.

### Phase 4: Organizations, members, join requests, projects (M)

Branch `feat/org-membership`.

- The mutations and `viewer` fields from section 3.4, including `createTask`, which writes `task.created` and applies up to 20 labels.
- `organization.members` and `organization.joinRequests` as connections.
- Approval inserts or reactivates exactly one membership and writes `member.added` with `via: join_request`. Rejection writes `member.join_request_rejected`.
- Member lookup is limited to 30 per org per hour, and join requests to 10 per user per hour.
- `createProject` copies the org status template through `app.create_project` and writes `project.created`.
- **Tests:**
  - **T30:** Approval and rejection outcomes and their events.
  - The T23 remainder: `organization.projects` pages.
  - Every role transition, including admins never granting owner.
  - The uniform response from the email lookup.
- **Exit:** two users can go from sign up to shared membership through the API alone.

### Phase 5: Seed data (S)

Branch `chore/seed`.

- **Organization Acme:** projects ENG (2,500 tasks) and OPS (40 tasks).
- **Organization Globex:** one project of 60 tasks.
- **Accounts:** an owner, admin, member, and contributor in Acme, one user in both organizations, one user with no organization, and one user with a pending request to Globex.
- **Task data:** statuses, labels, priorities, assignees including departed members, and due dates spread around today so overdue counts are meaningful.
- The seed runs per org through the creation procedures with tenant context set. It is idempotent: it resets and reseeds.
- Demo passwords live in `api/seed/` as test values and are listed in the README.
- **Exit:** `npm run seed` on a fresh database, and every demo account can sign in.

### Phase 6: Read API for Task 2.1 (L)

Branch `feat/read-api`.

- The full Task 1.1 types and the queries listed in section 1.1.
- One `TaskFilter` builder shared by `tasks`, `taskSummary`, and `board`.
- Cursor codecs, and four orders, each with its index.
- The summary as one `GROUPING SETS` statement, zero-filled.
- The board as one `LATERAL` statement, with per-column `rank` cursors.
- `taskByIdentifier`, and the overdue predicate exactly as in 1.2 section 3.1, with inactive projects read once per request.
- Loaders for users, statuses, labels by task, projects, and comment counts.
- **Tests:**
  - T15: due dates survive `TZ=Pacific/Kiritimati` and `TZ=America/Phoenix`.
  - T24: `EXPLAIN` as `app_user` shows index scans and no full sort.
  - T27: overdue ignores archived projects without reading `projects`.
  - A statement-count test: the board uses 8 statements or fewer, whatever the project size.
  - Filter semantics: `NONE` priority, `labelsAll`, unassigned, and the due-date range.
- **Exit:** the 2.1 operations answer on seeded data within the RFC targets on a laptop. The numbers go in the PR as evidence, not as a claim about production.

### Phase 7: Web foundation (M)

Branch `feat/web-foundation`.

- **Design system:** color, spacing, radius, type, z-index, and motion tokens, light and dark themes, and MUI component overrides.
- **Wrapper components:** Button, TextField, Dialog, Card, PageHeader, EmptyState, ErrorState, skeletons, UserChip, PriorityChip, StatusChip, and DateBadge. Each has Storybook stories that pass the a11y addon.
- **App shell:**
  - React Router routes and guards from section 3.6.
  - The auth module: in-memory token, refresh on load, and a single retry on 401. Refresh rotation is strict (Phase 3), so all tabs must share one refresh call (for example a `BroadcastChannel` or Web Locks leader); two tabs refreshing independently would revoke the session.
  - Apollo links for the auth header, the org header, and error mapping.
  - The org switcher, and an error boundary per route.
- Sign in and sign up screens built with React Hook Form and Zod, using the rules from `@taskloom/contracts`.
- **Tests:** component tests for the forms and guards. Playwright: sign up, sign out, sign in.
- **Exit:** every token and component reviewed in Storybook, in both themes.

### Phase 8: Onboarding, dashboard, members (M)

Branch `feat/web-org`.

- The onboarding screen, with creation and join requests.
- The dashboard, with a project list and a create-project dialog.
- The members screen, with add by email and approve or reject.
- Loading, error, and empty states on every screen.
- **Tests:** Playwright covers two flows:
  - Sign up, create an org, create a project.
  - A second user requests to join, the owner approves, and the second user sees the org.
- **Exit:** both flows pass in CI.

### Phase 9: Task Board for Task 2.2 (L)

Branch `feat/task-board`.

- The 2.2 tree: `TaskBoardPage`, `FilterBar`, `SummaryPanel` (`StatCards`, `PriorityChart`), `Board`, `Column`, `TaskCard`.
- `useTaskFilters` keeps filters in the URL. `useTaskBoard(filters)` runs the board and summary queries with the same variables.
- Each column calls `fetchMore` with its own cursor, through an Apollo field policy.
- Long columns are virtualized (open question Q4).
- A New task dialog (Q1), available to every role.
- Loading skeletons, per-query error and retry, and both empty cases.
- **Tests:**
  - Component tests with a mocked Apollo provider.
  - Stories for every state.
  - Playwright: a filter updates the board and the summary together, and the URL restores the view.
- **Exit:** the ENG board with 2,500 tasks loads with one page per column, and the measured time goes in the PR.

### Phase 10: Hardening and documentation (M)

Branch `docs/final-sync`.

- A full CI run from a clean clone, with the README steps followed exactly.
- `/security-review` and `/code-review` passes, with findings fixed or recorded.
- Documentation:
  - Compress 1.2.
  - Split the design reference into `design-reference-data.md` and `design-reference-api.md`.
  - Recheck the word limits of 2.1 and 2.2.
  - Update the AI transcript commentary.
- **Exit:** every README link resolves, and the Built tier matches the code.

## 5. Working Rules

- Branch from `main` after the previous phase merges. Use Conventional Commits. Pull requests follow the personal template.
- The gates in `.claude/rules/pre-commit.md` pass before every commit. No file exceeds 500 lines.
- A phase that must deviate from a document stops and asks first, then updates the document in the same pull request.
- Every pull request states what was run and what was checked by hand.

## 6. Risks

| Risk | Response |
| --- | --- |
| Holding a Prisma interactive transaction from Apollo plugin hooks is unusual | Spike first in Phase 2. The fallback is a Nest GraphQL execution wrapper that runs the operation inside `$transaction`. |
| Prisma behind PgBouncer in transaction mode with prepared statements | `max_prepared_statements` is set, and Phase 2 tests run through PgBouncer, not directly |
| T13 drift noise from hand-written SQL | Measured in Phase 1. Expression indexes may need `@@index` omissions documented in the schema. |
| Throttle counters are in memory | Correct for one instance. A shared store is Later, noted in the README. |
| Slug-based join requests confirm that an org slug exists | Accepted and rate-limited, like the member-lookup oracle in design reference section 2 |

## 7. Resolved Questions

| # | Question | Decision |
| --- | --- | --- |
| Q1 | Build a minimal `createTask`? | Yes. The seed and its demo accounts stay as planned. |
| Q2 | Show the organization's name to a requester? | Yes |
| Q3 | Does the approver pick the role at approval? | Yes, any role except owner |
| Q4 | Add `@tanstack/react-virtual` for long columns? | Yes |
| Q5 | Throttle organization creation? | Yes, 5 per user per day |
| Q6 | Keep this plan in the submission? | Yes |

## 8. Phase Decisions

Each phase is walked through with the reviewer before it is built. The answers are recorded here.

### Phase 1: Database foundation

| Topic | Decision |
| --- | --- |
| Where `createTask` lands | Database pieces in Phase 1, the mutation in Phase 4, the dialog in Phase 9 |
| Colors | Labels take one of ten color tokens: slate, red, orange, amber, green, teal, blue, indigo, purple, pink. Statuses have no color; the UI styles them by open, completed, or canceled. |
| Priority display names | `priority_labels text[4]`, default Urgent, High, Medium, Low |
| Timezone | Checked against `pg_timezone_names`, default `UTC`. The web app sends the browser's timezone at org creation. |
| Default template | Backlog, Todo, In Progress, In Review (open), Done (completed), Canceled (canceled). Todo is the default status, marked by `org_template_statuses.is_default`. |
| Field limits | Org slug 3 to 6 characters, lowercase letters, digits, inner hyphens. Org name 1 to 80. Project key exactly 3 characters (`^[A-Z][A-Z0-9]{2}$`). Project name 1 to 80, description up to 2,000. Task title 1 to 200, description up to 20,000. Comment up to 10,000. Label and status names 1 to 40. Display name 1 to 80. Enforced by database checks and shared from `@taskloom/contracts`. |
| Reserved slugs | admin, api, auth, app, o, signin, signup, onboarding, settings, www |
| Deactivation columns | `org_memberships.deactivated_at` added now |
| Case-insensitive text | The `citext` extension for email and slug |
| Partial indexes | Declared in the Prisma schema through the `partialIndexes` preview feature, so the drift check stays strict. Expression indexes and deferrable constraints stay in hand-written SQL, which Prisma's diff ignores. |
| Partition fallback | Not needed: the partitioned `activity_events` diffs clean |
| Task rank on create | Generated by the insert trigger after the project counter lock: before the column's first live rank and unique in the project. A client-supplied rank fails with `DERIVED_COLUMN_WRITE`. |
| Schema layout | `api/prisma/schema/` holds one file per domain, to respect the 500-line rule |
| Local tooling | `npm run db:reset` re-creates the dev databases. `npm run migrate:dev -w @taskloom/api` runs `prisma migrate dev` on a fresh shadow database. Both exist because Prisma only drops `public`, and the chain also owns `app` and `history_parts`. |

### Phase 2: Request lifecycle and API platform

| Topic | Decision |
| --- | --- |
| JWT | Phase 2 verifies only (HS256, signature, expiry, `sub` is a user id). Only token errors become `UNAUTHENTICATED` (HTTP 401); anything else surfaces as a bug. Issuing is Phase 3. |
| Transaction holder | The Apollo plugin approach passed the spike through PgBouncer in transaction mode; the fallback was not needed |
| Org header | `X-Org-Id`, the org id. The web app maps the URL slug to the id through `viewer.memberships`. |
| Capabilities | `MANAGE_OWNERS`, `MANAGE_ORG`, `MANAGE_PROJECTS`, `MANAGE_LABELS`, `EDIT_TASKS`, `COMMENT`, `DELETE_ANY_COMMENT`, `READ_ORG`, over the 1.2 section 2.3 matrix, exported from `@taskloom/contracts` |
| Error mapping | `P0001` codes pass through; `23514` and `23505` become `VALIDATION_FAILED`; `23503` and `42501` become `NOT_FOUND`; anything else is `INTERNAL_SERVER_ERROR`, masked for the client and logged in full |
| Cost model | Each field costs 1; a connection costs `first` (default 50) times its children. Depth 10, cost 10,000. |
| Rate limit | 300 GraphQL operations a minute per user, in memory, counted per operation. HTTP 429 with `RATE_LIMITED`. |
| Timeouts | Transaction timeout 5 s, maximum wait 2 s, and a warning log above 1 s of connection hold |
| T22 | Proved now with test-only probe resolvers; the real `tasks` plus `taskSummary` version comes in Phase 6 |
| Schema this phase | `viewer { id email displayName }` (org-less) and `organization { id slug name }` (org-scoped) replace the placeholder |
| Dependencies | `nestjs-cls`, `@nestjs/jwt`, `@nestjs/passport` with `passport-jwt`, `graphql-depth-limit`, `graphql-query-complexity`, `nestjs-pino` with `pino-http`, `@nestjs/throttler`, `dataloader` |

### Phase 3: Accounts and authentication

| Topic | Decision |
| --- | --- |
| Hashing | `argon2` (argon2id, 19 MiB, 2 iterations, parallelism 1). Unknown emails verify against a dummy hash, so both failures take the same time and return the same `INVALID_CREDENTIALS`. |
| Password rules | 10 to 128 characters, no composition rules, not equal to the email. Shared as `checkSignUp` in `@taskloom/contracts`. |
| Session lifetime | 30 days absolute from sign in; rotated tokens inherit the family expiry |
| Concurrent refresh | Strict: any reuse of a rotated token revokes the family. The web client shares one refresh call across tabs (Phase 7). |
| Cookie | `tl_refresh`, `HttpOnly`, `SameSite=Strict`, `Path=/auth`, `Secure` except in development |
| CSRF | `/auth` rejects requests whose `Origin` is not `WEB_ORIGIN` (403 `FORBIDDEN`) |
| Token claims | `iss: taskloom-api`, `aud: taskloom-web`, checked by the GraphQL verifier |
| Rate limits | Sign in 10 per minute per IP and 5 per minute per email; sign up 5 per hour; refresh 60 per minute; sign out 30 per minute. In memory. |
| Existing email | 409 `EMAIL_TAKEN`, as planned |
| Passport | Removed (`@nestjs/passport`, `passport`, `passport-jwt`); tokens are verified directly. `@types/express` added as a dev dependency, which Passport had provided transitively. |
| Sign-up response | 201 with a session; the web app then opens onboarding |
| Timestamps | Found while building: Prisma sends `created_at` and `updated_at` itself for `@default(now())`, which the column grants reject. All timestamp defaults are now `@default(dbgenerated("transaction_timestamp()"))` (the same function as `now()`; Prisma reads `now()` back as `now()` and would drift). PostgreSQL fills them; the API can never write one. |

### Phase 4: Organizations, members, join requests, projects, task creation

| Topic | Decision |
| --- | --- |
| Requester details | Owners and admins see a requester's id, display name, and email. Mechanism: one more `users` policy for `app_user` (`join_requester_read`): a user row is visible when that user has a join request in the current org and the caller is an active owner or admin there. Verified on a scratch database before the migration was written. |
| Email visibility | `User.email` for the user and for owners and admins; `null` for everyone else, including in the members list |
| Members list | Every status, by display name then user id; 50 per page, 100 at most |
| `addMember` | Unknown email is `NOT_FOUND`; an active member is `ALREADY_MEMBER`; a deactivated member is reactivated with the chosen role; a pending request from that user is marked approved and the event records its id |
| Admins | May grant `admin`, `member`, or `contributor`. Nobody grants `owner` by approval or add (`FORBIDDEN`). |
| Task type | Core fields now (`id`, `number`, `identifier`, `title`, `description`, `priority`, `dueDate`, `status`, `assignee`, `labels`, `isClosed`, `closedAt`, `createdAt`); Phase 6 adds the rest |
| `createTask` | Every role. Archived project `PROJECT_ARCHIVED`, foreign status `STATUS_NOT_IN_PROJECT`, archived status `STATUS_ARCHIVED`, inactive assignee `ASSIGNEE_INACTIVE`, non-member `ASSIGNEE_NOT_MEMBER`, archived label `LABEL_ARCHIVED`, unknown label `NOT_FOUND`, more than 20 labels or a bad or missing due date `VALIDATION_FAILED` |
| Event payloads | `task.created {number, title, status_id, priority, assignee_id, due_date, label_ids}`, `member.added {user_id, role, via, request_id?}`, `member.join_request_rejected {user_id, request_id}` |
| Lists | `organization.projects(includeArchived = false)` by name; `organization.joinRequests(status = PENDING)` oldest first, owners and admins only |
| Limits | Org creation 5 per user per day, join requests 10 per user per hour, member lookups 30 per org per hour; in memory |
| Return types | `createOrganization` returns `OrganizationSummary` (id, slug, name): it runs without an organization, so org-scoped fields are not resolvable in that request. `approveJoinRequest` and `addMember` return `Member`. |
| Input errors | Invalid or missing variables (for example an impossible `Date`) are `VALIDATION_FAILED`; ids that are not uuids are `NOT_FOUND` |

### Phase 5: Seed data

| Topic | Decision |
| --- | --- |
| Running TypeScript | Compiled with `tsc` (`tsconfig.seed.json` to `dist-seed`) and run with `node`; no new dependency |
| Re-running | Runs once; a second run prints "Already seeded". Start over with `npm run db:reset` (local only). |
| Atomicity | Found while building: a failed run left users behind, so "Already seeded" could lie. The whole seed is now one transaction. Deferred checks are fired under each organization's own context (`SET CONSTRAINTS ALL IMMEDIATE` at each context switch); at commit they would run under the last context and row-level security would hide the other organizations' rows. |
| History | Every seeded change writes its event, matching what the API records |
| Timestamps | Seeded rows are created "now"; due dates spread about 60 days around today |
| Accounts | `owner@acme.test`, `admin@acme.test`, `member@acme.test`, `contributor@acme.test`, `departed@acme.test`, `owner@globex.test` (added: Globex needs an owner), `both@example.test` (member of both), `newbie@example.test`, `requester@example.test`; password `taskloom-demo-2026` |
| Data mix | Status 30/20/15/10/20/5; about 5% archived; about 15% of open tasks overdue; 0 to 3 labels; even priorities; the departed member only on closed tasks |
| Labels | Acme: bug red, feature blue, infra slate, design purple, docs teal, security orange. Globex: bug, content green, seo amber. |
| Titles | From word lists, for example "Fix flaky login test" |
| Safety | Refuses when `NODE_ENV=production` or the database host is not local |
| Rank keys | Found while seeding: the Phase 1 rank keys grew one character per six top-of-column creates and passed the 128-character limit after about 770 creates in one column. Keys now use fractional indexing with a length-prefixed integer part, and a new task's key is placed before the project's lowest rank, which is below its column's first card and unique in the project. Measured: 20,000 top inserts stay at 4 characters; 3,000 creates interleaved across columns stay at 3. The migration refuses to run while any task exists (existing keys cannot be read by the new functions); local databases are rebuilt with `npm run db:reset`. Rebalance stays Designed, for dense drag-and-drop moves. |

### Phase 6: Read API (Task 2.1)

| Topic | Decision |
| --- | --- |
| Column paging | `boardColumn(projectId, statusId, filter, first, after)`: one column loads more without reloading the others |
| Column counts | From `taskSummary.byStatus` (same filter); the board returns columns and first pages only |
| Archived projects | Their tasks are excluded from `tasks`, `board`, and `taskSummary` unless `filter.includeArchived`; overdue never counts them |
| Orders | `TaskOrder` enum with fixed directions, each index-backed: `CREATED_AT` newest first (default), `DUE_DATE` soonest first, `PRIORITY` urgent first and none last, `RANK` board order with exactly one project (`INVALID_ORDER` otherwise). Cursors carry their order; a cursor from another order is `VALIDATION_FAILED`. |
| Not found | `project`, `projectByKey`, `task`, `taskByIdentifier` return `NOT_FOUND` for missing or hidden rows; non-uuid ids in arguments or filters are `NOT_FOUND` |
| Identifiers | Any letter case, trimmed; malformed is `NOT_FOUND` |
| Task fields added | `project`, `createdBy`, `updatedAt`, `archivedAt`; comments and the timeline stay Designed |
| Labels | `labels(includeArchived = false)`, a plain list by name |
| Plan tests (T24) | 5,000 tasks across two projects (with one project an org-wide index covers the same rows), inserted one statement at a time, then `ANALYZE`; `EXPLAIN` as `app_user` on the exact SQL the repository builds |
| Summary assignees | Anyone with a matching task, including deactivated members, plus one unassigned entry |
| Statement ceiling | Counts data statements (resolvers, through `DbContext`), not the 4 fixed lifecycle statements. Board plus summary uses 8 (the summary's assignees resolve in a later tick than the board's, so users batch twice), the same for any project size. The count is logged per request (`statements`). |
| Measured locally | Seeded ENG (2,500 tasks), compiled API through PgBouncer: board plus summary 20 ms p50, 22 ms p90, 67 KB; each `tasks` order about 5 ms |

### Phase 7: Web foundation

| Topic | Decision |
| --- | --- |
| Palette | Material teal primary (`#00796B` light, `#4DB6AC` dark) and a deep orange accent for sparse highlights only (`#C43E0F` light, darkened from deep orange 700 to pass 4.5:1; `#FF8A65` dark), blue-grey neutrals. Priority (red, amber, blue, grey) and status colors never reuse the accent, and each chip also has an icon and a name. |
| Font | Inter Variable through `@fontsource-variable/inter`: bundled, no external request, `font-display: swap` |
| Color mode | Follows the system by default; light, system, or dark from the account menu. Stored per browser (`tl-color-mode`), synced across tabs; not an account setting. |
| Tokens | `design-system/tokens.ts`: palette, priority and label colors, 4 px spacing unit, radius, type scale, z-index, motion (reduced motion honored globally), breakpoints |
| Components | Button (tones, loading, in-app link), TextField (error and hint wired to `aria-describedby`), Dialog, Card, PageHeader, EmptyState, ErrorState, skeletons, UserChip, PriorityChip, StatusChip, DateBadge (from the date string, never through local time), LabelChip, ColorModeSelect |
| Accessibility | Every story checked with axe (WCAG 2.1 AA) in both themes: 31 stories, 62 checks, no violations. Storybook's a11y addon is set to `error`. |
| Access token | In module memory only (`features/auth/session.ts`); the refresh token stays in the API's HttpOnly cookie |
| Refresh | Once on load, and once on a 401 followed by one retry of the operation. Concurrent callers in a tab share one request; tabs take turns through a Web Lock (`tl-refresh`), each using the cookie the previous tab rotated. Without Web Locks the refresh runs directly. |
| Sign out | Revokes the session and clears it locally even if the request fails; other tabs sign out too (`BroadcastChannel`). After a deliberate sign out the sign-in page does not keep `?next`, since the next person may be someone else. |
| API access | Same origin: the Vite dev server (and `vite preview`) proxies `/auth` and `/graphql` to `API_PORT`, forwarding `Origin` unchanged for the API's check. The unused `VITE_API_URL` was removed; the web app has no environment variables. |
| Org header | Org-scoped operations pass `context: { orgId }` (from the `/o/:orgSlug` route's membership); one link adds the bearer token and `X-Org-Id`. Nothing holds a global "current org". |
| Landing | `/`: onboarding without memberships, otherwise the last organization used in this browser (`tl-last-org`), else the first. A slug the viewer is not a member of shows "Organization not found" whether or not it exists. |
| Cache | Cleared whenever the signed-in user changes |
| Errors | An error boundary on every route; the shell stays usable when a screen crashes |
| Placeholders | Onboarding, dashboard, and members are placeholders until Phase 8 |
| E2E | `npm run e2e`: the web app against an in-memory fake of `/auth` and `/graphql` that enforces strict rotation (5 tests, including three tabs loading at once). `npm run e2e:stack`: one smoke test against the real stack. CI runs both in the `e2e` job, the stack test on the compose database. |
| Bundle | One 918 kB chunk (287 kB gzipped), nearly all libraries (MUI, react-dom, Apollo, Zod, React Router). Route splitting brings little while every route uses MUI; the board and charts in Phase 9 load lazily, and Phase 10 sets a budget. |

### Phase 8: Onboarding, dashboard, members

| Topic | Decision |
| --- | --- |
| Onboarding | Create (name, slug, timezone) and join (by slug) side by side, then "Your requests" with status and cancel; an approved request links to its organization. Reachable at any time from the switcher. |
| Slug | Suggested from the name (lowercase, hyphens, at most 6 characters) until the user edits the slug; the contract pattern and reserved words are checked before sending |
| Timezone | Defaults to the browser's zone, in a searchable list. Found while building: browsers report 18 zones by legacy names PostgreSQL rejects (Chrome and Node report India as `Asia/Calcutta`); the list and the default use current names (`Asia/Kolkata`), checked against postgres:18. A server `VALIDATION_FAILED` on create shows on the timezone field. |
| Dashboard | Project cards (key, name, description) link to `/o/:orgSlug/p/:KEY` (the board, Phase 9); 50 per page with Load more. New project for owners, admins, and members (`roleCan`); the key is upper-cased as typed; `PROJECT_KEY_TAKEN` on the key field. |
| Members | Everyone, deactivated included; emails as the API returns them (owners and admins). Owners and admins see pending join requests above the list, approve with a role (admin, member, or contributor; never owner) or reject, and add a member by email. `JOIN_REQUEST_NOT_PENDING` explains that someone else decided. Role changes and removal stay unbuilt. |
| Pending badge | The Members tab shows the pending count for owners and admins (first page of 50; "50+" beyond) |
| Org cache isolation | `organization` takes no arguments (the header picks the org), so the cache stores every org under one key. Org screens remount when the org changes, and `useOrgQuery` reads the network first on mount, then the cache. A component test fails if one org's projects ever show under another (verified by switching the policy to cache-first). |
| After mutations | Create organization refetches the viewer before opening the dashboard; project, approve, reject, and add refetch the affected lists (server order stays authoritative) |
| Archived projects | Hidden (the API default); no toggle |
| E2E | Both plan flows run against the real stack (`e2e-stack/org.stack.spec.ts`); the mocked suite answers the queries the auth flows render. Each stack run signs up 4 accounts; sign up is limited to 5 per hour per IP, and the limiter is in memory. |
