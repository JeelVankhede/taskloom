import type { Meta, StoryObj } from '@storybook/react-vite';
import { NewTaskDialog } from '../components/NewTaskDialog';
import { PROJECT_ID } from '../test-fixtures';
import { withOrg } from './withOrg';

const meta = {
  title: 'Task board/NewTaskDialog',
  component: NewTaskDialog,
  decorators: [withOrg()],
  args: {
    open: true,
    onClose: () => undefined,
    onCreated: () => undefined,
    projectId: PROJECT_ID,
    statuses: [
      { id: 's-backlog', name: 'Backlog' },
      { id: 's-todo', name: 'Todo' },
      { id: 's-done', name: 'Done' },
    ],
    assignees: [{ id: 'u-ada', name: 'Ada Lovelace' }],
    labels: [
      { id: 'l-bug', name: 'bug' },
      { id: 'l-fe', name: 'frontend' },
    ],
  },
} satisfies Meta<typeof NewTaskDialog>;
export default meta;
export const Open: StoryObj<typeof meta> = {};
