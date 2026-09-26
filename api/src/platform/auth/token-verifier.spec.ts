import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { TokenVerifier } from './token-verifier.js';

const SECRET = 'unit-test-secret-that-is-at-least-32-chars';
const USER = '01a0df4b-82b8-76bb-9ef8-34226e862dd6';
const jwt = new JwtService({ secret: SECRET });
const verifier = new TokenVerifier(jwt);

describe('TokenVerifier', () => {
  it('returns the user id from a valid bearer token', async () => {
    await expect(verifier.userIdFrom(`Bearer ${jwt.sign({ sub: USER })}`)).resolves.toBe(USER);
  });

  it.each([
    ['missing header', undefined],
    ['wrong scheme', `Basic ${jwt.sign({ sub: USER })}`],
    ['expired', `Bearer ${jwt.sign({ sub: USER }, { expiresIn: -1 })}`],
    ['wrong secret', `Bearer ${jwt.sign({ sub: USER }, { secret: 'x'.repeat(40) })}`],
    ['non-uuid subject', `Bearer ${jwt.sign({ sub: 'admin' })}`],
    ['no subject', `Bearer ${jwt.sign({ role: 'owner' })}`],
    [
      'alg none',
      `Bearer ${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(`{"sub":"${USER}"}`).toString('base64url')}.`,
    ],
  ])('rejects %s with UNAUTHENTICATED', async (_label, header) => {
    await expect(verifier.userIdFrom(header)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
