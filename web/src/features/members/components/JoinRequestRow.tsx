import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ErrorCode, type Role } from '@taskloom/contracts';
import { useState } from 'react';
import { errorCode } from '../../../app/apollo';
import { Button, UserChip } from '../../../design-system';
import {
  ApproveJoinRequestDocument,
  OrgMembersDocument,
  PendingJoinRequestsDocument,
  RejectJoinRequestDocument,
  type PendingJoinRequestsQuery,
} from '../../../generated/graphql';
import { messageFor } from '../../../lib/error-messages';
import { formatDay } from '../../../lib/format-datetime';
import { useOrgMutation } from '../../org/hooks/useOrgOperation';
import { RoleSelect } from './RoleSelect';

type Request = PendingJoinRequestsQuery['organization']['joinRequests']['edges'][number]['node'];

/** Both lists change on a decision: the request leaves, and an approved user joins. */
const AFTER_DECISION = {
  refetchQueries: [PendingJoinRequestsDocument, OrgMembersDocument],
  awaitRefetchQueries: true,
};

/** One pending request: pick a role and approve, or reject. */
export function JoinRequestRow({ request }: { request: Request }) {
  const [role, setRole] = useState<Role>('MEMBER');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approve] = useOrgMutation(ApproveJoinRequestDocument);
  const [reject] = useOrgMutation(RejectJoinRequestDocument);

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(decision);
    setError(null);
    try {
      if (decision === 'approve')
        await approve({ variables: { id: request.id, role }, ...AFTER_DECISION });
      else await reject({ variables: { id: request.id }, ...AFTER_DECISION });
    } catch (e) {
      const code = errorCode(e);
      setError(
        code === ErrorCode.JOIN_REQUEST_NOT_PENDING
          ? 'Someone else already decided on this request, or it was canceled.'
          : messageFor(code),
      );
      setBusy(null);
    }
  };

  const who = request.user.displayName;
  return (
    <ListItem divider sx={{ py: 3 }}>
      {/* A named group inside the list item: the list keeps its structure, and screen readers
          hear whose request the role picker and buttons belong to. */}
      <Stack
        role="group"
        aria-label={`Join request from ${who}`}
        direction="row"
        useFlexGap
        sx={{ gap: 4, flexWrap: 'wrap', alignItems: 'center', width: '100%' }}
      >
        <Stack sx={{ flex: '1 1 220px', minWidth: 0 }}>
          <UserChip displayName={who} size="medium" />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 12 }}>
            {request.user.email ? `${request.user.email} · ` : ''}asked{' '}
            {formatDay(request.createdAt)}
          </Typography>
          {error && (
            <Typography role="alert" variant="caption" color="error" sx={{ ml: 12 }}>
              {error}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <RoleSelect value={role} onChange={setRole} disabled={busy !== null} />
          <Button
            tone="primary"
            loading={busy === 'approve'}
            disabled={busy === 'reject'}
            onClick={() => void decide('approve')}
            aria-label={`Approve ${who}`}
          >
            Approve
          </Button>
          <Button
            loading={busy === 'reject'}
            disabled={busy === 'approve'}
            onClick={() => void decide('reject')}
            aria-label={`Reject ${who}`}
          >
            Reject
          </Button>
        </Stack>
      </Stack>
    </ListItem>
  );
}
