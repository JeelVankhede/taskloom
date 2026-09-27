import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json } from '../../test/render';
import { sessionBody, user } from '../../test/fixtures';
import { resetSessionForTests, session } from './session';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetSessionForTests();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('session.refresh', () => {
  it('shares one request between concurrent callers in a tab', async () => {
    // Arrange
    fetchMock.mockResolvedValue(json(200, sessionBody('fresh')));

    // Act
    const tokens = await Promise.all([session.refresh(), session.refresh(), session.refresh()]);

    // Assert
    expect(tokens).toEqual(['fresh', 'fresh', 'fresh']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.getAccessToken()).toBe('fresh');
  });

  it('holds the tl-refresh Web Lock while refreshing, so tabs take turns', async () => {
    // Arrange
    const held: string[] = [];
    const request = vi.fn(async (name: string, fn: () => Promise<unknown>) => {
      held.push(name);
      const result = await fn();
      held.pop();
      return result;
    });
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    fetchMock.mockImplementation(async () => {
      // Assert (inside): the request runs while the lock is held.
      expect(held).toEqual(['tl-refresh']);
      return json(200, sessionBody());
    });

    // Act
    await session.refresh();

    // Assert
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('signs out when the cookie is missing, expired, or revoked (401)', async () => {
    // Arrange
    fetchMock.mockResolvedValue(
      json(401, { statusCode: 401, code: 'UNAUTHENTICATED', message: 'x' }),
    );

    // Act
    const token = await session.refresh();

    // Assert
    expect(token).toBeNull();
    expect(session.getState()).toEqual({ status: 'signedOut', reason: 'none' });
  });
});

describe('session.restore', () => {
  it('restores the user from the refresh cookie', async () => {
    fetchMock.mockResolvedValue(json(200, sessionBody()));
    await session.restore();
    expect(session.getState()).toEqual({ status: 'signedIn', user });
  });

  it('reports the API as unavailable when it cannot be reached, instead of signing out', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await session.restore();
    expect(session.getState()).toMatchObject({ status: 'unavailable' });
  });
});

describe('session.signOut', () => {
  it('forgets the token even when the sign-out request fails', async () => {
    // Arrange
    session.start(sessionBody());
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    // Act
    await expect(session.signOut()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    // Assert
    expect(session.getAccessToken()).toBeNull();
    expect(session.getState()).toEqual({ status: 'signedOut', reason: 'ended' });
  });
});
