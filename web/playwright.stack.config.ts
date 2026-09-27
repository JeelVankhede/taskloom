import { defineConfig, devices } from '@playwright/test';

/**
 * One smoke test against the real stack: API, PostgreSQL through PgBouncer, and the Vite dev
 * server proxying /auth and /graphql (so the Origin check, the HttpOnly cookie on Path=/auth,
 * and strict rotation are all real). Needs the database up and migrated (npm run db:up, npm run
 * migrate). It signs up a new, uniquely named account on every run.
 */
export default defineConfig({
  testDir: './e2e-stack',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run start -w @taskloom/api',
      cwd: '..',
      port: 4000,
      reuseExistingServer: !process.env.CI,
      // API logs (including slow-transaction warnings) appear in the test output.
      stdout: 'pipe',
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
