---
paths:
  - "web/**"
---

# State And Data Fetching

Guide frontend state and data fetching choices.

Use this rule during the Think, Plan, Build, Review, and Test stages.

Before adding state, decide whether it is local UI state, shared client state, server state, URL state, or persisted state. Before changing data access, identify the owning API client, cache strategy, loading/error/empty states, and mutation invalidation behavior.

## AI Responsibilities

- Keep state local unless it is shared, persisted, or cross-route.
- Follow existing data fetching conventions.
- Model loading, empty, error, and success states.
- Avoid duplicated request logic.
- Define retry and invalidation behavior when relevant.

## AI Must Avoid

- Adding global state for isolated UI behavior.
- Swallowing request failures.
- Updating cached data without considering invalidation.

## Stack-Specific Guidance

For client-side fetching libraries, prefer existing query keys, cache invalidation patterns, and error display conventions.

### State management

- Prefer **local component state** and framework primitives (Context sparingly).
- Avoid prop drilling more than 2–3 levels — lift state or use composition.


#### SSR / hydration


#### Ownership rules

- Keep state local when only one component subtree needs it.
- Lift state only to the nearest common owner.
- Use URL/search params for shareable navigation or filter state.
- Use server-state tooling for cache, invalidation, and async data; do not duplicate it in client stores.
- Persist state only when the product behavior requires it.

### Data fetching

- Apollo Client with a normalized cache is the only server-state tool. Do not add TanStack Query, Redux, or Zustand.
- Operations are `.graphql` documents typed by GraphQL Code Generator; no hand-written response types, no `any`.
- Auth header and selected org id are attached in one Apollo link.
- The board and the summary use the same filter variables (`useTaskBoard(filters)`), so the two views never disagree.
- Each board column paginates with its own cursor via `fetchMore` and a field policy.
- Filters are URL state (`useTaskFilters`), so a filtered board survives reload and can be shared.

## Acceptance Criteria

- State owner is named.
- Data lifecycle states are handled.
- Failure mode is visible to the user or caller.
- Tests or manual checks cover success and failure paths.
- Data owner, cache key/invalidation, and UI states are named.
- Auth/session behavior is preserved.
