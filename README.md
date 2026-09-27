# Multi-Tenant Project Management Platform

Submission for the Compliance Foundry Senior Full-Stack Developer take-home assessment. The platform is a multi-tenant project manager in the style of a simplified Linear or Jira.

**Status:** the design documents and the repository scaffold are complete. The code is being built in the phases of the [implementation plan](docs/implementation-plan.md).

## Deliverables

| Brief item                             | Location                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1.1 GraphQL type definitions           | [`packages/contracts/schema.graphql`](packages/contracts/schema.graphql)                                         |
| 1.1 SQL and ORM definitions            | [`api/prisma/schema/`](api/prisma/schema/), [`api/prisma/migrations/`](api/prisma/migrations/)                   |
| 1.2 Technical documentation            | [`docs/1.2-data-model.md`](docs/1.2-data-model.md)                                                               |
| 1.3 AI critique output                 | [`docs/1.3-ai-critique.md`](docs/1.3-ai-critique.md)                                                             |
| 1.3 My analysis                        | [`docs/1.3-analysis.md`](docs/1.3-analysis.md)                                                                   |
| 2.1 GraphQL schema and resolvers       | [`packages/contracts/schema.graphql`](packages/contracts/schema.graphql), [`api/src/modules/`](api/src/modules/) |
| 2.1 Design decisions                   | [`docs/2.1-api-design.md`](docs/2.1-api-design.md)                                                               |
| 2.2 React component                    | [`web/src/features/task-board/`](web/src/features/task-board/)                                                   |
| 2.2 State and architecture decisions   | [`docs/2.2-ui-architecture.md`](docs/2.2-ui-architecture.md)                                                     |
| 3.1 RFC                                | [`docs/3.1-rfc-board-performance.md`](docs/3.1-rfc-board-performance.md)                                         |
| AI transcript and prompting commentary | [`docs/ai-transcript/`](docs/ai-transcript/)                                                                     |
| Full design detail (appendix)          | [`docs/design-reference.md`](docs/design-reference.md)                                                           |
| Implementation plan                    | [`docs/implementation-plan.md`](docs/implementation-plan.md)                                                     |

## Reading Order

1. This README.
2. [1.2 Data model](docs/1.2-data-model.md).
3. [1.3 Analysis](docs/1.3-analysis.md), with the [AI critique](docs/1.3-ai-critique.md) beside it.
4. [2.1 API design](docs/2.1-api-design.md) and [2.2 UI architecture](docs/2.2-ui-architecture.md), then the code.
5. [3.1 RFC](docs/3.1-rfc-board-performance.md).
6. [Design reference](docs/design-reference.md), when a detail is needed.
7. [Implementation plan](docs/implementation-plan.md), for how the build is sequenced and verified.

## What Is Built and What Is Designed

Part 2 of the brief asks for queries, pagination, a summary, authorization, and a board UI. It does not ask for mutations. The line between built and designed follows that, with one addition: a working product needs accounts and a way into an organization, so sign up, organization creation, join requests, project creation, and task creation are built.

| Tier     | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built    | Schema and migration chain. The API database roles, the runtime login role, row-level security policies, triggers, and the tests tagged Built in the design reference. The request lifecycle. Email and password accounts with rotating refresh tokens. Creating an organization, joining one by request with owner or admin approval, adding an existing user by email, creating a project, and creating a task. The `tasks` query with filters and cursor pagination, `taskSummary`, the board query, overdue, and identifier resolution. The onboarding, dashboard, members, and Task Board screens. |
| Designed | Task edits, moves, and archive, and status, label, and comment mutations, with their history writes. Rank generation for moves and rebalance, the bulk reopen routine, member role changes and deactivation, and partition maintenance. Each is specified in the design reference.                                                                                                                                                                                                                                                                                                                      |
| Later    | Project re-key, org soft delete and purge, auto-archive, domain events through an outbox, cross-project move, email verification and password reset, an external identity provider, and the rest of the design reference's Later list. Each has an additive path.                                                                                                                                                                                                                                                                                                                                       |

## Assumptions

1. **Contributor instead of viewer.** The brief's viewer role is named contributor, because it creates, edits, and moves tasks. It does not manage projects, statuses, or labels. A read-only role is one added enum value.
2. **Every task has a due date.** `dueDate` is a required `Date`, a `YYYY-MM-DD` string with no time part. Overdue is evaluated in the organization's timezone.
3. **One organization per request.** The client picks an organization from `viewer.memberships` and sends its id with every request. "My tasks across projects" spans the projects of that organization.
4. **One timezone per organization.** Everyone in an organization sees the same overdue count.
5. **Email and password accounts.** The brief names no identity provider. Accounts use email and password, and `users.auth_subject` stays reserved for a provider later.
6. **Joining by request.** A user asks to join an organization by its slug, and an owner or admin approves with any role except owner. A requester learns that a slug exists. That is accepted and rate-limited. Owners and admins can also add an existing user by exact email.
7. **Demo data comes from the seed.** A new organization can create tasks, and the seed still provides demo organizations, accounts for every role, and a 2,500-task project.

## Running It

Requirements: Node.js 24 and Docker.

```bash
npm install
cp .env.example .env
npm run db:up      # PostgreSQL 18 and PgBouncer in Docker
npm run migrate    # applies the Prisma migration chain
npm run seed       # demo organizations, accounts, and tasks
npm test           # built-tier tests (integration tests start PostgreSQL through Testcontainers)
npm run e2e        # Playwright: the web app against a mocked API
npm run dev        # API on :4000, web app on :5173
npm run e2e:stack  # Playwright smoke test on the real stack (needs db:up and migrate)
```

The web app talks only to its own origin: the Vite dev server proxies `/auth` and `/graphql` to the API on `API_PORT`. `npm run e2e:stack` signs up a new `e2e-…@example.test` account on each run.

`npm run db:reset` re-creates the local databases and reapplies the migrations. It is for local Docker development only.

### Demo accounts

After `npm run seed`, every account below uses the password `taskloom-demo-2026` (local test values). Details: [`api/seed/README.md`](api/seed/README.md).

| Email                                                                             | Shows                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------- |
| `owner@acme.test`, `admin@acme.test`, `member@acme.test`, `contributor@acme.test` | Each role in Acme, which has a 2,500-task project |
| `owner@globex.test`                                                               | Globex owner with a pending join request          |
| `both@example.test`                                                               | The organization switcher (member of both)        |
| `newbie@example.test`                                                             | Onboarding (no organization)                      |
| `requester@example.test`                                                          | A pending join request                            |
| `departed@acme.test`                                                              | A deactivated member                              |

`npm run storybook -w @taskloom/web` opens the design system.

## Repository Layout

```
/
├── README.md
├── CLAUDE.md                 agent instructions; .claude/rules/ holds path-scoped rules
├── package.json              npm workspaces: packages/contracts, api, web
├── docker-compose.yml        PostgreSQL 18 and PgBouncer
├── codegen.ts                GraphQL Code Generator for contracts, api, and web
├── docs/
│   ├── 1.2-data-model.md
│   ├── 1.3-ai-critique.md
│   ├── 1.3-analysis.md
│   ├── 2.1-api-design.md
│   ├── 2.2-ui-architecture.md
│   ├── 3.1-rfc-board-performance.md
│   ├── design-reference.md
│   ├── implementation-plan.md
│   └── ai-transcript/
├── packages/contracts/       schema.graphql and TypeScript shared by api and web
├── api/
│   ├── prisma/               schema/ (one file per domain) and migrations
│   ├── src/modules/          NestJS modules: identity, org, project, task, board
│   ├── seed/
│   └── test/                 integration tests on Testcontainers
└── web/
    ├── src/design-system/    MUI theme, tokens, wrapper components
    ├── src/features/         auth, onboarding, org, members, task-board
    ├── .storybook/
    ├── e2e/                  Playwright against a mocked API
    └── e2e-stack/            one Playwright smoke test against the real stack
```

## Stack

PostgreSQL 18 and PgBouncer in transaction mode. A NestJS 12 API with Apollo Server 5 (schema-first) and Prisma 7. React 19 with Vite, MUI, Apollo Client, and MUI X Charts. Vitest and Testcontainers for tests, Storybook for the design system, and Playwright for end-to-end flows. Node.js 24 and TypeScript 6.

The API is one deployable modular monolith, not a set of services. Composite tenant keys, one read snapshot per request, and row-level security all depend on a single database and a single transaction.
