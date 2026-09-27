import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { FilterBar } from '../components/FilterBar';
import { type BoardFilters, NO_FILTERS } from '../filters';

const assignees = [
  { id: '0193a1b2-0000-7000-8000-00000000000a', name: 'Ada Lovelace' },
  { id: '0193a1b2-0000-7000-8000-00000000000b', name: 'Grace Hopper' },
];
const labels = [
  { id: '0193a1b2-0000-7000-8000-0000000000aa', name: 'bug' },
  { id: '0193a1b2-0000-7000-8000-0000000000bb', name: 'frontend' },
];

function Demo({ initial }: { initial: BoardFilters }) {
  const [filters, setFilters] = useState(initial);
  return (
    <FilterBar
      filters={filters}
      onChange={setFilters}
      onClear={() => setFilters(NO_FILTERS)}
      assignees={assignees}
      labels={labels}
    />
  );
}

const meta = {
  title: 'Task board/FilterBar',
  component: Demo,
  args: { initial: NO_FILTERS },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoFilters: Story = {};
export const Filtered: Story = {
  args: {
    initial: {
      ...NO_FILTERS,
      assigneeIds: [assignees[0]!.id],
      unassigned: true,
      priorities: ['URGENT', 'HIGH'],
      labelIds: [labels[0]!.id],
      dueFrom: '2026-09-01',
      dueTo: '2026-09-30',
      overdue: true,
      state: 'open',
    },
  },
};
