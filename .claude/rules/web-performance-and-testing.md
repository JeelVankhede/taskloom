---
paths:
  - 'web/**'
---

# Performance And Testing

Guide frontend validation for performance-sensitive and user-facing changes.

Use this rule during the Review and Test stages.

## AI Responsibilities

- Choose tests proportional to risk.
- Watch for avoidable re-renders, unnecessary client work, oversized dependencies, and blocking data waterfalls.
- Validate key user flows after UI changes.
- State untested areas clearly.

## AI Must Avoid

- Adding dependencies for small utilities without justification.
- Claiming performance improvement without a measurable or reviewable basis.
- Treating snapshot-only tests as sufficient for behavior.

## Stack-Specific Guidance

For frontend changes, combine unit/component tests with route-level or manual checks when behavior crosses component boundaries.

### Performance targets

- Aim for **good** Core Web Vitals (CWV) on primary flows (LCP, INP, CLS).
- Set a **bundle budget** policy (documented) for main entry and largest routes.

### Loading strategy

- Code-split **routes** and heavy components (`dynamic import`, framework equivalents).

### Rendering

- Avoid unnecessary re-renders; measure before memoizing.

### Lists

- Virtualize long lists (table/grid) when item count routinely exceeds ~100 visible rows.

### Fonts

- Use `font-display: swap` or framework defaults; subset fonts when possible.

### Networking

- Debounce search inputs; cancel in-flight requests on unmount or param change when safe.

### Testing commands

**Unit / component:** `npx vitest run`
**E2E:** `npx playwright test`

### Unit & component

- Prefer **Testing Library** queries that reflect user-visible behavior (`getByRole`, `getByLabelText`).
- Use `userEvent` over `fireEvent` when available.
- Co-locate tests as `*.test.ts(x)` / `*.spec.ts` consistent with repo convention.

### Mocking

- Mock network at the boundary (**MSW** or fetch mocks) instead of stubbing every component.

### E2E

- Prefer stable selectors (`getByRole`, `data-testid` only when necessary).
- Run against realistic auth states; reset storage between tests.

### Storybook

- Each complex component should have at least a **default** story + primary variants.

### Coverage

- Cover critical user paths and edge cases; do not chase 100% line coverage blindly.

## Acceptance Criteria

- Relevant tests or manual checks are listed.
- Performance-sensitive changes have a review note.
- Accessibility-sensitive changes have a validation note.
- Untested areas are explicit.
- Critical route performance is not knowingly degraded.
- Image/media and async loading behavior are reviewed.
- Tests match the risk of the changed user flow.
- Build, unit/component, E2E/manual, and accessibility checks are recorded when relevant.
