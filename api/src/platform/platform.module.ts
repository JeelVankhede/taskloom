import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import type { Env } from '../config/env.js';
import { TokenVerifier } from './auth/token-verifier.js';
import { DbContext } from './database/db-context.js';
import { IdentityTx } from './database/identity-tx.js';
import { GraphqlExceptionFilter } from './errors/graphql-exception.filter.js';
import { PrismaService } from './database/prisma.service.js';
import { LimitsPlugin } from './graphql/limits.plugin.js';
import { TransactionPlugin } from './graphql/transaction.plugin.js';
import { ActivityRecorder } from './history/activity-recorder.js';
import { Loaders } from './loaders/loaders.js';
import {
  ACTION_LIMITS,
  ActionLimiter,
  DEFAULT_ACTION_LIMITS,
} from './rate-limit/action-limiter.js';

/** Cross-cutting infrastructure: database, request context, auth verification, limits, logging. */
@Global()
@Module({
  imports: [
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    ThrottlerModule.forRoot([]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: (req) => String(req.headers['x-request-id']),
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        },
      }),
    }),
  ],
  providers: [
    PrismaService,
    DbContext,
    IdentityTx,
    TokenVerifier,
    LimitsPlugin,
    TransactionPlugin,
    ActivityRecorder,
    ActionLimiter,
    Loaders,
    { provide: ACTION_LIMITS, useValue: DEFAULT_ACTION_LIMITS },
    // Resolver errors: expected ones quietly, unexpected ones once (see the filter).
    { provide: APP_FILTER, useClass: GraphqlExceptionFilter },
  ],
  exports: [
    PrismaService,
    DbContext,
    IdentityTx,
    TokenVerifier,
    LimitsPlugin,
    TransactionPlugin,
    ActivityRecorder,
    ActionLimiter,
    Loaders,
    JwtModule,
  ],
})
export class PlatformModule {}
