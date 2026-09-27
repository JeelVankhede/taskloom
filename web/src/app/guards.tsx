import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '../features/auth/hooks/useSession';
import { safeNext } from '../lib/safe-redirect';

/**
 * Signed-in routes. Without a session: go to sign in, and come back here afterwards. After a
 * deliberate sign out, start fresh: the next person to sign in may be someone else.
 */
export function RequireAuth() {
  const state = useSession();
  const { pathname, search } = useLocation();
  if (state.status === 'signedIn') return <Outlet />;
  const here = pathname + search;
  const keep = here !== '/' && !(state.status === 'signedOut' && state.reason === 'ended');
  const next = keep ? `?next=${encodeURIComponent(here)}` : '';
  return <Navigate to={`/signin${next}`} replace />;
}

/** Sign in and sign up. Once signed in (including right after submitting), continue to ?next or home. */
export function PublicOnly() {
  const state = useSession();
  const { search } = useLocation();
  if (state.status !== 'signedIn') return <Outlet />;
  return <Navigate to={safeNext(search) ?? '/'} replace />;
}
