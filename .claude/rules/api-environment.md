---
paths:
  - "api/**"
---

# Environment And Configuration

Guide environment variable usage, runtime configuration, and secrets management in this monorepo.

Use this rule during the Plan, Build, and Review stages.

All configuration values must flow through environment variables (12-Factor App methodology). Never commit `.env` files or hardcode environment-specific values in source.

## AI Responsibilities

- Never hardcode environment-specific values (database URLs, API keys, signing secrets) in source files.
- Add new variables to `.env.example` with a placeholder value when introducing them.
- Keep secrets server-side only; never log, serialize, or return them in API responses.
- Use the project's existing config loading pattern rather than introducing a new one.
- Validate required environment variables at startup and fail fast with a clear message if any are missing.

## AI Must Avoid

- Committing real secrets or credentials to source control.
- Using different variable names across environments for the same value.
- Accessing environment variables deep inside domain logic; prefer injecting config at the application boundary.
- Silently defaulting to insecure fallback values when an env var is missing.

## Stack-Specific Guidance

For 12-Factor apps: treat config as environment — all per-environment values come from env vars, not files committed to the repo. For secrets managers (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault): reference the secret key in config; never pull the value into a `.env` file that might be committed.

### Environment Variables (`.env`)
- Never commit `.env` files to source control.
- Maintain a `.env.example` file with dummy values for all required variables.

### Configuration Management
- Use `@nestjs/config` and the `ConfigService` for all config injection.
- Never use `process.env` directly in application code outside of `app.module.ts`.
- Validate environment variables on startup using `class-validator` or `zod`.

### Feature Flags
- Use feature flags for partially completed features.
- Keep feature flag checks at the controller/router level or service boundary, not deeply nested within repositories.

### Containerization (Docker)
- Use multi-stage builds in Dockerfiles to keep production images tiny.
- Always include a pristine `.dockerignore` file.
- Run the application as a non-root user inside the container for security.

## Acceptance Criteria

- All new environment variables are documented in `.env.example`.
- No secrets appear in committed source files or logs.
- Missing required env vars cause a startup error, not a silent runtime failure.
