import Stack from '@mui/material/Stack';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { CardSkeleton, ListSkeleton, StatSkeleton } from '../components/Skeletons';

const meta = {
  title: 'Design system/States',
  component: EmptyState,
  args: { title: 'No tasks yet' },
} satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { title: 'No tasks yet', description: 'Create the first task in this project.' },
};
export const EmptyWithAction: Story = {
  args: {
    title: 'No tasks match these filters',
    description: 'Try removing a filter.',
    action: <Button>Clear filters</Button>,
  },
};
export const Error: Story = {
  render: () => <ErrorState message="Could not load the board." onRetry={() => undefined} />,
};
export const ErrorRetrying: Story = {
  render: () => (
    <ErrorState message="Could not load the board." onRetry={() => undefined} retrying />
  ),
};
export const Skeletons: Story = {
  render: () => (
    <Stack spacing={4} sx={{ maxWidth: 480 }} role="status" aria-busy="true" aria-label="Loading">
      <Stack direction="row" spacing={4}>
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </Stack>
      <CardSkeleton />
      <ListSkeleton rows={3} />
    </Stack>
  ),
};
