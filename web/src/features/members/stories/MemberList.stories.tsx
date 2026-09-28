import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemberList } from '../components/MemberList';

const user = (id: string, displayName: string, email: string | null) => ({
  id,
  displayName,
  email,
});
const members = [
  {
    role: 'OWNER' as const,
    status: 'ACTIVE' as const,
    joinedAt: '2026-06-01T10:00:00Z',
    user: user('1', 'Grace Owner', 'owner@acme.test'),
  },
  {
    role: 'ADMIN' as const,
    status: 'ACTIVE' as const,
    joinedAt: '2026-06-03T10:00:00Z',
    user: user('2', 'Alan Admin', 'admin@acme.test'),
  },
  {
    role: 'CONTRIBUTOR' as const,
    status: 'ACTIVE' as const,
    joinedAt: '2026-07-11T10:00:00Z',
    user: user('3', 'Cora Contributor', null),
  },
  {
    role: 'MEMBER' as const,
    status: 'DEACTIVATED' as const,
    joinedAt: '2026-06-05T10:00:00Z',
    user: user('4', 'Dee Departed', null),
  },
];

const meta = {
  title: 'Members/MemberList',
  component: MemberList,
  args: { members, hasMore: false, loadingMore: false, onLoadMore: () => undefined },
} satisfies Meta<typeof MemberList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithMore: Story = { args: { hasMore: true } };
