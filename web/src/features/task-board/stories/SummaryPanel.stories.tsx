import type { Meta, StoryObj } from '@storybook/react-vite';
import { SummaryPanel, SummarySkeleton } from '../components/SummaryPanel';
import { summary, task } from '../test-fixtures';

const tasks = [
  ...Array.from({ length: 12 }, () => task({ priority: 'URGENT' })),
  ...Array.from({ length: 30 }, () => task({ priority: 'HIGH' })),
  ...Array.from({ length: 25 }, () => task({ priority: 'MEDIUM' })),
  ...Array.from({ length: 8 }, () => task({ priority: 'LOW', statusId: 's-done' })),
  ...Array.from({ length: 5 }, () => task({ priority: 'NONE' })),
];

const meta = {
  title: 'Task board/SummaryPanel',
  component: SummaryPanel,
  args: { summary: summary(tasks, { overdue: 9 }) },
} satisfies Meta<typeof SummaryPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NothingOverdue: Story = { args: { summary: summary(tasks, { overdue: 0 }) } };
export const Empty: Story = { args: { summary: summary([]) } };
export const Loading: Story = { render: () => <SummarySkeleton /> };
