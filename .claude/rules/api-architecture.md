---
paths:
  - 'api/**'
---

# Backend Architecture And API

Guide backend architecture and API contract decisions in this monorepo.

Use this rule during the Think, Plan, Build, and Review stages.

Before changing backend structure or an endpoint, identify affected routes/controllers, services, repositories, data models, auth boundaries, request/response shape, status codes, validation, error behavior, versioning impact, integrations, jobs, and tests. Prefer local changes over broad restructuring.

## AI Responsibilities

- Inspect current API patterns before adding endpoints.
- Preserve public contracts unless a plan explicitly changes them.
- Define request validation, response shape, status codes, and error cases.
- Identify compatibility and versioning risks.
- Keep transport, business logic, persistence, and external integration concerns separated when the repo already separates them.

## AI Must Avoid

- Silent response shape or status-code changes.
- Mixing transport, business, and persistence logic when the project separates them.
- Adding endpoints without validation and error behavior.
- Creating new architecture layers for one-off work.
- Bypassing dependency injection, config, logging, or error handling conventions.

## Stack-Specific Guidance

This project uses NestJS. All business logic must be encapsulated in Feature Modules.

### NestJS Module Structure

- Features belong in `api/src/modules/<feature-name>/` (identity, org, membership, project, task, board, summary).
- Modules export services; they never import another module's repositories or internals.
- This is a modular monolith. Do not split modules into separately deployed services.

### Dependency Injection (DI)

Use constructor-based injection.

```typescript
constructor(
  private readonly userService: UserService,
  private readonly configService: ConfigService,
) {}
```

### Repository Pattern

All database access goes through `[feature].repository.ts`. Services never touch Prisma directly.

**Project override (request transaction):**

- Repositories never inject the root `PrismaClient`. They read the current request transaction from the request-scoped store (`nestjs-cls`) through `TxHost` / `DbContext`.
- The request transaction has already run `SET LOCAL ROLE` and `set_config('app.user_id'/'app.org_id', ..., true)`. Row-level security depends on it.
- The runtime login role has no table grants. A query outside a request transaction fails loudly by design (critique X7). Never work around it.
- Raw SQL uses tagged `$queryRaw` only. `$queryRawUnsafe` and `$executeRawUnsafe` are banned.

### General App Architecture

- **Resolvers:** Parse GraphQL args, call services, map to GraphQL types. No business logic, no Prisma.
- **Services:** Business logic and authorization (`authorize(role, capability)` is a pure function).
- **Repositories:** Data access through the request transaction.
- **DataLoaders:** Every nested field reachable from a list resolves through a request-scoped loader (`api/src/loaders`).
- REST controllers exist only for `/auth/*` (sign up, sign in, refresh, sign out).

### Request Validation

- The GraphQL schema (`packages/contracts/schema.graphql`, schema-first) validates types and nullability.
- `class-validator` covers what the schema cannot express: email format, password strength, `first <= 100`, string lengths. It is also used for REST auth DTOs.
- Enable `ValidationPipe` globally with `whitelist: true` and `transform: true`.

### Pagination

- Every list that can grow without bound is a Relay-style connection (`edges`, `node`, `pageInfo { hasNextPage, endCursor }`).
- Cursors are opaque base64 of the sort key plus id. Fetch `first + 1` rows to set `hasNextPage`.
- `first` defaults to 50, maximum 100. Every order has a unique tiebreaker and a matching index.
- Offset pagination is not used.

### Rate Limiting & Throttling

- `@nestjs/throttler` on all routes; strict limits on `/auth/*`.
- Member lookup by email: 30 lookups per org per hour (design reference, section 2).
- GraphQL cost and depth limits reject oversized queries with `QUERY_TOO_COMPLEX` (depth 10, cost 10,000 initially).

### CORS & Security Headers

- Ensure CORS is restricted to known origins.
- Use Helmet or equivalent to set strict security headers.

### API Versioning

- GraphQL is not URI-versioned. Evolve additively: add fields, deprecate with `@deprecated`, remove two releases later.
- Breaking changes follow expand, migrate, contract.

### Graceful Shutdown

Always ensure the HTTP server and database connections close gracefully on `SIGTERM` and `SIGINT` signals to avoid dropping requests during deployments.

## Acceptance Criteria

- Affected routes/controllers/services/repositories are named.
- API change names request and response shape.
- Error cases and status codes are defined.
- Compatibility risk is named.
- Tests cover success and failure paths.
