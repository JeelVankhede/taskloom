import type { Decorator, Preview } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '../src/design-system';
import { SchemeSync } from './SchemeSync';

const withTheme: Decorator = (Story, context) => (
  <ThemeProvider>
    <SchemeSync mode={context.globals.theme === 'dark' ? 'dark' : 'light'}>
      <MemoryRouter>
        <div style={{ padding: 16 }}>
          <Story />
        </div>
      </MemoryRouter>
    </SchemeSync>
  </ThemeProvider>
);

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Color theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: {
    // Accessibility violations fail the story's a11y check rather than only warning.
    a11y: { test: 'error' },
    layout: 'fullscreen',
  },
};

export default preview;
