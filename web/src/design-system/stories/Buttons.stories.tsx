import AddOutlined from '@mui/icons-material/AddOutlined';
import Stack from '@mui/material/Stack';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../components/Button';

const meta = {
  title: 'Design system/Button',
  component: Button,
  args: { children: 'Save changes', tone: 'secondary' },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { tone: 'primary' } };
export const Secondary: Story = {};
export const Danger: Story = { args: { tone: 'danger', children: 'Remove member' } };
export const Loading: Story = { args: { tone: 'primary', loading: true } };
export const Disabled: Story = { args: { disabled: true } };
export const WithIcon: Story = {
  args: { tone: 'primary', startIcon: <AddOutlined />, children: 'New task' },
};
export const AsLink: Story = {
  args: { to: '/onboarding', children: 'Create or join an organization' },
};
export const AllTones: Story = {
  render: () => (
    <Stack direction="row" spacing={3}>
      <Button tone="primary">Primary</Button>
      <Button>Secondary</Button>
      <Button tone="danger">Danger</Button>
      <Button tone="primary" loading>
        Loading
      </Button>
      <Button disabled>Disabled</Button>
    </Stack>
  ),
};
