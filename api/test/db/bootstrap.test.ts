import { describe, expect, it } from 'vitest';
import { expectCode, inTx } from './support/db.js';
import { createOrg, insertTask } from './support/fixtures.js';

describe('T1: tenants bootstrap through the creation procedures', () => {
  it('creates the org, settings, owner membership, and default template', async () => {
    // Arrange
    const org = await createOrg();

    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Act
      const settings = await tx.one(`SELECT timezone, priority_labels FROM organization_settings`);
      const membership = await tx.one(`SELECT user_id, role, status FROM org_memberships`);
      const { rows: template } = await tx.query(
        `SELECT name, closed_kind, is_closed, is_default FROM org_template_statuses ORDER BY position`,
      );

      // Assert
      expect(settings).toEqual({
        timezone: 'UTC',
        priority_labels: ['Urgent', 'High', 'Medium', 'Low'],
      });
      expect(membership).toEqual({ user_id: org.ownerId, role: 'owner', status: 'active' });
      expect(template).toEqual([
        { name: 'Backlog', closed_kind: null, is_closed: false, is_default: false },
        { name: 'Todo', closed_kind: null, is_closed: false, is_default: true },
        { name: 'In Progress', closed_kind: null, is_closed: false, is_default: false },
        { name: 'In Review', closed_kind: null, is_closed: false, is_default: false },
        { name: 'Done', closed_kind: 'completed', is_closed: true, is_default: false },
        { name: 'Canceled', closed_kind: 'canceled', is_closed: true, is_default: false },
      ]);
    });
  });

  it('copies the template into the project, defaults to Todo, and records project.created', async () => {
    // Arrange
    const org = await createOrg();

    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Act
      const project = await tx.one(
        `SELECT p.key, p.next_task_number, s.name AS default_status
         FROM projects p JOIN project_statuses s ON s.id = p.default_status_id`,
      );
      const copied = await tx.one<{ count: string }>(
        `SELECT count(*) FROM project_statuses s
         JOIN org_template_statuses t ON t.id = s.template_status_id AND t.name = s.name`,
      );
      const event = await tx.one(`SELECT type, actor_kind, actor_id, payload FROM activity_events`);

      // Assert
      expect(project).toEqual({ key: 'ENG', next_task_number: 1, default_status: 'Todo' });
      expect(copied.count).toBe('6');
      expect(event).toEqual({
        type: 'project.created',
        actor_kind: 'user',
        actor_id: org.ownerId,
        payload: { key: 'ENG', name: 'Project' },
      });
    });
  });

  it('keeps two tenants apart from the start', async () => {
    // Arrange
    const a = await createOrg();
    const b = await createOrg();

    await inTx({ userId: a.ownerId, orgId: a.orgId }, async (tx) => {
      // Act
      const { rows } = await tx.query(`SELECT id FROM organizations`);

      // Assert
      expect(rows).toEqual([{ id: a.orgId }]);
      expect(a.orgId).not.toBe(b.orgId);
    });
  });

  it('rejects a taken slug with ORG_SLUG_TAKEN and a taken key with PROJECT_KEY_TAKEN', async () => {
    // Arrange
    const org = await createOrg();

    // Act and assert
    await inTx({ userId: org.ownerId }, async (tx) => {
      expectCode(
        await tx.fails(`SELECT app.create_organization('Other', $1)`, [org.slug]),
        'ORG_SLUG_TAKEN',
      );
    });
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      expectCode(await tx.fails(`SELECT app.create_project('Again', 'ENG')`), 'PROJECT_KEY_TAKEN');
    });
  });

  it('enforces the slug, key, and reserved-word rules', async () => {
    // Arrange
    const org = await createOrg();

    await inTx({ userId: org.ownerId }, async (tx) => {
      // Act and assert: slugs are 3 to 6 characters, lowercase, inner hyphens only
      for (const slug of ['ab', 'abcdefg', '-abc', 'abc-', 'ABC', 'a_b1']) {
        expectCode(await tx.fails(`SELECT app.create_organization('X', $1)`, [slug]), '23514');
      }
      expectCode(await tx.fails(`SELECT app.create_organization('X', 'api')`), '23514');
      await tx.query(`SELECT app.create_organization('X', 'a-b1')`);
    });
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      for (const key of ['EN', 'ENGG', 'eng', '1EN']) {
        expectCode(await tx.fails(`SELECT app.create_project('X', $1)`, [key]), '23514');
      }
    });
  });
});

describe('T2 and T19: task numbers are allocated by the database', () => {
  it('allocates 1, 2, 3 per project and never reuses', async () => {
    // Arrange
    const org = await createOrg();

    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Act
      const numbers = [];
      for (let i = 0; i < 3; i += 1) {
        numbers.push((await insertTask(tx, org, { statusId: org.statuses.Todo! })).number);
      }

      // Assert
      expect(numbers).toEqual([1, 2, 3]);
    });
  });

  it('T19: a create with a number other than 0 fails, and the next create still gets the next number', async () => {
    // Arrange
    const org = await createOrg();

    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Act
      const failure = await tx.fails(
        `INSERT INTO tasks (org_id, project_id, number, title, status_id, due_date, created_by)
         VALUES ($1, $2, 99, 'Forged', $3, '2026-12-31', $4)`,
        [org.orgId, org.projectId, org.statuses.Todo, org.ownerId],
      );
      const next = await insertTask(tx, org, { statusId: org.statuses.Todo! });

      // Assert
      expectCode(failure, 'DERIVED_COLUMN_WRITE');
      expect(next.number).toBe(1);
    });
  });

  it('rejects a client-supplied rank on create with DERIVED_COLUMN_WRITE', async () => {
    // Arrange
    const org = await createOrg();

    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Act
      const failure = await tx.fails(
        `INSERT INTO tasks (org_id, project_id, title, status_id, due_date, rank, created_by)
         VALUES ($1, $2, 'Forged', $3, '2026-12-31', 'V', $4)`,
        [org.orgId, org.projectId, org.statuses.Todo, org.ownerId],
      );

      // Assert
      expectCode(failure, 'DERIVED_COLUMN_WRITE');
    });
  });

  it('puts each new task at the top of its column with a project-unique rank', async () => {
    // Arrange
    const org = await createOrg();

    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Act: two empty columns would both start at the same key without the uniqueness step
      const todo1 = await insertTask(tx, org, { statusId: org.statuses.Todo! });
      const backlog1 = await insertTask(tx, org, { statusId: org.statuses.Backlog! });
      const todo2 = await insertTask(tx, org, { statusId: org.statuses.Todo! });
      const backlog2 = await insertTask(tx, org, { statusId: org.statuses.Backlog! });
      const { rows } = await tx.query<{ rank: string }>(`SELECT rank FROM tasks`);

      // Assert
      expect(new Set(rows.map((r) => r.rank)).size).toBe(4);
      expect(todo2.rank < todo1.rank).toBe(true);
      expect(backlog2.rank < backlog1.rank).toBe(true);
    });
  });
});
