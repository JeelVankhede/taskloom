import { createTheme } from '@mui/material/styles';

/**
 * Design tokens and MUI theme. The full design system (tokens, typography scale,
 * component overrides, wrapper components) is built before feature screens.
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: { light: true, dark: true },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});
