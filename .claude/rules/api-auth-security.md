---
paths:
  - 'api/**'
---

# Auth And Security

Guide authentication, authorization, validation, and sensitive-data handling.

Use this rule during the Think, Plan, Build, Review, and Test stages.

Before changing auth or sensitive-data behavior, identify caller permissions, resource ownership, input validation patterns, sensitive-data flow, and the allowed/denied test cases.

## AI Responsibilities

- Identify who can call the changed behavior.
- Check authentication and authorization separately — authentication answers "who is this" and authorization answers "are they allowed to touch this specific resource."
- Validate untrusted input.
- Avoid logging secrets or sensitive payloads.
- Consider abuse cases and privilege boundaries.
- Enforce both the caller's permission and resource ownership (are they allowed to touch this specific record ID?).

## AI Must Avoid

- Assuming authentication implies authorization.
- Returning sensitive data by default.
- Adding bypasses for convenience.
- Changing security-sensitive behavior without tests or explicit review.
- Logging PII, passwords, tokens, raw credentials, or sensitive financial details.

## Stack-Specific Guidance

Use existing guards and the pure `authorize(role, capability)` function rather than inventing parallel authorization logic.

- Passwords are hashed with argon2id. Only `app_identity` can read the hash column.
- Access token: short-lived JWT (15 minutes), sent as a bearer header. Refresh token: rotating, stored hashed, sent only as an `HttpOnly`, `Secure`, `SameSite=Strict` cookie scoped to `/auth`.
- Extract the user id from the verified token `sub`, never from request bodies or GraphQL args.
- The selected org id comes from a request header. The request lifecycle reads the caller's own membership once; no membership means `NOT_FOUND`.
- Role-changing and membership-approving code paths need tests for every role transition (a bug that writes `role = owner` is an org takeover).
- Member lookup and join requests never reveal whether an account or org exists beyond what the design reference allows.

## Acceptance Criteria

- Authn/authz impact is named, checked separately.
- Input validation is defined.
- Sensitive data handling is checked.
- Allowed and denied cases are tested or manually checked.
