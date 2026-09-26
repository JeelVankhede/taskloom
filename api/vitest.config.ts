import { createRequire } from 'node:module';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

// SWC emits decorator metadata, which NestJS dependency injection needs. esbuild does not.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    // graphql 16 has no exports map. Node resolves every import to its CommonJS build, but Vite
    // prefers the `module` field (index.mjs) for ESM importers while CommonJS dependencies
    // (graphql-query-complexity, graphql-depth-limit) require index.js: two copies of graphql,
    // and "Cannot use GraphQLSchema from another module or realm". Resolve it the way Node does.
    alias: [{ find: /^graphql$/, replacement: require.resolve('graphql') }],
  },
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.spec.ts'] },
      },
      {
        // Database invariant tests and API tests. One PostgreSQL 18 container and one PgBouncer
        // per run (Docker required), with the full migration chain applied once.
        extends: true,
        test: {
          name: 'integration',
          include: ['test/db/**/*.test.ts', 'test/api/**/*.test.ts'],
          globalSetup: ['test/db/support/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
