import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DbContext } from '../../platform/database/db-context.js';
import { type FilterContext, overdueSql } from './task-filter.js';
import { TASK_COLUMNS, type TaskRow } from './task.repository.js';

export type TaskOrder = 'CREATED_AT' | 'DUE_DATE' | 'PRIORITY' | 'RANK';
type CursorValue = string | number;

interface OrderSpec {
  /** ORDER BY, matching one index (design reference 7.2). */
  orderBy: Prisma.Sql;
  /** Keyset condition for rows after the cursor values (cursor[0] is the order name). */
  after(cursor: CursorValue[]): Prisma.Sql;
  key(row: TaskRow): CursorValue[];
  cursorTypes: ('string' | 'number')[];
}

/** Every order has a unique tiebreaker and an index, and the cursor carries the order name. */
export const ORDERS: Record<TaskOrder, OrderSpec> = {
  CREATED_AT: {
    // UUIDv7 ids are time-ordered: newest first is id descending (tasks_project_created).
    orderBy: Prisma.sql`t.id DESC`,
    after: (c) => Prisma.sql`t.id < ${c[1]}::uuid`,
    key: (row) => ['CREATED_AT', row.id],
    cursorTypes: ['string', 'string'],
  },
  DUE_DATE: {
    orderBy: Prisma.sql`t.due_date, t.id`,
    after: (c) => Prisma.sql`(t.due_date, t.id) > (${c[1]}::date, ${c[2]}::uuid)`,
    key: (row) => ['DUE_DATE', row.dueDate, row.id],
    cursorTypes: ['string', 'string', 'string'],
  },
  PRIORITY: {
    // No priority last, matching the coalesce(priority, 5) expression index.
    orderBy: Prisma.sql`coalesce(t.priority, 5), t.id`,
    after: (c) => Prisma.sql`(coalesce(t.priority, 5), t.id) > (${c[1]}::int, ${c[2]}::uuid)`,
    key: (row) => ['PRIORITY', row.priority === 0 ? 5 : row.priority, row.id],
    cursorTypes: ['string', 'number', 'string'],
  },
  RANK: {
    // Rank is unique per project, so it is a complete cursor on its own.
    orderBy: Prisma.sql`t.rank`,
    after: (c) => Prisma.sql`t.rank > ${c[1]}`,
    key: (row) => ['RANK', row.rank],
    cursorTypes: ['string', 'string'],
  },
};

export interface StatusRecord {
  id: string;
  name: string;
  isClosed: boolean;
  position: number;
}

export interface SummaryRow {
  statusId: string | null;
  assigneeId: string | null;
  priority: number | null;
  gStatus: number;
  gAssignee: number;
  gPriority: number;
  total: number;
  open: number;
  overdue: number;
}

export interface BoardRow extends Partial<TaskRow> {
  columnId: string;
  columnName: string;
  columnIsClosed: boolean;
  columnPosition: number;
}

/** The list statement. Exported so the plan tests (T24) EXPLAIN exactly what runs. */
export function listSql(
  where: Prisma.Sql,
  order: TaskOrder,
  limit: number,
  cursor?: CursorValue[],
): Prisma.Sql {
  const spec = ORDERS[order];
  const after = cursor ? Prisma.sql`AND ${spec.after(cursor)}` : Prisma.empty;
  return Prisma.sql`
    SELECT ${TASK_COLUMNS} FROM tasks t
    WHERE ${where} ${after}
    ORDER BY ${spec.orderBy}
    LIMIT ${limit}`;
}

/**
 * Every breakdown in one statement (1.2 section 3.4), so each sums to the total. GROUPING()
 * separates a real NULL (unassigned, no priority) from a grouping-set NULL. Exported for T27.
 */
export function summarySql(where: Prisma.Sql, ctx: FilterContext): Prisma.Sql {
  return Prisma.sql`
    SELECT t.status_id AS "statusId", t.assignee_id AS "assigneeId", t.priority::int AS priority,
           GROUPING(t.status_id)::int AS "gStatus", GROUPING(t.assignee_id)::int AS "gAssignee",
           GROUPING(t.priority)::int AS "gPriority",
           count(*)::int AS total,
           (count(*) FILTER (WHERE NOT t.is_closed))::int AS open,
           (count(*) FILTER (WHERE ${overdueSql(ctx)}))::int AS overdue
    FROM tasks t
    WHERE ${where}
    GROUP BY GROUPING SETS ((t.status_id), (t.assignee_id), (t.priority), ())`;
}

@Injectable()
export class TaskQueryRepository {
  constructor(private readonly db: DbContext) {}

  /** Today in the org's timezone and its archived projects: one statement, once per request. */
  context(): Promise<FilterContext> {
    return this.db.loaders.memo('filterContext', async () => {
      const [row] = await this.db.tx.$queryRaw<{ today: string; inactive: string[] }[]>`
        SELECT (now() AT TIME ZONE s.timezone)::date::text AS today,
               coalesce((SELECT array_agg(p.id::text) FROM projects p WHERE p.state = 'archived'), '{}') AS inactive
        FROM organization_settings s`;
      return { orgId: this.db.orgId, today: row!.today, inactiveProjectIds: row!.inactive };
    });
  }

  list(
    where: Prisma.Sql,
    order: TaskOrder,
    limit: number,
    cursor?: CursorValue[],
  ): Promise<TaskRow[]> {
    return this.db.tx.$queryRaw<TaskRow[]>(listSql(where, order, limit, cursor));
  }

  summary(where: Prisma.Sql, ctx: FilterContext): Promise<SummaryRow[]> {
    return this.db.tx.$queryRaw<SummaryRow[]>(summarySql(where, ctx));
  }

  /** Live statuses of a project, in column order. */
  liveStatuses(projectId: string): Promise<StatusRecord[]> {
    return this.db.tx.$queryRaw<StatusRecord[]>`
      SELECT id, name, is_closed AS "isClosed", position FROM project_statuses
      WHERE org_id = ${this.db.orgId}::uuid AND project_id = ${projectId}::uuid AND archived_at IS NULL
      ORDER BY position, id`;
  }

  /**
   * The first page of every live column in one statement (1.2 section 3.3): each column is an
   * ordered range scan on tasks_board, so cost is columns times page size, not project size.
   */
  board(projectId: string, where: Prisma.Sql, limit: number): Promise<BoardRow[]> {
    return this.db.tx.$queryRaw<BoardRow[]>`
      SELECT s.id AS "columnId", s.name AS "columnName", s.is_closed AS "columnIsClosed",
             s.position AS "columnPosition", x.*
      FROM project_statuses s
      LEFT JOIN LATERAL (
        SELECT ${TASK_COLUMNS} FROM tasks t
        WHERE ${where} AND t.status_id = s.id
        ORDER BY t.rank
        LIMIT ${limit}
      ) x ON true
      WHERE s.org_id = ${this.db.orgId}::uuid AND s.project_id = ${projectId}::uuid AND s.archived_at IS NULL
      ORDER BY s.position, s.id, x.rank`;
  }

  async findByNumber(projectId: string, number: number): Promise<TaskRow | undefined> {
    const [row] = await this.db.tx.$queryRaw<TaskRow[]>`
      SELECT ${TASK_COLUMNS} FROM tasks t
      WHERE t.org_id = ${this.db.orgId}::uuid AND t.project_id = ${projectId}::uuid AND t.number = ${number}`;
    return row;
  }
}
