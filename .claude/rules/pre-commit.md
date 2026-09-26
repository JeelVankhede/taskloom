# Pre-Commit Quality Gates

Use this rule during the Build, Test, and Ship stages. Run the local checks before committing. Do not rely on CI to catch basic errors.

## AI Responsibilities

- Run the gates for every workspace you changed before proposing a commit.
- Do not bypass hooks (`--no-verify`) unless explicitly instructed and the reason is documented.
- When adding a package or changing config, confirm the gates still pass.

## AI Must Avoid

- Committing files that fail lint, format, or type-check.
- `eslint-disable` or `@ts-expect-error` without a one-line justification. Never `@ts-ignore`.

## The Gates

Hooks run `lint-staged` (ESLint and Prettier on staged files) through Husky.

| Gate | Command |
|---|---|
| Lint and format | `npm run lint` |
| Type-check | `npm run typecheck` (`tsc --noEmit` in every workspace) |
| Code generation is current | `npm run codegen` leaves no diff |
| API tests | `npm run test -w api` |
| Web unit and component tests | `npm run test -w web` |
| Web end-to-end | `npm run e2e -w web` (Playwright) |
| Storybook builds | `npm run build-storybook -w web` |
| Migrations | Schema changes have a migration; `npm run migrate` applies cleanly to an empty database |

`max-lines: 500` is an ESLint error. Generated files (Prisma client, GraphQL codegen output) and SQL migrations are exempt.

## Acceptance Criteria

- Every changed file passes lint, format, and type-check.
- Tests for the changed workspaces pass.
- Hooks were not bypassed without a documented reason.
