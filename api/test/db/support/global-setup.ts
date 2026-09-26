import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  GenericContainer,
  Network,
  type StartedNetwork,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import type { TestProject } from 'vitest/node';

// Test-only credentials for a throwaway container.
const OWNER_PASSWORD = 'app_owner_test';
const RUNTIME_PASSWORD = 'app_runtime_test';

const apiDir = fileURLToPath(new URL('../../..', import.meta.url));
const initDir = fileURLToPath(new URL('../../../../docker/postgres/init', import.meta.url));

let container: StartedTestContainer | undefined;
let bouncer: StartedTestContainer | undefined;
let network: StartedNetwork | undefined;

declare module 'vitest' {
  export interface ProvidedContext {
    ownerUrl: string;
    runtimeUrl: string;
    /** app_runtime through PgBouncer in transaction mode, as the API connects in every environment. */
    bouncerUrl: string;
  }
}

/** Starts PostgreSQL 18 with the same init scripts as docker-compose, then migrates it. */
export async function setup(project: TestProject): Promise<void> {
  network = await new Network().start();
  container = await new GenericContainer('postgres:18')
    .withNetwork(network)
    .withNetworkAliases('postgres')
    .withEnvironment({
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres_test',
      APP_OWNER_PASSWORD: OWNER_PASSWORD,
      APP_RUNTIME_PASSWORD: RUNTIME_PASSWORD,
    })
    .withCopyDirectoriesToContainer([{ source: initDir, target: '/docker-entrypoint-initdb.d' }])
    .withExposedPorts(5432)
    // The image restarts once after running init scripts.
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();

  const host = `${container.getHost()}:${container.getMappedPort(5432)}`;
  const ownerUrl = `postgresql://app_owner:${OWNER_PASSWORD}@${host}/taskloom`;
  const runtimeUrl = `postgresql://app_runtime:${RUNTIME_PASSWORD}@${host}/taskloom`;

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    env: {
      ...process.env,
      DIRECT_DATABASE_URL: ownerUrl,
      SHADOW_DATABASE_URL: `postgresql://app_owner:${OWNER_PASSWORD}@${host}/taskloom_shadow`,
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
    },
    stdio: 'pipe',
  });

  bouncer = await new GenericContainer('edoburu/pgbouncer:latest')
    .withNetwork(network)
    .withEnvironment({
      DB_HOST: 'postgres',
      DB_PORT: '5432',
      DB_NAME: 'taskloom',
      DB_USER: 'app_runtime',
      DB_PASSWORD: RUNTIME_PASSWORD,
      AUTH_TYPE: 'scram-sha-256',
      POOL_MODE: 'transaction',
      MAX_PREPARED_STATEMENTS: '200',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  const bouncerHost = `${bouncer.getHost()}:${bouncer.getMappedPort(5432)}`;

  project.provide('ownerUrl', ownerUrl);
  project.provide(
    'bouncerUrl',
    `postgresql://app_runtime:${RUNTIME_PASSWORD}@${bouncerHost}/taskloom`,
  );
  project.provide('runtimeUrl', runtimeUrl);
}

export async function teardown(): Promise<void> {
  await bouncer?.stop();
  await container?.stop();
  await network?.stop();
}
