import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskDetailDocument } from '../../../generated/graphql';
import { TaskDetailPane } from '../components/TaskDetailPane';
import { task } from '../test-fixtures';
import { withOrg } from './withOrg';

const owner = { __typename: 'User' as const, id: 'u-ada', displayName: 'Ada Owner' };
const frontend = { __typename: 'Label' as const, id: 'l1', name: 'frontend', color: 'blue' };
const t = task({
  title: 'Migrate error boundary copy before release',
  priority: 'URGENT',
  dueDate: '2026-08-23',
  assignee: owner,
  labels: [frontend],
});
const detail = {
  request: { query: TaskDetailDocument, variables: { identifier: t.identifier } },
  result: {
    data: {
      taskByIdentifier: {
        ...t,
        number: 7,
        description:
          'Copy is out of date in three places.\n\n- Sign-in error\n- Board error\n- 404',
        closedAt: null,
        createdAt: '2026-09-01T10:00:00Z',
        updatedAt: '2026-09-20T10:00:00Z',
        status: { __typename: 'Status', id: 's-todo', name: 'Todo', isClosed: false },
        createdBy: { __typename: 'User', id: 'u-bo', displayName: 'Bo Both' },
      },
    },
  },
};
const missing = {
  request: { query: TaskDetailDocument, variables: { identifier: 'ENG-999' } },
  result: { errors: [{ message: 'x', extensions: { code: 'NOT_FOUND' } }] },
};

const meta = {
  title: 'Task board/TaskDetailPane',
  component: TaskDetailPane,
  args: { identifier: t.identifier, today: '2026-09-27', onClose: () => undefined },
  decorators: [withOrg([detail, missing])],
} satisfies Meta<typeof TaskDetailPane>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
export const NotFound: Story = { args: { identifier: 'ENG-999' } };
