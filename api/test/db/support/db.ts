import pg from 'pg';
import { afterAll, expect, inject } from 'vitest';

/**
 * Connections for the database invariant tests. Every test connects as app_runtime, the
 * API's real login, and acts only through SET LOCAL ROLE, exactly like the API will.
 * The owner pool exists only for the few tests that must prove what triggers do regardless
 * of grants (T14); it is never a superuser.
 */
export const runtimePool = new pg.Pool({ connectionString: inject('runtimeUrl'), max: 6 });
export const ownerPool = new pg.Pool({ connectionString: inject('ownerUrl'), max: 2 });

afterAll(async () => {
  await Promise.all([runtimePool.end(), ownerPool.end()]);
});

export type Role = 'app_user' | 'app_identity';

export interface Context {
  role?: Role;
  userId?: string;
  orgId?: string;
}

export interface Tx {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<T>>;
  /** First row, or undefined. */
  one<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: unknown[]): Promise<T>;
  /** Runs a statement that must fail, inside a savepoint so the transaction stays usable. */
  fails(sql: string, params?: unknown[]): Promise<pg.DatabaseError>;
  /** Fires deferred constraint triggers now, inside a savepoint. */
  commitCheck(): Promise<pg.DatabaseError | undefined>;
  setContext(ctx: Context): Promise<void>;
}

function wrap(client: pg.PoolClient): Tx {
  const tx: Tx = {
    query: (sql, params) => client.query(sql, params),
    one: async (sql, params) => (await client.query(sql, params)).rows[0],
    fails: async (sql, params) => {
      await client.query('SAVEPOINT expect_failure');
      try {
        await client.query(sql, params);
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT expect_failure');
        return error as pg.DatabaseError;
      }
      await client.query('ROLLBACK TO SAVEPOINT expect_failure');
      throw new Error(`Expected failure, but it succeeded: ${sql}`);
    },
    commitCheck: async () => {
      await client.query('SAVEPOINT commit_check');
      try {
        await client.query('SET CONSTRAINTS ALL IMMEDIATE');
        await client.query('SET CONSTRAINTS ALL DEFERRED');
        await client.query('RELEASE SAVEPOINT commit_check');
        return undefined;
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT commit_check');
        return error as pg.DatabaseError;
      }
    },
    setContext: async ({ role = 'app_user', userId, orgId }) => {
      await client.query(`SET LOCAL ROLE ${role}`);
      await client.query(
        `SELECT set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)`,
        [userId ?? '', orgId ?? ''],
      );
    },
  };
  return tx;
}

async function run<T>(
  pool: pg.Pool,
  ctx: Context | null,
  commit: boolean,
  fn: (tx: Tx) => Promise<T>,
) {
  const client = await pool.connect();
  const tx = wrap(client);
  try {
    await client.query('BEGIN');
    if (ctx) await tx.setContext(ctx);
    const result = await fn(tx);
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** A transaction as app_runtime with the given role and context, always rolled back. */
export const inTx = <T>(ctx: Context, fn: (tx: Tx) => Promise<T>) =>
  run(runtimePool, ctx, false, fn);

/** Same, but committed. Used for fixtures and for tests that need two sessions. */
export const committed = <T>(ctx: Context, fn: (tx: Tx) => Promise<T>) =>
  run(runtimePool, ctx, true, fn);

/** A transaction as app_runtime with no SET ROLE at all (T32). Always rolled back. */
export const asRuntimeOnly = <T>(fn: (tx: Tx) => Promise<T>) => run(runtimePool, null, false, fn);

/** A transaction as app_owner (not a superuser) with tenant context. Always rolled back. */
export const asOwner = <T>(ctx: Omit<Context, 'role'>, fn: (tx: Tx) => Promise<T>) =>
  run(ownerPool, null, false, async (tx) => {
    await tx.query(
      `SELECT set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)`,
      [ctx.userId ?? '', ctx.orgId ?? ''],
    );
    return fn(tx);
  });

/** Asserts a database error: an app code (P0001 message) or a SQLSTATE. */
export function expectCode(error: pg.DatabaseError | undefined, code: string): void {
  expect(error, `expected ${code}`).toBeDefined();
  const actual = error?.code === 'P0001' ? error.message : error?.code;
  expect(actual).toBe(code);
}

export const SQLSTATE = {
  insufficientPrivilege: '42501',
  notNull: '23502',
  foreignKey: '23503',
  unique: '23505',
  check: '23514',
} as const;
