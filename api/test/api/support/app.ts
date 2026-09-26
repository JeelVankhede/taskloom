import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';
import { AppModule, type AppModuleOptions } from '../../../src/app.module.js';
import { configureApp } from '../../../src/platform/http/configure-app.js';
import { PROBE_TYPE_DEFS, ProbeResolver } from './probe.js';

/** Test-only signing secret. */
export const TEST_JWT_SECRET = 'test-access-secret-that-is-at-least-32-chars';

export interface GqlResult {
  status: number;
  headers: Headers;
  body: {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions?: { code?: string } }[];
  };
}

export interface GqlOptions {
  token?: string;
  orgId?: string;
  variables?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface TestApp {
  app: INestApplication;
  gql(query: string, options?: GqlOptions): Promise<GqlResult>;
  token(userId: string, options?: { expiresIn?: number; secret?: string; sub?: string }): string;
  close(): Promise<void>;
}

/** Boots the real app (real pipeline, PgBouncer, row-level security) with the probe schema. */
export async function startApp(
  env: Record<string, string> = {},
  options: AppModuleOptions = {},
): Promise<TestApp> {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
    WEB_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: inject('bouncerUrl'),
    JWT_ACCESS_SECRET: TEST_JWT_SECRET,
    DB_TX_TIMEOUT_MS: '5000',
    DB_TX_MAX_WAIT_MS: '2000',
    ...env,
  });

  const moduleRef = await Test.createTestingModule({
    imports: [
      AppModule.register({
        extraTypeDefs: [PROBE_TYPE_DEFS, ...(options.extraTypeDefs ?? [])],
        extraProviders: [ProbeResolver, ...(options.extraProviders ?? [])],
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.listen(0);
  const url = `${await app.getUrl()}/graphql`.replace('[::1]', 'localhost');
  const jwt = new JwtService({ secret: TEST_JWT_SECRET });

  return {
    app,
    async gql(query, { token, orgId, variables, headers } = {}) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { 'x-org-id': orgId } : {}),
          ...headers,
        },
        body: JSON.stringify({ query, variables }),
      });
      return {
        status: response.status,
        headers: response.headers,
        body: (await response.json()) as GqlResult['body'],
      };
    },
    token(userId, { expiresIn = 900, secret, sub } = {}) {
      return jwt.sign({ sub: sub ?? userId }, { expiresIn, ...(secret ? { secret } : {}) });
    },
    close: () => app.close(),
  };
}

export const codeOf = (result: GqlResult) => result.body.errors?.[0]?.extensions?.code;
