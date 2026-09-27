import PersonAddOutlined from '@mui/icons-material/PersonAddOutlined';
import List from '@mui/material/List';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Capability } from '@taskloom/contracts';
import { useState } from 'react';
import { errorCode } from '../../app/apollo';
import { Button, ErrorState, ListSkeleton, PageHeader } from '../../design-system';
import { OrgMembersDocument, PendingJoinRequestsDocument } from '../../generated/graphql';
import { messageFor } from '../../lib/error-messages';
import { useOrgQuery } from '../org/hooks/useOrgOperation';
import { useOrg } from '../org/org-context';
import { can } from '../org/roles';
import { AddMemberDialog } from './components/AddMemberDialog';
import { JoinRequestRow } from './components/JoinRequestRow';
import { MemberList } from './components/MemberList';
import { MEMBERS_PAGE, PENDING_PAGE } from './pagination';

/** /o/:orgSlug/members: everyone in the organization; owners and admins also manage access. */
export function MembersPage() {
  const org = useOrg();
  const manager = can(org.role, Capability.MANAGE_ORG);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader
        title="Members"
        description={`People in ${org.name}.`}
        actions={
          manager && (
            <Button
              tone="primary"
              startIcon={<PersonAddOutlined />}
              onClick={() => setAdding(true)}
            >
              Add member
            </Button>
          )
        }
      />
      <Stack spacing={10}>
        {manager && <PendingRequests />}
        <Members />
      </Stack>
      {manager && <AddMemberDialog open={adding} onClose={() => setAdding(false)} />}
    </>
  );
}

function PendingRequests() {
  const { data, error, loading, refetch, fetchMore } = useOrgQuery(PendingJoinRequestsDocument, {
    first: PENDING_PAGE,
  });
  const connection = data?.organization.joinRequests;
  const [loadingMore, setLoadingMore] = useState(false);

  if (!connection && loading) return <ListSkeleton rows={2} />;
  if (!connection) {
    return <ErrorState message={messageFor(errorCode(error))} onRetry={() => void refetch()} />;
  }
  if (connection.edges.length === 0) return null;
  return (
    <Stack component="section" aria-labelledby="pending-requests" spacing={2}>
      <Typography id="pending-requests" variant="h3" component="h2">
        Join requests
      </Typography>
      <List disablePadding>
        {connection.edges.map(({ node }) => (
          <JoinRequestRow key={node.id} request={node} />
        ))}
      </List>
      {connection.pageInfo.hasNextPage && (
        <div>
          <Button
            loading={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              fetchMore({ variables: { after: connection.pageInfo.endCursor } })
                .catch((e: unknown) => console.error('Loading more join requests failed', e))
                .finally(() => setLoadingMore(false));
            }}
          >
            Load more requests
          </Button>
        </div>
      )}
    </Stack>
  );
}

function Members() {
  const { data, error, loading, refetch, fetchMore } = useOrgQuery(OrgMembersDocument, {
    first: MEMBERS_PAGE,
  });
  const connection = data?.organization.members;
  const [loadingMore, setLoadingMore] = useState(false);

  let body;
  if (!connection && loading) body = <ListSkeleton rows={5} />;
  else if (!connection) {
    body = <ErrorState message={messageFor(errorCode(error))} onRetry={() => void refetch()} />;
  } else {
    body = (
      <MemberList
        members={connection.edges.map((edge) => edge.node)}
        hasMore={connection.pageInfo.hasNextPage}
        loadingMore={loadingMore}
        onLoadMore={() => {
          setLoadingMore(true);
          fetchMore({ variables: { after: connection.pageInfo.endCursor } })
            .catch((e: unknown) => console.error('Loading more members failed', e))
            .finally(() => setLoadingMore(false));
        }}
      />
    );
  }
  return (
    <Stack component="section" aria-labelledby="all-members" spacing={2}>
      <Typography id="all-members" variant="h3" component="h2">
        Everyone
      </Typography>
      {body}
    </Stack>
  );
}
