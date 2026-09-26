import { GraphQLError } from 'graphql';
import { describe, expect, it } from 'vitest';
import { mapDatabaseError } from './database-errors.js';
import { DomainError } from './domain-error.js';
import { formatError } from './format-error.js';

/** The shape Prisma's pg driver adapter produces (observed with Prisma 7.10). */
const pgError = (originalCode: string, originalMessage = 'detail from postgres') => ({
  name: 'PrismaClientKnownRequestError',
  code: 'P2010',
  meta: { driverAdapterError: { cause: { originalCode, originalMessage } } },
});

describe('mapDatabaseError', () => {
  it.each([
    [pgError('P0001', 'STATUS_ARCHIVED'), 'STATUS_ARCHIVED'],
    [pgError('P0001', 'LAST_OWNER'), 'LAST_OWNER'],
    [pgError('23514'), 'VALIDATION_FAILED'],
    [pgError('23505'), 'VALIDATION_FAILED'],
    [pgError('23503'), 'NOT_FOUND'],
    [pgError('42501', 'new row violates row-level security policy'), 'NOT_FOUND'],
    [{ code: 'P2025' }, 'NOT_FOUND'],
    // A commit failure (deferred constraint) arrives unwrapped.
    [
      {
        name: 'DriverAdapterError',
        cause: { originalCode: 'P0001', originalMessage: 'LAST_OWNER' },
      },
      'LAST_OWNER',
    ],
  ])('maps %j to %s', (error, code) => {
    expect(mapDatabaseError(error)?.code).toBe(code);
  });

  it.each([
    [pgError('P0001', 'something custom')],
    [pgError('25006')],
    [new Error('boom')],
    [null],
  ])('leaves %j unmapped', (error) => {
    expect(mapDatabaseError(error)).toBeUndefined();
  });
});

describe('formatError', () => {
  const format = (error: unknown) =>
    formatError(
      { message: 'raw', extensions: {} },
      new GraphQLError('raw', { originalError: error as Error }),
    );

  it('keeps a domain error code and message', () => {
    expect(format(new DomainError('NOT_FOUND', 'Not found'))).toEqual({
      message: 'Not found',
      path: undefined,
      extensions: { code: 'NOT_FOUND' },
    });
  });

  it('never exposes database detail', () => {
    const formatted = format(pgError('42501', 'permission denied for table tasks'));
    expect(JSON.stringify(formatted)).not.toContain('tasks');
    expect(formatted.extensions?.code).toBe('NOT_FOUND');
  });

  it('masks unexpected errors', () => {
    expect(format(new Error('password=hunter2'))).toEqual({
      message: 'Internal server error',
      path: undefined,
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  });
});
