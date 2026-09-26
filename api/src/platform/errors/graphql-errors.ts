import { GraphQLError } from 'graphql';
import type { DomainError } from './domain-error.js';

const HTTP_STATUS: Record<string, number> = {
  UNAUTHENTICATED: 401,
  RATE_LIMITED: 429,
  VALIDATION_FAILED: 400,
  QUERY_TOO_COMPLEX: 400,
};

/**
 * Lifecycle failures raised before execution (in Apollo plugin hooks) become request errors.
 * UNAUTHENTICATED is 401 so the web client knows to refresh once and retry.
 */
export function requestError(error: DomainError): GraphQLError {
  return new GraphQLError(error.message, {
    originalError: error,
    extensions: { code: error.code, http: { status: HTTP_STATUS[error.code] ?? 200 } },
  });
}
