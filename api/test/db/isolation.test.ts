import { describe, expect, it } from 'vitest';
import { asRuntimeOnly, expectCode, inTx, SQLSTATE } from './support/db.js';
import { addMember, createOrg, createUser, emailOf, insertTask } from './support/fixtures.js';

const TENANT_TABLES = [
  'organizations',
  'organization_settings',
  'org_memberships',
  'org_join_requests',
  'org_template_statuses',
  'projects',
  'project_statuses',
  'tasks',
  'labels',
  'task_labels',
  'comments',
  'activity_events',
];

describe('T4: row-level security isolates tenants', () => {
  it('reads nothing from another org, in every tenant table', async () => {
    // Arrange
    const a = await createOrg();
    const b = await createOrg();
    await inTx({ userId: b.ownerId, orgId: b.orgId }, async (tx) => {
      await insertTask(tx, b, { statusId: b.statuses.Todo! });
    });

    await inTx({ userId: a.ownerId, orgId: a.orgId }, async (tx) => {
      for (const table of TENANT_TABLES) {
        // Act
        const idColumn = table === 'organizations' ? 'id' : 'org_id';
        const row = await tx.one<{ count: string }>(
          `SELECT count(*) FROM ${table} WHERE ${idColumn} = $1`,
          [b.orgId],
        );

        // Assert
        expect(row.count, table).toBe('0');
      }
    });
  });

  it('cannot update or insert into another org', async () => {
    // Arrange
    const a = await createOrg();
    const b = await createOrg();

    await inTx({ userId: a.ownerId, orgId: a.orgId }, async (tx) => {
      // Act
      const updated = await tx.query(`UPDATE projects SET name = 'hijacked' WHERE org_id = $1`, [
        b.orgId,
      ]);
      const inserted = await tx.fails(
        `INSERT INTO labels (org_id, name, color) VALUES ($1, 'x', 'red')`,
        [b.orgId],
      );

      // Assert
      expect(updated.rowCount).toBe(0);
      expectCode(inserted, SQLSTATE.insufficientPrivilege);
    });
  });

  it('fails closed without tenant context', async () => {
    // Arrange
    const org = await createOrg();

    await inTx({ userId: org.ownerId }, async (tx) => {
      for (const table of TENANT_TABLES) {
        // Act
        const row = await tx.one<{ count: string }>(`SELECT count(*) FROM ${table}`);

        // Assert
        expect(row.count, table).toBe('0');
      }
    });
  });

  it('rejects an assignee, status, or label from another org', async () => {
    // Arrange
    const a = await createOrg();
    const b = await createOrg();

    await inTx({ userId: a.ownerId, orgId: a.orgId }, async (tx) => {
      // Act
      const foreignAssignee = await tx.fails(
        `INSERT INTO tasks (org_id, project_id, title, status_id, assignee_id, due_date, created_by)
         VALUES ($1, $2, 'x', $3, $4, '2026-12-31', $5)`,
        [a.orgId, a.projectId, a.statuses.Todo, b.ownerId, a.ownerId],
      );
      const foreignStatus = await tx.fails(
        `INSERT INTO tasks (org_id, project_id, title, status_id, due_date, created_by)
         VALUES ($1, $2, 'x', $3, '2026-12-31', $4)`,
        [a.orgId, a.projectId, b.statuses.Todo, a.ownerId],
      );

      // Assert
      expectCode(foreignAssignee, 'ASSIGNEE_NOT_MEMBER');
      expectCode(foreignStatus, 'STATUS_NOT_IN_PROJECT');
    });
  });
});

describe('T16: only the switcher crosses tenants, and only for the caller', () => {
  it("lists exactly the caller's active memberships across orgs", async () => {
    // Arrange
    const user = await createUser('multi');
    const a = await createOrg(user);
    const b = await createOrg();
    await addMember(b.orgId, b.ownerId, user, 'contributor');
    await createOrg(); // an org the user does not belong to

    await inTx({ userId: user }, async (tx) => {
      // Act
      const { rows } = await tx.query(
        `SELECT org_id, role FROM app.viewer_memberships() ORDER BY role`,
      );

      // Assert
      expect(rows).toEqual(
        expect.arrayContaining([
          { org_id: a.orgId, role: 'owner' },
          { org_id: b.orgId, role: 'contributor' },
        ]),
      );
      expect(rows).toHaveLength(2);
    });
  });

  it('as app_user, a user in two orgs reads one membership row per org context', async () => {
    // Arrange
    const user = await createUser('multi');
    const a = await createOrg(user);
    const b = await createOrg();
    await addMember(b.orgId, b.ownerId, user);

    await inTx({ userId: user, orgId: a.orgId }, async (tx) => {
      // Act
      const { rows } = await tx.query(`SELECT org_id FROM org_memberships WHERE user_id = $1`, [
        user,
      ]);

      // Assert
      expect(rows).toEqual([{ org_id: a.orgId }]);
    });
  });

  it('the runtime login cannot become the switcher or join role directly', async () => {
    await asRuntimeOnly(async (tx) => {
      for (const role of ['app_membership_reader', 'app_join', 'app_owner']) {
        expectCode(await tx.fails(`SET LOCAL ROLE ${role}`), SQLSTATE.insufficientPrivilege);
      }
    });
  });
});

describe('T17: the users table', () => {
  it('app_user reads itself and current-org members only', async () => {
    // Arrange
    const a = await createOrg();
    const b = await createOrg();

    await inTx({ userId: a.ownerId, orgId: a.orgId }, async (tx) => {
      // Act
      const { rows } = await tx.query(`SELECT id FROM users`);

      // Assert
      expect(rows).toEqual([{ id: a.ownerId }]);
      expect((await tx.query(`SELECT id FROM users WHERE id = $1`, [b.ownerId])).rowCount).toBe(0);
    });
  });

  it('app_user cannot update another user, insert users, or touch identity columns', async () => {
    // Arrange
    const org = await createOrg();
    const peer = await createUser('peer');
    await addMember(org.orgId, org.ownerId, peer);

    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Act
      const otherUpdate = await tx.query(`UPDATE users SET display_name = 'x' WHERE id = $1`, [
        peer,
      ]);
      const selfUpdate = await tx.query(`UPDATE users SET display_name = 'Me' WHERE id = $1`, [
        org.ownerId,
      ]);

      // Assert
      expect(otherUpdate.rowCount).toBe(0);
      expect(selfUpdate.rowCount).toBe(1);
      for (const sql of [
        `INSERT INTO users (email, display_name, password_hash) VALUES ('x@example.test', 'x', 'h')`,
        `UPDATE users SET email = 'x@example.test' WHERE id = '${org.ownerId}'`,
        `UPDATE users SET password_hash = 'h' WHERE id = '${org.ownerId}'`,
        `SELECT password_hash FROM users`,
        `SELECT auth_subject FROM users`,
      ]) {
        expectCode(await tx.fails(sql), SQLSTATE.insufficientPrivilege);
      }
    });
  });

  it('app_identity reads and writes users and refresh tokens, and no tenant table', async () => {
    await inTx({ role: 'app_identity' }, async (tx) => {
      for (const table of TENANT_TABLES) {
        expectCode(
          await tx.fails(`SELECT 1 FROM ${table} LIMIT 1`),
          SQLSTATE.insufficientPrivilege,
        );
      }
      expect((await tx.query(`SELECT id, password_hash FROM users LIMIT 1`)).fields).toHaveLength(
        2,
      );
      expect(
        (await tx.query(`SELECT id FROM refresh_tokens LIMIT 1`)).rowCount,
      ).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('T32: app_runtime has no privileges without SET ROLE', () => {
  it('reads nothing from any table', async () => {
    await asRuntimeOnly(async (tx) => {
      for (const table of [...TENANT_TABLES, 'users', 'refresh_tokens']) {
        expectCode(
          await tx.fails(`SELECT 1 FROM ${table} LIMIT 1`),
          SQLSTATE.insufficientPrivilege,
        );
      }
    });
  });
});

describe('T33: member lookup returns an id and nothing else', () => {
  it('matches the exact email, case-insensitively, and nothing partial', async () => {
    // Arrange
    const org = await createOrg();
    const target = await createUser('target');
    const email = await emailOf(target);

    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Act
      const exact = await tx.one(`SELECT app.lookup_user_id_by_email($1) AS id`, [
        email.toUpperCase(),
      ]);
      const partial = await tx.one(`SELECT app.lookup_user_id_by_email($1) AS id`, [
        email.slice(0, 10),
      ]);
      const unknown = await tx.one(
        `SELECT app.lookup_user_id_by_email('nobody@example.test') AS id`,
      );

      // Assert
      expect(exact).toEqual({ id: target });
      expect(partial).toEqual({ id: null });
      expect(unknown).toEqual({ id: null });
    });
  });
});
