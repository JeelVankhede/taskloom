import { type ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { type GqlContextType, GqlArgumentsHost } from '@nestjs/graphql';
import { responsePathAsArray } from 'graphql';
import { toDomainError } from './format-error.js';

/**
 * Replaces Nest's default handling of errors thrown by GraphQL resolvers, which logs every
 * Error at error level with its stack before Apollo's formatError has translated it.
 *
 * - Expected failures (a DomainError, or a code raised by the database) get one debug line.
 * - Unexpected errors are not logged here: formatError logs them once, in full, and masks them.
 *
 * Either way the error is rethrown, so formatError still decides what the client sees.
 * Non-GraphQL requests keep Nest's default behavior (the /auth routes have their own filter).
 */
@Catch()
export class GraphqlExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('GraphQL');

  override catch(exception: unknown, host: ArgumentsHost): unknown {
    if (host.getType<GqlContextType>() !== 'graphql') return super.catch(exception, host);

    const domain = toDomainError(exception);
    if (domain) {
      const info = GqlArgumentsHost.create(host).getInfo<{
        path?: Parameters<typeof responsePathAsArray>[0];
      }>();
      this.logger.debug(
        { code: domain.code, path: info?.path ? responsePathAsArray(info.path) : undefined },
        'Expected GraphQL error',
      );
    }
    throw exception;
  }
}
