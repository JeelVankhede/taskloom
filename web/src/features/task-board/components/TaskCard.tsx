import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { LabelColor } from '@taskloom/contracts';
import { DateBadge, LabelChip, PriorityChip, UserChip } from '../../../design-system';
import type { TaskCardFieldsFragment } from '../../../generated/graphql';

const MAX_LABELS = 3;

export interface TaskCardProps {
  task: TaskCardFieldsFragment;
  /** Today in the organization's timezone, for the overdue badge. */
  today: string;
  onOpen: (identifier: string) => void;
}

/** One task on the board. The whole card is a button that opens the task's details. */
export function TaskCard({ task, today, onOpen }: TaskCardProps) {
  const extra = task.labels.length - MAX_LABELS;
  return (
    <Card>
      <CardActionArea onClick={() => onOpen(task.identifier)} sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {task.identifier}
            </Typography>
            {task.assignee && <UserChip displayName={task.assignee.displayName} avatarOnly />}
          </Stack>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {task.title}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <PriorityChip priority={task.priority} />
            <DateBadge date={task.dueDate} today={today} isClosed={task.isClosed} />
            {task.labels.slice(0, MAX_LABELS).map((label) => (
              <LabelChip key={label.id} name={label.name} color={label.color as LabelColor} />
            ))}
            {extra > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                +{extra}
              </Typography>
            )}
          </Stack>
        </Stack>
      </CardActionArea>
    </Card>
  );
}
