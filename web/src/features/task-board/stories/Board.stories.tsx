import type { Meta, StoryObj } from '@storybook/react-vite';
import { Board, BoardSkeleton } from '../components/Board';
import { boardMock, filterFor, PROJECT_ID, task } from '../test-fixtures';
import { withOrg } from './withOrg';

const tasks = [
  task({ title: 'Write the RFC', priority: 'HIGH', dueDate: '2026-10-02' }),
  task({ title: 'Rotate keys', priority: 'URGENT', dueDate: '2026-09-01' }),
  task({ title: 'Triage', priority: 'NONE', dueDate: '2026-12-01' }),
  task({ title: 'Ship onboarding', statusId: 's-done', dueDate: '2026-09-10' }),
];
const data = boardMock(tasks).result.data;
const counts = new Map(data.taskSummary.byStatus.map((c) => [c.status.id, c.total]));

const meta = {
  title: 'Task board/Board',
  component: Board,
  decorators: [withOrg()],
  args: {
    columns: data.board.columns,
    countByStatus: counts,
    projectId: PROJECT_ID,
    filter: filterFor(),
    today: '2026-09-27',
    onOpen: () => undefined,
  },
} satisfies Meta<typeof Board>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const EmptyColumn: Story = {
  args: {
    columns: boardMock([task({ title: 'Only open work' })]).result.data.board.columns,
    countByStatus: new Map([
      ['s-todo', 1],
      ['s-done', 0],
    ]),
  },
};
export const Loading: Story = { render: () => <BoardSkeleton /> };
