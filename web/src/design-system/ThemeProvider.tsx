import '@fontsource-variable/inter';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { theme } from './theme';

/** Per-viewer convenience only: the chosen color mode (light, dark, or system). */
export const COLOR_MODE_STORAGE_KEY = 'tl-color-mode';

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <MuiThemeProvider theme={theme} defaultMode="system" modeStorageKey={COLOR_MODE_STORAGE_KEY}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}
