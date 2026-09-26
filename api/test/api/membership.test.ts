import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ACTION_LIMITS } from '../../src/platform/rate-limit/action-limiter.js';
import { committed, inTx } from '../db/support/db.js';
import { addMember, createUser, emailOf, newSlug } from '../db/support/fixtures.js';
import { codeOf, startApp, type TestApp } from './support/app.js';

let api: TestApp;

beforeAll(async () => {
  api = await startApp();
});
afterAll(() => api.close());

interface Org {
  id: string;
  ownerId: string;
  slug: string;
}

async function newOrg(): Promise<Org> {
  const ownerId = await createUser('owner');
  const slug = newSlug();
  const result = await api.gql(
    `mutation ($input: CreateOrganizationInput!) { createOrganization(input: $input) { id } }`,
    { token: api.token(ownerId), variables: { input: { name: 'Org', slug } } },
  );
  return { id: (result.body.data?.createOrganization as { id: string }).id, ownerId, slug };
}

async function requestToJoin(
  org: Org,
  label = 'requester',
): Promise<{ userId: string; requestId: string }> {
  const userId = await createUser(label);
  const result = await api.gql(
    `mutation ($slug: String!) { requestToJoinOrganization(slug: $slug) { id } }`,
    {
      token: api.token(userId),
      variables: { slug: org.slug },
    },
  );
  return { userId, requestId: (result.body.data?.requestToJoinOrganization as { id: string }).id };
}

const APPROVE = `mutation ($id: ID!, $role: Role) {
  approveJoinRequest(id: $id, role: $role) { role status user { id displayName email } }
}`;
const REJECT = `mutation ($id: ID!) { rejectJoinRequest(id: $id) { id status decidedAt decidedBy { id } user { id } } }`;
const ADD = `mutation ($email: String!, $role: Role) { addMember(email: $email, role: $role) { role status user { id } } }`;

const eventsOf = (org: Org, type: string) =>
  inTx(
    { userId: org.ownerId, orgId: org.id },
    async (tx) =>
      (
        await tx.query(
          `SELECT actor_id, payload FROM activity_events WHERE type = $1 ORDER BY created_at`,
          [type],
        )
      ).rows,
  );

describe('T30: deciding join requests', () => {
  it('approval creates the membership with the chosen role and writes member.added', async () => {
    // Arrange
    const org = await newOrg();
    const { userId, requestId } = await requestToJoin(org);

    // Act
    const result = await api.gql(APPROVE, {
      token: api.token(org.ownerId),
      orgId: org.id,
      variables: { id: requestId, role: 'CONTRIBUTOR' },
    });
    const asMember = await api.gql('{ organization { id } }', {
      token: api.token(userId),
      orgId: org.id,
    });

    // Assert
    expect(result.body.data).toEqual({
      approveJoinRequest: {
        role: 'CONTRIBUTOR',
        status: 'ACTIVE',
        user: { id: userId, displayName: 'requester', email: await emailOf(userId) },
      },
    });
    expect(asMember.body.data).toEqual({ organization: { id: org.id } });
    expect(await eventsOf(org, 'member.added')).toEqual([
      {
        actor_id: org.ownerId,
        payload: {
          user_id: userId,
          role: 'contributor',
          via: 'join_request',
          request_id: requestId,
        },
      },
    ]);
  });

  it('approval reactivates a deactivated member with the chosen role', async () => {
    // Arrange
    const org = await newOrg();
    const { userId, requestId } = await (async () => {
      const departed = await createUser('returning');
      await addMember(org.id, org.ownerId, departed, 'admin');
      await committed({ userId: org.ownerId, orgId: org.id }, (tx) =>
        tx.query(
          `UPDATE org_memberships SET status = 'deactivated', deactivated_at = now() WHERE user_id = $1`,
          [departed],
        ),
      );
      const request = await api.gql(
        `mutation ($slug: String!) { requestToJoinOrganization(slug: $slug) { id } }`,
        {
          token: api.token(departed),
          variables: { slug: org.slug },
        },
      );
      return {
        userId: departed,
        requestId: (request.body.data?.requestToJoinOrganization as { id: string }).id,
      };
    })();

    // Act
    const result = await api.gql(APPROVE, {
      token: api.token(org.ownerId),
      orgId: org.id,
      variables: { id: requestId },
    });

    // Assert
    expect(result.body.data).toMatchObject({
      approveJoinRequest: { role: 'MEMBER', status: 'ACTIVE', user: { id: userId } },
    });
  });

  it('rejection records the decision and writes member.join_request_rejected', async () => {
    // Arrange
    const org = await newOrg();
    const { userId, requestId } = await requestToJoin(org);

    // Act
    const result = await api.gql(REJECT, {
      token: api.token(org.ownerId),
      orgId: org.id,
      variables: { id: requestId },
    });

    // Assert
    expect(result.body.data).toMatchObject({
      rejectJoinRequest: {
        id: requestId,
        status: 'REJECTED',
        decidedBy: { id: org.ownerId },
        user: { id: userId },
      },
    });
    expect(await eventsOf(org, 'member.join_request_rejected')).toEqual([
      { actor_id: org.ownerId, payload: { user_id: userId, request_id: requestId } },
    ]);
  });

  it('a decided request fails with JOIN_REQUEST_NOT_PENDING', async () => {
    const org = await newOrg();
    const { requestId } = await requestToJoin(org);
    const token = api.token(org.ownerId);
    await api.gql(REJECT, { token, orgId: org.id, variables: { id: requestId } });
    expect(
      codeOf(await api.gql(APPROVE, { token, orgId: org.id, variables: { id: requestId } })),
    ).toBe('JOIN_REQUEST_NOT_PENDING');
    expect(
      codeOf(await api.gql(REJECT, { token, orgId: org.id, variables: { id: requestId } })),
    ).toBe('JOIN_REQUEST_NOT_PENDING');
  });

  it('a request from another org is NOT_FOUND', async () => {
    const org = await newOrg();
    const other = await newOrg();
    const { requestId } = await requestToJoin(other);
    const result = await api.gql(APPROVE, {
      token: api.token(org.ownerId),
      orgId: org.id,
      variables: { id: requestId },
    });
    expect(codeOf(result)).toBe('NOT_FOUND');
  });
});

describe('who may decide, and which roles can be granted', () => {
  it.each([
    ['owner', 'ADMIN', 'OK'],
    ['admin', 'ADMIN', 'OK'],
    ['admin', 'MEMBER', 'OK'],
    ['owner', 'OWNER', 'FORBIDDEN'],
    ['admin', 'OWNER', 'FORBIDDEN'],
    ['member', 'MEMBER', 'FORBIDDEN'],
    ['contributor', 'MEMBER', 'FORBIDDEN'],
  ])('%s approving with role %s: %s', async (deciderRole, grant, outcome) => {
    // Arrange
    const org = await newOrg();
    const decider =
      deciderRole === 'owner'
        ? org.ownerId
        : await (async () => {
            const id = await createUser(deciderRole);
            await addMember(
              org.id,
              org.ownerId,
              id,
              deciderRole as 'admin' | 'member' | 'contributor',
            );
            return id;
          })();
    const { requestId } = await requestToJoin(org);

    // Act
    const result = await api.gql(APPROVE, {
      token: api.token(decider),
      orgId: org.id,
      variables: { id: requestId, role: grant },
    });

    // Assert
    expect(codeOf(result) ?? 'OK').toBe(outcome);
  });

  it('addMember never grants OWNER either', async () => {
    const org = await newOrg();
    const target = await createUser('target');
    const result = await api.gql(ADD, {
      token: api.token(org.ownerId),
      orgId: org.id,
      variables: { email: await emailOf(target), role: 'OWNER' },
    });
    expect(codeOf(result)).toBe('FORBIDDEN');
  });
});

describe('join request list and requester visibility', () => {
  it('owners see requesters, with email; members get FORBIDDEN', async () => {
    // Arrange
    const org = await newOrg();
    const member = await createUser('member');
    await addMember(org.id, org.ownerId, member, 'member');
    const first = await requestToJoin(org, 'first');
    const second = await requestToJoin(org, 'second');
    const list = `{ organization { joinRequests(first: 1) { edges { cursor node { id user { displayName email } } } pageInfo { hasNextPage endCursor } } } }`;

    // Act
    const page1 = await api.gql(list, { token: api.token(org.ownerId), orgId: org.id });
    const after = (
      page1.body.data?.organization as { joinRequests: { pageInfo: { endCursor: string } } }
    ).joinRequests.pageInfo.endCursor;
    const page2 = await api.gql(
      `query ($after: String) { organization { joinRequests(first: 1, after: $after) { edges { node { id } } pageInfo { hasNextPage } } } }`,
      { token: api.token(org.ownerId), orgId: org.id, variables: { after } },
    );
    const asMember = await api.gql(list, { token: api.token(member), orgId: org.id });

    // Assert
    expect(page1.body.data).toMatchObject({
      organization: {
        joinRequests: {
          edges: [
            {
              node: {
                id: first.requestId,
                user: { displayName: 'first', email: await emailOf(first.userId) },
              },
            },
          ],
          pageInfo: { hasNextPage: true },
        },
      },
    });
    expect(page2.body.data).toEqual({
      organization: {
        joinRequests: {
          edges: [{ node: { id: second.requestId } }],
          pageInfo: { hasNextPage: false },
        },
      },
    });
    expect(codeOf(asMember)).toBe('FORBIDDEN');
  });
});

describe('addMember', () => {
  it('adds an existing account by exact email, and approves their pending request', async () => {
    // Arrange
    const org = await newOrg();
    const { userId, requestId } = await requestToJoin(org);

    // Act
    const result = await api.gql(ADD, {
      token: api.token(org.ownerId),
      orgId: org.id,
      variables: { email: (await emailOf(userId)).toUpperCase() },
    });
    const request = await inTx({ userId: org.ownerId, orgId: org.id }, (tx) =>
      tx.one(`SELECT status, decided_by FROM org_join_requests WHERE id = $1`, [requestId]),
    );

    // Assert
    expect(result.body.data).toEqual({
      addMember: { role: 'MEMBER', status: 'ACTIVE', user: { id: userId } },
    });
    expect(request).toEqual({ status: 'approved', decided_by: org.ownerId });
    expect(await eventsOf(org, 'member.added')).toEqual([
      {
        actor_id: org.ownerId,
        payload: { user_id: userId, role: 'member', via: 'direct', request_id: requestId },
      },
    ]);
  });

  it.each([
    ['an unknown email', 'unknown', 'NOT_FOUND'],
    ['an active member', 'active', 'ALREADY_MEMBER'],
  ])('rejects %s', async (_label, kind, code) => {
    const org = await newOrg();
    const email = kind === 'unknown' ? 'nobody@example.test' : await emailOf(org.ownerId);
    const result = await api.gql(ADD, {
      token: api.token(org.ownerId),
      orgId: org.id,
      variables: { email },
    });
    expect(codeOf(result)).toBe(code);
  });

  it('limits member lookups to 30 per org per hour', async () => {
    const strict = await startApp({}, { actionLimits: DEFAULT_ACTION_LIMITS });
    try {
      const org = await newOrg();
      const codes = [];
      for (let i = 0; i < 31; i += 1) {
        const result = await strict.gql(ADD, {
          token: strict.token(org.ownerId),
          orgId: org.id,
          variables: { email: `nobody-${i}@example.test` },
        });
        codes.push(codeOf(result));
      }
      expect(codes.slice(0, 30).every((code) => code === 'NOT_FOUND')).toBe(true);
      expect(codes[30]).toBe('RATE_LIMITED');
    } finally {
      await strict.close();
    }
  });
});

describe('members list', () => {
  it('lists members in any status by name, and shows email only to owners and admins', async () => {
    // Arrange
    const org = await newOrg();
    const member = await createUser('member');
    const departed = await createUser('departed');
    await addMember(org.id, org.ownerId, member, 'member');
    await addMember(org.id, org.ownerId, departed, 'member');
    await committed({ userId: org.ownerId, orgId: org.id }, (tx) =>
      tx.query(
        `UPDATE org_memberships SET status = 'deactivated', deactivated_at = now() WHERE user_id = $1`,
        [departed],
      ),
    );
    const query = `{ organization { members { edges { node { status user { displayName email } } } } } }`;
    type Nodes = {
      organization: {
        members: {
          edges: {
            node: { status: string; user: { displayName: string; email: string | null } };
          }[];
        };
      };
    };

    // Act
    const asOwner = (await api.gql(query, { token: api.token(org.ownerId), orgId: org.id })).body
      .data as Nodes;
    const asMember = (await api.gql(query, { token: api.token(member), orgId: org.id })).body
      .data as Nodes;

    // Assert
    const names = asOwner.organization.members.edges.map((e) => [
      e.node.user.displayName,
      e.node.status,
    ]);
    expect(names).toEqual([
      ['departed', 'DEACTIVATED'],
      ['member', 'ACTIVE'],
      ['owner', 'ACTIVE'],
    ]);
    expect(asOwner.organization.members.edges.every((e) => e.node.user.email !== null)).toBe(true);
    const memberView = asMember.organization.members.edges.map((e) => [
      e.node.user.displayName,
      e.node.user.email !== null,
    ]);
    expect(memberView).toEqual([
      ['departed', false],
      ['member', true],
      ['owner', false],
    ]);
  });
});
