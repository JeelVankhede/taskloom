import { Navigate } from 'react-router';
import { ErrorState, ListSkeleton } from '../../design-system';
import { messageFor } from '../../lib/error-messages';
import { readLastOrg } from '../../lib/last-org';
import { errorCode } from '../apollo';
import { useViewer } from './useViewer';

/** "/": no membership opens onboarding; otherwise the last organization, or the first. */
export function HomeRedirect() {
  const { data, error, loading, refetch } = useViewer();
  if (loading && !data) return <ListSkeleton rows={3} />;
  if (!data) {
    return <ErrorState message={messageFor(errorCode(error))} onRetry={() => void refetch()} />;
  }
  const memberships = data.viewer.memberships;
  if (memberships.length === 0) return <Navigate to="/onboarding" replace />;
  const last = readLastOrg();
  const target = memberships.find((m) => m.organization.slug === last) ?? memberships[0]!;
  return <Navigate to={`/o/${target.organization.slug}`} replace />;
}
