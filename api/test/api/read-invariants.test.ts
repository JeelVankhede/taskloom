import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committed } from '../db/support/db.js';
import { createOrg, createProject, insertTask, type OrgFixture } from '../db/support/fixtures.js';
import { startApp, type TestApp } from './support/app.js';
import { probeHooks } from './support/probe.js';
import { insertTasks } from './support/tasks.js';

let api: TestApp;
/** Every line the app writes to stdout (pino JSON), for the per-request statement counts. */
const logLines: string[] = [];
const originalWrite = process.stdout.write.bind(process.stdout);

beforeAll(async () => {
  (process.stdout as { write: unknown }).write = (chunk: unknown, ...rest: unknown[]) => {
    logLines.push(String(chunk));
    return (originalWrite as (...args: unknown[]) => boolean)(chunk, ...rest);
  };
  api = await startApp({ LOG_LEVEL: 'debug' });
});
afterAll(async () => {
  await api.close();
  (process.stdout as { write: unknown }).write = originalWrite;
});

const gqlAs = (org: OrgFixture, query: string, variables?: Record<string, unknown>) =>
  api.gql(query, { token: api.token(org.ownerId), orgId: org.orgId, variables });

describe('T22: the list and the summary read one snapshot', () => {
  it('a task committed by another session mid-request appears in neither', async () => {
    // Arrange
    const org = await createOrg();
    await insertTasks(org, [{ title: 'before', status: 'Todo', dueDate: '2099-01-01' }]);
    probeHooks.between = () =>
      committed({ userId: org.ownerId, orgId: org.orgId }, (tx) =>
        insertTask(tx, org, { statusId: org.statuses.Todo!, title: 'during' }).then(
          () => undefined,
        ),
      );
    const query = `query ($f: TaskFilter) {
      before: tasks(filter: $f) { edges { node { title } } }
      commitDuringRequest
      after: tasks(filter: $f) { edges { node { title } } }
      taskSummary(filter: $f) { total }
    }`;

    try {
      // Act
      const within = await gqlAs(org, query, { f: { projectIds: [org.projectId] } });
      const later = await gqlAs(
        org,
        `query ($f: TaskFilter) { taskSummary(filter: $f) { total } }`,
        {
          f: { projectIds: [org.projectId] },
        },
      );

      // Assert
      const data = within.body.data as {
        before: { edges: unknown[] };
        after: { edges: unknown[] };
        taskSummary: { total: number };
      };
      expect(data.before.edges).toHaveLength(1);
      expect(data.after.edges).toHaveLength(1);
      expect(data.taskSummary.total).toBe(1);
      expect((later.body.data!.taskSummary as { total: number }).total).toBe(2);
    } finally {
      delete probeHooks.between;
    }
  });
});

describe('T27: overdue ignores archived projects', () => {
  it('an overdue task in an archived project never counts as overdue', async () => {
    // Arrange
    const org = await createOrg();
    const ops = await createProject(org.orgId, org.ownerId, 'OPS');
    await insertTasks(org, [
      { title: 'late', status: 'Todo', dueDate: '2020-01-01' },
      { title: 'late in archived project', status: 'Todo', dueDate: '2020-01-01', projectId: ops },
    ]);
    await committed({ userId: org.ownerId, orgId: org.orgId }, (tx) =>
      tx.query(`UPDATE projects SET state = 'archived', archived_at = now() WHERE id = $1`, [ops]),
    );
    const query = `query ($f: TaskFilter) { taskSummary(filter: $f) { total overdue }
      tasks(filter: { overdueOnly: true, includeArchived: true }) { edges { node { title } } } }`;

    // Act
    const visible = await gqlAs(org, query, { f: {} });
    const withArchived = await gqlAs(org, query, { f: { includeArchived: true } });

    // Assert
    expect(visible.body.data!.taskSummary).toEqual({ total: 1, overdue: 1 });
    expect(withArchived.body.data!.taskSummary).toEqual({ total: 2, overdue: 1 });
    expect(
      (withArchived.body.data!.tasks as { edges: { node: { title: string } }[] }).edges.map(
        (e) => e.node.title,
      ),
    ).toEqual(['late']);
  });
});

describe('statement ceiling: board plus summary', () => {
  const BOARD = `query BoardCeiling($p: ID!, $f: TaskFilter) {
    board(projectId: $p, filter: $f, first: 50) { columns { status { name } tasks { edges { node {
      identifier title priority dueDate assignee { displayName } labels { name color } } } } } }
    taskSummary(filter: $f) { total open overdue byStatus { status { name } total } byPriority { priority total }
      byAssignee { user { displayName } total } }
  }`;

  function statementsOf(operation: string): number[] {
    return logLines
      .flatMap((line) => line.split('\n'))
      .filter(
        (line) => line.includes(`"operation":"${operation}"`) && line.includes('"statements"'),
      )
      .map((line) => (JSON.parse(line) as { statements: number }).statements);
  }

  it('issues 8 or fewer data statements, the same for 6 tasks and for 300', async () => {
    // Arrange: a small and a larger project, with assignees and labels on every card
    const small = await createOrg();
    const large = await createOrg();
    const spec = (i: number) => ({
      title: `t${i}`,
      status: ['Backlog', 'Todo', 'In Progress', 'Done'][i % 4]!,
      priority: (i % 4) + 1,
      assigneeId: i % 3 === 0 ? null : undefined,
      dueDate: '2099-01-01',
    });
    await insertTasks(
      small,
      Array.from({ length: 6 }, (_, i) => ({
        ...spec(i),
        assigneeId: i % 2 ? small.ownerId : null,
      })),
    );
    await insertTasks(
      large,
      Array.from({ length: 300 }, (_, i) => ({
        ...spec(i),
        assigneeId: i % 2 ? large.ownerId : null,
      })),
    );

    // Act
    for (const org of [small, large]) {
      const result = await gqlAs(org, BOARD, {
        p: org.projectId,
        f: { projectIds: [org.projectId] },
      });
      expect(result.body.errors).toBeUndefined();
    }
    await new Promise((resolve) => setTimeout(resolve, 50)); // let the last log line flush

    // Assert
    const counts = statementsOf('BoardCeiling');
    expect(counts).toHaveLength(2);
    expect(counts[0]).toBe(counts[1]);
    expect(counts[0]).toBeLessThanOrEqual(8);
  });
});
