---
paths:
  - "web/**"
---

# Frontend Security

Guide secure coding practices for this monorepo, covering XSS prevention, auth token handling, and safe third-party integration.

Use this rule during the Plan, Build, and Review stages.

## AI Responsibilities

- Never store auth tokens in `localStorage` unless the existing codebase already does and a migration is out of scope.
- Sanitize or escape all user-controlled content before rendering it as HTML.
- Avoid `dangerouslySetInnerHTML` (React) or `v-html` (Vue) unless the content is pre-sanitized by a trusted server-side process.
- Keep sensitive values in environment variables; never hardcode API keys, secrets, or tokens.
- Apply Content Security Policy headers when the framework supports it via config.

## AI Must Avoid

- Logging auth tokens, session IDs, or sensitive form values anywhere.
- Trusting `window.location`, query params, or hash values as authoritative without validation.
- Including third-party scripts without a subresource integrity (SRI) hash or CSP restriction.

## Stack-Specific Guidance

For SPAs, prefer `HttpOnly` cookies over `localStorage` for auth tokens. For server-rendered frameworks (Next.js, Nuxt, Remix), use the server-side session mechanism rather than client-side token storage.

### XSS

- Avoid `dangerouslySetInnerHTML`; if required, sanitize with a vetted library and narrow scope.

### Auth tokens

- The access token lives in memory only (an auth module, not React state scattered across components).
- The refresh token is an `HttpOnly` cookie set by the API. The client never reads it. On load or on a 401, call `/auth/refresh` once, then retry.
- Never store tokens in `localStorage` or `sessionStorage`.

### Dependencies

- Run `npm audit` / tooling regularly; justify new dependencies (bundle + maintenance cost).

### CSP

- Prefer strict **Content-Security-Policy** compatible with your framework dev tooling.

### Third-party scripts

- Load analytics with async/defer; use SRI for CDN assets when applicable.

## Acceptance Criteria

- No auth tokens stored in `localStorage` or `sessionStorage` without documented risk acceptance.
- No unescaped user-controlled content rendered as HTML.
- No hardcoded secrets in source files or client-side bundles.
