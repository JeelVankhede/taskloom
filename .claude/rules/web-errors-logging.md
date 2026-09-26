---
paths:
  - 'web/**'
---

# Errors And Logging

Guide frontend error handling, error boundaries, and observability in this monorepo.

Use this rule during the Plan, Build, Review, and Test stages.

## AI Responsibilities

- Wrap risky UI sections in error boundaries where the framework supports them.
- Show user-visible error states for all data-fetching failures — never silently swallow errors.
- Log unexpected errors with enough context to reproduce (user action, component, error message).
- Distinguish recoverable errors (show retry) from fatal errors (show fallback page).

## AI Must Avoid

- Catching and discarding errors without logging or user feedback.
- Logging sensitive user data (PII, tokens, form values).
- Using `console.error` as the only error signal when a monitoring library is available.

## Stack-Specific Guidance

For React, use `ErrorBoundary` components at route and widget boundaries. For Vue, use `onErrorCaptured`. For async operations, always handle the rejection path explicitly — do not rely on unhandled promise rejection handlers as the primary signal.

### User-facing errors

- Use error boundaries for route-level or feature-level failures; never swallow errors silently.

### Logging

- Log structured context (route, user id if safe, correlation id) — **never** secrets, tokens, or PII.

### Monitoring

### Source maps

- Upload source maps to your error tracker in production builds when privacy policy allows.

## Acceptance Criteria

- All data-fetching error paths have a visible UI state.
- Unexpected errors are captured by a monitoring library or logged with context.
- Error boundaries prevent a single component failure from crashing the full page.
