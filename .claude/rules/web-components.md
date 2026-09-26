---
paths:
  - 'web/**'
---

# Components

Guide component creation and modification in this monorepo.

Use this rule during the Build and Review stages.

## AI Responsibilities

- Reuse existing component patterns before creating new ones.
- Keep component APIs explicit and small.
- Separate presentation, state, and side effects when the existing stack supports it.
- Include loading, empty, error, disabled, and focused states when relevant.

## AI Must Avoid

- Building generic component libraries for a single screen.
- Hiding data fetching inside reusable presentation components unless that is the existing convention.
- Styling states that are inaccessible by keyboard or screen reader.

## Stack-Specific Guidance

For typed frontend stacks, keep prop types close to component usage and avoid overly broad `any`-style contracts.

### Composition

- Prefer **small, focused components** over large "god" components.
- Push conditional rendering and side effects **down** when it improves readability.
- Reuse existing primitives before creating new ones.
- Keep route/page orchestration separate from reusable component internals.

- Prefer function components; colocate small presentational pieces next to features.
- Extract reusable logic into custom hooks (`useThing`) in `src/hooks/` or feature folders.

### Props & API surface

- Prefer explicit prop types (TypeScript) and discriminated unions for variant props.
- Avoid anonymous inline objects as props in hot paths; stabilize with `useMemo` when needed.

### Lists & keys

- Stable `key` values for lists; never use array index when order can change.

### Side effects

- Keep data fetching in **dedicated hooks/composables/effects**, not scattered in leaf components unless trivial.
- Keep derived UI state close to the component until it is shared or persisted.
- Model loading, empty, error, disabled, and success states explicitly for interactive components.

### Performance guardrails

- Use `React.memo` / `useCallback` / `useMemo` **only** when profiling shows benefit.

### Accessibility contract

- Interactive components expose accessible names.
- Keyboard behavior matches the visual affordance.
- Focus is visible and returns to the right place after modal/popover flows.

## Acceptance Criteria

- Component purpose is clear.
- Props and states are handled deliberately.
- Accessibility states are accounted for.
- Tests or manual checks cover important variants.
