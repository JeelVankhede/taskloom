import { beforeAll, describe, expect, it } from 'vitest';
import type { FilterContext } from '../../src/modules/task/task-filter.js';
import { taskWhere } from '../../src/modules/task/task-filter.js';
import {
  listSql,
  summarySql,
  type TaskOrder,
} from '../../src/modules/task/task-query.repository.js';
import { committed, inTx, ownerPool } from './support/db.js';
import { createOrg, createProject, type OrgFixture } from './support/fixtures.js';

/** A rendered statement: PostgreSQL text with $n placeholders and its values. */
interface Rendered {
  text: string;
  values: unknown[];
}

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

const flatten = (node: PlanNode): PlanNode[] => [node, ...(node.Plans ?? []).flatMap(flatten)];

let org: OrgFixture;
let ctx: FilterContext;

/**
 * T24 and T27 on a large project. EXPLAIN runs as app_user with tenant context (a superuser
 * would bypass row-level security and plan a different query), on exactly the SQL the
 * repository builds.
 */
beforeAll(async () => {
  org = await createOrg();
  // Two projects of 2,500 tasks each: with one project, an org-wide index would cover the same
  // rows and the planner could pick it. Real orgs have several projects.
  const other = await createProject(org.orgId, org.ownerId, 'OPS');
  for (const projectId of [org.projectId, other]) {
    // One INSERT statement per task, so the insert trigger sees every earlier row.
    await committed({ userId: org.ownerId, orgId: org.orgId }, (tx) =>
      tx.query(
        `DO $$
         DECLARE s uuid[] := ARRAY(SELECT id FROM project_statuses WHERE project_id = '${projectId}' AND closed_kind IS NULL);
         BEGIN
           FOR i IN 1..2500 LOOP
             INSERT INTO tasks (org_id, project_id, title, status_id, priority, due_date, created_by)
             VALUES ('${org.orgId}', '${projectId}', 'task ' || i, s[1 + i % array_length(s, 1)],
                     CASE WHEN i % 5 = 0 THEN NULL ELSE 1 + i % 4 END,
                     DATE '2026-01-01' + (i % 400), '${org.ownerId}');
           END LOOP;
         END $$`,
      ),
    );
  }
  // ANALYZE needs the table owner; app_owner is not a superuser.
  await ownerPool.query('ANALYZE tasks');
  ctx = await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => ({
    orgId: org.orgId,
    today: (
      await tx.one<{ today: string }>(`SELECT (now() AT TIME ZONE 'UTC')::date::text AS today`)
    ).today,
    inactiveProjectIds: [],
  }));
}, 180_000);

async function plan(statement: Rendered): Promise<PlanNode[]> {
  return inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
    const { rows } = await tx.query<{ 'QUERY PLAN': { Plan: PlanNode }[] }>(
      `EXPLAIN (FORMAT JSON) ${statement.text}`,
      statement.values,
    );
    return flatten(rows[0]!['QUERY PLAN'][0]!.Plan);
  });
}

describe('T24: every default page reads one index range, with no full sort', () => {
  it.each([
    ['CREATED_AT', 'tasks_project_created'],
    ['DUE_DATE', 'tasks_project_due'],
    ['PRIORITY', 'tasks_project_priority'],
    ['RANK', 'tasks_rank_unique'],
  ] as [TaskOrder, string][])('%s uses %s', async (order, index) => {
    // Act
    const nodes = await plan(
      listSql(taskWhere({ projectIds: [org.projectId] }, ctx), order, 51) as unknown as Rendered,
    );

    // Assert
    const indexNodes = nodes.filter((n) => n['Node Type'].startsWith('Index'));
    expect(indexNodes.map((n) => n['Index Name'])).toContain(index);
    expect(nodes.some((n) => n['Node Type'] === 'Sort')).toBe(false);
    expect(nodes.some((n) => n['Node Type'] === 'Seq Scan')).toBe(false);
  });
});

describe('T27: overdue and the summary never read projects', () => {
  it.each([
    [
      'the overdue list',
      () =>
        listSql(taskWhere({ projectIds: [org.projectId], overdueOnly: true }, ctx), 'DUE_DATE', 51),
    ],
    ['the summary', () => summarySql(taskWhere({ projectIds: [org.projectId] }, ctx), ctx)],
  ])('%s', async (_label, build) => {
    const nodes = await plan(build() as unknown as Rendered);
    expect(nodes.map((n) => n['Relation Name']).filter(Boolean)).not.toContain('projects');
  });
});
