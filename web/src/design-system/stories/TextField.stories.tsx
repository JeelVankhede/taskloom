import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextField } from '../components/TextField';

const meta = {
  title: 'Design system/TextField',
  component: TextField,
  args: { label: 'Email', sx: { maxWidth: 360 } },
} satisfies Meta<typeof TextField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithHint: Story = { args: { label: 'Name', hint: '1 to 80 characters' } };
export const WithError: Story = {
  args: { defaultValue: 'not-an-email', errorText: 'Enter a valid email address' },
};
export const Disabled: Story = { args: { disabled: true, defaultValue: 'ada@example.test' } };
