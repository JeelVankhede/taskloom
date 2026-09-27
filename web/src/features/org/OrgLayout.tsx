import { Fragment, useEffect } from 'react';
import { Outlet, useParams } from 'react-router';
import { errorCode } from '../../app/apollo';
import { useViewer } from '../../app/shell/useViewer';
import { Button, EmptyState, ErrorState, ListSkeleton } from '../../design-system';
import { messageFor } from '../../lib/error-messages';
import { writeLastOrg } from '../../lib/last-org';
import { OrgTabs } from './components/OrgTabs';
import { type CurrentOrg, OrgContext } from './org-context';

/**
 * /o/:orgSlug. Maps the slug to one of the viewer's memberships; that id is what every
 * org-scoped operation sends as X-Org-Id. A slug that is not one of them looks the same whether
 * the organization exists or not.
 */
export function OrgLayout() {
  const { orgSlug } = useParams();
  const { data, error, loading, refetch } = useViewer();

  const membership = data?.viewer.memberships.find((m) => m.organization.slug === orgSlug);
  const org: CurrentOrg | null = membership
    ? { ...membership.organization, role: membership.role }
    : null;

  useEffect(() => {
    if (org) writeLastOrg(org.slug);
  }, [org?.slug]); // eslint-disable-line react-hooks/exhaustive-deps -- only the slug matters

  if (loading && !data) return <ListSkeleton rows={4} />;
  if (!data)
    return <ErrorState message={messageFor(errorCode(error))} onRetry={() => void refetch()} />;
  if (!org) {
    return (
      <EmptyState
        title="Organization not found"
        description="It does not exist, or you are not a member. You can request to join it from onboarding."
        action={
          <Button tone="primary" to="/onboarding">
            Create or join an organization
          </Button>
        }
      />
    );
  }

  // Keyed by organization: switching remounts every org screen, so no screen can show the
  // previous organization's data (see useOrgQuery).
  return (
    <OrgContext.Provider value={org}>
      <Fragment key={org.id}>
        <OrgTabs />
        <Outlet />
      </Fragment>
    </OrgContext.Provider>
  );
}
