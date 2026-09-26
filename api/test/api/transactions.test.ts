import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { committed, inTx } from '../db/support/db.js';
import { createOrg, insertTask, type OrgFixture } from '../db/support/fixtures.js';
import { codeOf, startApp, type TestApp } from './support/app.js';
import { probeHooks } from './support/probe.js';

let api: TestApp;
let org: OrgFixture;

beforeAll(async () => {
  api = await startApp();
  org = await createOrg();
});
afterAll(() => api.close());

const labelCount = (name: string) =>
  inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) =>
    Number(
      (await tx.one<{ n: string }>(`SELECT count(*) AS n FROM labels WHERE name = $1`, [name])).n,
    ),
  );

describe('T22: one snapshot per read request', () => {
  it('a task committed by another session mid-request is invisible to the rest of that request', async () => {
    // Arrange: between the two reads, another session commits a task
    probeHooks.between = () =>
      committed({ userId: org.ownerId, orgId: org.orgId }, (tx) =>
        insertTask(tx, org, { statusId: org.statuses.Todo! }).then(() => undefined),
      );

    try {
      // Act
      const within = await api.gql('{ snapshotProbe }', {
        token: api.token(org.ownerId),
        orgId: org.orgId,
      });
      const after = await api.gql('{ snapshotProbe }', {
        token: api.token(org.ownerId),
        orgId: org.orgId,
      });

      // Assert
      const [before, again] = within.body.data!.snapshotProbe as number[];
      expect(again).toBe(before);
      expect((after.body.data!.snapshotProbe as number[])[0]).toBe(before! + 1);
    } finally {
      delete probeHooks.between;
    }
  });
});

describe('transaction behavior', () => {
  it('runs queries read-only: a write inside a query fails and persists nothing', async () => {
    // Act
    const result = await api.gql('{ writeInQuery }', {
      token: api.token(org.ownerId),
      orgId: org.orgId,
    });

    // Assert
    expect(codeOf(result)).toBe('INTERNAL_SERVER_ERROR');
    expect(await labelCount('from-query')).toBe(0);
  });

  it('commits a successful mutation', async () => {
    const result = await api.gql('mutation { insertLabel(name: "kept") }', {
      token: api.token(org.ownerId),
      orgId: org.orgId,
    });
    expect(result.body.data).toEqual({ insertLabel: true });
    expect(await labelCount('kept')).toBe(1);
  });

  it('rolls back every write of a mutation that fails', async () => {
    const result = await api.gql('mutation { insertLabelThenFail(name: "rolled-back") }', {
      token: api.token(org.ownerId),
      orgId: org.orgId,
    });
    expect(codeOf(result)).toBe('VALIDATION_FAILED');
    expect(await labelCount('rolled-back')).toBe(0);
  });

  it('reports a failed commit instead of success (deferred LAST_OWNER)', async () => {
    // Arrange: a separate org, so demoting its only owner cannot affect other tests
    const solo = await createOrg();

    // Act
    const result = await api.gql('mutation { demoteSelf }', {
      token: api.token(solo.ownerId),
      orgId: solo.orgId,
    });

    // Assert
    expect(codeOf(result)).toBe('LAST_OWNER');
    expect(result.body.data ?? null).toBeNull();
  });

  it('ends a request that exceeds the transaction timeout', async () => {
    // Arrange: a second app with a 200 ms transaction timeout
    const slow = await startApp({ DB_TX_TIMEOUT_MS: '200' });
    try {
      // Act
      const result = await slow.gql('{ slowProbe(ms: 500) }', {
        token: slow.token(org.ownerId),
        orgId: org.orgId,
      });

      // Assert
      expect(codeOf(result)).toBe('INTERNAL_SERVER_ERROR');
    } finally {
      await slow.close();
    }
  });
});

describe('T23: query limits', () => {
  const token = () => api.token(org.ownerId);

  it('rejects first above 100 with VALIDATION_FAILED', async () => {
    const result = await api.gql('{ probe { list(first: 101) { value } } }', {
      token: token(),
      orgId: org.orgId,
    });
    expect(codeOf(result)).toBe('VALIDATION_FAILED');
  });

  it('rejects a query deeper than 10 with QUERY_TOO_COMPLEX', async () => {
    const deep = `{ probe { ${'child { '.repeat(10)}value${' }'.repeat(10)} } }`;
    const result = await api.gql(deep, { token: token(), orgId: org.orgId });
    expect(result.status).toBe(400);
    expect(codeOf(result)).toBe('QUERY_TOO_COMPLEX');
  });

  it('rejects nested connections over the cost limit with QUERY_TOO_COMPLEX', async () => {
    const result = await api.gql('{ probe { list(first: 100) { list(first: 100) { value } } } }', {
      token: token(),
      orgId: org.orgId,
    });
    expect(codeOf(result)).toBe('QUERY_TOO_COMPLEX');
  });

  it('allows a query within both limits', async () => {
    const result = await api.gql('{ probe { list(first: 50) { value child { value } } } }', {
      token: token(),
      orgId: org.orgId,
    });
    expect(result.body.errors).toBeUndefined();
  });
});

describe('rate limit', () => {
  it('returns RATE_LIMITED with HTTP 429 after 300 operations a minute', async () => {
    // Arrange: a fresh user, so other tests' traffic does not count
    const busy = await createOrg();
    const token = api.token(busy.ownerId);
    for (let i = 0; i < 300; i += 1) {
      const ok = await api.gql('{ viewer { id } }', { token });
      expect(ok.status).toBe(200);
    }

    // Act
    const limited = await api.gql('{ viewer { id } }', { token });

    // Assert
    expect(limited.status).toBe(429);
    expect(codeOf(limited)).toBe('RATE_LIMITED');
  });
});

describe('startup', () => {
  it('refuses to start when the database login holds privileges of its own', async () => {
    await expect(startApp({ DATABASE_URL: inject('ownerUrl') })).rejects.toThrow(
      /must have no privileges/,
    );
  });
});
