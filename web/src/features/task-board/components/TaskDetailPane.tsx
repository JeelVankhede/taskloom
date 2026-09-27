import CloseOutlined from '@mui/icons-material/CloseOutlined';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ErrorCode, type LabelColor } from '@taskloom/contracts';
import type { ReactNode } from 'react';
import { errorCode } from '../../../app/apollo';
import {
  DateBadge,
  EmptyState,
  ErrorState,
  LabelChip,
  ListSkeleton,
  PriorityChip,
  StatusChip,
  UserChip,
} from '../../../design-system';
import { TaskDetailDocument } from '../../../generated/graphql';
import { formatDay } from '../../../lib/format-datetime';
import { messageFor } from '../../../lib/error-messages';
import { useOrgQuery } from '../../org/hooks/useOrgOperation';

export interface TaskDetailPaneProps {
  /** The open task (?task= in the URL), or null when the pane is closed. */
  identifier: string | null;
  today: string;
  onClose: () => void;
}

/** A read-only side pane: task edits are Designed, not Built. */
export function TaskDetailPane({ identifier, today, onClose }: TaskDetailPaneProps) {
  return (
    <Drawer
      anchor="right"
      open={identifier !== null}
      onClose={onClose}
      slotProps={{
        paper: { sx: { width: { xs: '100%', sm: 440 } }, 'aria-label': 'Task details' },
      }}
    >
      {identifier && <Details identifier={identifier} today={today} onClose={onClose} />}
    </Drawer>
  );
}

function Details({
  identifier,
  today,
  onClose,
}: {
  identifier: string;
  today: string;
  onClose: () => void;
}) {
  const { data, error, loading, refetch } = useOrgQuery(TaskDetailDocument, { identifier });
  const task = data?.taskByIdentifier;

  const header = (title: string) => (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', p: 5, pb: 3 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {identifier}
        </Typography>
        <Typography variant="h3" component="h2" sx={{ overflowWrap: 'anywhere' }}>
          {title}
        </Typography>
      </Box>
      <IconButton aria-label="Close task details" onClick={onClose} edge="end">
        <CloseOutlined />
      </IconButton>
    </Stack>
  );

  if (!task && loading) {
    return (
      <>
        {header('Loading…')}
        <Box sx={{ px: 5 }} role="status" aria-label="Loading the task">
          <ListSkeleton rows={4} />
        </Box>
      </>
    );
  }
  if (!task) {
    const code = errorCode(error);
    return (
      <>
        {header('Task')}
        {code === ErrorCode.NOT_FOUND ? (
          <EmptyState
            title="Task not found"
            description="It does not exist, or you cannot see it."
          />
        ) : (
          <ErrorState message={messageFor(code)} onRetry={() => void refetch()} />
        )}
      </>
    );
  }

  return (
    <>
      {header(task.title)}
      <Box
        component="dl"
        sx={{
          px: 5,
          m: 0,
          display: 'grid',
          gridTemplateColumns: '120px 1fr',
          rowGap: 3,
          columnGap: 3,
        }}
      >
        <Field label="Status">
          <StatusChip name={task.status.name} isClosed={task.status.isClosed} />
        </Field>
        <Field label="Priority">
          <PriorityChip priority={task.priority} />
        </Field>
        <Field label="Assignee">
          <UserChip displayName={task.assignee?.displayName ?? null} />
        </Field>
        <Field label="Due">
          <DateBadge date={task.dueDate} today={today} isClosed={task.isClosed} />
        </Field>
        <Field label="Labels">
          {task.labels.length ? (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {task.labels.map((l) => (
                <LabelChip key={l.id} name={l.name} color={l.color as LabelColor} />
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              None
            </Typography>
          )}
        </Field>
      </Box>
      <Divider sx={{ my: 5 }} />
      <Box sx={{ px: 5 }}>
        <Typography variant="h4" component="h3" gutterBottom>
          Description
        </Typography>
        <Typography
          variant="body2"
          color={task.description ? 'text.primary' : 'text.secondary'}
          sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
        >
          {task.description || 'No description'}
        </Typography>
      </Box>
      <Divider sx={{ my: 5 }} />
      <Typography variant="caption" color="text.secondary" sx={{ px: 5, pb: 5, display: 'block' }}>
        Created {formatDay(task.createdAt)}
        {task.createdBy ? ` by ${task.createdBy.displayName}` : ''} · updated{' '}
        {formatDay(task.updatedAt)}
        {task.closedAt ? ` · closed ${formatDay(task.closedAt)}` : ''}
      </Typography>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <Typography
        component="dt"
        variant="body2"
        color="text.secondary"
        sx={{ alignSelf: 'center' }}
      >
        {label}
      </Typography>
      <Box component="dd" sx={{ m: 0, minWidth: 0 }}>
        {children}
      </Box>
    </>
  );
}
