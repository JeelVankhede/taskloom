import { describe, expect, it } from 'vitest';
import { isValidSlug, suggestSlug } from './slug';

describe('suggestSlug', () => {
  it.each([
    ['Acme', 'acme'],
    ['Globex Corporation', 'globex'],
    ['Big Co', 'big-co'],
    ['Crème Brûlée', 'creme'],
    ['R&D Lab', 'r-d-la'],
    ['A B', 'a-b'],
    ['X', ''],
    ['!!!', ''],
    ['Admin', ''],
    ['abcde-', 'abcde'],
  ])('%s gives "%s"', (name, slug) => {
    expect(suggestSlug(name)).toBe(slug);
  });

  it('only ever suggests valid slugs', () => {
    for (const name of ['Acme', 'Big Co', 'R&D Lab', 'A B']) {
      expect(isValidSlug(suggestSlug(name))).toBe(true);
    }
  });
});
