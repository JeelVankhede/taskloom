import {
  ApolloClient,
  ApolloLink,
  CombinedGraphQLErrors,
  HttpLink,
  InMemoryCache,
  ServerError,
} from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';

import { ErrorLink } from '@apollo/client/link/error';
import { relayStylePagination } from '@apollo/client/utilities';
import { ErrorCode, ORG_HEADER } from '@taskloom/contracts';
import { from, switchMap, throwError } from 'rxjs';
import { session } from '../features/auth/session';

declare module '@apollo/client' {
  interface DefaultContext {
    /** The organization an operation runs in, sent as X-Org-Id. Absent for viewer-level queries. */
    orgId?: string;
    /** Set on the one retry after a refresh, so a second 401 is final. */
    retriedAfterRefresh?: boolean;
  }
}

/** The API answers a missing or expired token with HTTP 401 and code UNAUTHENTICATED. */
export function isUnauthenticated(error: unknown): boolean {
  if (ServerError.is(error)) return error.statusCode === 401;
  if (CombinedGraphQLErrors.is(error)) {
    return error.errors.some((e) => e.extensions?.code === ErrorCode.UNAUTHENTICATED);
  }
  return false;
}

/** The API error code of a failed operation, for messageFor() and per-screen handling. */
export function errorCode(error: unknown): string | undefined {
  if (CombinedGraphQLErrors.is(error)) {
    const code = error.errors[0]?.extensions?.code;
    return typeof code === 'string' ? code : undefined;
  }
  if (ServerError.is(error))
    return error.statusCode === 401 ? ErrorCode.UNAUTHENTICATED : ErrorCode.INTERNAL_SERVER_ERROR;
  return 'NETWORK_ERROR';
}

/** One link attaches both headers, read at send time so a retry carries the new token. */
const headersLink = new SetContextLink((prev) => {
  const token = session.getAccessToken();
  return {
    headers: {
      ...prev.headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(prev.orgId ? { [ORG_HEADER]: prev.orgId } : {}),
    },
  };
});

/** On 401: refresh once (shared across tabs), then retry the operation once. */
const refreshLink = new ErrorLink(({ error, operation, forward }) => {
  if (!isUnauthenticated(error) || operation.getContext().retriedAfterRefresh) return;
  return from(session.refresh()).pipe(
    switchMap((token) => {
      // No session: the guards send the user to sign in; the operation fails as it did.
      if (!token) return throwError(() => error);
      operation.setContext({ retriedAfterRefresh: true });
      return forward(operation);
    }),
  );
});

interface ColumnPage {
  edges: { cursor: string }[];
  pageInfo: unknown;
}

/** The normalized cache and its field policies. Tests build theirs with this too. */
export function createCache(): InMemoryCache {
  return new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          // A column's later pages (the first page comes with the board). One list per project,
          // column, and filter. A page that starts where the list ends is appended; any other
          // page starts the list again (for example the first request after a remount), so
          // cards are never duplicated.
          boardColumn: {
            keyArgs: ['projectId', 'statusId', 'filter'],
            merge(existing: ColumnPage | undefined, incoming: ColumnPage, { args }) {
              const last = existing?.edges.at(-1)?.cursor;
              if (!existing || !args?.after || args.after !== last) return incoming;
              return { ...incoming, edges: [...existing.edges, ...incoming.edges] };
            },
          },
        },
      },
      // Lists page with fetchMore: pages append under the organization's own id, so one
      // organization's pages never mix with another's.
      Organization: {
        fields: {
          projects: relayStylePagination(['includeArchived']),
          members: relayStylePagination(),
          joinRequests: relayStylePagination(['status']),
        },
      },
    },
  });
}

export function createApolloClient(uri = '/graphql'): ApolloClient {
  const client = new ApolloClient({
    link: ApolloLink.from([refreshLink, headersLink, new HttpLink({ uri })]),
    cache: createCache(),
  });

  // A different user (or none) must never see the previous user's cached data.
  let userId = currentUserId();
  session.subscribe(() => {
    const next = currentUserId();
    if (next === userId) return;
    userId = next;
    client
      .clearStore()
      .catch((error: unknown) => console.error('Clearing the cache failed', error));
  });
  return client;
}

function currentUserId(): string | null {
  const state = session.getState();
  return state.status === 'signedIn' ? state.user.id : null;
}
