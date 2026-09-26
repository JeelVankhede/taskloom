/**
 * Field rules enforced by database checks (api/prisma/migrations/*_constraints) and, from
 * Phase 3 on, by API validation and web forms. Change them together with a migration.
 */
export const ORG_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,4}[a-z0-9])$/;
export const ORG_SLUG_RESERVED = [
  'admin',
  'api',
  'auth',
  'app',
  'o',
  'signin',
  'signup',
  'onboarding',
  'settings',
  'www',
] as const;
export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{2}$/;

/** Inclusive character limits. */
export const LENGTH = {
  orgName: { min: 1, max: 80 },
  projectName: { min: 1, max: 80 },
  projectDescription: { min: 0, max: 2000 },
  taskTitle: { min: 1, max: 200 },
  taskDescription: { min: 0, max: 20000 },
  commentBody: { min: 1, max: 10000 },
  labelName: { min: 1, max: 40 },
  statusName: { min: 1, max: 40 },
  displayName: { min: 1, max: 80 },
  email: { min: 3, max: 254 },
} as const;

/** The design system's label color tokens. */
export const LABEL_COLORS = [
  'slate',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

/** Priority 1 (urgent) to 4 (low); NONE is SQL NULL. */
export const PRIORITY_MIN = 1;
export const PRIORITY_MAX = 4;
