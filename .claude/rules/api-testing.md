---
paths:
  - 'api/**'
---

# Backend Testing

Guide validation choices for this monorepo.

Use this rule during the Review and Test stages.

This project uses **Vitest** for testing. NestJS 12 is ESM-only, so the API is ESM and Vitest runs it through `unplugin-swc`, which emits the decorator metadata Nest DI needs. Choose validation proportional to risk and cover success, validation failure, auth failure, and integration failure paths where relevant.

## AI Responsibilities

- Choose validation proportional to risk.
- Cover success, validation failure, auth failure, and integration failure paths where relevant.
- Include migration and contract checks for schema/API changes.
- Plan tests before implementation for non-trivial backend changes.
- Use targeted checks for narrow changes, then broaden when public APIs, data, auth, integrations, async behavior, or generated output changes.
- Include manual QA when automation does not cover migrations, provider behavior, deployment order, or adapter output.
- State untested areas clearly.

## AI Must Avoid

- Treating unit tests as enough for public contract changes.
- Unit-only validation for public contract, migration, auth, or integration changes.
- Skipping failure-path tests for integrations.
- Skipping validation failure, auth denial, not-found, provider failure, retry, and duplicate-delivery paths when relevant.
- Tests that assert implementation details instead of observable behavior.
- Claiming smoke or adapter/generated-output checks passed without running or inspecting them.

## Stack-Specific Guidance

Use the existing test framework and fixture style. Prefer focused integration tests for endpoint and persistence behavior.

- Run tests: `npm run test`
- Watch tests: `npm run test --watch`
- Test coverage: `npm run test --coverage`

### Unit Tests

- Co-locate unit tests with the code they are testing (e.g. `user.service.spec.ts` next to `user.service.ts`).
- Use `Test.createTestingModule` from `@nestjs/testing` for isolated modules.
- Mock repositories and external services with custom providers or `vi.fn()`. Import `describe`, `it`, `expect`, and `vi` from `vitest` explicitly.

### Integration And E2E Tests

- Place integration and E2E tests in `api/test/`.
- Use Testcontainers with PostgreSQL 18. Apply the full migration chain to an empty database.
- Database invariant tests (T1 to T28 in the design reference) run as `app_user`, never as the owner or a superuser, because a superuser bypasses row-level security.
- Only Built-tier tests are implemented. Test ids match the design reference.
- A statement-count test fails if the board query exceeds its SQL ceiling.

### Mocking Conventions

- Only mock external boundaries (databases, third-party APIs, queues).
- Do not over-mock internal business logic if testing it all together is fast and deterministic.

### JSDoc and Documentation

- Clearly comment complex test setups.
- Use the `Arrange, Act, Assert` pattern in every test block.

## Acceptance Criteria

- Relevant automated or manual checks are listed.
- Contract and migration risks have validation.
- Failure paths are covered where material.
- Untested areas are explicit.
- Build, unit/integration/E2E, migration, smoke, and manual checks are recorded when relevant.
