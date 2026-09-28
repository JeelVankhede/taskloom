import { describe, expect, it } from 'vitest';
import type { TaskCardFieldsFragment } from '../../generated/graphql';
import {
  type BoardFilters,
  matchesFilters,
  NO_FILTERS,
  parseFilters,
  todayIn,
  toTaskFilter,
  writeFilters,
} from './filters';

const A = '0193a1b2-0000-7000-8000-00000000000a';
const B = '0193a1b2-0000-7000-8000-00000000000b';
const L = '0193a1b2-0000-7000-8000-0000000000aa';

describe('URL round trip', () => {
  it('reads what it writes, and keeps unrelated parameters', () => {
    const filters: BoardFilters = {
      assigneeIds: [A],
      unassigned: true,
      priorities: ['URGENT', 'NONE'],
      labelIds: [L],
      dueFrom: '2026-01-01',
      dueTo: '2026-01-31',
      overdue: true,
      state: 'open',
    };
    const params = writeFilters(new URLSearchParams('task=ENG-12'), filters);
    expect(params.get('task')).toBe('ENG-12');
    expect(parseFilters(params)).toEqual(filters);
  });

  it('writes nothing for no filters', () => {
    expect(writeFilters(new URLSearchParams(), NO_FILTERS).toString()).toBe('');
  });

  it('ignores invalid values from a hand-edited URL', () => {
    const f = parseFilters(
      new URLSearchParams(
        'assignee=nope,none&priority=BIG,HIGH&from=2026-13&state=done&overdue=yes',
      ),
    );
    expect(f).toEqual({ ...NO_FILTERS, unassigned: true, priorities: ['HIGH'] });
  });
});

describe('toTaskFilter', () => {
  it('always names the project and adds only the set filters', () => {
    expect(toTaskFilter(NO_FILTERS, 'p1')).toEqual({ projectIds: ['p1'] });
    expect(
      toTaskFilter({ ...NO_FILTERS, unassigned: true, state: 'closed', labelIds: [L] }, 'p1'),
    ).toEqual({ projectIds: ['p1'], includeUnassigned: true, isClosed: true, labelsAny: [L] });
  });
});

describe('matchesFilters (mirrors the API rules)', () => {
  const task: TaskCardFieldsFragment = {
    id: 't',
    identifier: 'ENG-1',
    title: 'x',
    priority: 'HIGH',
    dueDate: '2026-09-20',
    isClosed: false,
    status: { id: 's' },
    assignee: { id: A, displayName: 'Ada' },
    labels: [{ id: L, name: 'bug', color: 'red' }],
  };
  const today = '2026-09-27';
  it.each<[string, Partial<BoardFilters>, boolean]>([
    ['no filters', {}, true],
    ['its assignee', { assigneeIds: [A] }, true],
    ['another assignee', { assigneeIds: [B] }, false],
    ['unassigned only', { unassigned: true }, false],
    ['another assignee or unassigned', { assigneeIds: [B], unassigned: true }, false],
    ['its priority', { priorities: ['HIGH', 'LOW'] }, true],
    ['other priorities', { priorities: ['NONE'] }, false],
    ['its label', { labelIds: [L] }, true],
    ['due inside the range', { dueFrom: '2026-09-20', dueTo: '2026-09-20' }, true],
    ['due before the range', { dueFrom: '2026-09-21' }, false],
    ['overdue', { overdue: true }, true],
    ['open', { state: 'open' }, true],
    ['closed', { state: 'closed' }, false],
  ])('%s: %s', (_label, change, expected) => {
    expect(matchesFilters(task, { ...NO_FILTERS, ...change }, today)).toBe(expected);
  });

  it('matches an unassigned task only when unassigned is included', () => {
    const none = { ...task, assignee: null };
    expect(matchesFilters(none, { ...NO_FILTERS, assigneeIds: [A] }, today)).toBe(false);
    expect(matchesFilters(none, { ...NO_FILTERS, assigneeIds: [A], unassigned: true }, today)).toBe(
      true,
    );
  });

  it('never counts a task due today, or a closed one, as overdue', () => {
    const f = { ...NO_FILTERS, overdue: true };
    expect(matchesFilters({ ...task, dueDate: today }, f, today)).toBe(false);
    expect(matchesFilters({ ...task, isClosed: true }, f, today)).toBe(false);
  });
});

describe('todayIn', () => {
  it('uses the organization timezone, not the browser’s', () => {
    const instant = new Date('2026-09-27T20:00:00Z');
    expect(todayIn('UTC', instant)).toBe('2026-09-27');
    expect(todayIn('Asia/Kolkata', instant)).toBe('2026-09-28');
    expect(todayIn('America/Los_Angeles', instant)).toBe('2026-09-27');
    expect(todayIn('Pacific/Kiritimati', new Date('2026-12-31T10:00:00Z'))).toBe('2027-01-01');
  });
});
