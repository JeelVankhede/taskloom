import { Injectable } from '@nestjs/common';
import { Capability, ErrorCode } from '@taskloom/contracts';
import { DbContext } from '../../platform/database/db-context.js';
import { DomainError, notFound } from '../../platform/errors/domain-error.js';
import { assertId } from '../../platform/graphql/ids.js';
import {
  type Connection,
  decodeCursor,
  pageSize,
  toConnection,
} from '../../platform/pagination/connection.js';
import { ProjectRepository, type ProjectRow } from '../project/project.repository.js';
import { type TaskFilterInput, taskWhere } from './task-filter.js';
import {
  ORDERS,
  type StatusRecord,
  type SummaryRow,
  type TaskOrder,
  TaskQueryRepository,
} from './task-query.repository.js';
import type { TaskRow } from './task.repository.js';

export interface Counts {
  total: number;
  open: number;
  overdue: number;
}

export interface TaskSummary extends Counts {
  closed: number;
  byStatus: (Counts & { status: StatusRecord })[] | null;
  byPriority: (Counts & { priority: number })[];
  byAssignee: (Counts & { userId: string | null })[];
}

export interface BoardResult {
  project: ProjectRow;
  columns: { status: StatusRecord; tasks: Connection<TaskRow> }[];
}

/** Priorities in output order: URGENT, HIGH, MEDIUM, LOW, NONE (0). */
const PRIORITY_ORDER = [1, 2, 3, 4, 0];
const zero = (): Counts => ({ total: 0, open: 0, overdue: 0 });
const counts = (row: SummaryRow): Counts => ({
  total: row.total,
  open: row.open,
  overdue: row.overdue,
});

/**
 * The Task 2.1 read API. tasks, taskSummary, board, and boardColumn share one WHERE builder and
 * run in one REPEATABLE READ READ ONLY snapshot, so the summary always matches the list (T22).
 */
@Injectable()
export class TaskQueryService {
  constructor(
    private readonly repo: TaskQueryRepository,
    private readonly projects: ProjectRepository,
    private readonly db: DbContext,
  ) {}

  async tasks(
    filter: TaskFilterInput | null,
    order: TaskOrder,
    first: number | null,
    after: string | null,
  ): Promise<Connection<TaskRow>> {
    this.db.require(Capability.READ_ORG);
    const clean = checkedFilter(filter);
    if (order === 'RANK' && clean.projectIds?.length !== 1) {
      throw new DomainError(
        ErrorCode.INVALID_ORDER,
        'RANK order needs exactly one project in the filter',
      );
    }
    return this.page(clean, order, first, after);
  }

  async summary(filter: TaskFilterInput | null): Promise<TaskSummary> {
    this.db.require(Capability.READ_ORG);
    const clean = checkedFilter(filter);
    const ctx = await this.repo.context();
    const rows = await this.repo.summary(taskWhere(clean, ctx), ctx);

    const grand = rows.find((r) => r.gStatus && r.gAssignee && r.gPriority);
    const totals = grand ? counts(grand) : zero();
    const statusRows = rows.filter((r) => !r.gStatus);
    const priorityRows = rows.filter((r) => !r.gPriority);
    const assigneeRows = rows.filter((r) => !r.gAssignee);

    let byStatus: TaskSummary['byStatus'] = null;
    if (clean.projectIds?.length === 1) {
      const statuses = await this.repo.liveStatuses(clean.projectIds[0]!);
      byStatus = statuses.map((status) => {
        const row = statusRows.find((r) => r.statusId === status.id);
        return { status, ...(row ? counts(row) : zero()) };
      });
    }
    const byPriority = PRIORITY_ORDER.map((priority) => {
      const row = priorityRows.find((r) => (r.priority ?? 0) === priority);
      return { priority, ...(row ? counts(row) : zero()) };
    });
    const byAssignee = assigneeRows
      .map((row) => ({ userId: row.assigneeId, ...counts(row) }))
      .sort((a, b) => (a.userId === null ? 1 : b.userId === null ? -1 : b.total - a.total));

    return { ...totals, closed: totals.total - totals.open, byStatus, byPriority, byAssignee };
  }

  async board(
    projectId: string,
    filter: TaskFilterInput | null,
    first: number | null,
  ): Promise<BoardResult> {
    this.db.require(Capability.READ_ORG);
    const clean = checkedFilter(filter);
    const project = await this.visibleProject(projectId, clean);
    const ctx = await this.repo.context();
    const size = pageSize(first);
    const rows = await this.repo.board(
      project.id,
      taskWhere({ ...clean, projectIds: [project.id] }, ctx),
      size + 1,
    );

    // Rows arrive ordered by column position then rank; an empty column is one row without a task.
    const byColumn = new Map<string, { status: StatusRecord; rows: TaskRow[] }>();
    for (const row of rows) {
      let column = byColumn.get(row.columnId);
      if (!column) {
        column = {
          status: {
            id: row.columnId,
            name: row.columnName,
            isClosed: row.columnIsClosed,
            position: row.columnPosition,
          },
          rows: [],
        };
        byColumn.set(row.columnId, column);
      }
      if (row.id) column.rows.push(row as TaskRow);
    }
    const columns = [...byColumn.values()].map(({ status, rows: tasks }) => ({
      status,
      tasks: toConnection(tasks, size, ORDERS.RANK.key),
    }));
    return { project, columns };
  }

  async boardColumn(
    projectId: string,
    statusId: string,
    filter: TaskFilterInput | null,
    first: number | null,
    after: string | null,
  ): Promise<Connection<TaskRow>> {
    this.db.require(Capability.READ_ORG);
    const clean = checkedFilter(filter);
    const project = await this.visibleProject(projectId, clean);
    const statuses = await this.repo.liveStatuses(project.id);
    if (!statuses.some((status) => status.id === assertId(statusId, 'status')))
      throw notFound('status');
    return this.page(
      { ...clean, projectIds: [project.id], statusIds: [statusId] },
      'RANK',
      first,
      after,
    );
  }

  /** ENG-12, any letter case, spaces trimmed. Anything malformed is NOT_FOUND. */
  async byIdentifier(identifier: string): Promise<TaskRow> {
    this.db.require(Capability.READ_ORG);
    const match = /^([A-Z][A-Z0-9]{2})-([1-9]\d{0,9})$/.exec(identifier.trim().toUpperCase());
    if (!match) throw notFound('task');
    const project = await this.projects.findByKey(match[1]!);
    const task = project ? await this.repo.findByNumber(project.id, Number(match[2])) : undefined;
    if (!task) throw notFound('task');
    return task;
  }

  private async page(
    filter: TaskFilterInput,
    order: TaskOrder,
    first: number | null,
    after: string | null,
  ): Promise<Connection<TaskRow>> {
    const spec = ORDERS[order];
    const cursor = after ? decodeCursor(after, spec.cursorTypes) : undefined;
    if (cursor && cursor[0] !== order) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Cursor belongs to a different order');
    }
    const ctx = await this.repo.context();
    const size = pageSize(first);
    const rows = await this.repo.list(taskWhere(filter, ctx), order, size + 1, cursor);
    return toConnection(rows, size, spec.key);
  }

  /** An archived project's board is visible only with includeArchived. */
  private async visibleProject(projectId: string, filter: TaskFilterInput): Promise<ProjectRow> {
    const project = await this.projects.find(assertId(projectId, 'project'));
    if (!project || (project.isArchived && !filter.includeArchived)) throw notFound('project');
    return project;
  }
}

/** Ids in a filter must be uuids; anything else cannot name a row (NOT_FOUND). */
function checkedFilter(filter: TaskFilterInput | null): TaskFilterInput {
  const clean: TaskFilterInput = { ...(filter ?? {}) };
  for (const key of ['projectIds', 'statusIds', 'assigneeIds', 'labelsAny', 'labelsAll'] as const) {
    clean[key]?.forEach((id) => assertId(id, key));
  }
  return clean;
}
