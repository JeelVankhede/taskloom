import { describe, expect, it } from 'vitest';
import { expectCode, inTx, SQLSTATE } from './support/db.js';
import {
  addMember,
  createOrg,
  createProject,
  createUser,
  insertTask,
  statusesOf,
} from './support/fixtures.js';

describe('T6: a live org cannot lose its last active owner', () => {
  it('rejects demoting or deactivating the only owner at commit', async () => {
    const org = await createOrg();
    for (const change of [`role = 'admin'`, `status = 'deactivated', deactivated_at = now()`]) {
      await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
        // Act
        await tx.query(`UPDATE org_memberships SET ${change} WHERE user_id = $1`, [org.ownerId]);

        // Assert
        expectCode(await tx.commitCheck(), 'LAST_OWNER');
      });
    }
  });

  it('allows it once another active owner exists', async () => {
    const org = await createOrg();
    const second = await createUser('owner2');
    await addMember(org.orgId, org.ownerId, second, 'owner');
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      await tx.query(`UPDATE org_memberships SET role = 'admin' WHERE user_id = $1`, [org.ownerId]);
      expect(await tx.commitCheck()).toBeUndefined();
    });
  });
});

describe('T7: status rules', () => {
  it('rejects a closed or archived default status', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Act: point the default at a closed status
      await tx.query(`UPDATE projects SET default_status_id = $1`, [org.statuses.Done]);

      // Assert
      expectCode(await tx.commitCheck(), 'DEFAULT_STATUS_INVALID');
    });
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Act: close the status that is currently the default
      await tx.query(`UPDATE project_statuses SET closed_kind = 'completed' WHERE id = $1`, [
        org.statuses.Todo,
      ]);

      // Assert
      expectCode(await tx.commitCheck(), 'DEFAULT_STATUS_INVALID');
    });
  });

  it('rejects a default status from another project', async () => {
    const a = await createOrg();
    const ops = await createProject(a.orgId, a.ownerId, 'OPS');
    const opsStatuses = await statusesOf(a.orgId, a.ownerId, ops);
    await inTx({ userId: a.ownerId, orgId: a.orgId }, async (tx) => {
      await tx.query(`UPDATE projects SET default_status_id = $2 WHERE id = $1`, [
        a.projectId,
        opsStatuses.Todo,
      ]);
      expectCode(await tx.commitCheck(), SQLSTATE.foreignKey);
    });
  });

  it('a status with tasks cannot be archived directly', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange
      await insertTask(tx, org, { statusId: org.statuses.Backlog! });

      // Act
      await tx.query(`UPDATE project_statuses SET archived_at = now() WHERE id = $1`, [
        org.statuses.Backlog,
      ]);

      // Assert
      expectCode(await tx.commitCheck(), 'STATUS_IN_USE');
    });
  });

  it('create, move, or restore into an archived status fails with STATUS_ARCHIVED', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange: a task parked in Backlog while it is archived, then Backlog archived.
      // The archive's commit check has not run yet, so the restore path is reachable.
      const mover = await insertTask(tx, org, { statusId: org.statuses.Todo! });
      const parked = await insertTask(tx, org, { statusId: org.statuses.Backlog! });
      await tx.query(`UPDATE tasks SET archived_at = now() WHERE id = $1`, [parked.id]);
      await tx.query(`UPDATE project_statuses SET archived_at = now() WHERE id = $1`, [
        org.statuses.Backlog,
      ]);

      // Act
      const create = await tx.fails(
        `INSERT INTO tasks (org_id, project_id, title, status_id, due_date, created_by)
         VALUES ($1, $2, 'x', $3, '2026-12-31', $4)`,
        [org.orgId, org.projectId, org.statuses.Backlog, org.ownerId],
      );
      const moveInto = await tx.fails(`UPDATE tasks SET status_id = $2 WHERE id = $1`, [
        mover.id,
        org.statuses.Backlog,
      ]);
      const restore = await tx.fails(`UPDATE tasks SET archived_at = NULL WHERE id = $1`, [
        parked.id,
      ]);

      // Assert
      expectCode(create, 'STATUS_ARCHIVED');
      expectCode(moveInto, 'STATUS_ARCHIVED');
      expectCode(restore, 'STATUS_ARCHIVED');
    });
  });

  it('keeps live status names unique per project, case-insensitively', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      const failure = await tx.fails(
        `INSERT INTO project_statuses (org_id, project_id, name, position) VALUES ($1, $2, 'todo', 9)`,
        [org.orgId, org.projectId],
      );
      expectCode(failure, SQLSTATE.unique);
    });
  });
});

describe('T10: history, rank, and labels', () => {
  it('history is append-only for the API role', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      expectCode(
        await tx.fails(`UPDATE activity_events SET payload = '{}'`),
        SQLSTATE.insufficientPrivilege,
      );
      expectCode(await tx.fails(`DELETE FROM activity_events`), SQLSTATE.insufficientPrivilege);
    });
  });

  it('an event scope must match its type prefix', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange
      const task = await insertTask(tx, org, { statusId: org.statuses.Todo! });
      const insert = (type: string, projectId: string | null, taskId: string | null) =>
        tx.fails(
          `INSERT INTO activity_events (org_id, project_id, task_id, type, actor_kind, actor_id, payload)
           VALUES ($1, $2, $3, $4, 'user', $5, '{}')`,
          [org.orgId, projectId, taskId, type, org.ownerId],
        );

      // Act and assert
      expectCode(await insert('task.created', org.projectId, null), SQLSTATE.check);
      expectCode(await insert('project.updated', org.projectId, task.id), SQLSTATE.check);
      expectCode(await insert('member.added', org.projectId, null), SQLSTATE.check);
      await tx.query(
        `INSERT INTO activity_events (org_id, project_id, task_id, type, actor_kind, actor_id, payload)
         VALUES ($1, $2, $3, 'task.created', 'user', $4, '{}')`,
        [org.orgId, org.projectId, task.id, org.ownerId],
      );
    });
  });

  it('rank is unique per project', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange
      const first = await insertTask(tx, org, { statusId: org.statuses.Todo! });
      const second = await insertTask(tx, org, { statusId: org.statuses.Backlog! });

      // Act
      const failure = await tx.fails(`UPDATE tasks SET rank = $2 WHERE id = $1`, [
        second.id,
        first.rank,
      ]);

      // Assert
      expectCode(failure, SQLSTATE.unique);
    });
  });

  it('an archived label cannot be applied', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange
      const task = await insertTask(tx, org, { statusId: org.statuses.Todo! });
      const label = await tx.one<{ id: string }>(
        `INSERT INTO labels (org_id, name, color) VALUES ($1, 'old', 'red') RETURNING id`,
        [org.orgId],
      );
      await tx.query(`UPDATE labels SET archived_at = now() WHERE id = $1`, [label.id]);

      // Act
      const failure = await tx.fails(
        `INSERT INTO task_labels (org_id, task_id, label_id) VALUES ($1, $2, $3)`,
        [org.orgId, task.id, label.id],
      );

      // Assert
      expectCode(failure, 'LABEL_ARCHIVED');
    });
  });
});

describe('T25: every task has a due date', () => {
  it('rejects creating without one and clearing one', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      const create = await tx.fails(
        `INSERT INTO tasks (org_id, project_id, title, status_id, created_by) VALUES ($1, $2, 'x', $3, $4)`,
        [org.orgId, org.projectId, org.statuses.Todo, org.ownerId],
      );
      const task = await insertTask(tx, org, { statusId: org.statuses.Todo! });
      const clear = await tx.fails(`UPDATE tasks SET due_date = NULL WHERE id = $1`, [task.id]);

      expectCode(create, SQLSTATE.notNull);
      expectCode(clear, SQLSTATE.notNull);
    });
  });
});

describe('T28: immutable keys and the comment body rule', () => {
  it('app_user cannot change a project key', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      expectCode(await tx.fails(`UPDATE projects SET key = 'NEW'`), SQLSTATE.insufficientPrivilege);
    });
  });

  it('a comment has a body exactly when it is not deleted', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Arrange
      const task = await insertTask(tx, org, { statusId: org.statuses.Todo! });
      const comment = await tx.one<{ id: string }>(
        `INSERT INTO comments (org_id, task_id, author_id, body) VALUES ($1, $2, $3, 'hi') RETURNING id`,
        [org.orgId, task.id, org.ownerId],
      );

      // Act
      const both = await tx.fails(
        `UPDATE comments SET deleted_at = now(), deleted_by = $2 WHERE id = $1`,
        [comment.id, org.ownerId],
      );
      const neither = await tx.fails(`UPDATE comments SET body = NULL WHERE id = $1`, [comment.id]);
      await tx.query(
        `UPDATE comments SET body = NULL, deleted_at = now(), deleted_by = $2 WHERE id = $1`,
        [comment.id, org.ownerId],
      );

      // Assert
      expectCode(both, SQLSTATE.check);
      expectCode(neither, SQLSTATE.check);
    });
  });
});
