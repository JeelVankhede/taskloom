import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Button, UserChip } from '../../../design-system';
import type { MemberFieldsFragment } from '../../../generated/graphql';
import { formatDay } from '../../../lib/format-datetime';
import { ROLE_LABEL } from '../../org/roles';

export interface MemberListProps {
  members: MemberFieldsFragment[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

/** Everyone in the organization, deactivated members included, by name. */
export function MemberList({ members, hasMore, loadingMore, onLoadMore }: MemberListProps) {
  return (
    <Stack spacing={4}>
      <List disablePadding aria-label="Members">
        {members.map((member) => {
          const inactive = member.status === 'DEACTIVATED';
          return (
            <ListItem key={member.user.id} divider sx={{ gap: 4, flexWrap: 'wrap', py: 3 }}>
              <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                <UserChip displayName={member.user.displayName} inactive={inactive} size="medium" />
                {member.user.email && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 12, display: 'block' }}
                  >
                    {member.user.email}
                  </Typography>
                )}
              </Box>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Chip size="small" label={ROLE_LABEL[member.role]} variant="outlined" />
                <Typography variant="caption" color="text.secondary">
                  {inactive ? 'Deactivated' : `Joined ${formatDay(member.joinedAt)}`}
                </Typography>
              </Stack>
            </ListItem>
          );
        })}
      </List>
      {hasMore && (
        <Box>
          <Button onClick={onLoadMore} loading={loadingMore}>
            Load more members
          </Button>
        </Box>
      )}
    </Stack>
  );
}
