import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

config({ path: '../.env' });

// Migrations run as app_owner over a direct connection, never through PgBouncer.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DIRECT_DATABASE_URL'),
  },
});
