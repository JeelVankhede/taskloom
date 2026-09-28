import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-redirect';

describe('safeNext', () => {
  it.each([
    ['?next=%2Fo%2Facme%2Fmembers', '/o/acme/members'],
    ['?next=%2Fo%2Facme%3Ftab%3D1', '/o/acme?tab=1'],
    ['', null],
    ['?next=https%3A%2F%2Fevil.test', null],
    ['?next=%2F%2Fevil.test', null],
    ['?next=%2F%5Cevil.test', null],
    ['?next=javascript%3Aalert(1)', null],
  ])('%s gives %s', (search, expected) => {
    expect(safeNext(search)).toBe(expected);
  });
});
