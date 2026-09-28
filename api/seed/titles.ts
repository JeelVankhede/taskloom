import type { Random } from './random.js';

const VERBS = [
  'Fix',
  'Add',
  'Update',
  'Refactor',
  'Remove',
  'Investigate',
  'Document',
  'Speed up',
  'Test',
  'Migrate',
];
const SUBJECTS = [
  'flaky login test',
  'billing API docs',
  'password reset email',
  'dashboard loading state',
  'search indexing job',
  'CSV export',
  'onboarding checklist',
  'rate limiter config',
  'audit log retention',
  'mobile nav layout',
  'webhook retries',
  'invoice PDF layout',
  'SSO callback handling',
  'dark mode contrast',
  'release notes page',
  'error boundary copy',
  'slow project query',
  'notification settings',
  'image upload limits',
  'timezone display',
];
const SUFFIXES = [
  '',
  '',
  '',
  ' for Safari',
  ' on staging',
  ' in the admin panel',
  ' before release',
  ' for large orgs',
];

/** A readable task title from small word lists, never "Task 1234". */
export const taskTitle = (random: Random): string =>
  `${random.pick(VERBS)} ${random.pick(SUBJECTS)}${random.pick(SUFFIXES)}`;
