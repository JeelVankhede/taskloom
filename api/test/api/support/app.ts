import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TOKEN_AUDIENCE, TOKEN_ISSUER } from '@taskloom/contracts';
import { inject } from 'vitest';
import { AppModule, type AppModuleOptions } from '../../../src/app.module.js';
import {
  AUTH_RATE_LIMITS,
  DEFAULT_AUTH_LIMITS,
} from '../../../src/modules/identity/auth-rate-limiter.js';
import { configureApp } from '../../../src/platform/http/configure-app.js';
import {
  ACTION_LIMITS,
  DEFAULT_ACTION_LIMITS,
} from '../../../src/platform/rate-limit/action-limiter.js';
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

export const WEB_ORIGIN = 'http://localhost:5173';

export interface RestResult {
  status: number;
  headers: Headers;
  body: Record<string, unknown> | null;
  /** The Set-Cookie header, if any. */
  cookie: string | null;
}

export interface TestApp {
  app: INestApplication;
  gql(query: string, options?: GqlOptions): Promise<GqlResult>;
  /** POST to a REST route with JSON, the web Origin, and an optional Cookie header. */
  post(
    path: string,
    body?: unknown,
    options?: { cookie?: string; origin?: string | null },
  ): Promise<RestResult>;
  token(userId: string, options?: { expiresIn?: number; secret?: string; sub?: string }): string;
  close(): Promise<void>;
}

/** Boots the real app (real pipeline, PgBouncer, row-level security) with the probe schema. */
export interface StartOptions extends AppModuleOptions {
  /** Auth rate limits; tests default to the real limits scaled up so they never interfere. */
  authLimits?: typeof DEFAULT_AUTH_LIMITS;
  /** Action limits (org creation, join requests, member lookups); relaxed by default. */
  actionLimits?: typeof DEFAULT_ACTION_LIMITS;
}

const RELAXED_ACTION_LIMITS = Object.fromEntries(
  Object.entries(DEFAULT_ACTION_LIMITS).map(([action, rule]) => [
    action,
    { ...rule, limit: rule.limit * 1000 },
  ]),
) as typeof DEFAULT_ACTION_LIMITS;

/** Real limits with every counter raised 1,000 times, so only the rate-limit tests hit them. */
const RELAXED_AUTH_LIMITS = Object.fromEntries(
  Object.entries(DEFAULT_AUTH_LIMITS).map(([action, rules]) => [
    action,
    rules.map((rule) => ({ ...rule, limit: rule.limit * 1000 })),
  ]),
) as typeof DEFAULT_AUTH_LIMITS;

export async function startApp(
  env: Record<string, string> = {},
  options: StartOptions = {},
): Promise<TestApp> {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
    WEB_ORIGIN,
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
  })
    .overrideProvider(AUTH_RATE_LIMITS)
    .useValue(options.authLimits ?? RELAXED_AUTH_LIMITS)
    .overrideProvider(ACTION_LIMITS)
    .useValue(options.actionLimits ?? RELAXED_ACTION_LIMITS)
    .compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.listen(0);
  const base = (await app.getUrl()).replace('[::1]', 'localhost');
  const url = `${base}/graphql`;
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
    async post(path, body, { cookie, origin = WEB_ORIGIN } = {}) {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(origin ? { origin } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
        cookie: response.headers.get('set-cookie'),
      };
    },
    token(userId, { expiresIn = 900, secret, sub } = {}) {
      return jwt.sign(
        { sub: sub ?? userId },
        {
          expiresIn,
          issuer: TOKEN_ISSUER,
          audience: TOKEN_AUDIENCE,
          ...(secret ? { secret } : {}),
        },
      );
    },
    close: () => app.close(),
  };
}

export const codeOf = (result: GqlResult) => result.body.errors?.[0]?.extensions?.code;
