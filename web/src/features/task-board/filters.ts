import type { Priority } from '@taskloom/contracts';
import type { TaskCardFieldsFragment, TaskFilter } from '../../generated/graphql';

/**
 * Board filters as they live in the URL (shareable, survive reload). Only valid values are read;
 * anything else in the URL is ignored.
 *
 *   ?assignee=<id>,<id>,none  &priority=URGENT,HIGH  &label=<id>  &from=2026-01-01  &to=2026-01-31
 *   &overdue=1  &state=open|closed
 */
export interface BoardFilters {
  assigneeIds: string[];
  /** "none" in the URL: unassigned tasks. */
  unassigned: boolean;
  priorities: Priority[];
  labelIds: string[];
  dueFrom: string | null;
  dueTo: string | null;
  overdue: boolean;
  state: 'all' | 'open' | 'closed';
}

export const NO_FILTERS: BoardFilters = {
  assigneeIds: [],
  unassigned: false,
  priorities: [],
  labelIds: [],
  dueFrom: null,
  dueTo: null,
  overdue: false,
  state: 'all',
};

export const PRIORITIES: readonly Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const list = (params: URLSearchParams, key: string) =>
  (params.get(key) ?? '').split(',').filter(Boolean);
const unique = <T>(values: T[]) => [...new Set(values)];

export function parseFilters(params: URLSearchParams): BoardFilters {
  const assignees = list(params, 'assignee');
  const from = params.get('from');
  const to = params.get('to');
  const state = params.get('state');
  return {
    assigneeIds: unique(assignees.filter((id) => UUID.test(id))),
    unassigned: assignees.includes('none'),
    priorities: PRIORITIES.filter((p) => list(params, 'priority').includes(p)),
    labelIds: unique(list(params, 'label').filter((id) => UUID.test(id))),
    dueFrom: from && DATE.test(from) ? from : null,
    dueTo: to && DATE.test(to) ? to : null,
    overdue: params.get('overdue') === '1',
    state: state === 'open' || state === 'closed' ? state : 'all',
  };
}

/** Writes the filters into `params`, leaving every other parameter (for example ?task=) alone. */
export function writeFilters(params: URLSearchParams, filters: BoardFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null) =>
    value ? next.set(key, value) : next.delete(key);
  set('assignee', [...filters.assigneeIds, ...(filters.unassigned ? ['none'] : [])].join(','));
  set('priority', filters.priorities.join(','));
  set('label', filters.labelIds.join(','));
  set('from', filters.dueFrom);
  set('to', filters.dueTo);
  set('overdue', filters.overdue ? '1' : null);
  set('state', filters.state === 'all' ? null : filters.state);
  return next;
}

export const isFiltered = (f: BoardFilters): boolean =>
  JSON.stringify(f) !== JSON.stringify(NO_FILTERS);

/** The API filter for one project. The board and the summary use exactly this value. */
export function toTaskFilter(f: BoardFilters, projectId: string): TaskFilter {
  return {
    projectIds: [projectId],
    ...(f.assigneeIds.length ? { assigneeIds: f.assigneeIds } : {}),
    ...(f.unassigned ? { includeUnassigned: true } : {}),
    ...(f.priorities.length ? { priorities: f.priorities } : {}),
    ...(f.labelIds.length ? { labelsAny: f.labelIds } : {}),
    ...(f.dueFrom ? { dueFrom: f.dueFrom } : {}),
    ...(f.dueTo ? { dueTo: f.dueTo } : {}),
    ...(f.overdue ? { overdueOnly: true } : {}),
    ...(f.state !== 'all' ? { isClosed: f.state === 'closed' } : {}),
  };
}

/**
 * Whether a newly created task belongs on the current board, by the same rules the API applies
 * (design reference 7.4). Used only to place a created task without refetching the board.
 */
export function matchesFilters(
  task: TaskCardFieldsFragment,
  f: BoardFilters,
  today: string,
): boolean {
  if (f.assigneeIds.length || f.unassigned) {
    const assigned = task.assignee ? f.assigneeIds.includes(task.assignee.id) : f.unassigned;
    if (!assigned) return false;
  }
  if (f.priorities.length && !f.priorities.includes(task.priority)) return false;
  if (f.labelIds.length && !task.labels.some((l) => f.labelIds.includes(l.id))) return false;
  if (f.dueFrom && task.dueDate < f.dueFrom) return false;
  if (f.dueTo && task.dueDate > f.dueTo) return false;
  if (f.state !== 'all' && task.isClosed !== (f.state === 'closed')) return false;
  if (f.overdue && (task.isClosed || task.dueDate >= today)) return false;
  return true;
}

/** Today (YYYY-MM-DD) in an IANA timezone: the organization's, which decides overdue. */
export function todayIn(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
