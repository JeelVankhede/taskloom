---
paths:
  - "web/**"
---

# Architecture

Guide architecture decisions in this monorepo.

Use this rule during the Think, Plan, Build, and Review stages.

Before changing architecture, identify affected routes/pages, layout boundaries, reusable components, state ownership, data-fetching boundaries, and test coverage. Prefer local changes over broad restructuring.

## AI Responsibilities

- Inspect current architecture before proposing new files.
- Keep route, layout, component, state, and data boundaries explicit.
- Prefer local changes over broad restructuring.
- Identify when a shared abstraction is justified by repeated behavior.

## AI Must Avoid

- Creating new architecture layers for one-off use cases.
- Moving state globally before it is shared or persisted.
- Changing route structure without naming user-facing impact.

## Stack-Specific Guidance

For React-style projects, separate route/page orchestration from reusable components, keep data-loading states close to the consuming view unless shared, and preserve existing framework conventions.

### Directory layout

- Feature-first folders under `web/src/features/<name>/` (`auth`, `onboarding`, `org`, `task-board`, `members`) with `components/`, `hooks/`, and `api/` as needed.
- Design system (MUI theme, tokens, wrapper components) in `web/src/design-system/`. Feature code uses these wrappers, not ad-hoc styling.
- Shared app shell, routing, and providers in `web/src/app/`. Small shared helpers in `web/src/lib/`.
- Types shared with the API come from `@taskloom/contracts`; never redeclare them in `web`.
- Global state: none. Server state lives in Apollo; filters live in the URL.

### Layering

1. **Presentation** — dumb UI, minimal logic, props/slots in, events out.
2. **Application** — hooks/composables/services orchestrating user flows.
3. **Data** — API clients, query hooks, DTO mappers (keep framework-agnostic where possible).

### Decision rules

- Route/page files orchestrate page-level composition; reusable components stay focused on UI behavior.
- Shared abstractions need repeated behavior or a clear ownership boundary, not a single call site.
- Global state is justified only when state is shared across routes/components, persisted, or required by app-level workflows.
- Data-loading, empty, error, and permission states should be named in the plan before implementation.

### Barrel exports

- Use `index.ts` sparingly at **feature boundaries**; avoid mega-barrels that harm tree-shaking.

### Co-location

- Prefer tests and styles next to the component when the team does so consistently.

### Commands

**Build:** `vite build`  
**Dev:** `vite dev`  
**Lint:** `npm run lint`

## Acceptance Criteria

- Architecture changes name affected routes/components.
- State and data ownership are explained.
- Tests or manual checks cover key user flows.
