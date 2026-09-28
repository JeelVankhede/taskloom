import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOrg } from '../db/support/fixtures.js';
import { startApp, type TestApp } from './support/app.js';

/**
 * T15: a due date round-trips unchanged whatever the server's timezone. Each test file runs in
 * its own worker process, so changing TZ here affects only this file. UTC+14 and UTC-7 are the
 * extremes most likely to shift a date by a day when it passes through local time.
 */
describe.each([['Pacific/Kiritimati'], ['America/Phoenix']])('T15: server in %s', (timezone) => {
  let api: TestApp;
  const previous = process.env.TZ;

  beforeAll(async () => {
    process.env.TZ = timezone;
    api = await startApp();
  });
  afterAll(async () => {
    await api.close();
    process.env.TZ = previous;
  });

  it('keeps 2026-12-31 and 2026-01-01 exactly, through create, read, and filter', async () => {
    // Arrange
    const org = await createOrg();
    const gql = (query: string, variables: Record<string, unknown>) =>
      api.gql(query, { token: api.token(org.ownerId), orgId: org.orgId, variables });

    for (const dueDate of ['2026-12-31', '2026-01-01']) {
      // Act
      const created = await gql(
        `mutation ($i: CreateTaskInput!) { createTask(input: $i) { id dueDate } }`,
        { i: { projectId: org.projectId, title: `due ${dueDate}`, dueDate } },
      );
      const id = (created.body.data!.createTask as { id: string }).id;
      const read = await gql(`query ($id: ID!) { task(id: $id) { dueDate } }`, { id });
      const filtered = await gql(
        `query ($d: Date!, $p: ID!) { tasks(filter: { projectIds: [$p], dueFrom: $d, dueTo: $d }) { edges { node { id } } } }`,
        { d: dueDate, p: org.projectId },
      );

      // Assert
      expect(created.body.data).toMatchObject({ createTask: { dueDate } });
      expect(read.body.data).toEqual({ task: { dueDate } });
      expect(filtered.body.data).toEqual({ tasks: { edges: [{ node: { id } }] } });
    }
  });
});
