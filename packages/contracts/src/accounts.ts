import { LENGTH } from './limits.js';

/**
 * Account rules shared by the API (validation) and the web forms (Phase 7).
 * The database also checks email format and display name length.
 */
export const PASSWORD = { min: 10, max: 128 } as const;

/** Same shape the database checks: something@something, no whitespace, at most 254 characters. */
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/;

/** Emails are compared case-insensitively and stored trimmed and lowercased. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export interface AccountRuleViolation {
  field: 'email' | 'password' | 'displayName';
  message: string;
}

/** One place for the sign-up rules, so client and server reject the same inputs. */
export function checkSignUp(input: {
  email: string;
  password: string;
  displayName: string;
}): AccountRuleViolation[] {
  const violations: AccountRuleViolation[] = [];
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();

  if (email.length > LENGTH.email.max || !EMAIL_PATTERN.test(email)) {
    violations.push({ field: 'email', message: 'Enter a valid email address' });
  }
  if (input.password.length < PASSWORD.min || input.password.length > PASSWORD.max) {
    violations.push({
      field: 'password',
      message: `Use ${PASSWORD.min} to ${PASSWORD.max} characters`,
    });
  } else if (input.password.toLowerCase() === email) {
    violations.push({ field: 'password', message: 'Password must not be your email' });
  }
  if (displayName.length < LENGTH.displayName.min || displayName.length > LENGTH.displayName.max) {
    violations.push({
      field: 'displayName',
      message: `Use ${LENGTH.displayName.min} to ${LENGTH.displayName.max} characters`,
    });
  }
  return violations;
}
