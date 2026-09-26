import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import type { TxClient } from '../request-store.js';
import { PrismaService } from './prisma.service.js';

/**
 * A short transaction as app_identity: the only role that can read password hashes and
 * refresh tokens. Used by the /auth routes, which run outside the GraphQL lifecycle.
 * Keep CPU-heavy work (password hashing) outside the callback.
 */
@Injectable()
export class IdentityTx {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  run<T>(work: (tx: TxClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL ROLE app_identity`;
        return work(tx);
      },
      {
        timeout: this.config.get('DB_TX_TIMEOUT_MS', { infer: true }),
        maxWait: this.config.get('DB_TX_MAX_WAIT_MS', { infer: true }),
      },
    );
  }
}
