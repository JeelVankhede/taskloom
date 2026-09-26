import { ErrorCode } from '@taskloom/contracts';
import { DomainError } from './domain-error.js';

/**
 * Maps a PostgreSQL failure, as surfaced by Prisma's pg driver adapter, to a domain error.
 * Mapping agreed in Phase 2:
 *   P0001 (our raised codes)  -> that code, when it is a known ErrorCode
 *   23514 check, 23505 unique -> VALIDATION_FAILED
 *   23503 foreign key          -> NOT_FOUND
 *   42501 permission or RLS    -> NOT_FOUND, so nothing leaks
 *   anything else              -> undefined (the caller treats it as internal)
 */
const KNOWN_CODES = new Set<string>(Object.values(ErrorCode));

interface PgCause {
  originalCode?: string;
  originalMessage?: string;
}

/**
 * Query failures arrive wrapped (PrismaClientKnownRequestError, meta.driverAdapterError.cause).
 * Commit failures, such as a deferred constraint, arrive as the raw DriverAdapterError.
 */
function pgCause(error: unknown): PgCause | undefined {
  const candidate = error as {
    name?: string;
    cause?: PgCause;
    meta?: { driverAdapterError?: { cause?: PgCause } };
  } | null;
  if (candidate?.name === 'DriverAdapterError') return candidate.cause;
  return candidate?.meta?.driverAdapterError?.cause;
}

/** Prisma's own codes for the same classes, when a model operation fails before SQL detail. */
const PRISMA_CODES: Record<string, ErrorCode> = {
  P2002: ErrorCode.VALIDATION_FAILED,
  P2003: ErrorCode.NOT_FOUND,
  P2025: ErrorCode.NOT_FOUND,
};

export function mapDatabaseError(error: unknown): DomainError | undefined {
  const cause = pgCause(error);
  const sqlState = cause?.originalCode;

  if (sqlState === 'P0001' && cause?.originalMessage && KNOWN_CODES.has(cause.originalMessage)) {
    return new DomainError(cause.originalMessage as ErrorCode);
  }
  switch (sqlState) {
    case '23514':
    case '23505':
      return new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid input');
    case '23503':
    case '42501':
      return new DomainError(ErrorCode.NOT_FOUND, 'Not found');
    default:
      break;
  }

  const prismaCode = (error as { code?: unknown } | null)?.code;
  if (typeof prismaCode === 'string' && PRISMA_CODES[prismaCode]) {
    return new DomainError(PRISMA_CODES[prismaCode]!, 'Not found');
  }
  return undefined;
}
