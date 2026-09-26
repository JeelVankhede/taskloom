---
paths:
  - 'web/**'
---

# Routing

Guide routing, navigation, and layout decisions in this monorepo.

Use this rule during the Think, Plan, Build, and Review stages.

## AI Responsibilities

- Identify the correct route file before proposing new pages or layouts.
- Keep route and layout boundaries consistent with existing patterns.
- Name user-facing URL impact for any route change.
- Preserve navigation guards and auth checks when moving or adding routes.

## AI Must Avoid

- Adding routes without naming the URL and expected layout.
- Changing the router library or route configuration format without explicit approval.
- Creating nested routes that conflict with existing layout nesting.

## Stack-Specific Guidance

For file-system routers (Next.js app dir, Remix, SvelteKit), name the file path that maps to the route. For config-based routers (React Router, Vue Router), name the route object and its parent.

- Keep route config centralized; lazy-load heavy screens.

### Error & empty states

- Every route should have a purposeful **404/empty** experience and a **route-level error** boundary where the framework supports it.

### Focus management

- Move focus logically on route changes for accessibility (especially modals and wizards).

## Acceptance Criteria

- New routes name their URL, parent layout, and auth requirements.
- Existing navigation guards are preserved or explicitly updated.
- No orphaned route files without a corresponding entry in the router config.
