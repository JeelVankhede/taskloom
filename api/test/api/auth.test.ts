import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AUTH_LIMITS } from '../../src/modules/identity/auth-rate-limiter.js';
import { startApp, type RestResult, type TestApp } from './support/app.js';

let api: TestApp;

beforeAll(async () => {
  api = await startApp();
});
afterAll(() => api.close());

const PASSWORD = 'correct horse battery';
const newEmail = () => `user-${randomUUID()}@example.test`;

/** The cookie pair to send back ("tl_refresh=value"), from a Set-Cookie header. */
const cookieOf = (result: RestResult) => result.cookie?.split(';')[0] ?? '';

async function signUp(email = newEmail()) {
  const result = await api.post('/auth/signup', {
    email,
    password: PASSWORD,
    displayName: 'New User',
  });
  return { email, result, cookie: cookieOf(result) };
}

describe('sign up', () => {
  it('creates the account, signs in, and sets a locked-down refresh cookie', async () => {
    // Act
    const { email, result } = await signUp();

    // Assert
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ expiresIn: 900, user: { email, displayName: 'New User' } });
    expect(result.body).not.toHaveProperty('refreshToken');
    const cookie = result.cookie!;
    expect(cookie).toMatch(/^tl_refresh=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('Path=/auth');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');
  });

  it('issues an access token that the GraphQL lifecycle accepts', async () => {
    // Arrange
    const { result } = await signUp();

    // Act
    const viewer = await api.gql('{ viewer { id email } }', {
      token: result.body!.accessToken as string,
    });

    // Assert
    expect(viewer.body.data).toEqual({
      viewer: { id: (result.body!.user as { id: string }).id, email: expect.any(String) },
    });
  });

  it('rejects a registered email, in any letter case, with EMAIL_TAKEN', async () => {
    const { email } = await signUp();
    const again = await api.post('/auth/signup', {
      email: email.toUpperCase(),
      password: PASSWORD,
      displayName: 'X',
    });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it.each([
    ['a short password', { password: 'short' }, 'password'],
    [
      'a password equal to the email',
      { email: 'same-as-password@example.test', password: 'same-as-password@example.test' },
      'password',
    ],
    ['an invalid email', { email: 'not-an-email' }, 'email'],
    ['a blank display name', { displayName: '   ' }, 'displayName'],
  ])('rejects %s with VALIDATION_FAILED', async (_label, override, field) => {
    const result = await api.post('/auth/signup', {
      email: newEmail(),
      password: PASSWORD,
      displayName: 'Name',
      ...override,
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ code: 'VALIDATION_FAILED', field });
  });

  it('rejects a malformed body with VALIDATION_FAILED', async () => {
    const result = await api.post('/auth/signup', { email: 42 });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('sign in', () => {
  it('signs in with the right password, case-insensitively on email', async () => {
    const { email } = await signUp();
    const result = await api.post('/auth/signin', {
      email: `  ${email.toUpperCase()} `,
      password: PASSWORD,
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ user: { email } });
    expect(cookieOf(result)).toMatch(/^tl_refresh=/);
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const { email } = await signUp();
    const wrong = await api.post('/auth/signin', { email, password: 'wrong password!' });
    const unknown = await api.post('/auth/signin', { email: newEmail(), password: PASSWORD });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(wrong.cookie).toBeNull();
  });
});

describe('T31: refresh rotation, reuse, and sign out', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    // Arrange
    const { cookie } = await signUp();

    // Act
    const refreshed = await api.post('/auth/refresh', undefined, { cookie });

    // Assert
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toMatchObject({ accessToken: expect.any(String), expiresIn: 900 });
    expect(cookieOf(refreshed)).toMatch(/^tl_refresh=/);
    expect(cookieOf(refreshed)).not.toBe(cookie);
  });

  it('revokes the whole family when a rotated token is presented again', async () => {
    // Arrange
    const { cookie: first } = await signUp();
    const second = cookieOf(await api.post('/auth/refresh', undefined, { cookie: first }));

    // Act: the old token comes back (stolen, or a second tab under strict rotation)
    const reuse = await api.post('/auth/refresh', undefined, { cookie: first });
    const afterReuse = await api.post('/auth/refresh', undefined, { cookie: second });

    // Assert
    expect(reuse.status).toBe(401);
    expect(reuse.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(reuse.cookie).toContain('tl_refresh=;');
    expect(afterReuse.status).toBe(401);
  });

  it('sign out revokes the session and clears the cookie', async () => {
    // Arrange
    const { cookie } = await signUp();

    // Act
    const out = await api.post('/auth/signout', undefined, { cookie });
    const refresh = await api.post('/auth/refresh', undefined, { cookie });

    // Assert
    expect(out.status).toBe(204);
    expect(out.cookie).toContain('tl_refresh=;');
    expect(refresh.status).toBe(401);
  });

  it('keeps other sessions of the same user alive', async () => {
    const { email, cookie: laptop } = await signUp();
    const phone = cookieOf(await api.post('/auth/signin', { email, password: PASSWORD }));
    await api.post('/auth/signout', undefined, { cookie: laptop });
    expect((await api.post('/auth/refresh', undefined, { cookie: phone })).status).toBe(200);
  });

  it('rejects a missing or unknown refresh cookie', async () => {
    expect((await api.post('/auth/refresh')).status).toBe(401);
    expect(
      (await api.post('/auth/refresh', undefined, { cookie: 'tl_refresh=forged' })).status,
    ).toBe(401);
  });
});

describe('origin check', () => {
  it.each([
    ['missing', null],
    ['another site', 'https://evil.example'],
  ])('rejects an %s Origin with FORBIDDEN', async (_label, origin) => {
    const result = await api.post(
      '/auth/signin',
      { email: newEmail(), password: PASSWORD },
      { origin },
    );
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('rate limits', () => {
  it('limits sign in to 5 attempts a minute per email', async () => {
    // Arrange: an app with the real limits
    const limited = await startApp({}, { authLimits: DEFAULT_AUTH_LIMITS });
    try {
      const email = newEmail();

      // Act
      const statuses = [];
      for (let i = 0; i < 6; i += 1) {
        statuses.push(
          (await limited.post('/auth/signin', { email, password: 'wrong password!' })).status,
        );
      }

      // Assert
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    } finally {
      await limited.close();
    }
  });
});
