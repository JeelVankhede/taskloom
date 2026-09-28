import Typography from '@mui/material/Typography';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';

const meta = { title: 'Design system/Surfaces', component: Card } satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CardDefault: Story = {
  args: {
    title: 'Website relaunch',
    children: (
      <Typography variant="body2" color="text.secondary">
        WEB · 42 open tasks
      </Typography>
    ),
  },
};
export const CardClickable: Story = { args: { ...CardDefault.args, onClick: () => undefined } };
export const Header: Story = {
  render: () => (
    <PageHeader
      title="Acme"
      description="Projects in this organization."
      actions={<Button tone="primary">New project</Button>}
    />
  ),
};
