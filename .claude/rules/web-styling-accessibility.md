---
paths:
  - "web/**"
---

# Styling And Accessibility

Keep frontend UI changes consistent, responsive, and accessible.

Use this rule during the Build, Review, and Test stages.

## AI Responsibilities

- Use the existing styling system.
- Preserve responsive behavior across supported viewports.
- Check keyboard navigation, focus order, labels, roles, and contrast-sensitive states.
- Keep UI text within containers.

## AI Must Avoid

- Introducing a second styling system.
- Using visual-only states for interactive controls.
- Making decorative layout changes unrelated to the task.

## Stack-Specific Guidance

Prefer semantic elements and framework-native accessibility (a11y) patterns before custom ARIA. Use custom ARIA only when native semantics are insufficient.

- Co-locate styles with components; avoid dynamic style objects in hot paths.

### Responsive design

- Design **mobile-first**; define breakpoints in one place (Tailwind config, tokens, or theme).
- Avoid magic numbers in multiple files — centralize spacing and radii.

### Dark mode

- Support `prefers-color-scheme` and/or class-based toggles consistently.
- Verify contrast for text, borders, and focus rings in both themes.

### Z-index & stacking

- Maintain a **small z-index scale** (e.g., dropdown < modal < toast) documented in tokens or CSS variables.

### Motion

- Respect `prefers-reduced-motion` for non-essential animations.

### Accessibility (a11y) baseline

- Meet **WCAG 2.1 AA** for primary user journeys where feasible.
- Prefer **semantic HTML** (`button`, `nav`, `main`, `header`, `section`) over div-only layouts.

### Keyboard

- All interactive controls reachable via **Tab**; visible **focus rings** (do not remove without replacement).
- Modals trap focus and return focus on close.

### ARIA

- Use ARIA only when semantics are insufficient; prefer native elements first.

### Color & motion contracts

- Text contrast **≥ 4.5:1** for body copy; test states (hover, disabled, error).
- Honor `prefers-reduced-motion`.

### Testing accessibility

- Complement automated checks (axe) with **keyboard-only** passes for new flows.

## Acceptance Criteria

- Layout works at expected mobile and desktop sizes.
- Interactive controls have accessible names and visible focus.
- Form labels and error messages are connected.
- Styling follows the selected approach: `emotion`.
- Responsive and dark-mode behavior are checked when affected.
- Primary flows are keyboard reachable.
- Form and async errors are perceivable.
- Labels, roles, focus order, and contrast are checked manually or with tooling.
