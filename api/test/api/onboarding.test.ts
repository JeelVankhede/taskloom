import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ACTION_LIMITS } from '../../src/platform/rate-limit/action-limiter.js';
import { createUser, newSlug } from '../db/support/fixtures.js';
import { codeOf, startApp, type TestApp } from './support/app.js';

let api: TestApp;

beforeAll(async () => {
  api = await startApp();
});
afterAll(() => api.close());

const CREATE_ORG = `mutation ($input: CreateOrganizationInput!) { createOrganization(input: $input) { id slug name } }`;
const REQUEST = `mutation ($slug: String!) {
  requestToJoinOrganization(slug: $slug) { id status organization { id slug name } }
}`;

async function createOrgAs(userId: string, slug = newSlug(), name = 'Acme') {
  const result = await api.gql(CREATE_ORG, {
    token: api.token(userId),
    variables: { input: { name, slug } },
  });
  return result.body.data?.createOrganization as { id: string; slug: string; name: string };
}

describe('createOrganization', () => {
  it('creates the org without X-Org-Id and makes the caller its owner', async () => {
    // Arrange
    const user = await createUser('founder');
    const slug = newSlug();

    // Act
    const created = await createOrgAs(user, slug, '  Acme Inc  ');
    const viewer = await api.gql('{ viewer { memberships { role organization { id slug } } } }', {
      token: api.token(user),
    });
    const org = await api.gql('{ organization { id name } }', {
      token: api.token(user),
      orgId: created.id,
    });

    // Assert
    expect(created).toMatchObject({ slug, name: 'Acme Inc' });
    expect(viewer.body.data).toEqual({
      viewer: { memberships: [{ role: 'OWNER', organization: { id: created.id, slug } }] },
    });
    expect(org.body.data).toEqual({ organization: { id: created.id, name: 'Acme Inc' } });
  });

  it('exposes the timezone it was created with, and UTC by default', async () => {
    // Arrange
    const user = await createUser('tz');
    const zoned = await api.gql(CREATE_ORG, {
      token: api.token(user),
      variables: { input: { name: 'Zoned', slug: newSlug(), timezone: 'Asia/Kolkata' } },
    });
    const plain = await createOrgAs(user);
    const read = (orgId: string) =>
      api.gql('{ organization { timezone } }', { token: api.token(user), orgId });

    // Act
    const [a, b] = await Promise.all([
      read((zoned.body.data?.createOrganization as { id: string }).id),
      read(plain.id),
    ]);

    // Assert
    expect(a.body.data).toEqual({ organization: { timezone: 'Asia/Kolkata' } });
    expect(b.body.data).toEqual({ organization: { timezone: 'UTC' } });
  });

  it.each([
    ['a taken slug', 'taken', 'ORG_SLUG_TAKEN'],
    ['a slug that is too long', 'abcdefg', 'VALIDATION_FAILED'],
    ['a reserved slug', 'api', 'VALIDATION_FAILED'],
    ['an unknown timezone', 'tz', 'VALIDATION_FAILED'],
  ])('rejects %s', async (_label, kind, code) => {
    // Arrange
    const user = await createUser('founder');
    const taken = await createOrgAs(user);
    const input =
      kind === 'taken'
        ? { name: 'X', slug: taken.slug }
        : kind === 'tz'
          ? { name: 'X', slug: newSlug(), timezone: 'Mars/Olympus' }
          : { name: 'X', slug: kind };

    // Act
    const result = await api.gql(CREATE_ORG, { token: api.token(user), variables: { input } });

    // Assert
    expect(codeOf(result)).toBe(code);
  });

  it('limits org creation to 5 per user per day', async () => {
    // Arrange: an app with the real limits
    const strict = await startApp({}, { actionLimits: DEFAULT_ACTION_LIMITS });
    const user = await createUser('prolific');
    try {
      // Act
      const codes = [];
      for (let i = 0; i < 6; i += 1) {
        const result = await strict.gql(CREATE_ORG, {
          token: strict.token(user),
          variables: { input: { name: 'X', slug: newSlug() } },
        });
        codes.push(codeOf(result) ?? 'OK');
      }

      // Assert
      expect(codes).toEqual(['OK', 'OK', 'OK', 'OK', 'OK', 'RATE_LIMITED']);
    } finally {
      await strict.close();
    }
  });
});

describe('join requests from the requester side', () => {
  it('requests by slug, shows the org name, and lists it on the viewer', async () => {
    // Arrange
    const owner = await createUser('owner');
    const org = await createOrgAs(owner, newSlug(), 'Globex');
    const requester = await createUser('requester');

    // Act
    const request = await api.gql(REQUEST, {
      token: api.token(requester),
      variables: { slug: org.slug.toUpperCase() },
    });
    const viewer = await api.gql(
      '{ viewer { joinRequests { id status organization { name } } } }',
      {
        token: api.token(requester),
      },
    );

    // Assert
    const created = request.body.data?.requestToJoinOrganization as { id: string };
    expect(request.body.data).toEqual({
      requestToJoinOrganization: {
        id: created.id,
        status: 'PENDING',
        organization: { id: org.id, slug: org.slug, name: 'Globex' },
      },
    });
    expect(viewer.body.data).toEqual({
      viewer: {
        joinRequests: [{ id: created.id, status: 'PENDING', organization: { name: 'Globex' } }],
      },
    });
  });

  it.each([
    ['a second pending request', 'again', 'JOIN_REQUEST_PENDING'],
    ['a request from an existing member', 'member', 'ALREADY_MEMBER'],
    ['an unknown slug', 'unknown', 'NOT_FOUND'],
  ])('rejects %s', async (_label, kind, code) => {
    // Arrange
    const owner = await createUser('owner');
    const org = await createOrgAs(owner);
    const requester = await createUser('requester');
    await api.gql(REQUEST, { token: api.token(requester), variables: { slug: org.slug } });
    const [who, slug] =
      kind === 'again'
        ? [requester, org.slug]
        : kind === 'member'
          ? [owner, org.slug]
          : [requester, 'zzz-9'];

    // Act
    const result = await api.gql(REQUEST, { token: api.token(who), variables: { slug } });

    // Assert
    expect(codeOf(result)).toBe(code);
  });

  it("cancels only the caller's own pending request", async () => {
    // Arrange
    const owner = await createUser('owner');
    const org = await createOrgAs(owner);
    const requester = await createUser('requester');
    const stranger = await createUser('stranger');
    const request = await api.gql(REQUEST, {
      token: api.token(requester),
      variables: { slug: org.slug },
    });
    const id = (request.body.data?.requestToJoinOrganization as { id: string }).id;
    const cancel = `mutation ($id: ID!) { cancelJoinRequest(id: $id) { id status } }`;

    // Act
    const byStranger = await api.gql(cancel, { token: api.token(stranger), variables: { id } });
    const byOwner = await api.gql(cancel, { token: api.token(requester), variables: { id } });
    const again = await api.gql(cancel, { token: api.token(requester), variables: { id } });
    const notAnId = await api.gql(cancel, {
      token: api.token(requester),
      variables: { id: 'nope' },
    });

    // Assert
    expect(codeOf(byStranger)).toBe('NOT_FOUND');
    expect(byOwner.body.data).toEqual({ cancelJoinRequest: { id, status: 'CANCELED' } });
    expect(codeOf(again)).toBe('JOIN_REQUEST_NOT_PENDING');
    expect(codeOf(notAnId)).toBe('NOT_FOUND');
  });

  it('limits join requests to 10 per user per hour', async () => {
    const strict = await startApp({}, { actionLimits: DEFAULT_ACTION_LIMITS });
    const requester = await createUser('eager');
    try {
      const codes = [];
      for (let i = 0; i < 11; i += 1) {
        const result = await strict.gql(REQUEST, {
          token: strict.token(requester),
          variables: { slug: 'zzz-9' },
        });
        codes.push(codeOf(result));
      }
      expect(codes.slice(0, 10).every((code) => code === 'NOT_FOUND')).toBe(true);
      expect(codes[10]).toBe('RATE_LIMITED');
    } finally {
      await strict.close();
    }
  });
});
