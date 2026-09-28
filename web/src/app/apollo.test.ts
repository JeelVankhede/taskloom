import { gql } from '@apollo/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSessionForTests, session } from '../features/auth/session';
import { json } from '../test/render';
import { sessionBody } from '../test/fixtures';
import { createApolloClient } from './apollo';

const QUERY = gql`
  query Probe {
    viewer {
      id
    }
  }
`;
const ok = { data: { viewer: { __typename: 'Viewer', id: 'u1' } } };
const unauthenticated = {
  errors: [{ message: 'Unauthenticated', extensions: { code: 'UNAUTHENTICATED' } }],
};

/** Every request the client made: URL, auth header, org header. */
const calls: { url: string; auth: string | null; org: string | null }[] = [];
let graphqlResponses: Response[] = [];
let refreshResponse: () => Response;

beforeEach(() => {
  resetSessionForTests();
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, auth: headers.get('authorization'), org: headers.get('x-org-id') });
      if (url === '/auth/refresh') return refreshResponse();
      return graphqlResponses.shift()!;
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Apollo links', () => {
  it('sends the access token and the org id from the operation context', async () => {
    // Arrange
    session.start(sessionBody('t1'));
    graphqlResponses = [json(200, ok)];

    // Act
    await createApolloClient().query({ query: QUERY, context: { orgId: 'org-1' } });

    // Assert
    expect(calls).toEqual([{ url: '/graphql', auth: 'Bearer t1', org: 'org-1' }]);
  });

  it('on 401 refreshes once and retries once with the new token', async () => {
    // Arrange
    session.start(sessionBody('expired'));
    graphqlResponses = [json(401, unauthenticated), json(200, ok)];
    refreshResponse = () => json(200, sessionBody('renewed'));

    // Act
    const result = await createApolloClient().query({ query: QUERY });

    // Assert
    expect(result.data).toEqual(ok.data);
    expect(calls.map((c) => [c.url, c.auth])).toEqual([
      ['/graphql', 'Bearer expired'],
      ['/auth/refresh', null],
      ['/graphql', 'Bearer renewed'],
    ]);
  });

  it('does not retry a second time when the retry is also rejected', async () => {
    // Arrange
    session.start(sessionBody('expired'));
    graphqlResponses = [json(401, unauthenticated), json(401, unauthenticated)];
    refreshResponse = () => json(200, sessionBody('renewed'));

    // Act
    const attempt = createApolloClient().query({ query: QUERY });

    // Assert
    await expect(attempt).rejects.toThrow();
    expect(calls.map((c) => c.url)).toEqual(['/graphql', '/auth/refresh', '/graphql']);
  });

  it('fails the operation and signs out when the refresh is rejected', async () => {
    // Arrange
    session.start(sessionBody('expired'));
    graphqlResponses = [json(401, unauthenticated)];
    refreshResponse = () => json(401, { statusCode: 401, code: 'UNAUTHENTICATED', message: 'x' });

    // Act
    const attempt = createApolloClient().query({ query: QUERY });

    // Assert
    await expect(attempt).rejects.toThrow();
    expect(session.getState()).toEqual({ status: 'signedOut', reason: 'none' });
    expect(calls.map((c) => c.url)).toEqual(['/graphql', '/auth/refresh']);
  });
});
