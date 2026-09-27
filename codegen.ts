import type { CodegenConfig } from '@graphql-codegen/cli';

const schema = 'packages/contracts/schema.graphql';

const config: CodegenConfig = {
  schema,
  ignoreNoDocuments: true,
  generates: {
    // Shared GraphQL types for both api and web.
    'packages/contracts/src/generated/graphql.ts': {
      plugins: ['typescript'],
      config: { enumsAsTypes: true, useTypeImports: true, scalars: { Date: 'string' } },
    },
    // Resolver signatures for the schema-first API.
    'api/src/generated/resolvers.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: { useTypeImports: true, enumsAsTypes: true, scalars: { Date: 'string' } },
    },
    // Typed documents for Apollo Client.
    'web/src/generated/': {
      preset: 'client',
      documents: ['web/src/**/*.graphql'],
      config: {
        useTypeImports: true,
        enumsAsTypes: true,
        // DateTime arrives as an ISO string in JSON; web never receives Date objects.
        scalars: { Date: 'string', DateTime: 'string' },
      },
    },
  },
};

export default config;
