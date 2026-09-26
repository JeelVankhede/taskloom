import { committed } from '../../db/support/db.js';
import type { OrgFixture } from '../../db/support/fixtures.js';

export interface TaskSpec {
  title: string;
  status: string;
  /** 1 to 4, or null for NONE. */
  priority?: number | null;
  assigneeId?: string | null;
  dueDate: string;
  labelIds?: string[];
  archived?: boolean;
  projectId?: string;
}

/**
 * Inserts tasks with exact fields through the real insert path (app_user, triggers), one
 * statement each, in the given order. Returns ids by title.
 */
export async function insertTasks(
  org: OrgFixture,
  specs: TaskSpec[],
): Promise<Record<string, string>> {
  return committed({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
    const ids: Record<string, string> = {};
    for (const spec of specs) {
      const projectId = spec.projectId ?? org.projectId;
      const status = await tx.one<{ id: string }>(
        `SELECT id FROM project_statuses WHERE project_id = $1 AND name = $2`,
        [projectId, spec.status],
      );
      const task = await tx.one<{ id: string }>(
        `INSERT INTO tasks (org_id, project_id, title, status_id, priority, assignee_id, due_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          org.orgId,
          projectId,
          spec.title,
          status.id,
          spec.priority ?? null,
          spec.assigneeId ?? null,
          spec.dueDate,
          org.ownerId,
        ],
      );
      for (const labelId of spec.labelIds ?? []) {
        await tx.query(`INSERT INTO task_labels (org_id, task_id, label_id) VALUES ($1, $2, $3)`, [
          org.orgId,
          task.id,
          labelId,
        ]);
      }
      if (spec.archived)
        await tx.query(`UPDATE tasks SET archived_at = now() WHERE id = $1`, [task.id]);
      ids[spec.title] = task.id;
    }
    return ids;
  });
}

export async function createLabel(org: OrgFixture, name: string, color = 'red'): Promise<string> {
  return committed(
    { userId: org.ownerId, orgId: org.orgId },
    async (tx) =>
      (
        await tx.one<{ id: string }>(
          `INSERT INTO labels (org_id, name, color) VALUES ($1, $2, $3) RETURNING id`,
          [org.orgId, name, color],
        )
      ).id,
  );
}
