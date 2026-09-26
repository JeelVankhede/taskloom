import type { Meta, StoryObj } from '@storybook/react-vite';
import { App } from './App';

const meta = { title: 'App/Shell', component: App } satisfies Meta<typeof App>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
