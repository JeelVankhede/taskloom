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

- **Schema Location:** `prisma/schema.prisma`
- Use UUIDs for all primary keys unless otherwise specified.
- Use `BigInt` or `Decimal` for financial amounts (never Float).
- Enforce constraints (unique, default values) at the schema level.

### Migration Conventions

- `schema.prisma` owns tables, keys, relations, enums, and partial indexes. Generated migrations are committed unedited.
- Row-level security, policies, grants, roles, triggers, functions, partitioning, checks, and expression indexes are hand-written SQL in `prisma migrate dev --create-only` migrations.
- Monthly partitions of `activity_events` live in schema `history_parts`, which Prisma does not model, so the drift check (T13) ignores them. `app.ensure_activity_partitions(months_ahead)` creates them idempotently.
- Forward-only. Prisma has no down migrations. Every migration names its remediation path instead of a rollback script.
- Expand, migrate, contract for breaking changes. `lock_timeout = '3s'`; indexes on large tables `CONCURRENTLY` in their own migration.
- Never edit an applied migration. Never run `prisma db push` against a shared database.
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
