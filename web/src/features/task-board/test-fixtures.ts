import type { Priority } from '@taskloom/contracts';
import {
  BoardColumnDocument,
  BoardOptionsDocument,
  BoardProjectDocument,
  type TaskCardFieldsFragment,
  type TaskFilter,
  TaskBoardDocument,
  TaskSummaryDocument,
} from '../../generated/graphql';

/** Test data for the board: builders for the operations TaskBoardPage runs. */
export const PROJECT_ID = 'p-eng';
export const TODAY_UTC = new Date().toISOString().slice(0, 10);

export const STATUSES = [
  { __typename: 'Status' as const, id: 's-todo', name: 'Todo', isClosed: false, position: 1 },
  { __typename: 'Status' as const, id: 's-done', name: 'Done', isClosed: true, position: 2 },
];

let n = 0;
export function task(over: Partial<TaskCardFieldsFragment> & { statusId?: string } = {}) {
  n += 1;
  const { statusId = 's-todo', ...rest } = over;
  return {
    __typename: 'Task' as const,
    id: `t-${n}`,
    identifier: `ENG-${n}`,
    title: `Task ${n}`,
    priority: 'MEDIUM' as Priority,
    dueDate: '2099-01-01',
    isClosed: statusId === 's-done',
    status: { __typename: 'Status' as const, id: statusId },
    assignee: null,
    labels: [],
    ...rest,
  };
}

type Task = ReturnType<typeof task>;

const page = (tasks: Task[], hasNextPage = false) => ({
  __typename: 'TaskConnection' as const,
  edges: tasks.map((node) => ({ __typename: 'TaskEdge' as const, cursor: `c-${node.id}`, node })),
  pageInfo: {
    __typename: 'PageInfo' as const,
    hasNextPage,
    endCursor: tasks.length ? `c-${tasks.at(-1)!.id}` : null,
  },
});

export function summary(
  tasks: Task[],
  counts: Partial<Record<'total' | 'open' | 'overdue', number>> = {},
) {
  const priorities: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];
  const open = tasks.filter((t) => !t.isClosed).length;
  return {
    __typename: 'TaskSummary' as const,
    total: counts.total ?? tasks.length,
    open: counts.open ?? open,
    closed: (counts.total ?? tasks.length) - (counts.open ?? open),
    overdue: counts.overdue ?? 0,
    byStatus: STATUSES.map((s) => ({
      __typename: 'StatusCount' as const,
      status: { __typename: 'Status' as const, id: s.id },
      total: tasks.filter((t) => t.status.id === s.id).length,
    })),
    byPriority: priorities.map((p) => ({
      __typename: 'PriorityCount' as const,
      priority: p,
      total: tasks.filter((t) => t.priority === p).length,
    })),
  };
}

export const filterFor = (extra: Partial<TaskFilter> = {}): TaskFilter => ({
  projectIds: [PROJECT_ID],
  ...extra,
});

export function projectMock(key = 'ENG', timezone = 'UTC') {
  return {
    request: { query: BoardProjectDocument, variables: { key } },
    result: {
      data: {
        projectByKey: {
          __typename: 'Project' as const,
          id: PROJECT_ID,
          key,
          name: 'Engineering',
          isArchived: false,
        },
        organization: { __typename: 'Organization' as const, id: 'org-acme', timezone },
      },
    },
  };
}

export function optionsMock() {
  return {
    request: { query: BoardOptionsDocument, variables: { first: 100 } },
    result: {
      data: {
        labels: [{ __typename: 'Label' as const, id: 'l-bug', name: 'bug', color: 'red' }],
        organization: {
          __typename: 'Organization' as const,
          id: 'org-acme',
          members: {
            __typename: 'MemberConnection' as const,
            edges: [
              {
                __typename: 'MemberEdge' as const,
                node: {
                  __typename: 'Member' as const,
                  status: 'ACTIVE' as const,
                  user: { __typename: 'User' as const, id: 'u-ada', displayName: 'Ada Lovelace' },
                },
              },
            ],
          },
        },
      },
    },
  };
}

export function boardMock(
  tasks: Task[],
  options: { filter?: TaskFilter; hasNext?: string[]; counts?: Parameters<typeof summary>[1] } = {},
) {
  const filter = options.filter ?? filterFor();
  return {
    request: { query: TaskBoardDocument, variables: { projectId: PROJECT_ID, filter, first: 50 } },
    result: {
      data: {
        board: {
          __typename: 'Board' as const,
          columns: STATUSES.map((status) => ({
            __typename: 'BoardColumn' as const,
            status,
            tasks: page(
              tasks.filter((t) => t.status.id === status.id),
              options.hasNext?.includes(status.id),
            ),
          })),
        },
        taskSummary: summary(tasks, options.counts),
      },
    },
  };
}

export function summaryMock(tasks: Task[], filter = filterFor()) {
  return {
    request: { query: TaskSummaryDocument, variables: { filter } },
    result: { data: { taskSummary: summary(tasks) } },
  };
}

export function columnMock(statusId: string, after: string, tasks: Task[], hasNext = false) {
  return {
    request: {
      query: BoardColumnDocument,
      variables: { projectId: PROJECT_ID, statusId, filter: filterFor(), first: 50, after },
    },
    result: { data: { boardColumn: page(tasks, hasNext) } },
  };
}
