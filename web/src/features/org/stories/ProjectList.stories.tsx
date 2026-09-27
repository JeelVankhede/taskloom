import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectList } from '../components/ProjectList';

const projects = [
  {
    id: '1',
    key: 'ENG',
    name: 'Engineering',
    description: 'Product engineering. Large enough to exercise the board.',
  },
  { id: '2', key: 'OPS', name: 'Operations', description: 'On-call and infra.' },
  { id: '3', key: 'WEB', name: 'Website', description: null },
  {
    id: '4',
    key: 'MKT',
    name: 'Marketing campaigns for the autumn launch across every region',
    description:
      'A long description that runs past two lines to show clamping. It keeps going so the card stays the same height as its neighbours in the grid.',
  },
];

const meta = {
  title: 'Org/ProjectList',
  component: ProjectList,
  args: {
    orgSlug: 'acme',
    projects,
    hasMore: false,
    loadingMore: false,
    onLoadMore: () => undefined,
  },
} satisfies Meta<typeof ProjectList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithMore: Story = { args: { hasMore: true } };
export const LoadingMore: Story = { args: { hasMore: true, loadingMore: true } };
