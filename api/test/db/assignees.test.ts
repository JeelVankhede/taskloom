import { describe, expect, it } from 'vitest';
import { committed, expectCode, inTx, type Tx } from './support/db.js';
import {
  addMember,
  createOrg,
  createUser,
  insertTask,
  type OrgFixture,
} from './support/fixtures.js';

const deactivate = (tx: Tx, userId: string) =>
  tx.query(
    `UPDATE org_memberships SET status = 'deactivated', deactivated_at = now() WHERE user_id = $1`,
    [userId],
  );

async function orgWithDepartedMember(): Promise<{ org: OrgFixture; departed: string }> {
  const org = await createOrg();
  const departed = await createUser('departed');
  await addMember(org.orgId, org.ownerId, departed);
  return { org, departed };
}

describe('T5 (Built part): an inactive member cannot hold an open, live task', () => {
  it('rejects creating an open task for an inactive assignee', async () => {
    const { org, departed } = await orgWithDepartedMember();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange
      await deactivate(tx, departed);

      // Act
      const failure = await tx.fails(
        `INSERT INTO tasks (org_id, project_id, title, status_id, assignee_id, due_date, created_by)
           VALUES ($1, $2, 'x', $3, $4, '2026-12-31', $5)`,
        [org.orgId, org.projectId, org.statuses.Todo, departed, org.ownerId],
      );

      // Assert
      expectCode(failure, 'ASSIGNEE_INACTIVE');
    });
  });

  it('rejects assigning an open task to an inactive member', async () => {
    const { org, departed } = await orgWithDepartedMember();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange
      const task = await insertTask(tx, org, { statusId: org.statuses.Todo! });
      await deactivate(tx, departed);

      // Act
      const failure = await tx.fails(`UPDATE tasks SET assignee_id = $2 WHERE id = $1`, [
        task.id,
        departed,
      ]);

      // Assert
      expectCode(failure, 'ASSIGNEE_INACTIVE');
    });
  });

  it('rejects reopening a closed task that is assigned to an inactive member', async () => {
    const { org, departed } = await orgWithDepartedMember();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange: closed tasks keep their assignee when the member departs
      const task = await insertTask(tx, org, {
        statusId: org.statuses.Done!,
        assigneeId: departed,
      });
      await deactivate(tx, departed);

      // Act
      const failure = await tx.fails(`UPDATE tasks SET status_id = $2 WHERE id = $1`, [
        task.id,
        org.statuses.Todo,
      ]);

      // Assert
      expectCode(failure, 'ASSIGNEE_INACTIVE');
    });
  });

  it('rejects restoring an archived open task assigned to an inactive member', async () => {
    const { org, departed } = await orgWithDepartedMember();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange
      const task = await insertTask(tx, org, {
        statusId: org.statuses.Todo!,
        assigneeId: departed,
      });
      await tx.query(`UPDATE tasks SET archived_at = now() WHERE id = $1`, [task.id]);
      await deactivate(tx, departed);

      // Act
      const failure = await tx.fails(`UPDATE tasks SET archived_at = NULL WHERE id = $1`, [
        task.id,
      ]);

      // Assert
      expectCode(failure, 'ASSIGNEE_INACTIVE');
    });
  });

  it('allows a closed task to keep an inactive assignee', async () => {
    const { org, departed } = await orgWithDepartedMember();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange
      const task = await insertTask(tx, org, {
        statusId: org.statuses.Done!,
        assigneeId: departed,
      });
      await deactivate(tx, departed);

      // Act
      await tx.query(`UPDATE tasks SET title = 'Still closed' WHERE id = $1`, [task.id]);

      // Assert
      expect(await tx.one(`SELECT assignee_id FROM tasks WHERE id = $1`, [task.id])).toEqual({
        assignee_id: departed,
      });
    });
  });
});

describe('T18 (Built part): a status flip that skips the bulk reopen routine', () => {
  it('fails with ASSIGNEE_INACTIVE and changes nothing', async () => {
    // Arrange
    const { org, departed } = await orgWithDepartedMember();
    const taskId = await committed({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      const task = await insertTask(tx, org, {
        statusId: org.statuses.Done!,
        assigneeId: departed,
      });
      await deactivate(tx, departed);
      return task.id;
    });

    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Act
      const failure = await tx.fails(
        `UPDATE project_statuses SET closed_kind = NULL WHERE id = $1`,
        [org.statuses.Done],
      );

      // Assert
      expectCode(failure, 'ASSIGNEE_INACTIVE');
      expect(
        await tx.one(`SELECT closed_kind FROM project_statuses WHERE id = $1`, [org.statuses.Done]),
      ).toEqual({
        closed_kind: 'completed',
      });
      expect(
        await tx.one(`SELECT is_closed, assignee_id FROM tasks WHERE id = $1`, [taskId]),
      ).toEqual({
        is_closed: true,
        assignee_id: departed,
      });
    });
  });
});
