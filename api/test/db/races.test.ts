import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { committed, expectCode, runtimePool } from './support/db.js';
import { createOrg, insertTask } from './support/fixtures.js';

/** An open transaction on its own connection, as app_user in the given org. */
async function session(userId: string, orgId: string) {
  const client = await runtimePool.connect();
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE app_user');
  await client.query(
    `SELECT set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)`,
    [userId, orgId],
  );
  let ended = false;
  return {
    client,
    async end(outcome: 'COMMIT' | 'ROLLBACK') {
      if (ended) return;
      ended = true;
      await client.query(outcome).catch(() => undefined);
      client.release();
    },
  };
}

/** Resolves true if the promise is still pending after the delay, meaning it is blocked on a lock. */
async function isBlocked(promise: Promise<unknown>, ms = 300): Promise<boolean> {
  const marker = Symbol('pending');
  const winner = await Promise.race([
    promise.then(
      () => 'settled',
      () => 'settled',
    ),
    new Promise((resolve) => setTimeout(() => resolve(marker), ms)),
  ]);
  return winner === marker;
}

describe('T7: concurrent writes against an archive', () => {
  it('a move waiting on a status archive fails with STATUS_ARCHIVED once the archive commits', async () => {
    // Arrange
    const org = await createOrg();
    const task = await committed({ userId: org.ownerId, orgId: org.orgId }, (tx) =>
      insertTask(tx, org, { statusId: org.statuses.Todo! }),
    );
    const archiver = await session(org.ownerId, org.orgId);
    const mover = await session(org.ownerId, org.orgId);

    try {
      await archiver.client.query(`UPDATE project_statuses SET archived_at = now() WHERE id = $1`, [
        org.statuses.Backlog,
      ]);

      // Act
      const move = mover.client.query(`UPDATE tasks SET status_id = $2 WHERE id = $1`, [
        task.id,
        org.statuses.Backlog,
      ]);
      const blocked = await isBlocked(move);
      await archiver.end('COMMIT');
      const error = await move.then(
        () => undefined,
        (e: pg.DatabaseError) => e,
      );

      // Assert
      expect(blocked).toBe(true);
      expectCode(error, 'STATUS_ARCHIVED');
    } finally {
      await archiver.end('ROLLBACK');
      await mover.end('ROLLBACK');
    }

    const status = await committed({ userId: org.ownerId, orgId: org.orgId }, (tx) =>
      tx.one(`SELECT status_id FROM tasks WHERE id = $1`, [task.id]),
    );
    expect(status).toEqual({ status_id: org.statuses.Todo });
  });

  it('a label apply waiting on a label archive fails with LABEL_ARCHIVED once the archive commits', async () => {
    // Arrange
    const org = await createOrg();
    const { task, label } = await committed(
      { userId: org.ownerId, orgId: org.orgId },
      async (tx) => ({
        task: await insertTask(tx, org, { statusId: org.statuses.Todo! }),
        label: await tx.one<{ id: string }>(
          `INSERT INTO labels (org_id, name, color) VALUES ($1, 'bug', 'red') RETURNING id`,
          [org.orgId],
        ),
      }),
    );
    const archiver = await session(org.ownerId, org.orgId);
    const applier = await session(org.ownerId, org.orgId);

    try {
      await archiver.client.query(`UPDATE labels SET archived_at = now() WHERE id = $1`, [
        label.id,
      ]);

      // Act
      const apply = applier.client.query(
        `INSERT INTO task_labels (org_id, task_id, label_id) VALUES ($1, $2, $3)`,
        [org.orgId, task.id, label.id],
      );
      const blocked = await isBlocked(apply);
      await archiver.end('COMMIT');
      const error = await apply.then(
        () => undefined,
        (e: pg.DatabaseError) => e,
      );

      // Assert
      expect(blocked).toBe(true);
      expectCode(error, 'LABEL_ARCHIVED');
    } finally {
      await archiver.end('ROLLBACK');
      await applier.end('ROLLBACK');
    }
  });
});
