/** Request limits agreed in Phase 2 (docs/implementation-plan.md section 8). */
export const LIMITS = {
  maxDepth: 10,
  maxCost: 10_000,
  /** GraphQL operations per minute, per user (or per IP before sign-in). */
  operationsPerMinute: 300,
  /** Log a warning when a request holds its connection longer than this. */
  slowTransactionMs: 1_000,
} as const;
