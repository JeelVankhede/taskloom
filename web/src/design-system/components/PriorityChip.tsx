import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp';
import KeyboardDoubleArrowUp from '@mui/icons-material/KeyboardDoubleArrowUp';
import Remove from '@mui/icons-material/Remove';
import DragHandle from '@mui/icons-material/DragHandle';
import Chip from '@mui/material/Chip';
import type { Priority } from '@taskloom/contracts';
import type { ReactElement } from 'react';
import { priorityColor } from '../tokens';
import { PRIORITY_LABEL } from '../format';

const ICON: Record<Priority, ReactElement> = {
  URGENT: <KeyboardDoubleArrowUp />,
  HIGH: <KeyboardArrowUp />,
  MEDIUM: <DragHandle />,
  LOW: <KeyboardArrowDown />,
  NONE: <Remove />,
};

/** Name, icon, and color: never color alone. */
export function PriorityChip({ priority }: { priority: Priority }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={ICON[priority]}
      label={PRIORITY_LABEL[priority]}
      sx={(theme) => ({
        color: priorityColor.light[priority],
        borderColor: 'currentColor',
        '& .MuiChip-icon': { color: 'inherit' },
        ...theme.applyStyles('dark', { color: priorityColor.dark[priority] }),
      })}
    />
  );
}
