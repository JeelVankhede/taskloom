import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC emits decorator metadata, which NestJS dependency injection needs. esbuild does not.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.spec.ts'] },
      },
      {
        // Database invariant tests. One PostgreSQL 18 container per run (Docker required),
        // with the full migration chain applied once.
        extends: true,
        test: {
          name: 'db',
          include: ['test/db/**/*.test.ts'],
          globalSetup: ['test/db/support/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
