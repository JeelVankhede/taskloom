import Box from '@mui/material/Box';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskCard } from '../components/TaskCard';
import { task } from '../test-fixtures';

const TODAY = '2026-09-27';
const ada = { __typename: 'User' as const, id: 'u-ada', displayName: 'Ada Lovelace' };
const label = (id: string, name: string, color: string) => ({
  __typename: 'Label' as const,
  id,
  name,
  color,
});

const meta = {
  title: 'Task board/TaskCard',
  component: TaskCard,
  decorators: [(Story) => <Box sx={{ width: 284 }}>{Story()}</Box>],
  args: {
    today: TODAY,
    onOpen: () => undefined,
    task: task({
      title: 'Migrate error boundary copy before release',
      priority: 'HIGH',
      dueDate: '2026-10-04',
      assignee: ada,
      labels: [label('l1', 'frontend', 'blue')],
    }),
  },
} satisfies Meta<typeof TaskCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Overdue: Story = {
  args: {
    task: task({
      title: 'Rotate the signing keys',
      priority: 'URGENT',
      dueDate: '2026-09-01',
      assignee: ada,
    }),
  },
};
export const Closed: Story = {
  args: {
    task: task({ title: 'Ship the onboarding flow', statusId: 's-done', dueDate: '2026-09-01' }),
  },
};
export const Unassigned: Story = {
  args: { task: task({ title: 'Triage the backlog', priority: 'NONE', dueDate: '2027-01-15' }) },
};
export const ManyLabelsLongTitle: Story = {
  args: {
    task: task({
      title:
        'A very long task title that keeps going to show that cards clamp their title to two lines and never grow without bound',
      priority: 'MEDIUM',
      dueDate: '2026-11-20',
      assignee: ada,
      labels: [
        label('l1', 'frontend', 'blue'),
        label('l2', 'bug', 'red'),
        label('l3', 'design', 'purple'),
        label('l4', 'infra', 'slate'),
        label('l5', 'docs', 'green'),
      ],
    }),
  },
};
