import type { AuthSessionBody } from '@taskloom/contracts';
import { AuthError, authApi } from './api/auth-api';

export type SessionUser = AuthSessionBody['user'];

export type SessionState =
  | { status: 'loading' }
  | { status: 'unavailable'; message: string }
  /** `ended`: the user signed out (here or in another tab). `none`: no session, or it expired. */
  | { status: 'signedOut'; reason: 'ended' | 'none' }
  | { status: 'signedIn'; user: SessionUser };

/**
 * The session: the access token lives only in this module's memory (never in storage or React
 * state). The refresh token is the API's HttpOnly cookie.
 *
 * Refresh rotation is strict: presenting an already rotated token revokes the session. So one
 * refresh runs at a time per tab (a shared promise) and across tabs (a Web Lock). A tab that
 * waited for the lock refreshes with the cookie the previous tab just rotated.
 */
let accessToken: string | null = null;
let state: SessionState = { status: 'loading' };
let inflight: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

const LOCK = 'tl-refresh';
const CHANNEL = 'tl-session';
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);

function set(next: SessionState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

/** Web Locks serialize refreshes across tabs; without them (old browsers, jsdom) run directly. */
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request(LOCK, fn) : fn();
}

export const session = {
  getState: (): SessionState => state,
  getAccessToken: (): string | null => accessToken,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** After sign in or sign up. */
  start(body: AuthSessionBody): void {
    accessToken = body.accessToken;
    set({ status: 'signedIn', user: body.user });
  },

  /** Forget the session locally. A sign out is also sent to other tabs, unless it came from one. */
  clear({ reason, broadcast }: { reason: 'ended' | 'none'; broadcast: boolean }): void {
    accessToken = null;
    set({ status: 'signedOut', reason });
    if (broadcast) channel?.postMessage('signedOut');
  },

  /**
   * A new access token from the refresh cookie, or null when there is no valid session.
   * Concurrent callers in this tab share one request.
   */
  refresh(): Promise<string | null> {
    inflight ??= withRefreshLock(async () => {
      try {
        const body = await authApi.refresh();
        session.start(body);
        return body.accessToken;
      } catch (error) {
        if (error instanceof AuthError && error.status === 401) {
          session.clear({ reason: 'none', broadcast: false });
          return null;
        }
        throw error;
      }
    }).finally(() => {
      inflight = null;
    });
    return inflight;
  },

  /** Once on app load: restore the session from the cookie. */
  async restore(): Promise<void> {
    set({ status: 'loading' });
    try {
      await session.refresh();
    } catch (error) {
      set({
        status: 'unavailable',
        message: error instanceof Error ? error.message : 'Could not reach Taskloom',
      });
    }
  },

  async signOut(): Promise<void> {
    try {
      await authApi.signOut();
    } finally {
      // Signed out locally even if the request failed: the access token is gone from memory.
      session.clear({ reason: 'ended', broadcast: true });
    }
  },
};

channel?.addEventListener('message', (event: MessageEvent) => {
  if (event.data === 'signedOut' && state.status === 'signedIn')
    session.clear({ reason: 'ended', broadcast: false });
});

/** Tests only: back to the initial state. */
export function resetSessionForTests(): void {
  accessToken = null;
  inflight = null;
  state = { status: 'loading' };
  listeners.clear();
}
