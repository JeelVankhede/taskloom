import { fileURLToPath } from 'node:url';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { formatError } from '../errors/format-error.js';
import type { LimitsPlugin } from './limits.plugin.js';
import type { GraphQLContext, TransactionPlugin } from './transaction.plugin.js';

const SCHEMA_PATH = fileURLToPath(import.meta.resolve('@taskloom/contracts/schema.graphql'));

export interface GraphQLOptionsInput {
  limits: LimitsPlugin;
  transaction: TransactionPlugin;
  production: boolean;
  /** Test builds only: extra type definitions for lifecycle probes. */
  extraTypeDefs?: string[];
}

/** Schema-first Apollo options. Plugin order matters: limits run before a transaction opens. */
export function graphqlOptions(input: GraphQLOptionsInput): ApolloDriverConfig {
  return {
    typePaths: [SCHEMA_PATH],
    typeDefs: input.extraTypeDefs,
    path: '/graphql',
    context: ({ req }: GraphQLContext) => ({ req }),
    plugins: [input.limits, input.transaction],
    formatError,
    includeStacktraceInErrorResponses: false,
    introspection: !input.production,
  };
}
