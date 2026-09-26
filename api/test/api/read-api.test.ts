import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committed } from '../db/support/db.js';
import {
  addMember,
  createOrg,
  createProject,
  createUser,
  type OrgFixture,
} from '../db/support/fixtures.js';
import { codeOf, startApp, type TestApp } from './support/app.js';
import { createLabel, insertTasks } from './support/tasks.js';

let api: TestApp;
let org: OrgFixture;
let memberId: string;
let labels: { bug: string; ui: string };
let ids: Record<string, string>;

/*
 * A dataset where every filter has a known answer. Organization timezone is UTC; 2020 dates are
 * past (overdue when open), 2099 dates are future.
 *   A  Todo         URGENT  owner   2020-01-01  bug      open, overdue
 *   B  Todo         NONE    -       2099-01-01  bug, ui  open
 *   C  In Progress  HIGH    member  2099-02-01  ui       open
 *   D  Done         LOW     owner   2020-01-02           closed
 *   E  Backlog      MEDIUM  member  2020-01-03           archived
 *   F  Todo         URGENT  -       2099-03-01           open
 */
beforeAll(async () => {
  api = await startApp();
  org = await createOrg();
  memberId = await createUser('member');
  await addMember(org.orgId, org.ownerId, memberId, 'member');
  labels = { bug: await createLabel(org, 'bug'), ui: await createLabel(org, 'ui', 'blue') };
  ids = await insertTasks(org, [
    {
      title: 'A',
      status: 'Todo',
      priority: 1,
      assigneeId: org.ownerId,
      dueDate: '2020-01-01',
      labelIds: [labels.bug],
    },
    {
      title: 'B',
      status: 'Todo',
      priority: null,
      dueDate: '2099-01-01',
      labelIds: [labels.bug, labels.ui],
    },
    {
      title: 'C',
      status: 'In Progress',
      priority: 2,
      assigneeId: memberId,
      dueDate: '2099-02-01',
      labelIds: [labels.ui],
    },
    { title: 'D', status: 'Done', priority: 4, assigneeId: org.ownerId, dueDate: '2020-01-02' },
    {
      title: 'E',
      status: 'Backlog',
      priority: 3,
      assigneeId: memberId,
      dueDate: '2020-01-03',
      archived: true,
    },
    { title: 'F', status: 'Todo', priority: 1, dueDate: '2099-03-01' },
  ]);
});
afterAll(() => api.close());

const gql = (query: string, variables?: Record<string, unknown>) =>
  api.gql(query, { token: api.token(org.ownerId), orgId: org.orgId, variables });

async function titles(filter: Record<string, unknown>, orderBy = 'DUE_DATE'): Promise<string[]> {
  const result = await gql(
    `query ($f: TaskFilter, $o: TaskOrder) { tasks(filter: $f, orderBy: $o, first: 100) { edges { node { title } } } }`,
    { f: { projectIds: [org.projectId], ...filter }, o: orderBy },
  );
  expect(result.body.errors).toBeUndefined();
  return (result.body.data!.tasks as { edges: { node: { title: string } }[] }).edges
    .map((e) => e.node.title)
    .sort();
}

describe('TaskFilter semantics', () => {
  it.each([
    ['no filter: live tasks only', {}, ['A', 'B', 'C', 'D', 'F']],
    ['includeArchived', { includeArchived: true }, ['A', 'B', 'C', 'D', 'E', 'F']],
    ['statusIds', 'status:Todo', ['A', 'B', 'F']],
    ['assigneeIds', 'assignee:owner', ['A', 'D']],
    ['assigneeIds + includeUnassigned', 'assignee:owner+unassigned', ['A', 'B', 'D', 'F']],
    ['includeUnassigned alone', { includeUnassigned: true }, ['B', 'F']],
    ['priorities NONE', { priorities: ['NONE'] }, ['B']],
    ['priorities URGENT or NONE', { priorities: ['URGENT', 'NONE'] }, ['A', 'B', 'F']],
    ['dueFrom (inclusive)', { dueFrom: '2099-01-01' }, ['B', 'C', 'F']],
    ['dueTo (inclusive)', { dueTo: '2020-01-02' }, ['A', 'D']],
    ['due range', { dueFrom: '2099-01-15', dueTo: '2099-02-15' }, ['C']],
    ['labelsAny', 'labelsAny:bug', ['A', 'B']],
    ['labelsAll', 'labelsAll:bug+ui', ['B']],
    ['isClosed true', { isClosed: true }, ['D']],
    ['isClosed false', { isClosed: false }, ['A', 'B', 'C', 'F']],
    ['overdueOnly', { overdueOnly: true }, ['A']],
  ])('%s', async (_label, spec, expected) => {
    const filter =
      spec === 'status:Todo'
        ? { statusIds: [org.statuses.Todo] }
        : spec === 'assignee:owner'
          ? { assigneeIds: [org.ownerId] }
          : spec === 'assignee:owner+unassigned'
            ? { assigneeIds: [org.ownerId], includeUnassigned: true }
            : spec === 'labelsAny:bug'
              ? { labelsAny: [labels.bug] }
              : spec === 'labelsAll:bug+ui'
                ? { labelsAll: [labels.bug, labels.ui] }
                : (spec as Record<string, unknown>);
    expect(await titles(filter)).toEqual(expected);
  });

  it('treats a non-uuid id in a filter as NOT_FOUND', async () => {
    const result = await gql(
      `{ tasks(filter: { statusIds: ["nope"] }) { edges { node { id } } } }`,
    );
    expect(codeOf(result)).toBe('NOT_FOUND');
  });
});

describe('orders and cursor pages', () => {
  const page = `query ($f: TaskFilter, $o: TaskOrder, $after: String) {
    tasks(filter: $f, orderBy: $o, first: 2, after: $after) { edges { node { title } } pageInfo { hasNextPage endCursor } }
  }`;

  async function walk(order: string): Promise<string[]> {
    const seen: string[] = [];
    let after: string | null = null;
    for (;;) {
      const result = await gql(page, { f: { projectIds: [org.projectId] }, o: order, after });
      const tasks = result.body.data!.tasks as {
        edges: { node: { title: string } }[];
        pageInfo: { hasNextPage: boolean; endCursor: string };
      };
      seen.push(...tasks.edges.map((e) => e.node.title));
      if (!tasks.pageInfo.hasNextPage) return seen;
      after = tasks.pageInfo.endCursor;
    }
  }

  it.each([
    ['CREATED_AT', ['F', 'D', 'C', 'B', 'A']],
    ['DUE_DATE', ['A', 'D', 'B', 'C', 'F']],
    ['PRIORITY', ['A', 'F', 'C', 'D', 'B']],
  ])('%s pages through every task once, in order', async (order, expected) => {
    expect(await walk(order)).toEqual(expected);
  });

  it('RANK walks the whole project once, newest card first', async () => {
    const walked = await walk('RANK');
    expect([...walked].sort()).toEqual(['A', 'B', 'C', 'D', 'F']);
    expect(walked[0]).toBe('F');
  });

  it('RANK needs exactly one project', async () => {
    const result = await gql(`{ tasks(orderBy: RANK) { edges { node { id } } } }`);
    expect(codeOf(result)).toBe('INVALID_ORDER');
  });

  it('rejects a cursor from another order', async () => {
    const first = await gql(page, { f: { projectIds: [org.projectId] }, o: 'DUE_DATE' });
    const cursor = (first.body.data!.tasks as { pageInfo: { endCursor: string } }).pageInfo
      .endCursor;
    const result = await gql(page, {
      f: { projectIds: [org.projectId] },
      o: 'CREATED_AT',
      after: cursor,
    });
    expect(codeOf(result)).toBe('VALIDATION_FAILED');
  });
});

describe('taskSummary', () => {
  const summary = `query ($f: TaskFilter) { taskSummary(filter: $f) {
    total open closed overdue
    byStatus { status { name } total open overdue }
    byPriority { priority total }
    byAssignee { user { id } total open overdue }
  } }`;

  it('counts the same scope as the list, with zero-filled breakdowns that sum to the total', async () => {
    // Act
    const result = await gql(summary, { f: { projectIds: [org.projectId] } });
    const s = result.body.data!.taskSummary as {
      total: number;
      open: number;
      closed: number;
      overdue: number;
      byStatus: { status: { name: string }; total: number }[];
      byPriority: { priority: string; total: number }[];
      byAssignee: { user: { id: string } | null; total: number }[];
    };

    // Assert
    expect({ total: s.total, open: s.open, closed: s.closed, overdue: s.overdue }).toEqual({
      total: 5,
      open: 4,
      closed: 1,
      overdue: 1,
    });
    expect(s.byStatus.map((x) => [x.status.name, x.total])).toEqual([
      ['Backlog', 0],
      ['Todo', 3],
      ['In Progress', 1],
      ['In Review', 0],
      ['Done', 1],
      ['Canceled', 0],
    ]);
    expect(s.byPriority).toEqual([
      { priority: 'URGENT', total: 2 },
      { priority: 'HIGH', total: 1 },
      { priority: 'MEDIUM', total: 0 },
      { priority: 'LOW', total: 1 },
      { priority: 'NONE', total: 1 },
    ]);
    expect(s.byAssignee.map((x) => [x.user?.id ?? null, x.total])).toEqual([
      [org.ownerId, 2],
      [memberId, 1],
      [null, 2],
    ]);
  });

  it('omits byStatus unless the filter names exactly one project', async () => {
    const result = await gql(summary, {});
    expect((result.body.data!.taskSummary as { byStatus: unknown }).byStatus).toBeNull();
  });
});

describe('board and boardColumn', () => {
  it('returns every live column in order, with the first page of each by rank', async () => {
    const result = await gql(
      `query ($p: ID!) { board(projectId: $p, first: 2) { project { key } columns { status { name position } tasks { edges { node { title } } pageInfo { hasNextPage endCursor } } } } }`,
      { p: org.projectId },
    );
    const board = result.body.data!.board as {
      project: { key: string };
      columns: {
        status: { name: string };
        tasks: { edges: { node: { title: string } }[]; pageInfo: { hasNextPage: boolean } };
      }[];
    };
    expect(board.project.key).toBe('ENG');
    expect(
      board.columns.map((c) => [
        c.status.name,
        c.tasks.edges.map((e) => e.node.title),
        c.tasks.pageInfo.hasNextPage,
      ]),
    ).toEqual([
      ['Backlog', [], false],
      ['Todo', ['F', 'B'], true],
      ['In Progress', ['C'], false],
      ['In Review', [], false],
      ['Done', ['D'], false],
      ['Canceled', [], false],
    ]);
  });

  it('boardColumn continues a column after its cursor, without overlap', async () => {
    const first = await gql(
      `query ($p: ID!) { board(projectId: $p, first: 2) { columns { status { id name } tasks { pageInfo { endCursor } } } } }`,
      { p: org.projectId },
    );
    const todo = (
      first.body.data!.board as {
        columns: {
          status: { id: string; name: string };
          tasks: { pageInfo: { endCursor: string } };
        }[];
      }
    ).columns.find((c) => c.status.name === 'Todo')!;
    const next = await gql(
      `query ($p: ID!, $s: ID!, $a: String) { boardColumn(projectId: $p, statusId: $s, first: 2, after: $a) { edges { node { title } } pageInfo { hasNextPage } } }`,
      { p: org.projectId, s: todo.status.id, a: todo.tasks.pageInfo.endCursor },
    );
    expect(next.body.data).toEqual({
      boardColumn: { edges: [{ node: { title: 'A' } }], pageInfo: { hasNextPage: false } },
    });
  });

  it('rejects a status from another project, and an archived project unless includeArchived', async () => {
    const other = await createProject(org.orgId, org.ownerId, 'OPS');
    const foreign = await gql(
      `query ($p: ID!, $s: ID!) { boardColumn(projectId: $p, statusId: $s) { edges { node { id } } } }`,
      {
        p: other,
        s: org.statuses.Todo,
      },
    );
    await committed({ userId: org.ownerId, orgId: org.orgId }, (tx) =>
      tx.query(`UPDATE projects SET state = 'archived', archived_at = now() WHERE id = $1`, [
        other,
      ]),
    );
    const hidden = await gql(`query ($p: ID!) { board(projectId: $p) { project { key } } }`, {
      p: other,
    });
    const shown = await gql(
      `query ($p: ID!) { board(projectId: $p, filter: { includeArchived: true }) { project { key } } }`,
      { p: other },
    );
    expect(codeOf(foreign)).toBe('NOT_FOUND');
    expect(codeOf(hidden)).toBe('NOT_FOUND');
    expect(shown.body.data).toEqual({ board: { project: { key: 'OPS' } } });
  });
});

describe('lookups and labels', () => {
  it('finds a task by id and by identifier in any letter case, with its extra fields', async () => {
    const byId = await gql(
      `query ($id: ID!) { task(id: $id) { identifier project { key } createdBy { id } archivedAt updatedAt } }`,
      { id: ids.A },
    );
    const byIdentifier = await gql(`{ taskByIdentifier(identifier: "  eng-1 ") { title } }`);
    expect(byId.body.data).toMatchObject({
      task: {
        identifier: 'ENG-1',
        project: { key: 'ENG' },
        createdBy: { id: org.ownerId },
        archivedAt: null,
      },
    });
    expect(byIdentifier.body.data).toEqual({ taskByIdentifier: { title: 'A' } });
  });

  it.each([['ENG-999'], ['ENG'], ['ENG-0'], ['not an identifier'], ['EN-1']])(
    'taskByIdentifier(%s) is NOT_FOUND',
    async (identifier) => {
      const result = await gql(`query ($i: String!) { taskByIdentifier(identifier: $i) { id } }`, {
        i: identifier,
      });
      expect(codeOf(result)).toBe('NOT_FOUND');
      expect(result.body.data ?? { taskByIdentifier: null }).toEqual({ taskByIdentifier: null });
    },
  );

  it("hides another org's task and project as NOT_FOUND", async () => {
    const other = await createOrg();
    const [otherTask] = Object.values(
      await insertTasks(other, [{ title: 'X', status: 'Todo', dueDate: '2099-01-01' }]),
    );
    expect(codeOf(await gql(`query ($id: ID!) { task(id: $id) { id } }`, { id: otherTask }))).toBe(
      'NOT_FOUND',
    );
    expect(
      codeOf(await gql(`query ($id: ID!) { project(id: $id) { id } }`, { id: other.projectId })),
    ).toBe('NOT_FOUND');
  });

  it('finds a project by key in any letter case', async () => {
    const result = await gql(`{ projectByKey(key: " eng ") { id key } }`);
    expect(result.body.data).toEqual({ projectByKey: { id: org.projectId, key: 'ENG' } });
  });

  it('lists live labels by name, and archived ones on request', async () => {
    const archived = await createLabel(org, 'aaa-old', 'slate');
    await committed({ userId: org.ownerId, orgId: org.orgId }, (tx) =>
      tx.query(`UPDATE labels SET archived_at = now() WHERE id = $1`, [archived]),
    );
    const live = await gql(`{ labels { name isArchived } }`);
    const all = await gql(`{ labels(includeArchived: true) { name isArchived } }`);
    expect(live.body.data).toEqual({
      labels: [
        { name: 'bug', isArchived: false },
        { name: 'ui', isArchived: false },
      ],
    });
    expect(all.body.data).toEqual({
      labels: [
        { name: 'aaa-old', isArchived: true },
        { name: 'bug', isArchived: false },
        { name: 'ui', isArchived: false },
      ],
    });
  });
});
