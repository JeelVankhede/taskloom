import { Injectable } from '@nestjs/common';
import { DbContext } from '../database/db-context.js';

export interface UserRecord {
  id: string;
  displayName: string;
  email: string;
}
export interface StatusRecord {
  id: string;
  name: string;
  isClosed: boolean;
  position: number;
}
export interface ProjectKeyRecord {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isArchived: boolean;
  createdAt: Date;
}
export interface LabelRecord {
  id: string;
  name: string;
  color: string;
  isArchived: boolean;
}

const byId = <T extends { id: string }>(ids: readonly string[], rows: T[]) => {
  const map = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => map.get(id) ?? null);
};

/**
 * Request-scoped batch loaders: a page of N items costs one query per nested field,
 * not N (design reference 7.3, contract 5). Row-level security still applies to every load.
 */
@Injectable()
export class Loaders {
  constructor(private readonly db: DbContext) {}

  user(id: string): Promise<UserRecord | null> {
    return this.db.loaders
      .get<string, UserRecord | null>('user', async (ids) =>
        byId(
          ids,
          await this.db.tx.$queryRaw<UserRecord[]>`
            SELECT id, display_name AS "displayName", email FROM users WHERE id = ANY(${ids}::uuid[])`,
        ),
      )
      .load(id);
  }

  status(id: string): Promise<StatusRecord | null> {
    return this.db.loaders
      .get<string, StatusRecord | null>('status', async (ids) =>
        byId(
          ids,
          await this.db.tx.$queryRaw<StatusRecord[]>`
            SELECT id, name, is_closed AS "isClosed", position FROM project_statuses WHERE id = ANY(${ids}::uuid[])`,
        ),
      )
      .load(id);
  }

  project(id: string): Promise<ProjectKeyRecord | null> {
    return this.db.loaders
      .get<string, ProjectKeyRecord | null>('project', async (ids) =>
        byId(
          ids,
          await this.db.tx.$queryRaw<ProjectKeyRecord[]>`
            SELECT id, key, name, description, state = 'archived' AS "isArchived", created_at AS "createdAt"
            FROM projects WHERE id = ANY(${ids}::uuid[])`,
        ),
      )
      .load(id);
  }

  labelsOf(taskId: string): Promise<LabelRecord[]> {
    return this.db.loaders
      .get<string, LabelRecord[]>('labelsOfTask', async (taskIds) => {
        const rows = await this.db.tx.$queryRaw<(LabelRecord & { taskId: string })[]>`
          SELECT tl.task_id AS "taskId", l.id, l.name, l.color, l.archived_at IS NOT NULL AS "isArchived"
          FROM task_labels tl JOIN labels l ON l.org_id = tl.org_id AND l.id = tl.label_id
          WHERE tl.task_id = ANY(${taskIds}::uuid[])
          ORDER BY l.name, l.id`;
        return taskIds.map((taskId) =>
          rows.filter((row) => row.taskId === taskId).map(({ taskId: _taskId, ...label }) => label),
        );
      })
      .load(taskId);
  }
}
