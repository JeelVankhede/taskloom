---
paths:
  - "web/**"
---

# Environment And Configuration

Guide environment variable usage, runtime configuration, and build-time config management in this monorepo.

Use this rule during the Plan, Build, and Review stages.

## AI Responsibilities

- Use the correct environment variable prefix for the build tool (`VITE_`, `NEXT_PUBLIC_`, etc.) for client-exposed values.
- Never reference `process.env` variables that are not declared in the project's `.env.example` or equivalent.
- Keep secrets (API keys, signing keys) server-side only; never expose them to the client bundle.
- Add new variables to `.env.example` with a placeholder value when introducing them.

## AI Must Avoid

- Hardcoding environment-specific values (API base URLs, feature flag keys) directly in source files.
- Using different variable names across environments (e.g., `API_URL` in dev and `NEXT_PUBLIC_API_URL` in prod).
- Accessing `process.env` at runtime in client-side code when the build tool requires compile-time replacement.

## Stack-Specific Guidance

For Vite: client-exposed vars must be prefixed `VITE_`; use `import.meta.env`. For Next.js: client-exposed vars must be prefixed `NEXT_PUBLIC_`; use `process.env`. For Remix: use `loader`/`action` to pass env vars to the client rather than exposing them in the bundle.

- For Vite-based SPA stacks, use `VITE_*` prefixes for client-exposed values.

### Files

- Commit `.env.example` with dummy values; **never** commit real `.env` files.

### Validation

- Validate env at startup (Zod / framework helpers) to fail fast in CI and production.

### Feature flags

- Evaluate flags at stable boundaries (layout, route guard, provider) — not inside every leaf component.

## Acceptance Criteria

- All new environment variables are documented in `.env.example`.
- Client-exposed variables use the correct build-tool prefix.
- No secrets appear in the client-side bundle.
