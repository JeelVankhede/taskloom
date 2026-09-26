---
paths:
  - "web/**"
---

# Forms And Validation

Guide form construction, input handling, and client-side validation in this monorepo.

Use this rule during the Plan, Build, Review, and Test stages.

## AI Responsibilities

- Use the existing form and validation library; do not introduce a second one.
- Keep validation schemas close to the form component that uses them.
- Show field-level and form-level errors consistently with existing patterns.
- Handle submit loading, success, and error states explicitly.

## AI Must Avoid

- Duplicating validation logic between client and a separate schema file without a clear shared contract.
- Submitting forms without disabling the submit button during in-flight requests.
- Using uncontrolled inputs where controlled inputs are the project convention, or vice versa.

## Stack-Specific Guidance

For schema-validated forms, define the schema first, derive types from it, and pass it to the form library's resolver. Keep schema files colocated with the form they validate unless the schema is shared.

- Use `useForm` + `Controller` for complex inputs, with `zodResolver`.
- Field rules the API also enforces (email, password strength, org slug format) come from `@taskloom/contracts` so client and server agree.

### UX rules

- Validate on **submit** for long forms; on **blur** for critical fields when it helps users.
- Associate `<label>` with inputs; surface errors in text + `aria-describedby`.

### Accessibility

- Announce async form errors with `role="alert"` or live regions when needed.

## Acceptance Criteria

- Every form field has a label, error message slot, and accessible description when needed.
- Submission triggers loading state, then success or error feedback.
- Validation schema covers required fields, format rules, and cross-field dependencies.
