# Taskloom

Multi-tenant project management platform (a simplified Linear or Jira), built as a take-home submission. The documents in `docs/` are the source of truth. Code follows them; when code must differ, update the doc in the same change and say so.

## Source of truth

| Topic                                                                                  | Document                            |
| -------------------------------------------------------------------------------------- | ----------------------------------- |
| Data model, tenancy, indexes, migrations                                               | `docs/1.2-data-model.md`            |
| Roles, invariants, tests (T1 to T28), mutation behavior, GraphQL contract, error codes | `docs/design-reference.md`          |
| Review decisions                                                                       | `docs/1.3-analysis.md`              |
| API design                                                                             | `docs/2.1-api-design.md`            |
| UI architecture                                                                        | `docs/2.2-ui-architecture.md`       |
| Board performance                                                                      | `docs/3.1-rfc-board-performance.md` |

Delivery tiers are Built, Designed, and Later (README). Build only the Built tier. Do not implement Designed or Later items unless asked.

## Monorepo

npm workspaces, Node 24 LTS.

| Path                  | Contents                                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/`                | NestJS 12 (ESM), Apollo driver (schema-first), Prisma 7, PostgreSQL 18, Vitest with SWC, Testcontainers                                                              |
| `web/`                | React, Vite, TypeScript, MUI, Apollo Client, React Hook Form, MUI X Charts, Vitest, Storybook, Playwright                                                            |
| `packages/contracts/` | `schema.graphql`, generated GraphQL types, and shared TypeScript: enums, interfaces, error codes, validation rules. Imported as `@taskloom/contracts` by both sides. |
| `docs/`               | Submission documents                                                                                                                                                 |
| `docker-compose.yml`  | PostgreSQL 18 and PgBouncer (transaction mode)                                                                                                                       |

Scoped rules load automatically: `.claude/rules/api-*.md` for `api/**`, `.claude/rules/web-*.md` for `web/**`. `git-conventions.md` and `pre-commit.md` apply everywhere.

## Global rules

1. **No file over 500 lines.** Enforced by ESLint `max-lines`. Generated code and SQL migrations are exempt. Split by responsibility, not arbitrarily.
2. **Modular monolith.** One deployable API. Modules have hard boundaries and talk through exported services. No microservices.
3. **Clean code, OOP where useful.** NestJS classes for resolvers, services, and repositories. Pure functions where state adds nothing (`authorize`, filter builders, cursor codecs). No speculative abstraction layers.
4. **One request, one transaction.** Every GraphQL request runs in one transaction with `SET LOCAL ROLE` and transaction-local tenant context. No external I/O inside it. Explicit `timeout` and `maxWait`.
5. **Tenant safety first.** Never bypass row-level security, never query with the root client, never use `$queryRawUnsafe` or `$executeRawUnsafe`.
6. **Shared types live in `packages/contracts`.** Never redeclare an API type in `web` or `api`.
7. **Report before deviating.** If a rule, a doc, and a good practice disagree, stop and ask before choosing.
8. **Evidence over claims.** Never say a test, migration, or check passed without running it.

## Commands (root)

```bash
npm install
npm run db:up      # PostgreSQL 18 and PgBouncer in Docker
npm run migrate    # Prisma migration chain
npm run seed       # two organizations with sample data
npm run codegen    # GraphQL types for api, web, and contracts
npm test           # all workspaces
npm run dev        # API and web
```

## Git

Work on a branch from `main`. Conventional Commits. Pull requests follow `~/.claude/PULL_REQUEST_TEMPLATE.md`.
