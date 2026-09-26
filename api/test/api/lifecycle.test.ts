import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committed } from '../db/support/db.js';
import { addMember, createOrg, createUser, type OrgFixture } from '../db/support/fixtures.js';
import { codeOf, startApp, type TestApp } from './support/app.js';

let api: TestApp;
let org: OrgFixture;

beforeAll(async () => {
  api = await startApp();
  org = await createOrg();
});
afterAll(() => api.close());

describe('authentication', () => {
  it('returns the viewer for a valid token, without an organization', async () => {
    // Act
    const result = await api.gql('{ viewer { id displayName } }', {
      token: api.token(org.ownerId),
    });

    // Assert
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ viewer: { id: org.ownerId, displayName: 'owner' } });
  });

  it.each([
    ['no token', undefined],
    ['a malformed token', 'not.a.jwt'],
    ['a token signed with another secret', 'other'],
    ['an expired token', 'expired'],
    ['a token whose subject is not a user id', 'bad-sub'],
  ])('rejects %s with UNAUTHENTICATED and HTTP 401', async (_label, kind) => {
    // Arrange
    const token =
      kind === 'other'
        ? api.token(org.ownerId, { secret: 'another-secret-that-is-at-least-32-chars' })
        : kind === 'expired'
          ? api.token(org.ownerId, { expiresIn: -10 })
          : kind === 'bad-sub'
            ? api.token(org.ownerId, { sub: 'admin' })
            : kind;

    // Act
    const result = await api.gql('{ viewer { id } }', { token });

    // Assert
    expect(result.status).toBe(401);
    expect(codeOf(result)).toBe('UNAUTHENTICATED');
    expect(result.body.data).toBeUndefined();
  });
});

describe('organization selection', () => {
  it('reads the selected organization when the caller is an active member', async () => {
    // Act
    const result = await api.gql('{ organization { id slug } viewer { id } }', {
      token: api.token(org.ownerId),
      orgId: org.orgId,
    });

    // Assert
    expect(result.body.data).toEqual({
      organization: { id: org.orgId, slug: org.slug },
      viewer: { id: org.ownerId },
    });
  });

  it('returns NOT_FOUND, never FORBIDDEN, for an organization the caller does not belong to', async () => {
    // Arrange
    const other = await createOrg();

    // Act
    const result = await api.gql('{ organization { id } }', {
      token: api.token(org.ownerId),
      orgId: other.orgId,
    });

    // Assert
    expect(codeOf(result)).toBe('NOT_FOUND');
    expect(result.body.data ?? null).toBeNull();
  });

  it('returns NOT_FOUND for a deactivated member', async () => {
    // Arrange
    const member = await createUser('leaver');
    await addMember(org.orgId, org.ownerId, member);
    await committed({ userId: org.ownerId, orgId: org.orgId }, (tx) =>
      tx.query(
        `UPDATE org_memberships SET status = 'deactivated', deactivated_at = now() WHERE user_id = $1`,
        [member],
      ),
    );

    // Act
    const result = await api.gql('{ organization { id } }', {
      token: api.token(member),
      orgId: org.orgId,
    });

    // Assert
    expect(codeOf(result)).toBe('NOT_FOUND');
  });

  it.each([
    ['missing', undefined],
    ['not an id', 'acme'],
  ])('rejects organization fields when the header is %s', async (_label, header) => {
    const result = await api.gql('{ organization { id } }', {
      token: api.token(org.ownerId),
      orgId: header,
    });
    expect(result.status).toBe(400);
    expect(codeOf(result)).toBe('VALIDATION_FAILED');
  });

  it('rejects an org-less mutation combined with organization fields', async () => {
    const result = await api.gql(
      'mutation { createOrganization(input: { name: "X", slug: "mix" }) { id } insertLabel(name: "x") }',
      {
        token: api.token(org.ownerId),
        orgId: org.orgId,
      },
    );
    expect(codeOf(result)).toBe('VALIDATION_FAILED');
  });
});

describe('errors', () => {
  it('masks unexpected errors: no message detail, no stack, INTERNAL_SERVER_ERROR', async () => {
    // Act
    const result = await api.gql('{ leakyFailure }', {
      token: api.token(org.ownerId),
      orgId: org.orgId,
    });
    const raw = JSON.stringify(result.body);

    // Assert
    expect(codeOf(result)).toBe('INTERNAL_SERVER_ERROR');
    expect(raw).not.toContain('secret');
    expect(raw).not.toContain('stacktrace');
  });

  it('echoes a safe request id, and generates one otherwise', async () => {
    const token = api.token(org.ownerId);
    const echoed = await api.gql('{ viewer { id } }', {
      token,
      headers: { 'x-request-id': 'trace-123' },
    });
    const generated = await api.gql('{ viewer { id } }', {
      token,
      headers: { 'x-request-id': 'bad id\n' },
    });
    expect(echoed.headers.get('x-request-id')).toBe('trace-123');
    expect(generated.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
