---
paths:
  - 'api/**'
---

# Errors, Logging, And Observability

Guide backend error handling, logging, and operational visibility.

Use this rule during the Build, Review, Test, and Ship stages.

Before changing error handling, logging, or observability behavior, identify public error shape, log fields, retryable vs. non-retryable failures, and failure-path tests.

## AI Responsibilities

- Return consistent errors to callers.
- Log useful operational context without secrets.
- Preserve traceability across request, integration, and job boundaries.
- Identify retryable and non-retryable failures.

## AI Must Avoid

- Swallowing errors without visibility or remediation path.
- Logging sensitive tokens or full credentials.
- Returning internal implementation details, stack traces, SQL errors, provider internals, or config values to public clients.
- Adding noisy logs without operational value.

## Stack-Specific Guidance

### Error Handling

- GraphQL errors carry `extensions.code` from the catalog in `docs/design-reference-api.md` section 7.5. Throw domain errors; one GraphQL error formatter maps them.
- A row hidden by row-level security surfaces as `NOT_FOUND`, never `FORBIDDEN`.
- `/auth/*` REST routes use NestJS `HttpException` classes and the global `ExceptionFilter`.
- Never leak stack traces, SQL errors, or config values to clients. Unexpected errors are masked as `INTERNAL_SERVER_ERROR` and logged in full server-side, never swallowed.

### Logging & Observability

- Use structured JSON logging for all production logs.
- Include a `correlation_id` (Trace ID) in all logs associated with a request lifecycle.
- **Never** log PII (Personally Identifiable Information), passwords, tokens, or financial specifics.

## Acceptance Criteria

- Error shape is consistent.
- Logs include useful context and exclude secrets.
- Failure modes are testable or manually checkable.
- Observability changes preserve request correlation.
- Known limitations are documented for release.
