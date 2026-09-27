import Stack from '@mui/material/Stack';
import { LABEL_COLORS, type Priority } from '@taskloom/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DateBadge } from '../components/DateBadge';
import { LabelChip } from '../components/LabelChip';
import { PriorityChip } from '../components/PriorityChip';
import { StatusChip } from '../components/StatusChip';
import { UserChip } from '../components/UserChip';

const PRIORITIES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];
const TODAY = '2026-09-27';

const meta = {
  title: 'Design system/Chips',
  component: PriorityChip,
  args: { priority: 'HIGH' },
} satisfies Meta<typeof PriorityChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Priorities: Story = {
  render: () => (
    <Stack direction="row" spacing={2}>
      {PRIORITIES.map((p) => (
        <PriorityChip key={p} priority={p} />
      ))}
    </Stack>
  ),
};
export const Statuses: Story = {
  render: () => (
    <Stack direction="row" spacing={2}>
      <StatusChip name="Todo" isClosed={false} />
      <StatusChip name="In Progress" isClosed={false} />
      <StatusChip name="Done" isClosed />
      <StatusChip name="Canceled" isClosed />
    </Stack>
  ),
};
export const DueDates: Story = {
  render: () => (
    <Stack direction="row" spacing={2}>
      <DateBadge date="2026-10-04" today={TODAY} />
      <DateBadge date="2026-09-20" today={TODAY} />
      <DateBadge date="2026-09-20" today={TODAY} isClosed />
      <DateBadge date="2027-01-15" today={TODAY} />
    </Stack>
  ),
};
export const Labels: Story = {
  render: () => (
    <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {LABEL_COLORS.map((c) => (
        <LabelChip key={c} name={c} color={c} />
      ))}
    </Stack>
  ),
};
export const Users: Story = {
  render: () => (
    <Stack spacing={3}>
      <UserChip displayName="Ada Lovelace" />
      <UserChip displayName="Grace Hopper" size="medium" />
      <UserChip displayName="Former Member" inactive />
      <UserChip displayName={null} />
      <UserChip displayName="Ada Lovelace" avatarOnly />
    </Stack>
  ),
};
