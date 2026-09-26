---
paths:
  - 'api/**'
---

# Data Layer And Migrations (prisma)

Guide data persistence and migration safety in this monorepo.

Use this rule during the Plan, Build, Review, Test, and Ship stages.

This project uses an Object-Relational Mapping (ORM) layer to handle persistence. Before changing persistence, identify data model impact, query ownership, migration risk, deployment order, rollback/remediation path, and tests.

## AI Responsibilities

- Identify data model impact before editing.
- Separate schema changes from application logic where the stack supports it.
- Name destructive operations.
- Include rollback notes for migrations.
- Validate data access paths and failure modes.

## AI Must Avoid

- Dropping, renaming, or transforming data without explicit approval.
- Editing applied migrations.
- Hiding migration risk inside implementation details.
- Bypassing repositories or transaction boundaries when conventions exist.
- Persisting sensitive values without encryption, hashing, or masking requirements.
- Changing persistence behavior without tests or manual checks.

## Stack-Specific Guidance

Follow the existing ORM, query builder, or migration tool. Prefer reversible migrations unless a one-way operation is explicitly accepted.

### Repository Pattern

See `api-architecture.md`. Repositories use the request transaction from CLS, never the root client.

### Schema & Models

- **Schema Location:** `api/prisma/schema/*.prisma`, one file per domain (500-line rule). Partial indexes use the `partialIndexes` preview feature.
- Use UUIDs for all primary keys unless otherwise specified.
- Timestamps default to `@default(dbgenerated("transaction_timestamp()"))`, never `@default(now())`: Prisma sends `now()` values itself, which the column grants reject, and reads a `now()` database default back as `now()`.
- Use `BigInt` or `Decimal` for financial amounts (never Float).
- Enforce constraints (unique, default values) at the schema level.

### Migration Conventions

- `schema.prisma` owns tables, keys, relations, enums, and partial indexes. Generated migrations are committed unedited.
- Row-level security, policies, grants, roles, triggers, functions, partitioning, checks, and expression indexes are hand-written SQL in `prisma migrate dev --create-only` migrations.
- Monthly partitions of `activity_events` live in schema `history_parts`, which Prisma does not model, so the drift check (T13) ignores them. `app.ensure_activity_partitions(months_ahead)` creates them idempotently.
- Forward-only. Prisma has no down migrations. Every migration names its remediation path instead of a rollback script.
- Expand, migrate, contract for breaking changes. `lock_timeout = '3s'`; indexes on large tables `CONCURRENTLY` in their own migration.
- Never edit an applied migration. Never run `prisma db push` against a shared database.
- `prisma migrate dev --create-only` applies every pending migration before it creates the next one. Write each hand-written migration completely before creating another, or it is recorded as applied while empty.
- Use `npm run migrate:dev -w @taskloom/api` (fresh shadow database) instead of calling `prisma migrate dev` directly, and `npm run db:reset` to rebuild the local databases. Prisma's own reset and shadow cleanup drop only `public`, and the chain also owns `app` and `history_parts`.
- Functions in schema `app` use `CREATE OR REPLACE` so shadow replays stay clean. Errors use SQLSTATE `P0001` with the GraphQL error code as the message.
- Database invariant tests live in `api/test/db/` and run on Testcontainers as `app_runtime` with `SET LOCAL ROLE`.
- Every new tenant table ships in the same migration with forced RLS, the tenant policy, and grants.
- Backfills run per org, in their own transaction, with tenant context set.

### Data Seeding

Use the project's seeding strategy (if provided) to populate lookups and initial admin states for development and testing. Do not rely on ad-hoc SQL inserts during setup.

## Acceptance Criteria

- Data impact is named.
- Migration risk is documented.
- Rollback or remediation path is described.
- Query paths, constraints, indexes, and transactions are reviewed.
- Migration and data-access tests or manual checks are listed.
