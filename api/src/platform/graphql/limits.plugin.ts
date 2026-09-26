import type { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
import { Injectable } from '@nestjs/common';
import { ErrorCode, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '@taskloom/contracts';
import { validate } from 'graphql';
import depthLimit from 'graphql-depth-limit';
import { type ComplexityEstimator, getComplexity, simpleEstimator } from 'graphql-query-complexity';
import { DomainError } from '../errors/domain-error.js';
import { requestError } from '../errors/graphql-errors.js';
import { LIMITS } from '../limits.js';

/**
 * Connections cost `first` times their children, so nested lists multiply (critique X3).
 * `first` above the maximum is rejected here, before any SQL runs (T23).
 */
const connectionEstimator: ComplexityEstimator = ({ field, args, childComplexity }) => {
  if (!field.args.some((arg) => arg.name === 'first')) return undefined;
  const first = (args.first as number | null | undefined) ?? PAGE_SIZE_DEFAULT;
  if (first < 0 || first > PAGE_SIZE_MAX) {
    throw new DomainError(
      ErrorCode.VALIDATION_FAILED,
      `first must be between 0 and ${PAGE_SIZE_MAX}`,
    );
  }
  return 1 + childComplexity * first;
};

/** Rejects oversized operations with QUERY_TOO_COMPLEX before the transaction opens. */
@Injectable()
export class LimitsPlugin implements ApolloServerPlugin {
  async requestDidStart(): Promise<GraphQLRequestListener<object>> {
    return {
      async didResolveOperation({ schema, document, request }) {
        const depthErrors = validate(schema, document, [depthLimit(LIMITS.maxDepth)]);
        if (depthErrors.length > 0) {
          throw requestError(
            new DomainError(ErrorCode.QUERY_TOO_COMPLEX, `Query depth exceeds ${LIMITS.maxDepth}`),
          );
        }

        let cost: number;
        try {
          cost = getComplexity({
            schema,
            query: document,
            operationName: request.operationName ?? undefined,
            variables: request.variables ?? {},
            estimators: [connectionEstimator, simpleEstimator({ defaultComplexity: 1 })],
          });
        } catch (error) {
          if (error instanceof DomainError) throw requestError(error);
          throw error;
        }
        if (cost > LIMITS.maxCost) {
          throw requestError(
            new DomainError(
              ErrorCode.QUERY_TOO_COMPLEX,
              `Query cost ${cost} exceeds ${LIMITS.maxCost}`,
            ),
          );
        }
      },
    };
  }
}
