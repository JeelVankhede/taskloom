import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DbContext } from '../../platform/database/db-context.js';

/** A task as the GraphQL Task parent. Priority 0 means NONE (SQL NULL). */
export interface TaskRow {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  priority: number;
  dueDate: string;
  statusId: string;
  assigneeId: string | null;
  isClosed: boolean;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  createdById: string;
  rank: string;
}

/** The columns every task query selects, from alias t. Due date stays a string. */
export const TASK_COLUMNS = Prisma.sql`
  t.id, t.project_id AS "projectId", t.number, t.title, t.description,
  coalesce(t.priority, 0)::int AS priority, t.due_date::text AS "dueDate", t.status_id AS "statusId",
  t.assignee_id AS "assigneeId", t.is_closed AS "isClosed", t.closed_at AS "closedAt",
  t.created_at AS "createdAt", t.updated_at AS "updatedAt", t.archived_at AS "archivedAt",
  t.created_by AS "createdById", t.rank`;

export interface NewTask {
  projectId: string;
  title: string;
  description: string | null;
  statusId: string;
  /** 0 to 4; 0 is NONE. */
  priority: number;
  assigneeId: string | null;
  dueDate: string;
}

@Injectable()
export class TaskRepository {
  constructor(private readonly db: DbContext) {}

  async find(id: string): Promise<TaskRow | undefined> {
    const [row] = await this.db.tx.$queryRaw<TaskRow[]>`
      SELECT ${TASK_COLUMNS} FROM tasks t WHERE t.org_id = ${this.db.orgId}::uuid AND t.id = ${id}::uuid`;
    return row;
  }

  /**
   * The insert trigger allocates the number and the top-of-column rank, derives is_closed,
   * and guards the status and assignee. Due date stays a date string end to end.
   */
  async insert(task: NewTask): Promise<{ id: string; number: number }> {
    const [row] = await this.db.tx.$queryRaw<{ id: string; number: number }[]>`
      INSERT INTO tasks (org_id, project_id, title, description, status_id, priority, assignee_id, due_date, created_by)
      VALUES (${this.db.orgId}::uuid, ${task.projectId}::uuid, ${task.title}, ${task.description},
              ${task.statusId}::uuid, ${task.priority === 0 ? null : task.priority}::smallint,
              ${task.assigneeId}::uuid, ${task.dueDate}::date, ${this.db.userId}::uuid)
      RETURNING id, number`;
    return row!;
  }

  async applyLabels(taskId: string, labelIds: string[]): Promise<void> {
    if (labelIds.length === 0) return;
    await this.db.tx.$executeRaw`
      INSERT INTO task_labels (org_id, task_id, label_id)
      SELECT ${this.db.orgId}::uuid, ${taskId}::uuid, label_id FROM unnest(${labelIds}::uuid[]) AS label_id`;
  }

  /** Live and archived labels among the ids, so the service can tell unknown from archived. */
  labels(ids: string[]): Promise<{ id: string; archived: boolean }[]> {
    return this.db.tx.$queryRaw<{ id: string; archived: boolean }[]>`
      SELECT id, archived_at IS NOT NULL AS archived FROM labels
      WHERE org_id = ${this.db.orgId}::uuid AND id = ANY(${ids}::uuid[])`;
  }
}
