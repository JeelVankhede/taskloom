import type { Preview } from '@storybook/react-vite';
import { ThemeProvider } from '../src/design-system';

const preview: Preview = {
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
};

export default preview;
