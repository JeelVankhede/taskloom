import { Prisma } from '../../generated/prisma/client.js';

/** TaskFilter after enum mapping: priorities are 0 (NONE) to 4. */
export interface TaskFilterInput {
  projectIds?: string[] | null;
  statusIds?: string[] | null;
  assigneeIds?: string[] | null;
  includeUnassigned?: boolean | null;
  priorities?: number[] | null;
  dueFrom?: string | null;
  dueTo?: string | null;
  labelsAny?: string[] | null;
  labelsAll?: string[] | null;
  isClosed?: boolean | null;
  overdueOnly?: boolean | null;
  includeArchived?: boolean | null;
}

/** Per-request facts, read once: today in the org's timezone and its archived projects. */
export interface FilterContext {
  orgId: string;
  today: string;
  inactiveProjectIds: string[];
}

/**
 * The single overdue definition (docs/1.2-data-model.md section 3.1): open, not archived,
 * due before today in the org's timezone, in an active project. No join to projects.
 */
export function overdueSql(ctx: FilterContext): Prisma.Sql {
  return Prisma.sql`(NOT t.is_closed AND t.archived_at IS NULL AND t.due_date < ${ctx.today}::date
    AND t.project_id <> ALL (${ctx.inactiveProjectIds}::uuid[]))`;
}

const idList = (ids: string[]) => Prisma.sql`${ids}::uuid[]`;

/**
 * The one WHERE clause shared by tasks, taskSummary, board, and boardColumn, so they can never
 * disagree about scope. Fields combine with AND; lists with OR, except labelsAll. Every clause
 * starts with org_id, the leading column of every index (1.2 section 4.1).
 */
export function taskWhere(filter: TaskFilterInput, ctx: FilterContext): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`t.org_id = ${ctx.orgId}::uuid`];

  if (!filter.includeArchived) {
    // Literal predicate, so the partial "live" indexes match.
    parts.push(Prisma.sql`t.archived_at IS NULL`);
    parts.push(Prisma.sql`t.project_id <> ALL (${ctx.inactiveProjectIds}::uuid[])`);
  }
  if (filter.projectIds) {
    parts.push(
      filter.projectIds.length === 1
        ? Prisma.sql`t.project_id = ${filter.projectIds[0]}::uuid`
        : Prisma.sql`t.project_id = ANY (${idList(filter.projectIds)})`,
    );
  }
  if (filter.statusIds) parts.push(Prisma.sql`t.status_id = ANY (${idList(filter.statusIds)})`);

  if (filter.assigneeIds && filter.includeUnassigned) {
    parts.push(
      Prisma.sql`(t.assignee_id = ANY (${idList(filter.assigneeIds)}) OR t.assignee_id IS NULL)`,
    );
  } else if (filter.assigneeIds) {
    parts.push(Prisma.sql`t.assignee_id = ANY (${idList(filter.assigneeIds)})`);
  } else if (filter.includeUnassigned) {
    parts.push(Prisma.sql`t.assignee_id IS NULL`);
  }

  if (filter.priorities) {
    const values = filter.priorities.filter((p) => p !== 0);
    const withNone = filter.priorities.includes(0);
    parts.push(
      withNone
        ? Prisma.sql`(t.priority IS NULL OR t.priority = ANY (${values}::smallint[]))`
        : Prisma.sql`t.priority = ANY (${values}::smallint[])`,
    );
  }
  if (filter.dueFrom) parts.push(Prisma.sql`t.due_date >= ${filter.dueFrom}::date`);
  if (filter.dueTo) parts.push(Prisma.sql`t.due_date <= ${filter.dueTo}::date`);

  if (filter.labelsAny) {
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM task_labels tl
      WHERE tl.org_id = t.org_id AND tl.task_id = t.id AND tl.label_id = ANY (${idList(filter.labelsAny)}))`);
  }
  if (filter.labelsAll) {
    const all = [...new Set(filter.labelsAll)];
    parts.push(Prisma.sql`(SELECT count(*) FROM task_labels tl
      WHERE tl.org_id = t.org_id AND tl.task_id = t.id AND tl.label_id = ANY (${idList(all)})) = ${all.length}`);
  }
  if (filter.isClosed !== null && filter.isClosed !== undefined) {
    parts.push(Prisma.sql`t.is_closed = ${filter.isClosed}`);
  }
  if (filter.overdueOnly) parts.push(overdueSql(ctx));

  return Prisma.join(parts, ' AND ');
}
