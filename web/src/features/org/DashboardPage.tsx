import AddOutlined from '@mui/icons-material/AddOutlined';
import { Capability } from '@taskloom/contracts';
import { useState } from 'react';
import { errorCode } from '../../app/apollo';
import { Button, CardSkeleton, EmptyState, ErrorState, PageHeader } from '../../design-system';
import { OrgProjectsDocument } from '../../generated/graphql';
import { messageFor } from '../../lib/error-messages';
import { CreateProjectDialog } from './components/CreateProjectDialog';
import { Grid, ProjectList } from './components/ProjectList';
import { useOrgQuery } from './hooks/useOrgOperation';
import { useOrg } from './org-context';
import { can } from './roles';

export const PROJECTS_PAGE = 50;

/** /o/:orgSlug: the organization's projects; owners, admins, and members can create one. */
export function DashboardPage() {
  const org = useOrg();
  const [creating, setCreating] = useState(false);
  const canCreate = can(org.role, Capability.MANAGE_PROJECTS);
  const { data, error, loading, refetch, fetchMore } = useOrgQuery(OrgProjectsDocument, {
    first: PROJECTS_PAGE,
  });
  const [loadingMore, setLoadingMore] = useState(false);

  const connection = data?.organization.projects;
  const create = canCreate && (
    <Button tone="primary" startIcon={<AddOutlined />} onClick={() => setCreating(true)}>
      New project
    </Button>
  );

  const loadMore = () => {
    setLoadingMore(true);
    fetchMore({ variables: { after: connection?.pageInfo.endCursor } })
      .catch((e: unknown) => console.error('Loading more projects failed', e))
      .finally(() => setLoadingMore(false));
  };

  let body;
  if (!connection && loading) {
    body = (
      <div aria-busy="true" role="status" aria-label="Loading projects">
        <Grid>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </Grid>
      </div>
    );
  } else if (!connection) {
    body = (
      <ErrorState
        message={messageFor(errorCode(error))}
        onRetry={() => void refetch()}
        retrying={loading}
      />
    );
  } else if (connection.edges.length === 0) {
    body = (
      <EmptyState
        title="No projects yet"
        description={
          canCreate
            ? 'Create the first project to start tracking tasks.'
            : 'An owner, admin, or member can create the first project.'
        }
        action={create}
      />
    );
  } else {
    body = (
      <ProjectList
        orgSlug={org.slug}
        projects={connection.edges.map((edge) => edge.node)}
        hasMore={connection.pageInfo.hasNextPage}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
      />
    );
  }

  return (
    <>
      <PageHeader title={org.name} description="Projects in this organization." actions={create} />
      {body}
      {canCreate && <CreateProjectDialog open={creating} onClose={() => setCreating(false)} />}
    </>
  );
}
