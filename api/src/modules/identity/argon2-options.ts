import argon2 from 'argon2';

/** OWASP argon2id parameters: 19 MiB memory, 2 iterations, parallelism 1. Shared with the seed. */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;
