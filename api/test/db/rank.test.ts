import { describe, expect, it } from 'vitest';
import { expectCode, inTx, type Tx } from './support/db.js';
import { createOrg, insertTask } from './support/fixtures.js';

const between = async (tx: Tx, lower: string | null, upper: string | null) =>
  (await tx.one<{ key: string }>(`SELECT app.rank_between($1, $2) AS key`, [lower, upper])).key;

const isValid = async (tx: Tx, key: string) =>
  (await tx.one<{ valid: boolean }>(`SELECT app.rank_is_valid($1) AS valid`, [key])).valid;

describe('rank generation (fractional indexing with an integer part)', () => {
  it('produces valid keys strictly between their bounds, in C collation', async () => {
    await inTx({}, async (tx) => {
      // Arrange: a deterministic pseudo-random sequence of inserts between neighbours
      const keys: string[] = [];
      let seed = 7;
      const next = () => (seed = (seed * 48271) % 2147483647);

      for (let i = 0; i < 300; i += 1) {
        // Act
        const at = keys.length === 0 ? 0 : next() % (keys.length + 1);
        const lower = at === 0 ? null : keys[at - 1]!;
        const upper = at === keys.length ? null : keys[at]!;
        const key = await between(tx, lower, upper);

        // Assert
        expect(await isValid(tx, key)).toBe(true);
        if (lower !== null) expect(key > lower).toBe(true);
        if (upper !== null) expect(key < upper).toBe(true);
        keys.splice(at, 0, key);
      }
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  it('starts at a0, decrements and increments the integer part, and carries correctly', async () => {
    await inTx({}, async (tx) => {
      expect(await between(tx, null, null)).toBe('a0');
      expect(await between(tx, null, 'a0')).toBe('Zz');
      expect(await between(tx, 'a0', null)).toBe('a1');
      expect(await between(tx, 'az', null)).toBe('b00');
      expect(await between(tx, null, 'b00')).toBe('az');
      expect(await between(tx, 'a0', 'a1')).toBe('a0V');
    });
  });

  it('regression: 1,000 creates at the top stay short (old keys passed 128 characters at ~770)', async () => {
    await inTx({}, async (tx) => {
      // Act: the same SQL loop the insert trigger effectively runs, "before the lowest key"
      const { maxLength } = await tx.one<{ maxLength: number }>(`
        WITH RECURSIVE k(n, key) AS (
          SELECT 1, app.rank_between(NULL, NULL)
          UNION ALL SELECT n + 1, app.rank_between(NULL, key) FROM k WHERE n < 1000
        )
        SELECT max(length(key)) AS "maxLength" FROM k`);

      // Assert
      expect(maxLength).toBeLessThanOrEqual(4);
    });
  });

  it('rejects inverted, equal, or malformed bounds with RANK_CONFLICT', async () => {
    await inTx({}, async (tx) => {
      expectCode(await tx.fails(`SELECT app.rank_between('a1', 'a0')`), 'RANK_CONFLICT');
      expectCode(await tx.fails(`SELECT app.rank_between('a0', 'a0')`), 'RANK_CONFLICT');
      expectCode(await tx.fails(`SELECT app.rank_between(NULL, 'V')`), 'RANK_CONFLICT');
    });
  });

  it('validates the key format', async () => {
    await inTx({}, async (tx) => {
      for (const key of ['a0', 'Zz', 'b00', 'a0V', 'a1x'])
        expect(await isValid(tx, key), key).toBe(true);
      for (const key of ['', 'V', 'a', 'a00', '0a', 'a0!', `A${'0'.repeat(26)}`]) {
        expect(await isValid(tx, key), key).toBe(false);
      }
    });
  });

  it('puts each new task above every other task in its project (top of column, unique)', async () => {
    const org = await createOrg();
    await inTx({ userId: org.ownerId, orgId: org.orgId }, async (tx) => {
      // Act: interleave creates across columns
      const ranks: string[] = [];
      for (let i = 0; i < 60; i += 1) {
        const status = [org.statuses.Todo!, org.statuses.Backlog!, org.statuses['In Progress']!][
          i % 3
        ]!;
        ranks.push((await insertTask(tx, org, { statusId: status })).rank);
      }

      // Assert: every new key is below all earlier keys, so it tops its column, and all are short
      for (let i = 1; i < ranks.length; i += 1) expect(ranks[i]! < ranks[i - 1]!).toBe(true);
      expect(Math.max(...ranks.map((rank) => rank.length))).toBeLessThanOrEqual(3);
    });
  });
});
