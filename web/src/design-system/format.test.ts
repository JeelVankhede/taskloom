import { describe, expect, it } from 'vitest';
import { formatDate, initials } from './format';

describe('formatDate', () => {
  it.each([
    ['2026-03-04', '2026-09-27', 'Mar 4'],
    ['2026-12-31', '2026-01-01', 'Dec 31'],
    ['2027-01-01', '2026-12-31', 'Jan 1, 2027'],
  ])('%s (today %s) is %s, whatever the local timezone', (date, today, expected) => {
    expect(formatDate(date, today)).toBe(expected);
  });
});

describe('initials', () => {
  it.each([
    ['Ada Lovelace', 'AL'],
    ['  grace  brewster hopper ', 'GB'],
    ['Linus', 'L'],
  ])('%s gives %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
