import { describe, expect, it } from 'vitest';
import { committed, expectCode, inTx } from './support/db.js';
import { createOrg, createUser } from './support/fixtures.js';

type JoinRow = { id: string; org_id: string; org_slug: string; org_name: string; status: string };

const submit = (userId: string, slug: string) =>
  committed({ userId }, (tx) =>
    tx.one<JoinRow>(`SELECT * FROM app.submit_join_request($1)`, [slug]),
  );

describe('T29: join requests cross tenants only for the requester', () => {
  it('lets a non-member request by slug and see the org name on their own request', async () => {
    // Arrange
    const org = await createOrg();
    const requester = await createUser('requester');

    // Act
    const request = await submit(requester, org.slug.toUpperCase());

    // Assert
    expect(request).toMatchObject({
      org_id: org.orgId,
      org_slug: org.slug,
      org_name: 'Org',
      status: 'pending',
    });
    await inTx({ userId: requester }, async (tx) => {
      const { rows } = await tx.query<JoinRow>(`SELECT * FROM app.viewer_join_requests()`);
      expect(rows.map((r) => r.id)).toEqual([request.id]);
    });
  });

  it('gives the requester no tenant rows in their org-less context', async () => {
    // Arrange
    const org = await createOrg();
    const requester = await createUser('requester');
    await submit(requester, org.slug);

    await inTx({ userId: requester }, async (tx) => {
      // Act
      const counts = await tx.one(
        `SELECT (SELECT count(*) FROM org_join_requests) AS requests,
                (SELECT count(*) FROM org_memberships) AS members,
                (SELECT count(*) FROM organizations) AS orgs`,
      );

      // Assert: the only way in is app.viewer_join_requests(), which returns their own rows
      expect(counts).toEqual({ requests: '0', members: '0', orgs: '0' });
    });
  });

  it('allows one pending request per user per org, and rejects existing members', async () => {
    // Arrange
    const org = await createOrg();
    const requester = await createUser('requester');
    await submit(requester, org.slug);

    // Act and assert
    await inTx({ userId: requester }, async (tx) => {
      expectCode(
        await tx.fails(`SELECT * FROM app.submit_join_request($1)`, [org.slug]),
        'JOIN_REQUEST_PENDING',
      );
    });
    await inTx({ userId: org.ownerId }, async (tx) => {
      expectCode(
        await tx.fails(`SELECT * FROM app.submit_join_request($1)`, [org.slug]),
        'ALREADY_MEMBER',
      );
    });
    await inTx({ userId: requester }, async (tx) => {
      expectCode(await tx.fails(`SELECT * FROM app.submit_join_request('zzz-99')`), 'NOT_FOUND');
    });
  });

  it('lets the requester cancel only their own pending request', async () => {
    // Arrange
    const org = await createOrg();
    const requester = await createUser('requester');
    const stranger = await createUser('stranger');
    const request = await submit(requester, org.slug);

    // Act and assert
    await inTx({ userId: stranger }, async (tx) => {
      expectCode(
        await tx.fails(`SELECT * FROM app.cancel_join_request($1)`, [request.id]),
        'NOT_FOUND',
      );
    });
    await committed({ userId: requester }, async (tx) => {
      const canceled = await tx.one<JoinRow>(`SELECT * FROM app.cancel_join_request($1)`, [
        request.id,
      ]);
      expect(canceled.status).toBe('canceled');
    });
    await inTx({ userId: requester }, async (tx) => {
      expectCode(
        await tx.fails(`SELECT * FROM app.cancel_join_request($1)`, [request.id]),
        'JOIN_REQUEST_NOT_PENDING',
      );
      // A canceled request no longer blocks a new one.
      await tx.query(`SELECT * FROM app.submit_join_request($1)`, [org.slug]);
    });
  });

  it('shows the request to the target org only, never to another org', async () => {
    // Arrange
    const target = await createOrg();
    const other = await createOrg();
    const requester = await createUser('requester');
    const request = await submit(requester, target.slug);

    // Act
    const seenByTarget = await inTx({ userId: target.ownerId, orgId: target.orgId }, (tx) =>
      tx.query(`SELECT id FROM org_join_requests`),
    );
    const seenByOther = await inTx({ userId: other.ownerId, orgId: other.orgId }, (tx) =>
      tx.query(`SELECT id FROM org_join_requests WHERE id = $1`, [request.id]),
    );

    // Assert
    expect(seenByTarget.rows).toEqual([{ id: request.id }]);
    expect(seenByOther.rowCount).toBe(0);
  });
});
