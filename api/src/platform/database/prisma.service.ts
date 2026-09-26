import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { Env } from '../../config/env.js';

/**
 * The single Prisma client and pool. It connects as app_runtime, which holds no privileges
 * of its own. Only the transaction plugin uses it directly; repositories reach the database
 * only through the request transaction (DbContext).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.assertLoginHasNoPrivileges();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Refuses to start when the login is a superuser or holds any table privilege directly.
   * Without this, a misconfigured DATABASE_URL (for example app_owner) would quietly
   * weaken the guarantee that a query outside a request transaction fails (critique X7).
   */
  private async assertLoginHasNoPrivileges(): Promise<void> {
    const [row] = await this.$queryRaw<{ login: string; superuser: boolean; privileged: number }[]>`
      SELECT current_user AS login,
             (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser,
             (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname IN ('public', 'history_parts') AND c.relkind IN ('r', 'p', 'v')
                AND (has_table_privilege(c.oid, 'SELECT') OR has_table_privilege(c.oid, 'INSERT')
                  OR has_table_privilege(c.oid, 'UPDATE') OR has_table_privilege(c.oid, 'DELETE'))
             ) AS privileged`;
    if (!row || row.superuser || row.privileged > 0) {
      throw new Error(
        `Database login "${row?.login}" must have no privileges of its own (superuser=${row?.superuser}, tables=${row?.privileged}). Use app_runtime.`,
      );
    }
    this.logger.log(`Database login ${row.login} verified: no direct privileges`);
  }
}
