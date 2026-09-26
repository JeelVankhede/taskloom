import { describe, expect, it } from 'vitest';
import { asOwner, expectCode, inTx, SQLSTATE, type Tx } from './support/db.js';
import { createOrg, insertTask, type OrgFixture } from './support/fixtures.js';

const closedState = (tx: Tx, id: string) =>
  tx.one<{ is_closed: boolean; closed_at: Date | null }>(
    `SELECT is_closed, closed_at FROM tasks WHERE id = $1`,
    [id],
  );

const move = (tx: Tx, id: string, statusId: string) =>
  tx.query(`UPDATE tasks SET status_id = $2 WHERE id = $1`, [id, statusId]);

const flip = (tx: Tx, org: OrgFixture, status: string, kind: 'completed' | 'canceled' | null) =>
  tx.query(`UPDATE project_statuses SET closed_kind = $2 WHERE id = $1`, [
    org.statuses[status],
    kind,
  ]);

describe('T2: derived is_closed and closed_at; direct writes rejected', () => {
  it('derives is_closed and stamps closed_at from the status on create', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Act
      const open = await insertTask(tx, org, { statusId: org.statuses.Todo! });
      const done = await insertTask(tx, org, { statusId: org.statuses.Done! });

      // Assert
      expect(open).toMatchObject({ is_closed: false, closed_at: null });
      expect(done.is_closed).toBe(true);
      expect(done.closed_at).toBeInstanceOf(Date);
    });
  });

  it('stamps on its own move into closed, keeps it between closed statuses, clears it on reopen', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange
      const task = await insertTask(tx, org, { statusId: org.statuses.Todo! });

      // Act and assert
      await move(tx, task.id, org.statuses.Done!);
      const done = await closedState(tx, task.id);
      expect(done.is_closed).toBe(true);
      expect(done.closed_at).toBeInstanceOf(Date);

      await move(tx, task.id, org.statuses.Canceled!);
      expect(await closedState(tx, task.id)).toEqual(done);

      await move(tx, task.id, org.statuses['In Progress']!);
      expect(await closedState(tx, task.id)).toEqual({ is_closed: false, closed_at: null });
    });
  });

  it('rejects direct writes to number, is_closed, and closed_at', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange
      const task = await insertTask(tx, org, { statusId: org.statuses.Todo! });

      // Act and assert
      for (const set of ['is_closed = true', 'closed_at = now()', 'number = 42']) {
        const failure = await tx.fails(`UPDATE tasks SET ${set} WHERE id = $1`, [task.id]);
        expectCode(failure, SQLSTATE.insufficientPrivilege);
      }
      const insert = await tx.fails(
        `INSERT INTO tasks (org_id, project_id, title, status_id, due_date, created_by, is_closed)
         VALUES ($1, $2, 'x', $3, '2026-12-31', $4, true)`,
        [org.orgId, org.projectId, org.statuses.Todo, org.ownerId],
      );
      expectCode(insert, SQLSTATE.insufficientPrivilege);
    });
  });
});

describe('T3: status flips update is_closed and never invent a closed_at', () => {
  it('a flip to closed sets is_closed and leaves closed_at empty', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange
      const task = await insertTask(tx, org, { statusId: org.statuses['In Review']! });

      // Act
      await flip(tx, org, 'In Review', 'completed');

      // Assert
      expect(await closedState(tx, task.id)).toEqual({ is_closed: true, closed_at: null });
      expect(await tx.commitCheck()).toBeUndefined();
    });
  });

  it('a flip to open clears closed_at', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange
      const task = await insertTask(tx, org, { statusId: org.statuses.Done! });

      // Act
      await flip(tx, org, 'Done', null);

      // Assert
      expect(await closedState(tx, task.id)).toEqual({ is_closed: false, closed_at: null });
    });
  });

  it('closed, flipped open, flipped closed shows no closed_at', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange
      const task = await insertTask(tx, org, { statusId: org.statuses.Done! });

      // Act
      await flip(tx, org, 'Done', null);
      await flip(tx, org, 'Done', 'completed');

      // Assert
      expect(await closedState(tx, task.id)).toEqual({ is_closed: true, closed_at: null });
    });
  });
});

describe('T14: status is_closed follows closed_kind whatever value is written', () => {
  it('the API role cannot write is_closed at all', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      const failure = await tx.fails(`UPDATE project_statuses SET is_closed = true WHERE id = $1`, [
        org.statuses.Todo,
      ]);
      expectCode(failure, SQLSTATE.insufficientPrivilege);
    });
  });

  it('even the owner role cannot make is_closed disagree with closed_kind', async () => {
    const org = await createOrg();
    await asOwner({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Act
      await tx.query(`UPDATE project_statuses SET is_closed = true WHERE id = $1`, [
        org.statuses.Backlog,
      ]);
      await tx.query(`UPDATE org_template_statuses SET is_closed = false WHERE name = 'Done'`);
      const inserted = await tx.one(
        `INSERT INTO project_statuses (org_id, project_id, name, closed_kind, is_closed, position)
         VALUES ($1, $2, 'Shipped', 'completed', false, 9) RETURNING is_closed`,
        [org.orgId, org.projectId],
      );

      // Assert
      expect(
        await tx.one(`SELECT is_closed FROM project_statuses WHERE id = $1`, [
          org.statuses.Backlog,
        ]),
      ).toEqual({ is_closed: false });
      expect(
        await tx.one(`SELECT is_closed FROM org_template_statuses WHERE name = 'Done'`),
      ).toEqual({
        is_closed: true,
      });
      expect(inserted).toEqual({ is_closed: true });
    });
  });
});
