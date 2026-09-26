# Multi-Tenant Project Management Platform

Submission for the Compliance Foundry Senior Full-Stack Developer take-home assessment. The platform is a multi-tenant project manager in the style of a simplified Linear or Jira.

## Deliverables

| Brief item                             | Location                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1.1 GraphQL type definitions           | [`api/src/schema.graphql`](api/src/schema.graphql)                                                         |
| 1.1 SQL and ORM definitions            | [`api/prisma/schema.prisma`](api/prisma/schema.prisma), [`api/prisma/migrations/`](api/prisma/migrations/) |
| 1.2 Technical documentation            | [`docs/1.2-data-model.md`](docs/1.2-data-model.md)                                                         |
| 1.3 AI critique output                 | [`docs/1.3-ai-critique.md`](docs/1.3-ai-critique.md)                                                       |
| 1.3 My analysis                        | [`docs/1.3-analysis.md`](docs/1.3-analysis.md)                                                             |
| 2.1 GraphQL schema and resolvers       | [`api/src/schema.graphql`](api/src/schema.graphql), [`api/src/resolvers/`](api/src/resolvers/)             |
| 2.1 Design decisions                   | [`docs/2.1-api-design.md`](docs/2.1-api-design.md)                                                         |
| 2.2 React component                    | [`web/src/TaskBoard/`](web/src/TaskBoard/)                                                                 |
| 2.2 State and architecture decisions   | [`docs/2.2-ui-architecture.md`](docs/2.2-ui-architecture.md)                                               |
| 3.1 RFC                                | [`docs/3.1-rfc-board-performance.md`](docs/3.1-rfc-board-performance.md)                                   |
| AI transcript and prompting commentary | [`docs/ai-transcript/`](docs/ai-transcript/)                                                               |
| Full design detail (appendix)          | [`docs/design-reference.md`](docs/design-reference.md)                                                     |

## Reading Order

1. This README.
2. [1.2 Data model](docs/1.2-data-model.md).
3. [1.3 Analysis](docs/1.3-analysis.md), with the [AI critique](docs/1.3-ai-critique.md) beside it.
4. [2.1 API design](docs/2.1-api-design.md) and [2.2 UI architecture](docs/2.2-ui-architecture.md), then the code.
5. [3.1 RFC](docs/3.1-rfc-board-performance.md).
6. [Design reference](docs/design-reference.md), when a detail is needed.

## What Is Built and What Is Designed

Part 2 of the brief asks for queries, pagination, a summary, authorization, and a board UI. It does not ask for mutations. The line between built and designed follows that.

| Tier     | Contents                                                                                                                                                                                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built    | Schema and migration chain. Four database roles, row-level security policies, triggers, and the tests tagged Built in the design reference. The request lifecycle. The `tasks` query with filters and cursor pagination, `taskSummary`, the board query, overdue, and identifier resolution. The Task Board UI. |
| Designed | GraphQL mutations with their history writes, rank generation and rebalance, the bulk reopen routine, member deactivation, and partition maintenance. Each is specified in the design reference.                                                                                                                 |
| Later    | Project re-key, org soft delete and purge, auto-archive, domain events through an outbox, cross-project move, and the rest of the design reference's Later list. Each has an additive path.                                                                                                                     |

## Assumptions

1. **Contributor instead of viewer.** The brief's viewer role is named contributor, because it creates, edits, and moves tasks. It does not manage projects, statuses, or labels. A read-only role is one added enum value.
2. **Every task has a due date.** `dueDate` is a required `Date`, a `YYYY-MM-DD` string with no time part. Overdue is evaluated in the organization's timezone.
3. **One organization per request.** The client picks an organization from `viewer.memberships` and sends its id with every request. "My tasks across projects" spans the projects of that organization.
4. **One timezone per organization.** Everyone in an organization sees the same overdue count.

## Running It

Requirements: Node.js and Docker.

```bash
npm install
npm run db:up      # PostgreSQL 18 and PgBouncer in Docker
npm run migrate    # applies the Prisma migration chain
npm run seed       # two organizations with sample projects and tasks
npm test           # built-tier tests
npm run dev        # API and web app
```

## Repository Layout

```
/
├── README.md
├── package.json              workspaces: api, web
├── docker-compose.yml        PostgreSQL 18 and PgBouncer
├── docs/
│   ├── 1.2-data-model.md
│   ├── 1.3-ai-critique.md
│   ├── 1.3-analysis.md
│   ├── 2.1-api-design.md
│   ├── 2.2-ui-architecture.md
│   ├── 3.1-rfc-board-performance.md
│   ├── design-reference.md
│   └── ai-transcript/
├── api/
│   ├── prisma/               schema.prisma and migrations
│   ├── src/                  schema.graphql, context, authorization, loaders, resolvers
│   ├── seed/
│   └── test/
└── web/
    └── src/TaskBoard/
```

## Stack

PostgreSQL 18, PgBouncer in transaction mode, Prisma 7, a Node.js GraphQL API, and React with TypeScript.
