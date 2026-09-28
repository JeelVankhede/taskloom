import type {
  ApolloServerPlugin,
  GraphQLRequestContext,
  GraphQLRequestListener,
} from '@apollo/server';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ErrorCode, ORG_HEADER, type OrgRole } from '@taskloom/contracts';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.js';
import { Prisma } from '../../generated/prisma/client.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { PrismaService } from '../database/prisma.service.js';
import { DomainError, notFound, validationFailed } from '../errors/domain-error.js';
import { formatError, toDomainError } from '../errors/format-error.js';
import { requestError } from '../errors/graphql-errors.js';
import { LIMITS } from '../limits.js';
import { LoaderRegistry } from '../loaders/loader-registry.js';
import type { RequestStore, TxClient } from '../request-store.js';
import { operationScope } from './operation-scope.js';

export interface GraphQLContext {
  req: Request;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thrown inside the transaction callback to roll back without it counting as a failure. */
class Rollback extends Error {}

interface OpenTransaction {
  tx: TxClient;
  /** Resolves the transaction: commit when true, roll back when false. */
  finish(commit: boolean): Promise<void>;
  startedAt: number;
}

/**
 * The request lifecycle (docs/2.1-api-design.md): verify the token, rate-limit, open one
 * transaction per operation, SET LOCAL ROLE app_user, set tenant context, read the caller's
 * membership once, then commit or roll back when the response is ready.
 *
 * Queries run REPEATABLE READ READ ONLY, so every field of one request reads one snapshot
 * (T22). Mutations run READ COMMITTED. No external I/O may happen inside the transaction.
 */
@Injectable()
export class TransactionPlugin implements ApolloServerPlugin<GraphQLContext> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenVerifier,
    private readonly cls: ClsService<RequestStore>,
    private readonly config: ConfigService<Env, true>,
    @Inject(ThrottlerStorage) private readonly throttle: ThrottlerStorage,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(TransactionPlugin.name);
  }

  async requestDidStart(): Promise<GraphQLRequestListener<GraphQLContext>> {
    let open: OpenTransaction | undefined;

    return {
      didResolveOperation: async ({ operation, document, contextValue }) => {
        try {
          if (!operation) throw validationFailed('No operation to execute');
          const req = contextValue.req;
          const userId = await this.tokens.userIdFrom(req.headers.authorization);
          await this.rateLimit(userId);

          const fragments = Object.fromEntries(
            document.definitions.flatMap((d) =>
              d.kind === 'FragmentDefinition' ? [[d.name.value, d]] : [],
            ),
          );
          const scope = operationScope(operation, fragments);
          const orgId = scope === 'org' ? this.orgIdFrom(req) : null;

          open = await this.begin(operation.operation === 'mutation', userId, orgId);
          this.cls.set('userId', userId);
          this.cls.set('tx', open.tx);
          this.cls.set('loaders', new LoaderRegistry());
        } catch (error) {
          const domain = toDomainError(error);
          throw domain ? requestError(domain) : error;
        }
      },

      willSendResponse: async (ctx) => {
        if (!open) return;
        const current = open;
        open = undefined;
        const commit = !hasErrors(ctx);
        try {
          await current.finish(commit);
        } catch (error) {
          // A failed commit (for example a deferred constraint) must not look like success.
          replaceWithError(ctx, error);
        } finally {
          this.logHold(ctx, current.startedAt, commit);
        }
      },
    };
  }

  private orgIdFrom(req: Request): string {
    const header = req.headers[ORG_HEADER];
    if (typeof header !== 'string' || header.length === 0) {
      throw validationFailed(`The ${ORG_HEADER} header is required for organization fields`);
    }
    if (!UUID.test(header))
      throw validationFailed(`The ${ORG_HEADER} header must be an organization id`);
    return header;
  }

  private async rateLimit(userId: string): Promise<void> {
    const { isBlocked } = await this.throttle.increment(
      `graphql:${userId}`,
      60_000,
      LIMITS.operationsPerMinute,
      60_000,
      'graphql',
    );
    if (isBlocked) throw new DomainError(ErrorCode.RATE_LIMITED, 'Too many requests');
  }

  /** Opens the transaction and resolves once context and membership are set. */
  private begin(
    isMutation: boolean,
    userId: string,
    orgId: string | null,
  ): Promise<OpenTransaction> {
    return new Promise<OpenTransaction>((resolveOpen, rejectOpen) => {
      let decide!: (commit: boolean) => void;
      const decision = new Promise<boolean>((resolve) => (decide = resolve));
      const startedAt = Date.now();
      let opened = false;

      const done = this.prisma
        .$transaction(
          async (tx) => {
            try {
              if (!isMutation) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
              await tx.$executeRaw`SET LOCAL ROLE app_user`;
              await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true), set_config('app.org_id', ${orgId ?? ''}, true)`;
              if (orgId) await this.readMembership(tx, userId, orgId);
            } catch (error) {
              rejectOpen(error);
              throw error;
            }
            opened = true;
            resolveOpen({ tx, finish: (commit) => (decide(commit), done), startedAt });
            if (!(await decision)) throw new Rollback();
          },
          {
            isolationLevel: isMutation
              ? Prisma.TransactionIsolationLevel.ReadCommitted
              : Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: this.config.get('DB_TX_TIMEOUT_MS', { infer: true }),
            maxWait: this.config.get('DB_TX_MAX_WAIT_MS', { infer: true }),
          },
        )
        .then(
          () => undefined,
          (error: unknown) => {
            if (error instanceof Rollback) return;
            if (!opened) return; // already surfaced through rejectOpen
            throw error;
          },
        );
    });
  }

  /** One read per request; the role then lives in context, so authorize() never queries. */
  private async readMembership(tx: TxClient, userId: string, orgId: string): Promise<void> {
    const [membership] = await tx.$queryRaw<{ role: OrgRole }[]>`
      SELECT role FROM org_memberships
      WHERE org_id = ${orgId}::uuid AND user_id = ${userId}::uuid AND status = 'active'`;
    if (!membership) throw notFound('organization');
    this.cls.set('orgId', orgId);
    this.cls.set('role', membership.role);
  }

  private logHold(
    ctx: GraphQLRequestContext<GraphQLContext>,
    startedAt: number,
    committed: boolean,
  ): void {
    const holdMs = Date.now() - startedAt;
    const fields = {
      operation: ctx.operationName ?? ctx.operation?.operation,
      holdMs,
      statements: this.cls.get('statements') ?? 0,
      committed,
    };
    if (holdMs > LIMITS.slowTransactionMs) this.logger.warn(fields, 'slow request transaction');
    else this.logger.debug(fields, 'request transaction');
  }
}

function hasErrors(ctx: GraphQLRequestContext<GraphQLContext>): boolean {
  const body = ctx.response.body;
  const fieldErrors = body?.kind === 'single' ? (body.singleResult.errors?.length ?? 0) : 0;
  return (ctx.errors?.length ?? 0) > 0 || fieldErrors > 0;
}

function replaceWithError(ctx: GraphQLRequestContext<GraphQLContext>, error: unknown): void {
  const domain = toDomainError(error);
  const formatted = formatError(
    { message: domain?.message ?? 'Internal server error', extensions: { code: domain?.code } },
    domain ?? error,
  );
  const body = ctx.response.body;
  if (body?.kind === 'single') {
    body.singleResult = { data: null, errors: [formatted] };
  }
}
