import type { Meta, StoryObj } from '@storybook/react-vite';
import { ColorModeSelect } from '../components/ColorModeSelect';

const meta = { title: 'Design system/ColorModeSelect', component: ColorModeSelect } satisfies Meta<
  typeof ColorModeSelect
>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
