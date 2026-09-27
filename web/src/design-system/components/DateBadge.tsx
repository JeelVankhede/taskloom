import EventOutlined from '@mui/icons-material/EventOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import Chip from '@mui/material/Chip';
import { formatDate } from '../format';

export interface DateBadgeProps {
  /** A calendar date, YYYY-MM-DD. Never converted through local time, so it never shifts a day. */
  date: string;
  /** Today in the organization's timezone, YYYY-MM-DD. */
  today: string;
  /** Closed tasks are never overdue. */
  isClosed?: boolean;
}

export function DateBadge({ date, today, isClosed = false }: DateBadgeProps) {
  // ISO dates compare correctly as strings.
  const overdue = !isClosed && date < today;
  const label = formatDate(date, today);
  return (
    <Chip
      size="small"
      variant="outlined"
      color={overdue ? 'error' : 'default'}
      icon={overdue ? <WarningAmberOutlined /> : <EventOutlined />}
      label={overdue ? `Overdue · ${label}` : label}
    />
  );
}
