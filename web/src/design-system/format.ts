import type { Priority } from '@taskloom/contracts';

export const PRIORITY_LABEL: Record<Priority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NONE: 'No priority',
};

export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mar 4" this year, "Mar 4, 2027" otherwise, from the string alone. */
export function formatDate(date: string, today: string): string {
  const [y, m, d] = date.split('-');
  const label = `${MONTHS[Number(m) - 1]} ${Number(d)}`;
  return y === today.slice(0, 4) ? label : `${label}, ${y}`;
}
