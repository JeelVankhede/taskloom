import pg from 'pg';

export type SeedRole = 'app_user' | 'app_identity';

export interface Ctx {
  role: SeedRole;
  userId?: string;
  orgId?: string;
}

/**
 * One seed transaction. Each step switches role and tenant context with SET LOCAL, exactly as
 * the API does, so row-level security, grants, and triggers all apply. Because everything runs
 * in one transaction, a failure leaves the database untouched: never half-seeded.
 */
export class SeedSession {
  constructor(private readonly client: pg.PoolClient) {}

  async run<T>(ctx: Ctx, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    await this.checkpoint();
    await this.client.query('SET CONSTRAINTS ALL DEFERRED');
    await this.client.query(`SET LOCAL ROLE ${ctx.role}`);
    await this.client.query(
      `SELECT set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)`,
      [ctx.userId ?? '', ctx.orgId ?? ''],
    );
    return work(this.client);
  }

  /**
   * Fires pending deferred checks (default status, last owner, the deferred default-status
   * foreign key) under the tenant context that created them. They would otherwise run at
   * COMMIT under the last context set, where row-level security hides other orgs' rows. The
   * API never needs this: each request is one org. The seed spans several in one transaction.
   */
  checkpoint(): Promise<unknown> {
    return this.client.query('SET CONSTRAINTS ALL IMMEDIATE');
  }
}

/** Connects as app_runtime, the API's own login. */
export class SeedDb {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 1 });
  }

  async transaction<T>(work: (session: SeedSession) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const session = new SeedSession(client);
      const result = await work(session);
      await session.checkpoint();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  end(): Promise<void> {
    return this.pool.end();
  }
}
