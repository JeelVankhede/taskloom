import { Logger } from '@nestjs/common';
import { ErrorCode } from '@taskloom/contracts';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { mapDatabaseError } from './database-errors.js';
import { DomainError } from './domain-error.js';

const logger = new Logger('GraphQL');

const PASSTHROUGH_CODES = new Set<string>([
  'GRAPHQL_PARSE_FAILED',
  'GRAPHQL_VALIDATION_FAILED',
  'BAD_USER_INPUT',
  ErrorCode.QUERY_TOO_COMPLEX,
  ErrorCode.VALIDATION_FAILED,
]);

/** Converts any thrown value into a domain error, or undefined when it is unexpected. */
export function toDomainError(error: unknown): DomainError | undefined {
  if (error instanceof DomainError) return error;
  return mapDatabaseError(error);
}

/**
 * Apollo formatError. Every error leaves with extensions.code. Unexpected errors are masked
 * as INTERNAL_SERVER_ERROR: no stack traces, SQL, or config ever reach the client.
 */
export function formatError(
  formatted: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError {
  const original = error instanceof GraphQLError ? (error.originalError ?? error) : error;
  const domain = toDomainError(original);
  if (domain) {
    return { message: domain.message, path: formatted.path, extensions: { code: domain.code } };
  }

  const code = formatted.extensions?.code;
  if (typeof code === 'string' && PASSTHROUGH_CODES.has(code)) {
    return {
      message: formatted.message,
      locations: formatted.locations,
      path: formatted.path,
      extensions: { code },
    };
  }
  // Masked for the client, logged in full for operators (with the request id from pino).
  logger.error({ err: original, path: formatted.path }, 'Unexpected GraphQL error');
  return {
    message: 'Internal server error',
    path: formatted.path,
    extensions: { code: ErrorCode.INTERNAL_SERVER_ERROR },
  };
}
