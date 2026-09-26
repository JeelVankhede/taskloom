import { randomBytes, randomUUID } from 'node:crypto';
import { committed, type Tx } from './db.js';

/**
 * Committed fixtures. Every test builds its own users and organizations with random,
 * format-valid identifiers, so test files can run in parallel against one database.
 */

const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
const random = (length: number) =>
  Array.from(randomBytes(length), (byte) => alphabet[byte % alphabet.length]).join('');

/** A valid org slug: 3 to 6 characters. Starts with 't' so it never hits a reserved word. */
export const newSlug = () => `t${random(5)}`;

export async function createUser(label = 'user'): Promise<string> {
  const email = `${label}-${randomUUID()}@example.test`;
  return committed({ role: 'app_identity' }, async (tx) => {
    const row = await tx.one<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, 'test-hash') RETURNING id`,
      [email, label],
    );
    return row.id;
  });
}

export async function emailOf(userId: string): Promise<string> {
  return committed({ role: 'app_identity' }, async (tx) => {
    const row = await tx.one<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]);
    return row.email;
  });
}

export interface OrgFixture {
  orgId: string;
  slug: string;
  ownerId: string;
  projectId: string;
  statuses: Record<string, string>;
}

/** An org created through app.create_organization plus one project through app.create_project. */
export async function createOrg(ownerId?: string, projectKey = 'ENG'): Promise<OrgFixture> {
  const owner = ownerId ?? (await createUser('owner'));
  const slug = newSlug();
  const orgId = await committed({ userId: owner }, async (tx) => {
    const row = await tx.one<{ id: string }>(
      `SELECT app.create_organization('Org', $1, 'UTC') AS id`,
      [slug],
    );
    return row.id;
  });
  const projectId = await createProject(orgId, owner, projectKey);
  const statuses = await statusesOf(orgId, owner, projectId);
  return { orgId, slug, ownerId: owner, projectId, statuses };
}

export async function createProject(orgId: string, userId: string, key: string): Promise<string> {
  return committed({ userId, orgId }, async (tx) => {
    const row = await tx.one<{ id: string }>(`SELECT app.create_project('Project', $1) AS id`, [
      key,
    ]);
    return row.id;
  });
}

export async function statusesOf(orgId: string, userId: string, projectId: string) {
  return committed({ userId, orgId }, async (tx) => {
    const { rows } = await tx.query<{ id: string; name: string }>(
      `SELECT id, name FROM project_statuses WHERE project_id = $1`,
      [projectId],
    );
    return Object.fromEntries(rows.map((row) => [row.name, row.id]));
  });
}

export async function addMember(
  orgId: string,
  actorId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member' | 'contributor' = 'member',
): Promise<void> {
  await committed({ userId: actorId, orgId }, (tx) =>
    tx.query(
      `INSERT INTO org_memberships (org_id, user_id, role, status) VALUES ($1, $2, $3, 'active')`,
      [orgId, userId, role],
    ),
  );
}

export interface TaskInput {
  statusId: string;
  assigneeId?: string | null;
  dueDate?: string;
  title?: string;
}

/** Inserts a task the way createTask will: number and rank come from the insert trigger. */
export async function insertTask(
  tx: Tx,
  org: OrgFixture,
  input: TaskInput,
  createdBy = org.ownerId,
) {
  return tx.one<{
    id: string;
    number: number;
    is_closed: boolean;
    closed_at: Date | null;
    rank: string;
  }>(
    `INSERT INTO tasks (org_id, project_id, title, status_id, assignee_id, due_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, number, is_closed, closed_at, rank`,
    [
      org.orgId,
      org.projectId,
      input.title ?? 'Task',
      input.statusId,
      input.assigneeId ?? null,
      input.dueDate ?? '2026-12-31',
      createdBy,
    ],
  );
}
