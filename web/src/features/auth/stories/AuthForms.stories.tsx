import type { Meta, StoryObj } from '@storybook/react-vite';
import { SignInPage } from '../pages/SignInPage';
import { SignUpPage } from '../pages/SignUpPage';

const meta = { title: 'Auth/Pages', component: SignInPage } satisfies Meta<typeof SignInPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {};
export const SignUp: Story = { render: () => <SignUpPage /> };
