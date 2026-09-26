import { describe, expect, it } from 'vitest';
import { expectCode, inTx } from './support/db.js';

const FORMAT = /^[0-9A-Za-z]{1,128}$/;

describe('rank generation', () => {
  it('produces keys strictly between their bounds, in C collation, never ending in 0', async () => {
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
        const { key } = await tx.one<{ key: string }>(`SELECT app.rank_between($1, $2) AS key`, [
          lower,
          upper,
        ]);

        // Assert
        expect(key).toMatch(FORMAT);
        expect(key.endsWith('0')).toBe(false);
        if (lower !== null) expect(key > lower).toBe(true);
        if (upper !== null) expect(key < upper).toBe(true);
        keys.splice(at, 0, key);
      }
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  it('starts an empty space at V and rejects inverted bounds with RANK_CONFLICT', async () => {
    await inTx({}, async (tx) => {
      expect(await tx.one(`SELECT app.rank_between(NULL, NULL) AS key`)).toEqual({ key: 'V' });
      expect(await tx.one(`SELECT app.task_rank_before('V') AS key`)).toEqual({ key: 'G' });
      expectCode(await tx.fails(`SELECT app.rank_between('b', 'a')`), 'RANK_CONFLICT');
      expectCode(await tx.fails(`SELECT app.rank_between('a', 'a')`), 'RANK_CONFLICT');
    });
  });
});
