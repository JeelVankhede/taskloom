import type pg from 'pg';
import type { SeedSession } from './db.js';
import type { Random } from './random.js';
import { taskTitle } from './titles.js';

type Client = pg.PoolClient;
type Role = 'owner' | 'admin' | 'member' | 'contributor';

const event = (
  client: Client,
  type: string,
  actorId: string,
  payload: Record<string, unknown>,
  scope: { projectId?: string; taskId?: string } = {},
) =>
  client.query(
    `INSERT INTO activity_events (org_id, project_id, task_id, type, actor_kind, actor_id, payload)
     VALUES (app.current_org_id(), $1, $2, $3::activity_type, 'user', $4, $5::jsonb)`,
    [scope.projectId ?? null, scope.taskId ?? null, type, actorId, JSON.stringify(payload)],
  );

/** Creates the org through app.create_organization, as the API does. Returns its id. */
export async function createOrganization(
  db: SeedSession,
  ownerId: string,
  org: { name: string; slug: string; timezone: string },
): Promise<string> {
  return db.run({ role: 'app_user', userId: ownerId }, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT app.create_organization($1, $2, $3) AS id`,
      [org.name, org.slug, org.timezone],
    );
    return rows[0]!.id;
  });
}

/** Adds members directly, as addMember does, with one member.added event each. */
export async function addMembers(
  db: SeedSession,
  orgId: string,
  ownerId: string,
  members: [string, Role][],
): Promise<void> {
  await db.run({ role: 'app_user', userId: ownerId, orgId }, async (client) => {
    for (const [userId, role] of members) {
      await client.query(
        `INSERT INTO org_memberships (org_id, user_id, role, status) VALUES ($1, $2, $3::org_role, 'active')`,
        [orgId, userId, role],
      );
      await event(client, 'member.added', ownerId, { user_id: userId, role, via: 'direct' });
    }
  });
}

export async function createLabels(
  db: SeedSession,
  orgId: string,
  ownerId: string,
  labels: [string, string][],
): Promise<string[]> {
  return db.run({ role: 'app_user', userId: ownerId, orgId }, async (client) => {
    const ids: string[] = [];
    for (const [name, color] of labels) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO labels (org_id, name, color) VALUES ($1, $2, $3) RETURNING id`,
        [orgId, name, color],
      );
      ids.push(rows[0]!.id);
      await event(client, 'label.created', ownerId, { label_id: rows[0]!.id, name, color });
    }
    return ids;
  });
}

export interface SeededProject {
  projectId: string;
  /** Status name to id and closed flag. */
  statuses: Map<string, { id: string; closed: boolean }>;
}

/** Creates the project through app.create_project (template statuses, project.created). */
export async function createProject(
  db: SeedSession,
  orgId: string,
  userId: string,
  project: { name: string; key: string; description: string },
): Promise<SeededProject> {
  return db.run({ role: 'app_user', userId, orgId }, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT app.create_project($1, $2, $3) AS id`,
      [project.name, project.key, project.description],
    );
    const projectId = rows[0]!.id;
    const statuses = await client.query<{ id: string; name: string; is_closed: boolean }>(
      `SELECT id, name, is_closed FROM project_statuses WHERE project_id = $1`,
      [projectId],
    );
    return {
      projectId,
      statuses: new Map(statuses.rows.map((s) => [s.name, { id: s.id, closed: s.is_closed }])),
    };
  });
}

/** Status mix agreed in Phase 5. */
const STATUS_WEIGHTS = [
  ['Backlog', 30],
  ['Todo', 20],
  ['In Progress', 15],
  ['In Review', 10],
  ['Done', 20],
  ['Canceled', 5],
] as const;

export interface TaskPlan {
  orgId: string;
  project: SeededProject;
  count: number;
  /** Active members who create tasks and can be assigned open tasks. */
  people: string[];
  /** A deactivated-to-be member, assigned only closed tasks (open tasks cannot hold them). */
  departedId?: string;
  labelIds: string[];
  random: Random;
}

/**
 * Inserts tasks one by one with tenant context, so the insert trigger allocates numbers and
 * top-of-column ranks and guards every rule. Writes task.created for each task, archives about
 * 5% (task.archived).
 */
export async function seedTasks(
  db: SeedSession,
  plan: TaskPlan,
): Promise<{ created: number; archived: number }> {
  const { random } = plan;
  return db.run({ role: 'app_user', userId: plan.people[0], orgId: plan.orgId }, async (client) => {
    const { rows } = await client.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE timezone)::date::text AS today FROM organization_settings`,
    );
    const today = rows[0]!.today;
    const archivedIds: string[] = [];

    for (let i = 0; i < plan.count; i += 1) {
      const statusName = random.weighted(STATUS_WEIGHTS);
      const status = plan.project.statuses.get(statusName)!;
      const creator = random.pick(plan.people);
      const assignee =
        status.closed && plan.departedId && random.chance(0.1)
          ? plan.departedId
          : random.chance(0.15)
            ? null
            : random.pick(plan.people);
      // Open tasks: about 15% overdue, the rest due within 60 days. Closed: anywhere nearby.
      const dueOffset = status.closed
        ? random.int(-60, 30)
        : random.chance(0.15)
          ? random.int(-60, -1)
          : random.int(0, 60);
      const priority = random.int(0, 4);

      const inserted = await client.query<{ id: string; number: number }>(
        `INSERT INTO tasks (org_id, project_id, title, status_id, priority, assignee_id, due_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date + $8::int, $9) RETURNING id, number`,
        [
          plan.orgId,
          plan.project.projectId,
          taskTitle(random),
          status.id,
          priority === 0 ? null : priority,
          assignee,
          today,
          dueOffset,
          creator,
        ],
      );
      const task = inserted.rows[0]!;
      const labelIds = random.sample(plan.labelIds, random.int(0, 3));
      for (const labelId of labelIds) {
        await client.query(
          `INSERT INTO task_labels (org_id, task_id, label_id) VALUES ($1, $2, $3)`,
          [plan.orgId, task.id, labelId],
        );
      }
      await client.query(
        `INSERT INTO activity_events (org_id, project_id, task_id, type, actor_kind, actor_id, payload)
         SELECT t.org_id, t.project_id, t.id, 'task.created', 'user', t.created_by,
                jsonb_build_object('number', t.number, 'title', t.title, 'status_id', t.status_id,
                                   'priority', t.priority, 'assignee_id', t.assignee_id,
                                   'due_date', t.due_date::text, 'label_ids', $2::uuid[])
         FROM tasks t WHERE t.id = $1`,
        [task.id, labelIds],
      );
      if (random.chance(0.05)) archivedIds.push(task.id);
    }

    for (const taskId of archivedIds) {
      await client.query(`UPDATE tasks SET archived_at = now() WHERE id = $1`, [taskId]);
      await event(
        client,
        'task.archived',
        plan.people[0]!,
        {},
        { projectId: plan.project.projectId, taskId },
      );
    }
    return { created: plan.count, archived: archivedIds.length };
  });
}

/** Deactivates a member (the designed flow's outcome), with a member.deactivated event. */
export async function deactivateMember(
  db: SeedSession,
  orgId: string,
  ownerId: string,
  userId: string,
): Promise<void> {
  await db.run({ role: 'app_user', userId: ownerId, orgId }, async (client) => {
    await client.query(
      `UPDATE org_memberships SET status = 'deactivated', deactivated_at = now() WHERE user_id = $1`,
      [userId],
    );
    await event(client, 'member.deactivated', ownerId, { user_id: userId, cleared_count: 0 });
  });
}
