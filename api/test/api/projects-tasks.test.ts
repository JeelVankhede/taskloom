import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committed, inTx } from '../db/support/db.js';
import { addMember, createUser, newSlug } from '../db/support/fixtures.js';
import { codeOf, startApp, type TestApp } from './support/app.js';

let api: TestApp;

beforeAll(async () => {
  api = await startApp();
});
afterAll(() => api.close());

interface Org {
  id: string;
  ownerId: string;
}

async function newOrg(): Promise<Org> {
  const ownerId = await createUser('owner');
  const result = await api.gql(
    `mutation ($input: CreateOrganizationInput!) { createOrganization(input: $input) { id } }`,
    { token: api.token(ownerId), variables: { input: { name: 'Org', slug: newSlug() } } },
  );
  return { id: (result.body.data?.createOrganization as { id: string }).id, ownerId };
}

async function userWithRole(org: Org, role: 'admin' | 'member' | 'contributor') {
  const id = await createUser(role);
  await addMember(org.id, org.ownerId, id, role);
  return id;
}

const CREATE_PROJECT = `mutation ($input: CreateProjectInput!) {
  createProject(input: $input) { id key name description isArchived }
}`;
const CREATE_TASK = `mutation ($input: CreateTaskInput!) {
  createTask(input: $input) {
    id number identifier title description priority dueDate isClosed closedAt
    status { id name isClosed } assignee { id } labels { id name color }
  }
}`;

async function createProject(org: Org, key: string, name = 'Project') {
  const result = await api.gql(CREATE_PROJECT, {
    token: api.token(org.ownerId),
    orgId: org.id,
    variables: { input: { name, key } },
  });
  return result.body.data?.createProject as { id: string; key: string };
}

const statusId = (org: Org, projectId: string, name: string) =>
  inTx(
    { userId: org.ownerId, orgId: org.id },
    async (tx) =>
      (
        await tx.one<{ id: string }>(
          `SELECT id FROM project_statuses WHERE project_id = $1 AND name = $2`,
          [projectId, name],
        )
      ).id,
  );

describe('createProject', () => {
  it.each([
    ['owner', 'OK'],
    ['admin', 'OK'],
    ['member', 'OK'],
    ['contributor', 'FORBIDDEN'],
  ])('%s: %s', async (role, outcome) => {
    const org = await newOrg();
    const user =
      role === 'owner'
        ? org.ownerId
        : await userWithRole(org, role as 'admin' | 'member' | 'contributor');
    const result = await api.gql(CREATE_PROJECT, {
      token: api.token(user),
      orgId: org.id,
      variables: { input: { name: '  Engineering ', key: 'ENG', description: 'Core' } },
    });
    if (outcome === 'OK') {
      expect(result.body.data).toMatchObject({
        createProject: { key: 'ENG', name: 'Engineering', description: 'Core', isArchived: false },
      });
    } else {
      expect(codeOf(result)).toBe(outcome);
    }
  });

  it.each([
    ['a taken key', 'ENG', 'PROJECT_KEY_TAKEN'],
    ['a two-character key', 'EN', 'VALIDATION_FAILED'],
    ['a four-character key', 'ENGG', 'VALIDATION_FAILED'],
    ['a lowercase key', 'eng', 'VALIDATION_FAILED'],
  ])('rejects %s', async (_label, key, code) => {
    const org = await newOrg();
    await createProject(org, 'ENG');
    const result = await api.gql(CREATE_PROJECT, {
      token: api.token(org.ownerId),
      orgId: org.id,
      variables: { input: { name: 'X', key } },
    });
    expect(codeOf(result)).toBe(code);
  });
});

describe('T23 (remainder): organization.projects returns pages', () => {
  it('pages by name and hides archived projects unless asked', async () => {
    // Arrange
    const org = await newOrg();
    const alpha = await createProject(org, 'AAA', 'Alpha');
    await createProject(org, 'BBB', 'Beta');
    const gamma = await createProject(org, 'CCC', 'Gamma');
    await committed({ userId: org.ownerId, orgId: org.id }, (tx) =>
      tx.query(`UPDATE projects SET state = 'archived', archived_at = now() WHERE id = $1`, [
        gamma.id,
      ]),
    );
    const query = `query ($after: String, $all: Boolean) {
      organization { projects(first: 1, after: $after, includeArchived: $all) {
        edges { node { key } } pageInfo { hasNextPage endCursor } } }
    }`;
    const page = async (after?: string, all = false) =>
      (
        await api.gql(query, {
          token: api.token(org.ownerId),
          orgId: org.id,
          variables: { after, all },
        })
      ).body.data as {
        organization: {
          projects: {
            edges: { node: { key: string } }[];
            pageInfo: { hasNextPage: boolean; endCursor: string };
          };
        };
      };

    // Act
    const first = await page();
    const second = await page(first.organization.projects.pageInfo.endCursor);
    const withArchived = await page(second.organization.projects.pageInfo.endCursor, true);

    // Assert
    expect(first.organization.projects.edges).toEqual([{ node: { key: alpha.key } }]);
    expect(first.organization.projects.pageInfo.hasNextPage).toBe(true);
    expect(second.organization.projects.edges).toEqual([{ node: { key: 'BBB' } }]);
    expect(second.organization.projects.pageInfo.hasNextPage).toBe(false);
    expect(withArchived.organization.projects.edges).toEqual([{ node: { key: 'CCC' } }]);
  });

  it('rejects first above 100 and a forged cursor', async () => {
    const org = await newOrg();
    const token = api.token(org.ownerId);
    const tooMany = await api.gql(
      '{ organization { projects(first: 101) { edges { node { id } } } } }',
      {
        token,
        orgId: org.id,
      },
    );
    const forged = await api.gql(
      '{ organization { projects(after: "bm90LWpzb24") { edges { node { id } } } } }',
      {
        token,
        orgId: org.id,
      },
    );
    expect(codeOf(tooMany)).toBe('VALIDATION_FAILED');
    expect(codeOf(forged)).toBe('VALIDATION_FAILED');
  });
});

describe('createTask', () => {
  it('creates a task in the default status with a generated number, identifier, and event', async () => {
    // Arrange
    const org = await newOrg();
    const project = await createProject(org, 'ENG');
    const contributor = await userWithRole(org, 'contributor');
    const label = await committed({ userId: org.ownerId, orgId: org.id }, (tx) =>
      tx.one<{ id: string }>(
        `INSERT INTO labels (org_id, name, color) VALUES ($1, 'bug', 'red') RETURNING id`,
        [org.id],
      ),
    );

    // Act
    const result = await api.gql(CREATE_TASK, {
      token: api.token(contributor),
      orgId: org.id,
      variables: {
        input: {
          projectId: project.id,
          title: '  Fix login  ',
          priority: 'HIGH',
          dueDate: '2026-10-15',
          assigneeId: contributor,
          labelIds: [label.id, label.id],
        },
      },
    });
    const event = await inTx({ userId: org.ownerId, orgId: org.id }, (tx) =>
      tx.one(`SELECT actor_id, task_id, payload FROM activity_events WHERE type = 'task.created'`),
    );

    // Assert
    const task = result.body.data?.createTask as { id: string; status: { id: string } };
    expect(result.body.data).toEqual({
      createTask: {
        id: task.id,
        number: 1,
        identifier: 'ENG-1',
        title: 'Fix login',
        description: null,
        priority: 'HIGH',
        dueDate: '2026-10-15',
        isClosed: false,
        closedAt: null,
        status: { id: task.status.id, name: 'Todo', isClosed: false },
        assignee: { id: contributor },
        labels: [{ id: label.id, name: 'bug', color: 'red' }],
      },
    });
    expect(event).toEqual({
      actor_id: contributor,
      task_id: task.id,
      payload: {
        number: 1,
        title: 'Fix login',
        status_id: task.status.id,
        priority: 2,
        assignee_id: contributor,
        due_date: '2026-10-15',
        label_ids: [label.id],
      },
    });
  });

  it('defaults priority to NONE and returns closedAt for a closed status', async () => {
    const org = await newOrg();
    const project = await createProject(org, 'ENG');
    const done = await statusId(org, project.id, 'Done');
    const result = await api.gql(CREATE_TASK, {
      token: api.token(org.ownerId),
      orgId: org.id,
      variables: {
        input: { projectId: project.id, title: 'Shipped', dueDate: '2026-10-01', statusId: done },
      },
    });
    expect(result.body.data).toMatchObject({
      createTask: {
        priority: 'NONE',
        isClosed: true,
        closedAt: expect.any(String),
        status: { name: 'Done' },
      },
    });
  });

  it.each([
    ['an archived project', 'archivedProject', 'PROJECT_ARCHIVED'],
    ['a status from another project', 'foreignStatus', 'STATUS_NOT_IN_PROJECT'],
    ['an inactive assignee', 'inactiveAssignee', 'ASSIGNEE_INACTIVE'],
    ['an assignee who is not a member', 'strangerAssignee', 'ASSIGNEE_NOT_MEMBER'],
    ['an archived label', 'archivedLabel', 'LABEL_ARCHIVED'],
    ['an unknown label', 'unknownLabel', 'NOT_FOUND'],
    ['more than 20 labels', 'tooManyLabels', 'VALIDATION_FAILED'],
    ['an impossible due date', 'badDate', 'VALIDATION_FAILED'],
    ['a missing due date', 'noDate', 'VALIDATION_FAILED'],
    ['a blank title', 'blankTitle', 'VALIDATION_FAILED'],
    ['an unknown project', 'unknownProject', 'NOT_FOUND'],
  ])('rejects %s', async (_label, kind, code) => {
    // Arrange
    const org = await newOrg();
    const project = await createProject(org, 'ENG');
    const other = await createProject(org, 'OPS');
    const input: Record<string, unknown> = {
      projectId: project.id,
      title: 'Task',
      dueDate: '2026-10-01',
    };
    const asOwner = { userId: org.ownerId, orgId: org.id };
    switch (kind) {
      case 'archivedProject':
        await committed(asOwner, (tx) =>
          tx.query(`UPDATE projects SET state = 'archived', archived_at = now() WHERE id = $1`, [
            project.id,
          ]),
        );
        break;
      case 'foreignStatus':
        input.statusId = await statusId(org, other.id, 'Todo');
        break;
      case 'inactiveAssignee': {
        const departed = await userWithRole(org, 'member');
        await committed(asOwner, (tx) =>
          tx.query(
            `UPDATE org_memberships SET status = 'deactivated', deactivated_at = now() WHERE user_id = $1`,
            [departed],
          ),
        );
        input.assigneeId = departed;
        break;
      }
      case 'strangerAssignee':
        input.assigneeId = await createUser('stranger');
        break;
      case 'archivedLabel': {
        const label = await committed(asOwner, (tx) =>
          tx.one<{ id: string }>(
            `INSERT INTO labels (org_id, name, color) VALUES ($1, 'old', 'red') RETURNING id`,
            [org.id],
          ),
        );
        await committed(asOwner, (tx) =>
          tx.query(`UPDATE labels SET archived_at = now() WHERE id = $1`, [label.id]),
        );
        input.labelIds = [label.id];
        break;
      }
      case 'unknownLabel':
        input.labelIds = ['01a0df4b-0000-7000-8000-000000000000'];
        break;
      case 'tooManyLabels':
        input.labelIds = Array.from(
          { length: 21 },
          (_, i) => `01a0df4b-0000-7000-8000-${String(i).padStart(12, '0')}`,
        );
        break;
      case 'badDate':
        input.dueDate = '2026-02-30';
        break;
      case 'noDate':
        delete input.dueDate;
        break;
      case 'blankTitle':
        input.title = '   ';
        break;
      case 'unknownProject':
        input.projectId = '01a0df4b-0000-7000-8000-000000000000';
        break;
    }

    // Act
    const result = await api.gql(CREATE_TASK, {
      token: api.token(org.ownerId),
      orgId: org.id,
      variables: { input },
    });

    // Assert
    expect(codeOf(result)).toBe(code);
    const count = await inTx(
      asOwner,
      async (tx) => (await tx.one<{ n: string }>(`SELECT count(*) AS n FROM tasks`)).n,
    );
    expect(count).toBe('0');
  });
});
