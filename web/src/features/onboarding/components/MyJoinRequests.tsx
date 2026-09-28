import { useMutation, useQuery } from '@apollo/client/react';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { JoinRequestStatus } from '@taskloom/contracts';
import { useState } from 'react';
import { errorCode } from '../../../app/apollo';
import { Button, ErrorState, ListSkeleton } from '../../../design-system';
import { CancelJoinRequestDocument, ViewerJoinRequestsDocument } from '../../../generated/graphql';
import { messageFor } from '../../../lib/error-messages';
import { formatDay } from '../../../lib/format-datetime';

const STATUS: Record<JoinRequestStatus, { label: string; color: 'default' | 'success' | 'error' }> =
  {
    PENDING: { label: 'Pending', color: 'default' },
    APPROVED: { label: 'Approved', color: 'success' },
    REJECTED: { label: 'Declined', color: 'error' },
    CANCELED: { label: 'Canceled', color: 'default' },
  };

/** The viewer's join requests, newest first, with cancel for pending ones. */
export function MyJoinRequests() {
  // Network on every visit: approvals happen elsewhere, and this also refreshes memberships.
  const { data, error, loading, refetch } = useQuery(ViewerJoinRequestsDocument, {
    fetchPolicy: 'cache-and-network',
  });
  const [cancel] = useMutation(CancelJoinRequestDocument);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  if (!data && loading) return <ListSkeleton rows={2} />;
  if (!data)
    return <ErrorState message={messageFor(errorCode(error))} onRetry={() => void refetch()} />;
  const requests = data.viewer.joinRequests;
  if (requests.length === 0) return null;
  const memberOf = new Set(data.viewer.memberships.map((m) => m.organization.id));

  const onCancel = async (id: string) => {
    setCanceling(id);
    setCancelError(null);
    try {
      await cancel({ variables: { id } });
    } catch (e) {
      setCancelError(messageFor(errorCode(e)));
    } finally {
      setCanceling(null);
    }
  };

  return (
    <Stack component="section" aria-labelledby="my-requests" spacing={2}>
      <Typography id="my-requests" variant="h3" component="h2">
        Your requests
      </Typography>
      {cancelError && (
        <Typography role="alert" color="error" variant="body2">
          {cancelError}
        </Typography>
      )}
      <List disablePadding>
        {requests.map((request) => {
          const status = STATUS[request.status];
          const { organization: org } = request;
          return (
            <ListItem
              key={request.id}
              divider
              secondaryAction={
                request.status === 'PENDING' ? (
                  <Button
                    size="small"
                    onClick={() => void onCancel(request.id)}
                    loading={canceling === request.id}
                  >
                    Cancel request
                  </Button>
                ) : request.status === 'APPROVED' && memberOf.has(org.id) ? (
                  <Button size="small" tone="primary" to={`/o/${org.slug}`}>
                    Open
                  </Button>
                ) : null
              }
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                    <span>{org.name}</span>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={status.label}
                      color={status.color}
                    />
                  </Stack>
                }
                secondary={`${org.slug} · requested ${formatDay(request.createdAt)}`}
              />
            </ListItem>
          );
        })}
      </List>
    </Stack>
  );
}
