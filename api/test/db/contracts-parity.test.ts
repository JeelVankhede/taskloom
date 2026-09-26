import {
  LABEL_COLORS,
  ORG_SLUG_PATTERN,
  ORG_SLUG_RESERVED,
  PROJECT_KEY_PATTERN,
} from '@taskloom/contracts';
import { describe, expect, it } from 'vitest';
import { inTx } from './support/db.js';
import { createOrg } from './support/fixtures.js';

/** The shared rules in @taskloom/contracts must accept exactly what the database accepts. */
describe('contracts parity with database checks', () => {
  it('org slug rule', async () => {
    const org = await createOrg();
    const samples = [
      'abc',
      'a-b',
      'ab1-9z',
      'a1b2c3',
      'ab',
      'abcdefg',
      '-ab',
      'ab-',
      'Abc',
      'a_b',
      ...ORG_SLUG_RESERVED,
    ];
    await inTx({ userId: org.ownerId }, async (tx) => {
      for (const slug of samples) {
        // Act
        const dbAccepts = await tx
          .fails(`SELECT app.create_organization('X', $1)`, [slug])
          .then(() => false)
          .catch(() => true);
        const contractAccepts =
          ORG_SLUG_PATTERN.test(slug) && !(ORG_SLUG_RESERVED as readonly string[]).includes(slug);

        // Assert
        expect(dbAccepts, slug).toBe(contractAccepts);
      }
    });
  });

  it('project key rule', async () => {
    const org = await createOrg();
    const samples = ['OPS', 'A1B', 'QA9', 'EN', 'ENGG', 'eng', '1AB', 'A-B'];
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      for (const key of samples) {
        const dbAccepts = await tx
          .fails(`SELECT app.create_project('X', $1)`, [key])
          .then(() => false)
          .catch(() => true);
        expect(dbAccepts, key).toBe(PROJECT_KEY_PATTERN.test(key));
      }
    });
  });

  it('label color tokens', async () => {
    await inTx({}, async (tx) => {
      const { def } = await tx.one<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'labels_color_token'`,
      );
      const dbColors = [...def.matchAll(/'([a-z]+)'::text/g)].map((m) => m[1]);
      expect(dbColors).toEqual([...LABEL_COLORS]);
    });
  });
});
